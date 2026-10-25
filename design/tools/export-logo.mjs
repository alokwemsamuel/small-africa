// Final export of the chosen logo (Concept B — SA Monogram Crest).
// Text is converted to outlines via resvg, so the SVGs need no fonts installed.
// Run: node design/tools/export-logo.mjs
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, '..', 'fonts');
const out = join(here, '..', 'logo');
mkdirSync(join(out, 'favicon'), { recursive: true });

const C = { gold: '#C9A24B', obsidian: '#0E0C0A', ivory: '#F6EFE3', black: '#000000', white: '#FFFFFF' };
const fontOpts = {
  fontFiles: ['CormorantGaramond-SemiBold.ttf', 'Manrope-Medium.ttf', 'Manrope-SemiBold.ttf'].map((f) => join(fontsDir, f)),
  loadSystemFonts: false,
  defaultFontFamily: 'Manrope',
};

const diamondRing = (count, a, b) =>
  Array.from({ length: count }, (_, i) =>
    `<path transform="rotate(${((360 / count) * i).toFixed(2)} 100 100)" d="M100 ${100 - b} L102.4 ${100 - (a + b) / 2} L100 ${100 - a} L97.6 ${100 - (a + b) / 2}Z"/>`).join('');

// The crest on a 200x200 grid. All fills/strokes use `col`.
const crest = (col, { detail = true } = {}) => `
<g fill="${col}" stroke="none">
  <circle cx="100" cy="100" r="95" fill="none" stroke="${col}" stroke-width="1.6"/>
  <circle cx="100" cy="100" r="84" fill="none" stroke="${col}" stroke-width="1.6"/>
  ${diamondRing(48, 86.5, 92.5)}
  <circle cx="100" cy="100" r="76" fill="none" stroke="${col}" stroke-width="0.6"/>
  <text x="100" y="128" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="84" letter-spacing="-4">SA</text>
  <path d="M100 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
  ${detail ? `<text x="101.1" y="146" text-anchor="middle" font-family="Manrope" font-weight="600" font-size="6.5" letter-spacing="2.2">LAGOS · EST. 2026</text>` : ''}
</g>`;

// Simplified crest for 16–48px: heavier rings, no diamonds, star or small text.
const crestSmall = (col) => `
<g fill="${col}">
  <circle cx="100" cy="100" r="91" fill="none" stroke="${col}" stroke-width="9"/>
  <text x="100" y="134" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="104" letter-spacing="-6">SA</text>
</g>`;

const wordmark = (col, y = 236) => `
<g fill="${col}">
  <text x="101.8" y="${y}" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="21" letter-spacing="3.6">SMALL AFRICA</text>
  <text x="101.7" y="${y + 18}" text-anchor="middle" font-family="Manrope" font-weight="500" font-size="7.5" letter-spacing="3.4">THREE KITCHENS · ONE TABLE</text>
</g>`;

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;

const variants = {
  mark: (col) => svg(200, 200, crest(col)),
  stacked: (col) => svg(200, 264, crest(col) + wordmark(col)),
  horizontal: (col) => svg(520, 200, crest(col) + `
<g fill="${col}">
  <text x="228" y="112" font-family="Cormorant Garamond" font-weight="600" font-size="52" letter-spacing="7">SMALL AFRICA</text>
  <rect x="230" y="128" width="40" height="1" />
  <text x="282" y="131.5" font-family="Manrope" font-weight="500" font-size="10" letter-spacing="4.4">THREE KITCHENS · ONE TABLE</text>
</g>`),
};

// Resvg converts all <text> to paths when re-serialising.
const outline = (src) => new Resvg(src, { font: fontOpts }).toString();
const png = (src, width) => new Resvg(src, { font: fontOpts, fitTo: { mode: 'width', value: width } }).render().asPng();

const colourways = { gold: C.gold, obsidian: C.obsidian, ivory: C.ivory, black: C.black, white: C.white };
for (const [name, make] of Object.entries(variants)) {
  for (const [cw, col] of Object.entries(colourways)) {
    let src = make(col);
    if (name === "horizontal") {
      // Trim the canvas to the real wordmark width so nothing clips.
      const bb = new Resvg(src, { font: fontOpts }).getBBox();
      const w = Math.ceil(bb.x + bb.width + 4);
      src = src.replace(/width="520" height="200" viewBox="0 0 520 200"/, `width="${w}" height="200" viewBox="0 0 ${w} 200"`);
    }
    writeFileSync(join(out, `small-africa-${name}-${cw}.svg`), outline(src));
    if (cw === 'gold' || cw === 'obsidian') {
      for (const w of [512, 1024, 2048]) writeFileSync(join(out, `small-africa-${name}-${cw}-${w}.png`), png(src, w));
    }
  }
}

// Favicons: gold crest on an obsidian tile. Detailed crest from 180px up, simplified below.
const tile = (size, body) =>
  svg(200, 200, `<rect width="200" height="200" rx="${size >= 180 ? 36 : 28}" fill="${C.obsidian}"/>` +
    `<g transform="translate(100 100) scale(${size >= 180 ? 0.88 : 0.9}) translate(-100 -100)">${body}</g>`);
const favSrc = (size) => tile(size, size >= 180 ? crest(C.gold, { detail: size >= 512 }) : crestSmall(C.gold));
const favPngs = {};
for (const s of [16, 32, 48, 180, 192, 512]) {
  favPngs[s] = png(favSrc(s), s);
  const name = s === 180 ? 'apple-touch-icon.png' : `favicon-${s}.png`;
  writeFileSync(join(out, 'favicon', name), favPngs[s]);
}
writeFileSync(join(out, 'favicon', 'favicon.svg'), outline(favSrc(32)));
writeFileSync(join(out, 'favicon', 'favicon.ico'), await pngToIco([favPngs[16], favPngs[32], favPngs[48]]));

// Open Graph / social share image, 1200x630.
const og = svg(1200, 630, `
<defs><radialGradient id="glow" cx="30%" cy="50%" r="60%"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.16"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient></defs>
<rect width="1200" height="630" fill="url(#glow)"/>
<rect x="28" y="28" width="1144" height="574" fill="none" stroke="${C.gold}" stroke-opacity="0.45" stroke-width="1.5"/>
<g transform="translate(110 125) scale(1.9)">${crest(C.gold)}</g>
<g fill="${C.ivory}">
  <text x="560" y="290" font-family="Cormorant Garamond" font-weight="600" font-size="70" letter-spacing="6">SMALL AFRICA</text>
</g>
<rect x="564" y="322" width="70" height="1.5" fill="${C.gold}"/>
<g fill="${C.gold}">
  <text x="564" y="380" font-family="Cormorant Garamond" font-weight="600" font-size="40">Three kitchens. One table.</text>
  <text x="564" y="440" font-family="Manrope" font-weight="500" font-size="17" letter-spacing="5">NIGERIAN · POLISH · CONTINENTAL — LAGOS</text>
</g>`, C.obsidian);
writeFileSync(join(out, 'og-image-1200x630.png'), png(og, 1200));

console.log('Logo assets written to', out);
