"""Make local preview pages that load the real built UI with a fake Forge bridge.

python3 dev/harness.py   -> static/sidebar/build/preview-panel.html, preview-context.html
Serve static/sidebar/build on 127.0.0.1 and open them in headless Chromium.
"""
import json
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
BUILD = APP / "static" / "sidebar" / "build"
review = json.loads((APP / "dev" / "out" / "review.json").read_text())
index = (BUILD / "index.html").read_text()

for module, width in (("sidebar-panel", 900), ("sidebar-context", 340)):
    shim = f"""<script>
window.__REVIEW__ = {json.dumps(review)};
globalThis.__bridge = {{ callBridge: async (name, payload) => {{
  if (name === 'getContext') return {{ moduleKey: '{module}', extension: {{ issue: {{ key: 'CLSD-7' }} }}, theme: {{}} }};
  if (name === 'invoke') {{
    if (payload.functionKey === 'getReview') return window.__REVIEW__;
    if (payload.functionKey === 'ask') return {{ answer: 'CLSD-6 (2025): 12 months of fees, indirect damages excluded for both parties. Delaware was accepted once as a one-off.', refs: ['CLSD-6'] }};
    return {{ message: 'ok' }};
  }}
  if (name === 'on') return {{ unsubscribe() {{}} }};
  return null;
}} }};
</script><style>body{{width:{width}px;padding:8px}}</style>"""
    page = index.replace("<head>", "<head>" + shim, 1)
    (BUILD / f"preview-{module.split('-')[1]}.html").write_text(page)
print("ok")
