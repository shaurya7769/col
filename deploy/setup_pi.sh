#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Escape Skate Platform — Raspberry Pi 3B+ Setup Script
# ═══════════════════════════════════════════════════════════════
# Run as: sudo bash setup_pi.sh <your-domain.com>
# Example: sudo bash setup_pi.sh skate.example.com
# ═══════════════════════════════════════════════════════════════

REPO_DIR="/opt/escape"
DOMAIN="${1:-escape.example.com}"
GIT_REPO="https://github.com/shaurya7769/col.git"
BRANCH="main"
PI_USER="${SUDO_USER:-$USER}"

echo "═══════════════════════════════════════════════"
echo "  Escape Skate Platform — Pi Setup"
echo "═══════════════════════════════════════════════"
echo "  Domain:     $DOMAIN"
echo "  Target:     $REPO_DIR"
echo "  Git repo:   $GIT_REPO"
echo "  Pi user:    $PI_USER"
echo ""

# ── 1. System packages ───────────────────────────────────────
echo "[1/9] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/9] Installing dependencies..."
apt-get install -y -qq \
  curl gnupg build-essential git \
  nginx certbot python3-certbot-nginx sqlite3 \
  ufw

# ── 3. Node.js 20 ────────────────────────────────────────────
echo "[3/9] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node: $(node -v) | npm: $(npm -v)"

# ── 4. Clone / pull repo ────────────────────────────────────
echo "[4/9] Cloning project from GitHub..."
if [ -d "$REPO_DIR" ]; then
  echo "  Repo exists — pulling latest..."
  cd "$REPO_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$REPO_DIR"
fi

# ── 5. Create runtime directories ────────────────────────────
echo "[5/9] Creating runtime directories..."
mkdir -p "$REPO_DIR/backend/data" \
         "$REPO_DIR/backend/uploads" \
         "$REPO_DIR/logs"

# ── 6. Configure environment ────────────────────────────────
echo "[6/9] Configuring .env..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

cat > "$REPO_DIR/backend/.env" << ENVEOF
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
JWT_SECRET=$JWT_SECRET
DB_PATH=$REPO_DIR/backend/data/escape.db
UPLOAD_DIR=$REPO_DIR/backend/uploads
BASE_URL=https://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_MAX=10
ENVEOF
echo "  JWT secret generated and .env written"

# ── 7. Install backend deps + seed DB ────────────────────────
echo "[7/9] Installing backend dependencies..."
cd "$REPO_DIR/backend"
npm install --omit=dev --no-audit --no-fund

echo "  Setting up database..."
node scripts/setup_sqlite.js

# ── 8. Build frontend ────────────────────────────────────────
echo "[8/9] Building frontend..."
cd "$REPO_DIR/frontend"
npm install --no-audit --no-fund
npm run build

# ── 9. PM2, nginx, SSL ──────────────────────────────────────
echo "[9/9] Configuring services..."

# PM2
echo "  → Installing PM2..."
npm install -g pm2

echo "  → Generating PM2 ecosystem config..."
cat > "$REPO_DIR/deploy/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'escape-api',
    script: 'server.js',
    cwd: '/opt/escape/backend',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      HOST: '0.0.0.0',
      DB_PATH: '/opt/escape/backend/data/escape.db',
      UPLOAD_DIR: '/opt/escape/backend/uploads',
    },
    env_file: '/opt/escape/backend/.env',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    error_file: '/opt/escape/logs/api-error.log',
    out_file: '/opt/escape/logs/api-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000,
  }]
};
PM2EOF

pm2 start "$REPO_DIR/deploy/ecosystem.config.js" --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# nginx config
echo "  → Configuring nginx..."
cat > /etc/nginx/sites-available/escape << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    client_max_body_size 20M;

    location /uploads/ {
        alias $REPO_DIR/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location / {
        root $REPO_DIR/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;

        location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)\$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/escape /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Firewall
echo "  → Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# SSL
echo "  → Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || {
  echo "  ⚠️  Certbot failed. Run manually:"
  echo "     certbot --nginx -d $DOMAIN"
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════════"
echo "  URL:     https://$DOMAIN"
echo ""
echo "  Accounts:"
echo "    Admin:  admin@escape.app / CoachPass1!"
echo "    Coach:  alex@skate.academy / CoachPass1!"
echo "    Student: student@skate.academy / StudentPass1!"
echo ""
echo "  Files:"
echo "    Backend:  $REPO_DIR/backend"
echo "    Frontend: $REPO_DIR/frontend/dist"
echo "    DB:       $REPO_DIR/backend/data/escape.db"
echo "    Logs:     $REPO_DIR/logs/"
echo ""
echo "  Commands:"
echo "    pm2 status              → Process status"
echo "    pm2 logs escape-api     → View logs"
echo "    pm2 restart escape-api  → Restart"
echo "    pm2 stop escape-api     → Stop"
echo ""
echo "  Update:"
echo "    cd $REPO_DIR && git pull && cd backend && npm install --omit=dev"
echo "    && cd ../frontend && npm install && npm run build && pm2 restart escape-api"
echo "═══════════════════════════════════════════════"
