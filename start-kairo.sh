#!/usr/bin/env sh
# Start from the distribution root; exec gives the supervisor signal ownership.
# Node 24 supplies the runtime APIs, so no dependency installation is needed here.
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 24 or newer from https://nodejs.org/ first.'
  exit 1
fi
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('Node.js 24 or newer is required.');process.exit(1)}"
exec node server/start.mjs --open
