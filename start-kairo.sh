#!/usr/bin/env sh
# Start from the distribution root; exec gives the supervisor signal ownership.
# A patched Node supplies the runtime APIs; no dependency install is needed here.
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install current Node.js 24 LTS (24.21.0 minimum) from https://nodejs.org/ first.'
  exit 1
fi
node -e "import('./server/runtime-version.mjs').then(m=>m.assertSupportedRuntime()).catch(e=>{console.error(e.message);process.exitCode=1})"
exec node server/start.mjs --open
