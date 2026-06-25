#!/usr/bin/env bash
set -Euo pipefail
trap 'echo; echo "⚠ Aborted at step $STEP"; exit 1' INT TERM

# ── Prevent apt prompts from hanging ────────────────────────
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_SUSPEND=1
export NEEDRESTART_MODE=a
export npm_config_loglevel=info

# ── Config ──────────────────────────────────────────────────
REPO_DIR="/opt/escape"
GIT_REPO="https://github.com/shaurya7769/col.git"
BRANCH="main"
LOG_FILE="/tmp/escape-setup.log"
START_TS=$(date +%s)
STEP=0
TOTAL=6

# ── Full session log (screen + file) ────────────────────────
exec > >(tee -ia "$LOG_FILE") 2>&1
cleanup() { wait; }
trap cleanup EXIT

# ── Helpers ─────────────────────────────────────────────────
step() {
  STEP=$((STEP + 1))
  echo ""
  echo "╔══════════════════════════════════════════════════════════"
  echo "║  Step $STEP/$TOTAL  $(date '+%H:%M:%S')  —  $1"
  echo "╚══════════════════════════════════════════════════════════"
}

run() {
  local desc="$1"
  shift
  echo "  → $desc"
  "$@" || {
    local rc=$?
    echo "  ✗ $desc — FAILED (exit $rc)"
    echo "  Details: $LOG_FILE"
    exit $rc
  }
  echo "  ✓ $desc"
}

# ── Detect Pi IP ────────────────────────────────────────────
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}') || PI_IP=""
[ -z "$PI_IP" ] && PI_IP="<this-pi-ip>"

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║  Escape Skate Platform — Pi Setup Script  ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""
echo "  Pi IP:      $PI_IP"
echo "  Target:     $REPO_DIR"
echo "  Git:        $GIT_REPO ($BRANCH)"
echo "  Log:        $LOG_FILE"
echo "  Started:    $(date)"
echo ""

# ══════════════════════════════════════════════════════════════
step "Install system dependencies"
echo "  Installing curl, git, nginx, sqlite3, ufw, build tools..."
run "apt-get install" apt-get install -y curl gnupg build-essential git nginx sqlite3 ufw

# ══════════════════════════════════════════════════════════════
step "Install Node.js 20"
if ! command -v node &>/dev/null; then
  echo "  → Adding NodeSource repo..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  run "apt-get install nodejs" apt-get install -y nodejs
fi
echo "  ✓ $(node -v) / $(npm -v)"

# ══════════════════════════════════════════════════════════════
step "Clone project from GitHub"
if [ -d "$REPO_DIR" ]; then
  echo "  → Repo exists — pulling latest..."
  cd "$REPO_DIR"
  run "git fetch origin" git fetch origin
  run "git reset --hard origin/$BRANCH" git reset --hard "origin/$BRANCH"
else
  run "git clone" git clone --branch "$BRANCH" --depth 1 "$GIT_REPO" "$REPO_DIR"
fi

# ══════════════════════════════════════════════════════════════
step "Create directories and configure environment"
mkdir -p "$REPO_DIR/backend/data" "$REPO_DIR/backend/uploads" "$REPO_DIR/logs"

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
echo "  ✓ .env created (BASE_URL=$BASE_URL)"

# ══════════════════════════════════════════════════════════════
step "Install backend dependencies and seed database"
cd "$REPO_DIR/backend"
run "npm install (backend)" npm install --omit=dev --no-audit --no-fund
run "Seed database" node scripts/setup_sqlite.js

# ══════════════════════════════════════════════════════════════
step "Build frontend"
cd "$REPO_DIR/frontend"
run "npm install (frontend)" npm install --no-audit --no-fund
echo "  → vite build..."
npm run build
echo "  ✓ Frontend built"

# ══════════════════════════════════════════════════════════════
step "Configure PM2, nginx, and firewall"

# PM2
run "Install pm2 globally" npm install -g pm2

cat > "$REPO_DIR/deploy/ecosystem.config.js" << 'PM2EOF'
module.exports = {
  apps: [{
    name: 'escape-api',
    script: 'src/server.js',
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

run "pm2 start" pm2 start "$REPO_DIR/deploy/ecosystem.config.js" --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
echo "  ✓ PM2 configured (auto-start on boot)"

# nginx
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
run "nginx config test" nginx -t
systemctl reload nginx
echo "  ✓ nginx loaded (HTTP on port 80 → 127.0.0.1:5000)"

# firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw --force enable
echo "  ✓ Firewall active (SSH + HTTP only)"

# ══════════════════════════════════════════════════════════════
step "Verify deployment"

sleep 3
echo ""

if pm2 show escape-api &>/dev/null; then
  echo "  ✅ PM2 escape-api is running"
else
  echo "  ⚠  PM2 process not found"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5000/api/feed 2>/dev/null || echo "000")
if echo "$CODE" | grep -qE '^(200|401)$'; then
  echo "  ✅ API responds on :5000  (HTTP $CODE)"
else
  echo "  ⚠  API returned HTTP $CODE"
fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then
  echo "  ✅ Frontend serves on :80  (HTTP $CODE)"
else
  echo "  ⚠  Frontend returned HTTP $CODE"
fi

# ══════════════════════════════════════════════════════════════
TOTAL_S=$(($(date +%s) - START_TS))
MIN=$((TOTAL_S / 60))
SEC=$((TOTAL_S % 60))

echo ""
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║  Setup complete  (${MIN}m ${SEC}s)           ║"
echo "  ╚═══════════════════════════════════════════╝"
echo ""
echo "  Access:  http://$PI_IP"
echo ""
echo "  Accounts:"
echo "    admin@escape.app      / CoachPass1!   (admin)"
echo "    alex@skate.academy    / CoachPass1!   (coach)"
echo "    student@skate.academy / StudentPass1! (student)"
echo ""
echo "  Login: enter email → pm2 logs | grep OTP → enter code"
echo "    pm2 logs escape-api --lines 20"
echo ""
echo "  Commands:"
echo "    pm2 status              → status"
echo "    pm2 logs escape-api     → logs (OTP)"
echo "    pm2 restart escape-api  → restart"
echo ""
echo "  Domain + SSL (next):"
echo "    sudo bash $REPO_DIR/deploy/step2_domain.sh your.domain.com"
echo ""
