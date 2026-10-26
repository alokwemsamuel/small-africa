// Writes public/sitemap.xml and public/robots.txt from the site's routes and the seeded menu.
// Runs automatically before `npm run build` (prebuild). SITE_URL comes from VITE_SITE_URL.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mode = process.argv[2] ?? 'production';
const envFile = (name) => {
  try {
    return readFileSync(resolve(root, name), 'utf8');
  } catch {
    return '';
  }
};
const env = Object.fromEntries(
  [envFile('.env'), envFile(`.env.${mode}`)]
    .join('\n')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const site = (process.env.VITE_SITE_URL ?? env.VITE_SITE_URL ?? 'https://smallafrica.ng').replace(/\/$/, '');

const menu = readFileSync(resolve(root, '../backend/seeds/data/menu.php'), 'utf8');
const slugs = [...menu.matchAll(/'slug' => '([a-z0-9-]+)'/g)].map((m) => m[1]);

const pages = [
  ['/', '1.0', 'weekly'],
  ['/menu', '0.9', 'weekly'],
  ['/reservations', '0.9', 'monthly'],
  ['/events', '0.8', 'monthly'],
  ['/about', '0.7', 'monthly'],
  ['/gallery', '0.6', 'monthly'],
  ['/contact', '0.7', 'monthly'],
  ['/rewards', '0.7', 'monthly'],
  ['/faq', '0.5', 'monthly'],
  ['/privacy', '0.3', 'yearly'],
  ['/terms', '0.3', 'yearly'],
  ...slugs.map((s) => [`/menu/${s}`, '0.6', 'monthly']),
];
const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  resolve(root, 'public/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages
      .map(
        ([p, prio, freq]) =>
          `  <url><loc>${site}${p}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`,
      )
      .join('\n') +
    '\n</urlset>\n',
);
writeFileSync(
  resolve(root, 'public/robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /cart\nDisallow: /style-guide\n\nSitemap: ${site}/sitemap.xml\n`,
);
console.log(`sitemap: ${pages.length} URLs for ${site}`);
