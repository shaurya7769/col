#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/escape"
GIT_REPO="https://github.com/shaurya7769/col.git"
BRANCH="main"
START_TS=$(date +%s)

step_start=""
step_num=0

log() { echo -e "$(date '+%H:%M:%S') $*"; }

step() {
  [ -n "$step_start" ] && elapsed=$(($(date +%s) - step_start)) && log "  └─ Done (${elapsed}s)"
  step_num=$((step_num + 1))
  step_start=$(date +%s)
  log ""
  log "━━━ [$step_num/8] $* ━━━"
}

ok() { log "  ✓ $*"; }

PI_IP=$(hostname -I | awk '{print $1}')
[ -z "$PI_IP" ] && PI_IP="<this-pi-ip>"

log "═══════════════════════════════════════════════"
log "  Escape Skate Platform — Pi Setup"
log "  Started: $(date)"
log "═══════════════════════════════════════════════"
log "  Target:  $REPO_DIR"
log "  Git:     $GIT_REPO ($BRANCH)"
log "  Pi IP:   $PI_IP"
log ""

# ── 1. Update system packages ──────────────────────────────
step "Updating system packages"
log "  This may take 5-15 minutes on a Pi (downloading + upgrading)"
apt-get update -y 2>&1 | awk '{print "  " $0}'
apt-get upgrade -y 2>&1 | awk '{print "  " $0}'
ok "System packages updated"

# ── 2. Install dependencies ────────────────────────────────
step "Installing system dependencies"
log "  curl, git, nginx, sqlite3, ufw, build tools..."
apt-get install -y curl gnupg build-essential git nginx sqlite3 ufw 2>&1 | awk '{print "  " $0}'
ok "Dependencies installed"

# ── 3. Node.js 20 ──────────────────────────────────────────
step "Installing Node.js 20"
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs 2>&1 | tail -3 | awk '{print "  " $0}'
fi
ok "Node: $(node -v) | npm: $(npm -v)"

# ── 4. Clone repo ──────────────────────────────────────────
step "Cloning project from GitHub"
if [ -d "$REPO_DIR" ]; then
  log "  Repo exists — pulling latest..."
  cd "$REPO_DIR"
  git fetch origin 2>&1 | awk '{print "  " $0}'
  git reset --hard "origin/$BRANCH" 2>&1 | awk '{print "  " $0}'
else
  git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$REPO_DIR" 2>&1 | awk '{print "  " $0}'
fi
ok "Repo ready at $REPO_DIR"

# ── 5. Directories + .env ─────────────────────────────────
step "Creating directories and .env"
mkdir -p "$REPO_DIR/backend/data" "$REPO_DIR/backend/uploads" "$REPO_DIR/logs"
ok "Directories created"

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
ok "JWT secret generated, BASE_URL=$BASE_URL"

# ── 6. Backend ─────────────────────────────────────────────
step "Installing backend dependencies (npm install)"
cd "$REPO_DIR/backend"
log "  Installing production npm packages..."
npm install --omit=dev --no-audit --no-fund 2>&1 | awk '{print "  " $0}'
ok "Backend dependencies installed"

step "Setting up database"
node scripts/setup_sqlite.js 2>&1 | awk '{print "  " $0}'
ok "Database seeded"

# ── 7. Frontend ────────────────────────────────────────────
step "Building frontend (npm install + vite build)"
cd "$REPO_DIR/frontend"
log "  Installing frontend npm packages..."
npm install --no-audit --no-fund 2>&1 | awk '{print "  " $0}'
ok "Frontend dependencies installed"

log "  Building production bundle (vite)..."
npm run build 2>&1 | awk '{print "  " $0}'
ok "Frontend built"

# ── 8. PM2 + nginx + firewall + verify ────────────────────
step "Configuring PM2"
npm install -g pm2 2>&1 | tail -3 | awk '{print "  " $0}'
ok "PM2 installed"

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
ok "PM2 app started and saved"

step "Configuring nginx (HTTP only)"
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
nginx -t 2>&1 | awk '{print "  " $0}'
systemctl reload nginx
ok "nginx configured and reloaded"

step "Configuring firewall"
ufw --force reset 2>&1 | tail -2 | awk '{print "  " $0}'
ufw default deny incoming 2>&1 | tail -1 | awk '{print "  " $0}'
ufw default allow outgoing 2>&1 | tail -1 | awk '{print "  " $0}'
ufw allow 22/tcp 2>&1 | tail -1 | awk '{print "  " $0}'
ufw allow 80/tcp 2>&1 | tail -1 | awk '{print "  " $0}'
ufw --force enable 2>&1 | tail -2 | awk '{print "  " $0}'
ok "Firewall active (SSH + HTTP)"

# ── Verify ─────────────────────────────────────────────────
step "Verifying deployment"
sleep 3

if pm2 show escape-api &>/dev/null; then
  ok "PM2 process 'escape-api' is running"
else
  log "  ⚠ PM2 process not found — check 'pm2 status'"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/feed 2>/dev/null || echo "000")
if echo "$HTTP_CODE" | grep -qE '^(200|401)$'; then
  ok "Backend API responds on http://127.0.0.1:5000 (HTTP $HTTP_CODE)"
else
  log "  ⚠ Backend returned HTTP $HTTP_CODE — may need a moment"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "nginx serves frontend on http://127.0.0.1 (HTTP $HTTP_CODE)"
else
  log "  ⚠ Frontend returned HTTP $HTTP_CODE — check nginx"
fi

TOTAL=$(($(date +%s) - START_TS))
MIN=$((TOTAL / 60))
SEC=$((TOTAL % 60))

log ""
log "═══════════════════════════════════════════════"
log "  Setup complete! (${MIN}m ${SEC}s total)"
log "═══════════════════════════════════════════════"
log ""
log "  Access the app:"
log "    http://$PI_IP"
log ""
log "  Demo accounts:"
log "    Admin:  admin@escape.app / CoachPass1!"
log "    Coach:  alex@skate.academy / CoachPass1!"
log "    Student: student@skate.academy / StudentPass1!"
log ""
log "  Login: enter email → check OTP in logs → enter code"
log "    pm2 logs escape-api --lines 20"
log ""
log "  Commands:"
log "    pm2 status              → Process status"
log "    pm2 logs escape-api     → View logs (OTP codes)"
log "    pm2 restart escape-api  → Restart"
log "    pm2 stop escape-api     → Stop"
log ""
log "  Next step (domain + SSL):"
log "    sudo bash $REPO_DIR/deploy/step2_domain.sh your-domain.com"
log ""
log "═══════════════════════════════════════════════"
