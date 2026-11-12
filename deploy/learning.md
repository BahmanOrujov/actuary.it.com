# Learning (/learning/)

Interactive courses with accounts and per-user progress. It runs as its own service (`learning`, Node 22 in
`/opt/learning/node`, data in `/var/lib/learning`) behind Caddy at `/learning/`.

The course content is not in this public repository: it is built in the separate Learning project and copied to the
server with `bash scripts/deploy.sh` from that project. This repository only holds the Caddy route (in
`deploy/setup_server.sh`) and the links on the site.

- Logs: `journalctl -u learning -f`
- Make a registered user admin: `sudo -u learning env $(sudo cat /etc/learning.env | xargs) /opt/learning/node/bin/node /opt/learning/app/server/server.mjs promote <e-mail>`
- Backup: `/var/lib/learning` (users, sessions, progress as JSON files)
