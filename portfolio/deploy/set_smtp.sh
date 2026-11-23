#!/usr/bin/env bash
# Sets the Gmail account that sends password-reset e-mails, then restarts the app.
#   ssh -t <server> sudo bash /opt/actuary/portfolio/deploy/set_smtp.sh
# Gmail needs an *app password* (Google account -> Security -> 2-Step Verification -> App passwords),
# not the account password. The password is read without echo, checked against Gmail before it is saved,
# and never printed or passed on a command line.
set -euo pipefail
ENVFILE=/etc/portfel.env
[ "$(id -u)" = 0 ] || { echo "sudo ilə işlədin: sudo bash $0"; exit 1; }

read -rp "Göndərən Gmail ünvanı: " user
read -rsp "Gmail app password (16 simvol; yazarkən ekranda görünmür): " pass; echo
pass="${pass// /}"   # Google shows it in four groups with spaces
[ -n "$user" ] && [ "${#pass}" -ge 16 ] || { echo "Ünvan boşdur və ya app password 16 simvoldan qısadır."; exit 1; }

echo "==> Gmail-ə giriş yoxlanılır"
PA_U="$user" PA_P="$pass" python3 - <<'EOF'
import os, smtplib, sys
try:
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as s:
        s.starttls()
        s.login(os.environ["PA_U"], os.environ["PA_P"])
except smtplib.SMTPAuthenticationError:
    sys.exit("Gmail girişi rədd etdi: ünvanı və app password-u yoxlayın (adi parol işləmir).")
except Exception as e:
    sys.exit(f"Gmail-ə qoşulmaq alınmadı: {e}")
print("   giriş uğurludur")
EOF

tmp=$(mktemp)
grep -v -E '^PA_(SMTP_USER|SMTP_PASSWORD)=' "$ENVFILE" > "$tmp" || true
printf 'PA_SMTP_USER=%s\nPA_SMTP_PASSWORD=%s\n' "$user" "$pass" >> "$tmp"
install -o root -g portfel -m 640 "$tmp" "$ENVFILE"
rm -f "$tmp"
unset pass

systemctl restart portfel-api portfel-worker@generate portfel-worker@validate
echo "Hazırdır: parol bərpası linkləri indi $user ünvanından e-poçtla göndəriləcək."
