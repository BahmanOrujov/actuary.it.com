#!/usr/bin/env bash
# One-time: connect the daily backups to a Google Drive account.  sudo bash /opt/actuary/deploy/connect_drive.sh
# The access is limited to files rclone itself creates (scope drive.file): the server cannot read the rest of Drive.
set -euo pipefail
CONF=/etc/actuary-rclone.conf
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }

cat <<'EOF'
1) Öz kompüterinizdə PowerShell-də:
     rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ=="
2) Açılan brauzerdə Google hesabınızı seçib icazə verin.
3) PowerShell-də çıxan {"access_token":...} sətrini tam kopyalayıb bura yapışdırın və Enter basın:
EOF
read -r TOKEN
case "$TOKEN" in \{*access_token*\}) ;; *) echo "Bu {\"access_token\":...} sətri deyil. Yenidən cəhd edin."; exit 1 ;; esac

( umask 077; rclone --config "$CONF" config create gdrive drive scope drive.file token "$TOKEN" >/dev/null )
rclone --config "$CONF" mkdir gdrive:actuary-backups
echo "Qoşuldu. İlk backup göndərilir..."
systemctl start actuary-backup.service
journalctl -u actuary-backup.service -n 2 --no-pager -o cat
