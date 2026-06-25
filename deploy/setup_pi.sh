#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Escape Skate Platform — Raspberry Pi 3B+ Setup Script
# ═══════════════════════════════════════════════════════════════
# Run as root: sudo bash setup_pi.sh
# No domain needed — runs on Pi's local IP, port 80 → 5000
# Domain/SSL is the next step.
# ═══════════════════════════════════════════════════════════════

REPO_DIR="/opt/escape"
GIT_REPO="https://github.com/shaurya7769/col.git"
BRANCH="main"

# Auto-detect Pi's IP
PI_IP=$(hostname -I | awk '{print $1}')
[ -z "$PI_IP" ] && PI_IP="<this-pi-ip>"

echo "═══════════════════════════════════════════════"
echo "  Escape Skate Platform — Pi Setup"
echo "═══════════════════════════════════════════════"
echo "  Target:  $REPO_DIR"
echo "  Git:     $GIT_REPO ($BRANCH)"
echo "  Pi IP:   $PI_IP"
echo "  Mode:    LOCAL (no domain, HTTP only)"
echo ""

# ── 1. System packages ───────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/8] Installing dependencies..."
apt-get install -y -qq \
  curl gnupg build-essential git \
  nginx sqlite3 ufw

# ── 2. Node.js 20 ────────────────────────────────────────────
echo "[3/8] Installing Node.js 20..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node: $(node -v) | npm: $(npm -v)"

# ── 3. Clone repo ────────────────────────────────────────────
echo "[4/8] Cloning project..."
if [ -d "$REPO_DIR" ]; then
  echo "  Repo exists — pulling latest..."
  cd "$REPO_DIR"
  git fetch origin
  git reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$REPO_DIR"
fi

# ── 4. Runtime directories ────────────────────────────────────
echo "[5/8] Creating runtime directories..."
mkdir -p "$REPO_DIR/backend/data" \
         "$REPO_DIR/backend/uploads" \
         "$REPO_DIR/logs"

# ── 5. Configure .env ─────────────────────────────────────────
echo "[6/8] Configuring environment..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
BASE_URL="http://$PI_IP"

cat > "$REPO_DIR/backend/.env" << ENVEOF
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
JWT_SECRET=$JWT_SECRET
DB_PATH=$REPO_DIR/backend/data/escape.db
UPLOAD_DIR=$REPO_DIR/backend/uploads
BASE_URL=$BASE_URL
ALLOWED_ORIGINS=$BASE_URL
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_MAX=10
ENVEOF
echo "  JWT secret generated, BASE_URL=$BASE_URL"

# ── 6. Install backend deps + seed DB ─────────────────────────
echo "[7/8] Installing backend dependencies..."
cd "$REPO_DIR/backend"
npm install --omit=dev --no-audit --no-fund

echo "  Setting up database..."
node scripts/setup_sqlite.js

# ── 7. Build frontend ─────────────────────────────────────────
echo "  Building frontend..."
cd "$REPO_DIR/frontend"
npm install --no-audit --no-fund
npm run build

# ── 8. PM2 + nginx (HTTP only) ────────────────────────────────
echo "[8/8] Configuring PM2 + nginx..."

# PM2
echo "  → Installing PM2..."
npm install -g pm2

echo "  → Starting app via PM2..."
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

# nginx — HTTP only, reverse proxy to port 5000
echo "  → Configuring nginx (HTTP)..."
cat > /etc/nginx/sites-available/escape << NGINXEOF
server {
    listen 80;
    server_name _;

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
ufw --force enable

# ── Verify ────────────────────────────────────────────────────
echo ""
echo "  → Verifying deployment..."
sleep 2

# Check PM2
if pm2 show escape-api &>/dev/null; then
  echo "  ✅ PM2 process 'escape-api' is running"
else
  echo "  ❌ PM2 process not found — check 'pm2 status'"
fi

# Check backend responds
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/feed 2>/dev/null | grep -qE '^(200|401)$'; then
  echo "  ✅ Backend API responds on http://127.0.0.1:5000"
else
  echo "  ⚠️  Backend API not responding yet — may need a moment"
fi

# Check nginx serves frontend
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null | grep -q "200"; then
  echo "  ✅ nginx serves frontend on port 80"
else
  echo "  ⚠️  nginx not serving frontend yet"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  Access the app:"
echo "    http://$PI_IP"
echo ""
echo "  Demo accounts:"
echo "    Admin:  admin@escape.app / CoachPass1!"
echo "    Coach:  alex@skate.academy / CoachPass1!"
echo "    Student: student@skate.academy / StudentPass1!"
echo ""
echo "  Login: enter email → check OTP in PM2 logs → enter code"
echo "    pm2 logs escape-api --lines 20"
echo ""
echo "  Management:"
echo "    pm2 status              → Process status"
echo "    pm2 logs escape-api     → View logs (OTP codes here)"
echo "    pm2 restart escape-api  → Restart"
echo "    pm2 stop escape-api     → Stop"
echo ""
echo "  Next step (domain + SSL):"
echo "    sudo bash $REPO_DIR/deploy/step2_domain.sh your-domain.com"
echo ""
echo "═══════════════════════════════════════════════"
