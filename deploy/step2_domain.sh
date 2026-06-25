#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Step 2: Domain + SSL — Run AFTER setup_pi.sh
# ═══════════════════════════════════════════════════════════════
# Usage: sudo bash step2_domain.sh your-domain.com
# ═══════════════════════════════════════════════════════════════

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: sudo bash step2_domain.sh your-domain.com"
  echo "Make sure your domain's A record points to this Pi's IP first."
  exit 1
fi

REPO_DIR="/opt/escape"

echo "═══════════════════════════════════════════════"
echo "  Step 2: Domain + SSL"
echo "  Domain: $DOMAIN"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Update nginx config with domain + SSL
echo "[1/3] Updating nginx config..."
apt-get install -y -qq certbot python3-certbot-nginx

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

nginx -t && systemctl reload nginx

# 2. Get SSL certificate
echo "[2/3] Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@$DOMAIN" || {
  echo "  ⚠️  Certbot failed. Try manually:"
  echo "     certbot --nginx -d $DOMAIN"
  exit 1
}

# 3. Update .env
echo "[3/3] Updating environment..."
sed -i "s|BASE_URL=http://.*|BASE_URL=https://$DOMAIN|" "$REPO_DIR/backend/.env"
sed -i "s|ALLOWED_ORIGINS=http://.*|ALLOWED_ORIGINS=https://$DOMAIN|" "$REPO_DIR/backend/.env"

# Update firewall
ufw allow 443/tcp
ufw --force enable

# Restart app to pick up new env
pm2 restart escape-api

echo ""
echo "═══════════════════════════════════════════════"
echo "  Done! Your app is live at:"
echo "    https://$DOMAIN"
echo "═══════════════════════════════════════════════"
