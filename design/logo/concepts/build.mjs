// Generates the Small Africa logo concept board (original artwork, no external assets).
// Run: node design/logo/concepts/build.mjs  ->  writes index.html + one SVG per concept.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const f = (n) => +n.toFixed(2);

// Catmull-Rom -> cubic bezier, closed loop. Gives the hand-drawn continent soft curves.
function smoothClosed(pts, t = 0.5) {
  const n = pts.length;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * t * 2, p1[1] + ((p2[1] - p0[1]) / 6) * t * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * t * 2, p2[1] - ((p3[1] - p1[1]) / 6) * t * 2];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${p2[0]} ${p2[1]}`;
  }
  return d + 'Z';
}

// Stylised African continent, drawn from scratch on a 100x110 grid.
const africa = smoothClosed([
  [20, 8], [33, 4], [45, 2], [50, 7], [57, 9], [66, 7], [73, 9], [77, 13], [80, 22], [84, 29],
  [89, 35], [99, 35], [96, 43], [89, 52], [83, 61], [82, 71], [78, 82], [72, 92], [64, 100],
  [55, 104], [50, 99], [47, 88], [45, 76], [42, 64], [43, 55], [37, 51], [27, 51], [17, 47],
  [8, 41], [2, 33], [5, 24], [11, 16],
]);
const madagascar = smoothClosed([[88, 76], [92, 74], [92, 84], [88, 92], [85, 88]]);

const fork = `<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
  <path d="M-4 -12 V-3 Q-4 1 0 1 Q4 1 4 -3 V-12"/><path d="M0 -12 V1"/><path d="M0 1 V16"/></g>`;
const leaf = `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
  <path d="M0 0 C6 -7 15 -7 22 0 C15 7 6 7 0 0Z"/><path d="M0 0 H18" stroke-width="0.9"/></g>`;

function ring(count, r1, r2, shape) {
  let out = '';
  for (let i = 0; i < count; i++) out += `<g transform="rotate(${f((360 / count) * i)} 100 100)">${shape(r1, r2)}</g>`;
  return out;
}

// A — Continent Plate
const conceptA = `
  <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width="2.4"/>
  <circle cx="100" cy="100" r="82" fill="none" stroke="currentColor" stroke-width="0.8"/>
  <g transform="translate(57 46) scale(0.86)" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round">
    <path d="${africa}"/><path d="${madagascar}" stroke-width="2"/></g>
  <g transform="translate(64 146) rotate(-28)">${fork}</g>
  <g transform="translate(122 152) rotate(-18)">${leaf}</g>`;

// B — SA Monogram Crest
const conceptB = `
  <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" stroke-width="1.6"/>
  ${ring(48, 86.5, 92.5, (a, b) => `<path d="M100 ${100 - b} L102.4 ${100 - (a + b) / 2} L100 ${100 - a} L97.6 ${100 - (a + b) / 2}Z" fill="currentColor"/>`)}
  <circle cx="100" cy="100" r="76" fill="none" stroke="currentColor" stroke-width="0.6"/>
  <text x="100" y="128" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="84" fill="currentColor" letter-spacing="-4">SA</text>
  <path d="M100 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="currentColor"/>
  <text x="100" y="152" text-anchor="middle" font-family="Manrope" font-weight="600" font-size="7.5" letter-spacing="3.2" fill="currentColor">LAGOS · EST. 2026</text>`;

// C — Sun Wordmark (sun is positioned over the first A of AFRICA by script in the preview)
const sun = `<g class="sun" transform="translate(274 48)"><circle r="4.2" fill="currentColor"/>${Array.from({ length: 12 }, (_, i) =>
  `<line x1="0" y1="-7" x2="0" y2="${i % 2 ? -9.5 : -12}" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" transform="rotate(${i * 30})"/>`).join('')}</g>`;
const conceptC = `
  <text class="wm" x="260" y="92" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="46" letter-spacing="7" fill="currentColor">SMALL AFRICA</text>
  ${sun}
  <line x1="150" y1="112" x2="230" y2="112" stroke="currentColor" stroke-width="0.8"/>
  <line x1="290" y1="112" x2="370" y2="112" stroke="currentColor" stroke-width="0.8"/>
  <path d="M260 108 l4 4 -4 4 -4 -4z" fill="currentColor"/>
  <text x="260" y="134" text-anchor="middle" font-family="Manrope" font-weight="500" font-size="10" letter-spacing="4.5" fill="currentColor">THREE KITCHENS · ONE TABLE</text>`;

// D — Pattern Ring + Papercut Flower (Nigerian zigzag ring, wycinanki-inspired bloom)
const petal = (len, w) => `M0 0 C${-w} ${-len * 0.35} ${-w * 0.8} ${-len * 0.8} 0 ${-len} C${w * 0.8} ${-len * 0.8} ${w} ${-len * 0.35} 0 0Z`;
const rot = (n, off, s) => Array.from({ length: n }, (_, i) => `<path d="${s}" transform="translate(100 100) rotate(${off + (360 / n) * i})"/>`).join('');
const conceptD = `
  <defs><mask id="cutD" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
    <rect width="200" height="200" fill="#fff"/>
    <g fill="#000">${rot(8, 0, petal(30, 4))}${rot(8, 22.5, petal(18, 3))}
      <circle cx="100" cy="100" r="6.5"/>
      ${Array.from({ length: 8 }, (_, i) => `<circle cx="100" cy="58" r="1.8" transform="rotate(${22.5 + i * 45} 100 100)"/>`).join('')}</g>
  </mask></defs>
  <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="100" cy="100" r="77" fill="none" stroke="currentColor" stroke-width="1.6"/>
  ${ring(36, 79.5, 92.5, (a, b) => `<path d="M95.6 ${100 - a} L100 ${100 - b} L104.4 ${100 - a}Z" fill="currentColor"/>`)}
  <g fill="currentColor" mask="url(#cutD)">${rot(8, 0, petal(50, 15))}${rot(8, 22.5, petal(34, 11))}<circle cx="100" cy="100" r="11"/></g>
  <circle cx="100" cy="100" r="2.6" fill="currentColor"/>`;

const concepts = [
  { id: 'a', name: 'A — Continent Plate', vb: '0 0 200 200', body: conceptA,
    note: 'A gold outline of the continent on a plate rim, with a fork and a leaf at its foot. The most literal of the four: it says "African dining" at a glance.' },
  { id: 'b', name: 'B — SA Monogram Crest', vb: '0 0 200 200', body: conceptB,
    note: 'A serif monogram in a crest edged with a ring of diamonds. It reads like a hotel or private club, so it suits the 5-star positioning, and it holds up best as a 16px favicon.' },
  { id: 'c', name: 'C — Sun Wordmark', vb: '0 0 520 150', body: conceptC, wide: true,
    fav: `<rect width="200" height="200" fill="none"/><text x="100" y="166" text-anchor="middle" font-family="Cormorant Garamond" font-weight="700" font-size="150" fill="currentColor">A</text><g transform="translate(100 34) scale(2.1)">${sun.replace(/ class="sun" transform="[^"]*"/,"")}</g>`,
    note: 'A refined serif wordmark with a small sun over the A and the tagline beneath. Elegant on signage and menus, but it needs a separate mark for the favicon.' },
  { id: 'd', name: 'D — Pattern & Papercut Badge', vb: '0 0 200 200', body: conceptD,
    note: 'A zigzag ring inspired by Nigerian textiles around a bloom inspired by Polish wycinanki papercuts. It tells the Nigerian + Polish story most directly.' },
];

