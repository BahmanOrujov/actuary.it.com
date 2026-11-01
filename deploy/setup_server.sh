#!/usr/bin/env bash
# The whole actuary.it.com on one Ubuntu server (e.g. Oracle Cloud Always Free):
#   - static site (frontend/) served by Caddy, /api and /admin proxied to Django (backend/, gunicorn)
#   - Portfel Analizi full version at /portfolio/ (portfolio/, FastAPI + workers); its demo at /portfolio/demo/
#   - HTTPS certificates from Let's Encrypt via Caddy
#
#   curl -fsSL https://raw.githubusercontent.com/BahmanOrujov/actuary.it.com/main/deploy/setup_server.sh \
#     | sudo bash -s -- [domain]
#
# domain (default actuary.it.com): its hosts are added to Caddy only once their DNS points to this server, so the
# script can run before the DNS switch. Until then the site answers on https://<ip-with-dashes>.sslip.io.
# Rerun the script after changing DNS.
set -euo pipefail

DOMAIN="${1:-actuary.it.com}"
REPO="${PA_REPO:-https://github.com/BahmanOrujov/actuary.it.com.git}"
SRC=/opt/actuary
VENV=/opt/actuary-venv
DATA=/var/lib/actuary
ENVFILE=/etc/actuary-site.env
SVC_USER=actuary

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> code"
command -v git >/dev/null || { apt-get update -q && apt-get install -y -q git; }
if [ -d "$SRC/.git" ]; then git -C "$SRC" pull --ff-only; else git clone --depth 1 "$REPO" "$SRC"; fi

echo "==> Portfel Analizi (packages, swap, firewall, its services)"
PA_SKIP_CADDY=1 PA_BASE_PATH=/portfolio/ bash "$SRC/portfolio/deploy/setup_server.sh"

echo "==> site backend (Django)"
id $SVC_USER >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin $SVC_USER
mkdir -p "$DATA/backups" && chown -R $SVC_USER:$SVC_USER "$DATA"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q --upgrade pip
"$VENV/bin/pip" install -q -r "$SRC/backend/requirements.txt"

IP=$(curl -fsS https://api.ipify.org)
SSLIP="${IP//./-}.sslip.io"
# public hosts: the sslip.io test names always, the real names once DNS points here
SITE_HOSTS="$SSLIP"; APEX=""
resolves_here() { [ "$(getent ahostsv4 "$1" | awk 'NR==1{print $1}')" = "$IP" ]; }
if resolves_here "www.$DOMAIN"; then SITE_HOSTS="$SITE_HOSTS, www.$DOMAIN"; fi
if resolves_here "$DOMAIN"; then APEX="$DOMAIN"; fi

DJANGO_HOSTS="$(echo "$SITE_HOSTS" | tr -d ' '),127.0.0.1,localhost"
umask 077
if [ ! -f "$ENVFILE" ]; then
  cat > "$ENVFILE" <<EOF
DJANGO_PRODUCTION=1
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
DJANGO_DB_PATH=$DATA/db.sqlite3
DJANGO_ALLOWED_HOSTS=$DJANGO_HOSTS
# feedback e-mails (Gmail: an app password, not the account password). Empty = e-mails are not sent.
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EOF
else
  sed -i "s|^DJANGO_ALLOWED_HOSTS=.*|DJANGO_ALLOWED_HOSTS=$DJANGO_HOSTS|" "$ENVFILE"
fi
chown root:$SVC_USER "$ENVFILE" && chmod 640 "$ENVFILE"
umask 022

( set -a; . "$ENVFILE"; set +a
  cd "$SRC/backend"
  "$VENV/bin/python" manage.py collectstatic --no-input -v 0
  runuser -u $SVC_USER -- "$VENV/bin/python" manage.py migrate --no-input -v 0 )

install -m 644 "$SRC/deploy/actuary-site.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now actuary-site
systemctl restart actuary-site

echo "==> off-server backups (encrypted, to Google Drive once connected)"
command -v rclone >/dev/null || apt-get install -y -q rclone
# the archive passphrase never leaves the server: keep a copy elsewhere, backups cannot be opened without it
[ -s /etc/actuary-backup.pass ] || ( umask 077; openssl rand -base64 32 > /etc/actuary-backup.pass )
install -m 644 "$SRC/deploy/actuary-backup.service" "$SRC/deploy/actuary-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now actuary-backup.timer

echo "==> https (Caddy)"
{
  echo "$SITE_HOSTS {"
  cat <<'EOF'
	encode gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options SAMEORIGIN
		Referrer-Policy strict-origin-when-cross-origin
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		-Server
	}
	@backend path /api/* /admin /admin/* /static/*
	handle @backend {
		reverse_proxy 127.0.0.1:8001
	}
	# the frontend reads its API location from this file; here the API is on the same origin
	handle /assets/runtime.js {
		header Content-Type "text/javascript; charset=utf-8"
		header Cache-Control no-cache
		respond "window.API_BASE = '';"
	}
	# Portfel Analizi: the demo is static, everything else under /portfolio/ is the full app (prefix stripped)
	redir /portfolio /portfolio/ permanent
	redir /portfolio/demo /portfolio/demo/ permanent
	handle /portfolio/demo/* {
		root * /opt/actuary/frontend
		file_server
	}
	handle /portfolio/* {
		uri strip_prefix /portfolio
		reverse_proxy 127.0.0.1:8000 {
			header_up X-Forwarded-Prefix /portfolio
		}
	}
	handle {
		root * /opt/actuary/frontend
		try_files {path} {path}/index.html
		file_server
	}
}
EOF
  if [ -n "$APEX" ]; then
    echo
    echo "$APEX {"
    printf '\tredir https://www.%s{uri} permanent\n}\n' "$DOMAIN"
  fi
} > /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy

echo "==> checks"
sleep 3
curl -fsS -o /dev/null -w "site api   %{http_code}\n" -H "Host: $SSLIP" http://127.0.0.1:8001/api/blog/ || true
curl -fsS -o /dev/null -w "portfolio  %{http_code}\n" http://127.0.0.1:8000/api/config/public || true
echo
echo "Sayt:        https://$SSLIP$( [[ $SITE_HOSTS == *www.* ]] && echo "  və  https://www.$DOMAIN")"
echo "Portfel:     https://$SSLIP/portfolio/   (demo: /portfolio/demo/)"
echo "DNS hələ dəyişməyibsə: A qeydləri  @ və www  ->  $IP ; sonra bu skripti yenidən işə salın."
