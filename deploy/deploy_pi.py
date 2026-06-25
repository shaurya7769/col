#!/usr/bin/env python3
"""Deploy Escape Skate Platform to Raspberry Pi via SCP + SSH."""
import os, sys, subprocess, time, json
from pathlib import Path

PI_HOST = os.environ.get("PI_HOST", "172.20.10.3")
PI_USER = os.environ.get("PI_USER", "waage")
PI_PASS = os.environ.get("PI_PASS", "")
PI_DIR  = "/opt/escape"
DOMAIN  = os.environ.get("DOMAIN", "escape.example.com")

def run(cmd, check=True):
    print(f"  $ {cmd}")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(f"  FAILED: {r.stderr.strip()}")
        sys.exit(1)
    return r.stdout.strip()

def ssh(cmd, check=True):
    pw = f"sshpass -p '{PI_PASS}' " if PI_PASS else ""
    return run(f"{pw}ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 {PI_USER}@{PI_HOST} '{cmd}'", check)

def scp(src, dst_dir, check=True):
    pw = f"sshpass -p '{PI_PASS}' " if PI_PASS else ""
    run(f"{pw}scp -o StrictHostKeyChecking=no -r {src} {PI_USER}@{PI_HOST}:{dst_dir}", check)

def main():
    print("=" * 60)
    print("  Escape Skate Platform — Pi Deployer")
    print("=" * 60)
    print(f"  Host:  {PI_USER}@{PI_HOST}")
    print(f"  Dir:   {PI_DIR}")
    print(f"  Domain:{DOMAIN}")
    print()

    project_root = Path(__file__).resolve().parent.parent

    # 1. Verify connection
    print("[1/8] Testing SSH connection...")
    out = ssh("hostname", check=False)
    if not out:
        print("  ERROR: Cannot reach Pi. Check PI_HOST and credentials.")
        sys.exit(1)
    print(f"  Connected to: {out}")

    # 2. Create dir structure
    print("[2/8] Creating directory structure...")
    ssh(f"mkdir -p {PI_DIR}/backend/data {PI_DIR}/backend/uploads {PI_DIR}/logs")

    # 3. Copy project files
    print("[3/8] Copying project files...")
    for d in ["backend", "frontend", "deploy"]:
        src = str(project_root / d)
        print(f"  -> Copying {d}/...")
        scp(src, PI_DIR)

    # 4. Install system packages
    print("[4/8] Installing system packages...")
    ssh("sudo apt-get update -qq && sudo apt-get install -y -qq curl gnupg build-essential nginx certbot python3-certbot-nginx sqlite3")

    # 5. Install Node.js 20
    print("[5/8] Installing Node.js 20...")
    ssh("""
        if ! command -v node &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
            sudo apt-get install -y -qq nodejs
        fi
    """)

    # 6. Setup backend
    print("[6/8] Setting up backend...")
    # Generate .env
    jwt_secret = os.urandom(32).hex()
    ssh(f"""
        cat > {PI_DIR}/backend/.env << 'ENVEOF'
NODE_ENV=production
PORT=5000
HOST=0.0.0.0
DB_PATH={PI_DIR}/backend/data/escape.db
UPLOAD_DIR={PI_DIR}/backend/uploads
JWT_SECRET={jwt_secret}
BASE_URL=https://{DOMAIN}
ALLOWED_ORIGINS=https://{DOMAIN}
ENVEOF
    """)
    # Install deps + seed DB
    ssh(f"cd {PI_DIR}/backend && npm install --omit=dev && node scripts/setup_sqlite.js")

    # 7. Build frontend
    print("[7/8] Building frontend...")
    ssh(f"cd {PI_DIR}/frontend && npm install && npm run build")

    # 8. Configure PM2 + nginx + SSL
    print("[8/8] Configuring services...")
    ssh(f"""
        sudo npm install -g pm2
        cd {PI_DIR}/backend
        sudo pm2 start {PI_DIR}/deploy/ecosystem.config.js --env production
        sudo pm2 save
        sudo pm2 startup systemd -u root --hp /root
        sudo sed 's/escape\\.example\\.com/{DOMAIN}/g' {PI_DIR}/deploy/nginx.conf > /etc/nginx/sites-available/escape
        sudo ln -sf /etc/nginx/sites-available/escape /etc/nginx/sites-enabled/
        sudo rm -f /etc/nginx/sites-enabled/default
        sudo nginx -t && sudo systemctl reload nginx
    """)

    print()
    print("=" * 60)
    print("  Deployment complete!")
    print(f"  URL: https://{DOMAIN}")
    print("  Accounts:")
    print("    Admin:  admin@escape.app / CoachPass1!")
    print("    Coach:  alex@skate.academy / CoachPass1!")
    print("    Student: student@skate.academy / StudentPass1!")
    print("=" * 60)

if __name__ == "__main__":
    main()
