// Fails if the production build (dist/ from `npm run build`) contains anything from the demo:
// the in-browser API, its data, or the simulated social sign-in. Run it right after a production build.
// Usage: node scripts/check-prod-bundle.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
// Text that only exists in demo code: fake people and their consent screen, the demo password salt,
// and the demo database's snapshot.
const MARKERS = [
  'ada.okafor@example.com',
  'This is a simulation: no real',
  'small-africa-demo:',
  'DEMO VERSION',
  'Reset demo data',
  // The demo logins and the box that shows them.
  '@smallafrica.demo',
  'SmallAfrica@',
  'Demo credentials',
];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(js|css|html|json)$/.test(entry.name)) yield path;
  }
}

const found = [];
for (const file of files(dist)) {
  const text = readFileSync(file, 'utf8');
  for (const marker of MARKERS)
    if (text.includes(marker)) found.push(`${file.slice(dist.length + 1)}: "${marker}"`);
}
if (/demo/i.test(readdirSync(join(dist, 'assets')).join(' ')))
  found.push('a file in dist/assets has "demo" in its name');
if (found.length) {
  const shown = found.slice(0, 12);
  const more = found.length > shown.length ? `\n  ... and ${found.length - shown.length} more` : '';
  console.error('The production build contains demo-only code:\n  ' + shown.join('\n  ') + more);
  process.exit(1);
}
console.log('Production build is free of demo code.');
