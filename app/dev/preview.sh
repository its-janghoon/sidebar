#!/bin/bash
# Build the backend locally, compute the review for an issue, build the UI and
# render both panels to PNG. Usage: bash dev/preview.sh CLSD-7
set -e
cd "$(dirname "$0")/.."
export PATH="$(cd "$(dirname "$0")/../.." && pwd)/node_modules/node/bin:$PATH"
E=static/sidebar/node_modules/.bin/esbuild
$E dev/run.js --bundle --platform=node --format=esm --outfile=dev/out/run.mjs \
  --alias:@forge/api=./dev/shims.js --alias:@forge/kvs=./dev/shims.js --alias:@forge/llm=./dev/shims.js --log-level=warning
node dev/out/run.mjs "${1:-CLSD-7}" 2>/dev/null > dev/out/review.json
(cd static/sidebar && npm run build >/dev/null 2>&1)
python3 dev/harness.py >/dev/null
curl -s -o /dev/null http://127.0.0.1:47811/ || (setsid python3 -m http.server 47811 --bind 127.0.0.1 --directory static/sidebar/build >/dev/null 2>&1 &)
sleep 1
B=~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
S=/home/ubuntu/.kiro/crew/workspace/shots
"$B" --headless=new --no-sandbox --hide-scrollbars --window-size=930,${2:-1100} --virtual-time-budget=4000 --screenshot=$S/sb-panel-$(date +%H%M%S).png http://127.0.0.1:47811/preview-panel.html >/dev/null 2>&1
"$B" --headless=new --no-sandbox --hide-scrollbars --window-size=360,700 --virtual-time-budget=4000 --screenshot=$S/sb-context-$(date +%H%M%S).png http://127.0.0.1:47811/preview-context.html >/dev/null 2>&1
python3 -c "
import json;r=json.load(open('dev/out/review.json'));print(r['state'],r.get('engine'),'v',r.get('from'),'->',r.get('to'),'changed',r.get('changedLines'));[print(' ',f['severity'],f['title'],'line',f.get('line')) for f in r['findings']]"
