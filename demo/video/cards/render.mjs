// Render cards and captions to PNG. node cards/render.mjs
// Writes cards/out/<name>.png and cards/out/<name>.json (boxes of [data-zoom] elements).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire('/home/ubuntu/workplace/janghoon/youtube/package.json');
const { chromium } = require('playwright');

const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });
const captions = JSON.parse(fs.readFileSync(path.join(dir, '..', 'captions.json'), 'utf8'));

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
async function shot(file, name, query = '', transparent = false) {
  await page.goto('file://' + path.join(dir, file) + query);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, name + '.png'), omitBackground: transparent });
  const boxes = await page.$$eval('[data-zoom]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { label: e.dataset.zoom, box: [r.x, r.y, r.width, r.height].map(Math.round) }; }));
  if (boxes.length) fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(boxes));
}
await shot('hook.html', 'hook');
await shot('title.html', 'title');
for (let n = 0; n <= 6; n++) await shot('teams.html', `teams-${n}`, `?n=${n}`);
await shot('arch.html', 'arch');
await shot('end.html', 'end');
for (const [key, html] of Object.entries(captions)) await shot('caption.html', `cap-${key}`, '?c=' + encodeURIComponent(html), true);
await b.close();
console.log('rendered', fs.readdirSync(out).length, 'files');
