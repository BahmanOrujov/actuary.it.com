#!/usr/bin/env bash
# Pull the latest code of the whole site and restart everything.  sudo bash /opt/actuary/deploy/update.sh
set -euo pipefail
bash /opt/actuary/deploy/setup_server.sh "${1:-actuary.it.com}"
