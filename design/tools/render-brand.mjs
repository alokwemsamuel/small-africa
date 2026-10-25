// Renders the HTML brand assets in design/brand/src to PNG/PDF using headless Chromium (Edge or Chrome).
// Run: npm run brand   (set BROWSER=/path/to/chrome to override browser discovery)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..', 'brand', 'src');
const out = resolve(here, '..', 'brand');
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Chromium browser found. Set BROWSER=/path/to/chrome');

const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=8000', '--run-all-compositor-stages-before-draw'];
const run = (args, page) => {
  const r = spawnSync(browser, [...base, ...args, pathToFileURL(join(src, page)).href], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${page}: ${r.stderr}`);
};
const png = (page, file, w, h, scale = 1) => run([`--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`, `--screenshot=${join(out, file)}`], page);
const pdf = (page, file) => run(['--no-pdf-header-footer', `--print-to-pdf=${join(out, file)}`], page);

png('instagram-post.html', 'instagram-post-1080x1350.png', 1080, 1350);
png('instagram-story.html', 'instagram-story-1080x1920.png', 1080, 1920);
pdf('menu-card.html', 'menu-card-A4.pdf');
png('menu-card.html', 'menu-card-A4.png', 794, 1123, 2);
pdf('brand-guide.html', 'brand-guide.pdf');
png('brand-guide.html', 'brand-guide-cover.png', 1123, 794, 2);

console.log('Brand assets written to', out, 'using', browser);
