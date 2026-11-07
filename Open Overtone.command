#!/bin/bash
# Open Overtone.command: double-click to open Overtone in your default browser.
# It serves this folder on a local port (so Safari doesn't ask to confirm the file)
# and stops when you close this window.
cd "$(dirname "$0")"
PORT=8790
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
if command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' 2>/dev/null; then
  echo "Overtone is running at http://127.0.0.1:$PORT  (close this window to stop it)"
  (sleep 1; open "http://127.0.0.1:$PORT/index.html") &
  exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1
else
  open "index.html"
fi
