#!/usr/bin/env bash
# Pull the latest code and restart.  sudo bash /opt/actuary/portfolio/deploy/update.sh
set -euo pipefail
APP=/opt/actuary/portfolio
git -C /opt/actuary pull --ff-only
/opt/portfel-venv/bin/pip install -q -r "$APP/backend/requirements.txt"
(cd "$APP/frontend" && npm ci --no-audit --no-fund && npm run build)
systemctl restart portfel-api portfel-worker@generate portfel-worker@validate
systemctl --no-pager --lines=0 status portfel-api portfel-worker@generate portfel-worker@validate | grep -E "●|Active:"