const lockupWord = `<text x="100" y="236" text-anchor="middle" font-family="Cormorant Garamond" font-weight="600" font-size="21" letter-spacing="3.6" fill="currentColor">SMALL AFRICA</text>
  <text x="100" y="254" text-anchor="middle" font-family="Manrope" font-weight="500" font-size="7.5" letter-spacing="3.4" fill="currentColor">THREE KITCHENS · ONE TABLE</text>`;

const svgFile = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${c.vb}" color="#C9A24B">${c.body}</svg>\n`;
for (const c of concepts) writeFileSync(join(here, `concept-${c.id}.svg`), svgFile(c));

const tiles = [
  { label: 'Gold on obsidian', bg: '#0E0C0A', fg: '#C9A24B' },
  { label: 'Obsidian on ivory', bg: '#F6EFE3', fg: '#0E0C0A' },
  { label: 'Single colour (ivory on terracotta)', bg: '#B4492F', fg: '#F6EFE3' },
];

// Unique ids per inline instance so masks don't collide.
const inst = (c, k) => c.body.replaceAll('cutD', `cutD${k}`);
let k = 0;
const section = (c) => `
<section>
  <h2>${c.name}</h2><p class="note">${c.note}</p>
  <div class="tiles">${tiles.map((t) => `
    <figure style="background:${t.bg};color:${t.fg}">
      <svg viewBox="${c.wide ? c.vb : '0 0 200 264'}" class="${c.wide ? 'wide' : ''}">${inst(c, k++)}${c.wide ? '' : lockupWord}</svg>
      <figcaption>${t.label}</figcaption></figure>`).join('')}
  </div>
  <div class="small"><span>Small sizes:</span>
    ${[180, 64, 32, 16].map((s) => `<span class="fav" style="width:${s}px;height:${s}px"><svg viewBox="0 0 200 200" width="${s}" height="${s}">${c.fav ?? inst(c, k++)}</svg></span>`).join('')}
    <span class="sign">Storefront sign:<span class="signbox"><svg viewBox="${c.wide ? c.vb : '0 0 200 264'}">${inst(c, k++)}${c.wide ? '' : lockupWord}</svg></span></span>
  </div>
</section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Small Africa — Logo Concepts</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--obsidian:#0E0C0A;--ebony:#1A1612;--gold:#C9A24B;--ivory:#F6EFE3;--smoke:#8A8178;--sand:#E7D9C4}
*{box-sizing:border-box}body{margin:0;background:var(--obsidian);color:var(--ivory);font-family:Manrope,sans-serif;padding:48px 16px}
main{max-width:1200px;margin:auto}h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(36px,5vw,56px);margin:0;color:var(--gold)}
.lede{color:var(--sand);max-width:680px;line-height:1.6}section{border-top:1px solid #C9A24B44;padding:40px 0}
h2{font-family:'Cormorant Garamond',serif;font-size:32px;margin:0 0 6px}.note{color:var(--sand);margin:0 0 20px;max-width:760px;line-height:1.55}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
figure{margin:0;border-radius:6px;padding:28px 24px 12px;display:flex;flex-direction:column;align-items:center}
figure svg{width:100%;max-width:240px;height:auto}figure svg.wide{max-width:100%}
figcaption{font-size:12px;opacity:.75;margin-top:10px;letter-spacing:.04em}
.small{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin-top:18px;color:var(--gold);font-size:13px}
.small>span:first-child{color:var(--smoke)}.fav{display:inline-flex;background:var(--ebony);border-radius:4px}
.sign{color:var(--smoke);display:flex;align-items:center;gap:10px}.signbox{display:inline-block;width:220px;padding:10px;background:#111;border:6px solid #2a241e;color:var(--gold);box-shadow:inset 0 0 18px #C9A24B22}
.signbox svg{width:100%;height:auto}
</style></head><body><main>
<h1>Small Africa — Logo Concepts</h1>
<p class="lede">Four original directions, each shown on the three colourways from the brief, at favicon sizes and on a storefront sign. Lettering uses Cormorant Garamond and Manrope (OFL). The text in the chosen logo will be converted to outlines in the final export.</p>
${concepts.map(section).join('')}
</main>
<script>
// Place the sun of concept C above the first "A" of AFRICA, whatever the font metrics.
document.fonts.ready.then(()=>document.querySelectorAll('text.wm').forEach(t=>{
  const i=t.textContent.indexOf('AFRICA'); const s=t.getStartPositionOfChar(i), e=t.getEndPositionOfChar(i);
  const sun=t.parentNode.querySelector('.sun'); if(sun) sun.setAttribute('transform','translate('+((s.x+e.x)/2)+' 48)');
}));
</script></body></html>`;
writeFileSync(join(here, 'index.html'), html);
console.log('Wrote concept board + SVGs to', here);
