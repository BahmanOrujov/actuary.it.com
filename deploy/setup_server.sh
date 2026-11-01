#!/usr/bin/env bash
# One-time (and repeatable) setup of Portfel Analizi on a fresh Ubuntu 22.04/24.04 server (x86_64 or arm64,
# e.g. Oracle Cloud Always Free Ampere A1).
#
#   curl -fsSL https://raw.githubusercontent.com/BahmanOrujov/actuary.it.com/main/portfolio/deploy/setup_server.sh \
#     | sudo bash -s -- [domain]
#
# domain: the public name (e.g. app.actuary.it.com, whose DNS A record points to this server). Without it the
# server is reachable at https://<public-ip>.sslip.io, which needs no DNS. Caddy obtains the TLS certificate.
set -euo pipefail

DOMAIN="${1:-}"
REPO="${PA_REPO:-https://github.com/BahmanOrujov/actuary.it.com.git}"
SRC=/opt/actuary                 # git checkout of the site repository
APP="$SRC/portfolio"             # the portfolio project inside it
VENV=/opt/portfel-venv
DATA=/var/lib/portfel
ENVFILE=/etc/portfel.env
SVC_USER=portfel

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -q
apt-get install -y -q git python3 python3-venv python3-dev build-essential gfortran libopenblas-dev \
  nodejs npm debian-keyring debian-archive-keyring apt-transport-https curl gnupg iptables-persistent
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "==> swap (model fitting peaks above 1 GB; harmless on large machines)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "==> firewall: Oracle Ubuntu images reject everything except SSH in iptables"
for p in 80 443; do
  if ! iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null; then
    # before the catch-all REJECT rule if there is one, otherwise at the end
    pos=$(iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
    if [ -n "$pos" ]; then iptables -I INPUT "$pos" -p tcp --dport $p -m state --state NEW -j ACCEPT
    else iptables -A INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT; fi
  fi
done
netfilter-persistent save >/dev/null 2>&1 || true

echo "==> user, code, data"
id $SVC_USER >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin $SVC_USER
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only; else git clone --depth 1 "$REPO" "$SRC"; fi
mkdir -p "$DATA/backups"
chown -R $SVC_USER:$SVC_USER "$DATA"

if [ ! -f "$ENVFILE" ]; then
  # umask only for the secret file: the venv and build created below must stay readable by the service user
  (umask 077; cat > "$ENVFILE" <<EOF
APP_MODE=personal
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
PA_DATA_DIR=$DATA
PA_OPEN_REGISTRATION=false
# password-reset e-mails (Gmail: an app password, not the account password). Empty = link goes to the log.
PA_SMTP_USER=
PA_SMTP_PASSWORD=
EOF
  )
  chown root:$SVC_USER "$ENVFILE" && chmod 640 "$ENVFILE"
fi

echo "==> python environment (first run compiles nothing on x86/arm64 wheels; a few minutes)"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$APP/backend/requirements.txt"

echo "==> frontend"
(cd "$APP/frontend" && npm ci --no-audit --no-fund && npm run build)

echo "==> services"
install -m 644 "$APP/deploy/portfel-api.service" /etc/systemd/system/
install -m 644 "$APP/deploy/portfel-worker@.service" /etc/systemd/system/
install -m 644 "$APP/deploy/portfel-backup.service" "$APP/deploy/portfel-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now portfel-api portfel-worker@generate portfel-worker@validate portfel-backup.timer
systemctl restart portfel-api portfel-worker@generate portfel-worker@validate

if [ -n "${PA_SKIP_CADDY:-}" ]; then
  # the whole-site setup (actuary.it.com deploy/setup_server.sh) writes one Caddyfile for every host
  echo "==> portfolio services ready (Caddy configured by the caller)"
  exit 0
fi

echo "==> https"
if [ -z "$DOMAIN" ]; then
  IP=$(curl -fsS https://api.ipify.org)
  DOMAIN="${IP//./-}.sslip.io"
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8000
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "==> waiting for the app"
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8000/api/config/public >/dev/null 2>&1 && break
  sleep 2
done
systemctl --no-pager --lines=0 status portfel-api portfel-worker@generate portfel-worker@validate | grep -E "●|Active:"
echo
echo "Hazırdır: https://$DOMAIN"
echo "İlk qeydiyyatdan keçən hesab admin olur; ondan sonra qeydiyyat bağlıdır (PA_OPEN_REGISTRATION=false)."
