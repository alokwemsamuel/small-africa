// Pre-builds the public pages as plain HTML (runs after `vite build` and the server build).
// Usage: node scripts/prerender.mjs [production|demo]
//
// Each public page is rendered with React on the server (src/entry-server.jsx) and saved as
// an HTML file with its data, so the browser paints it straight away and React then attaches
// to it. Account, admin, checkout and other private pages are not pre-built: they use the app
// shell (app.html; on GitHub Pages also 404.html).
//
// Data: the seeded demo menu and site details, or a live API when PRERENDER_API_URL is set
// (e.g. https://smallafrica.ng/api for a production build). See docs/DEPLOYMENT.md.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// React and the router in production mode: faster, and the same output browsers get.
process.env.NODE_ENV = 'production';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'production';
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');

const PAGES = [
  '/',
  '/menu',
  '/reservations',
  '/about',
  '/gallery',
  '/events',
  '/contact',
  '/faq',
  '/privacy',
  '/terms',
  '/rewards',
  '/rewards-terms',
];

const server = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href);
if (process.env.PRERENDER_API_URL) {
  console.log(`Data: live API ${process.env.PRERENDER_API_URL}`);
  server.fromLiveApi(process.env.PRERENDER_API_URL);
} else {
  console.log('Data: seeded demo menu and site details');
  await server.fromDemoData();
}

const template = readFileSync(join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html is not a fresh Vite build');

// The plain app shell, for every page that isn't pre-built.
writeFileSync(join(dist, 'app.html'), template);
// GitHub Pages serves 404.html for any unknown address: the shell boots the app right there.
if (mode === 'demo') writeFileSync(join(dist, '404.html'), template);

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** JSON inside <script type="application/json">: "<" escaped so it can never close the tag. */
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function pageHtml(path, { html, head, state }) {
  let out = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeText(head.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escapeAttr(head.description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(head.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(head.description)}$2`);
  const extraHead = [
    `<link rel="canonical" href="${escapeAttr(head.url)}" />`,
    `<meta property="og:url" content="${escapeAttr(head.url)}" />`,
  ].join('\n    ');
  // The script font is only on the home page's first screen (the hero); don't preload it elsewhere.
  if (path !== '/') out = out.replace(/\s*<link\s+rel="preload"[^>]*italiana[^>]*\/>/, '');
  out = out.replace('</head>', `    ${extraHead}\n  </head>`);
  // The page's data, read by src/main.jsx. A data block, not a script: allowed by the CSP.
  const data = `<script type="application/json" id="prerender">${safeJson({ path, state })}</script>`;
  return out.replace('<div id="root"></div>', `<div id="root">${html}</div>\n    ${data}`);
}

const slugs = await server.dishSlugs();
const all = [...PAGES, ...slugs.map((s) => `/menu/${s}`)];
let bytes = 0;
for (const path of all) {
  const result = await server.render(path);
  // The production CSP blocks style attributes, so a pre-built page with one would look broken.
  const inline = result.html.match(/<[^>]+\sstyle="[^"]*"/);
  if (inline)
    throw new Error(`${path}: inline style in pre-built HTML (use a CSS class): ${inline[0].slice(0, 120)}`);
  const file = path === '/' ? join(dist, 'index.html') : join(dist, `${path.slice(1)}.html`);
  mkdirSync(dirname(file), { recursive: true });
  const html = pageHtml(path, result);
  writeFileSync(file, html);
  bytes += html.length;
}
console.log(
  `Pre-built ${all.length} pages (${PAGES.length} public pages + ${slugs.length} dishes), ${Math.round(bytes / 1024)} KB of HTML`,
);

// The server bundle is only needed during the build.
if (existsSync(ssrDir)) rmSync(ssrDir, { recursive: true, force: true });
