#!/usr/bin/env bash
# Daily off-server backup: fresh copies of both SQLite databases (portfolio app + site), packed into one archive,
# encrypted with the passphrase in /etc/actuary-backup.pass and uploaded to Google Drive (rclone remote "gdrive",
# folder actuary-backups). Archives older than KEEP_DAYS are removed from Drive.
#
# Restore on any machine with the passphrase:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in actuary-DATE.tar.gz.enc | tar -xz
set -euo pipefail

CONF=/etc/actuary-rclone.conf
PASS=/etc/actuary-backup.pass
KEEP_DAYS="${KEEP_DAYS:-30}"

[ -s "$CONF" ] || { echo "Google Drive is not connected yet: sudo bash /opt/actuary/deploy/connect_drive.sh"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

snapshot() {  # consistent copy of a live SQLite database (WAL mode included)
  python3 - "$1" "$2" <<'EOF'
import sqlite3, sys
src, out = sqlite3.connect(sys.argv[1]), sqlite3.connect(sys.argv[2])
src.backup(out)
out.close(); src.close()
EOF
}
snapshot /var/lib/portfel/app.db "$WORK/portfel.db"
snapshot /var/lib/actuary/db.sqlite3 "$WORK/site.db"

ARCHIVE="$WORK/actuary-$(date -u +%Y-%m-%d).tar.gz.enc"
tar -C "$WORK" -czf - portfel.db site.db \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$PASS" -out "$ARCHIVE"

rclone --config "$CONF" copy "$ARCHIVE" gdrive:actuary-backups
rclone --config "$CONF" delete --min-age "${KEEP_DAYS}d" gdrive:actuary-backups
echo "uploaded $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1))"
