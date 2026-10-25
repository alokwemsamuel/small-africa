// use_figma script: composes the "Style Guide Board" on the Style Guide page (id 0:1).
// Depends on variables, text styles and components listed in state.json. Idempotent: skips if the board exists.
const page = await figma.getNodeByIdAsync('0:1'); await figma.setCurrentPageAsync(page);
if (page.findOne(n => n.name === 'Style Guide Board')) return { skipped: 'exists' };
const V = async (id) => figma.variables.getVariableByIdAsync(id);
const TH = {"bg/base":"VariableID:1:71","bg/surface":"VariableID:1:72","text/on-dark":"VariableID:1:75","text/muted":"VariableID:1:77","text/accent":"VariableID:1:78","primary":"VariableID:1:79","border/gold":"VariableID:1:84"};
const ST = {"Display":"S:e5fe0e1664a96d7478853882669ba676adfe0311,","H1":"S:2c33bd425f3f69db8d12f03822066f9198b2a7aa,","H2":"S:9a3332aeeac7e1e39e06c6f03df5c354741a6da2,","H3":"S:d1bb24f92677d237cf3f31f8d84b8949e6f5c73d,","H4":"S:cd9bb7092b76706871218b4fdb9a3b57471e269f,","BodyL":"S:1442b90a1f37288443a4434fcee9d11bdede0ae3,","Body":"S:8be5e5c4ae4a3419129c4a3dc997c9d8e29c7672,","Small":"S:92e74cd71efb5a2efcd6762608fa9e38282a3f8d,","Button":"S:9e7af72666144f64f09aeda1adfb699e70a35027,","Overline":"S:6856e37ce487dd1222d526e64152d7f8837f88d7,","Price":"S:b01ac80fdbf9f2c0b3e8b58f7a17f4a2b5d72665,","Script":"S:6caa157137e3f574f625c4a0d884a36365f865e0,"};
const paint = async (id) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', await V(id));
for (const f of [['Manrope','Regular'],['Manrope','SemiBold'],['Cormorant Garamond','SemiBold'],['Cormorant Garamond','Bold'],['Italiana','Regular']]) await figma.loadFontAsync({ family: f[0], style: f[1] });
const text = async (s, style, color = 'text/on-dark', w) => { const t = figma.createText(); await t.setTextStyleIdAsync(ST[style]); t.characters = s; t.fills = [await paint(TH[color])]; if (w) { t.resize(w, t.height); t.textAutoResize = 'HEIGHT'; } return t; };

const board = figma.createAutoLayout('VERTICAL', { name: 'Style Guide Board', itemSpacing: 72, paddingLeft: 96, paddingRight: 96, paddingTop: 96, paddingBottom: 96 });
board.fills = [await paint(TH['bg/base'])]; board.x = 0; board.y = 0; board.resize(1440, 100); board.primaryAxisSizingMode = 'AUTO';
const section = async (over, title) => {
  const s = figma.createAutoLayout('VERTICAL', { name: title, itemSpacing: 24 }); board.appendChild(s); s.layoutSizingHorizontal = 'FILL'; s.fills = [];
  s.appendChild(await text(over, 'Overline', 'text/accent')); s.appendChild(await text(title, 'H2'));
  const rule = figma.createRectangle(); rule.resize(64, 1); rule.fills = [await paint(TH.primary)]; s.appendChild(rule); return s;
};

// Header
const head = figma.createAutoLayout('HORIZONTAL', { name: 'Header', itemSpacing: 48, counterAxisAlignItems: 'CENTER' }); head.fills = []; board.appendChild(head);
const crest = (await figma.getNodeByIdAsync('2:3')).createInstance(); crest.resize(180, 180); head.appendChild(crest);
const ht = figma.createAutoLayout('VERTICAL', { itemSpacing: 12 }); ht.fills = []; head.appendChild(ht);
ht.appendChild(await text('Small Africa — Style Guide', 'Display'));
ht.appendChild(await text('Three kitchens. One table.', 'Script', 'text/accent'));
ht.appendChild(await text('Source of truth for colour, type, spacing and core components. Tokens map 1:1 to CSS variables in the app.', 'BodyL', 'text/muted', 760));

// Colour
const col = await section('01 — Foundations', 'Colour');
const grid = figma.createAutoLayout('HORIZONTAL', { name: 'Swatches', itemSpacing: 20, counterAxisSpacing: 28, layoutWrap: 'WRAP' }); grid.fills = []; col.appendChild(grid); grid.layoutSizingHorizontal = 'FILL';
const prims = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(v => v.name.startsWith('brand/'));
const uses = { obsidian: 'Main dark background', ebony: 'Cards on dark', gold: 'Primary accent, CTAs', 'gold-light': 'Hover, highlights', terracotta: 'Nigerian accent', palm: 'Secondary accent', crimson: 'Polish accent (sparingly)', ivory: 'Light sections, text on dark', sand: 'Muted bg, borders', smoke: 'Secondary text' };
for (const v of prims) {
  const key = v.name.split('/')[1]; const c = Object.values(v.valuesByMode)[0];
  const h = '#' + [c.r, c.g, c.b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const sw = figma.createAutoLayout('VERTICAL', { name: key, itemSpacing: 6 }); sw.fills = []; grid.appendChild(sw);
  const r = figma.createRectangle(); r.resize(232, 120); r.cornerRadius = 6; r.fills = [figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v)];
  r.strokes = [{ type: 'SOLID', color: { r: 0.79, g: 0.64, b: 0.29 }, opacity: 0.25 }]; r.strokeWeight = 1; sw.appendChild(r);
  sw.appendChild(await text(key, 'H4')); sw.appendChild(await text(`${h} · ${uses[key]}`, 'Small', 'text/muted', 232));
}
col.appendChild(await text('Contrast (WCAG AA): ivory on obsidian 17.4:1 · gold on obsidian 8.6:1 · obsidian on ivory 17.4:1 · smoke on obsidian 5.0:1. Gold is not used for body text on ivory (2.0:1).', 'Small', 'text/muted', 1100));

// Typography
const ty = await section('02 — Foundations', 'Typography');
const samples = [['Display', 'Display · Cormorant Garamond 80', 'Three kitchens. One table.'], ['H1', 'H1 · Cormorant Garamond 56', 'From Lagos to Kraków'], ['H2', 'H2 · 40', 'Signature dishes'], ['H3', 'H3 · 28', 'Private dining'], ['H4', 'H4 · Bold 22', 'Smoky Party Jollof'], ['BodyL', 'Body Large · Manrope 18', 'Slow-cooked over firewood, finished with a whisper of smoke.'], ['Body', 'Body · Manrope 16', 'Every dish is made to order in one of our three kitchens.'], ['Small', 'Small · Manrope 14', 'Contains nuts · Spice level 2'], ['Button', 'Button · Manrope SemiBold 14 / +8%', 'Reserve a table'], ['Overline', 'Overline · Manrope SemiBold 12 / +20%', 'Nigerian kitchen'], ['Price', 'Price · Manrope SemiBold 16', '₦18,500'], ['Script', "Accent · Italiana 28 (sparingly)", "Chef's Special"]];
for (const [st, label, sample] of samples) {
  const row = figma.createAutoLayout('HORIZONTAL', { itemSpacing: 32, counterAxisAlignItems: 'BASELINE' }); row.fills = []; ty.appendChild(row);
  row.appendChild(await text(label, 'Small', 'text/muted', 280)); row.appendChild(await text(sample, st));
}

// Spacing & radius
const sp = await section('03 — Foundations', 'Spacing & radius');
const sprow = figma.createAutoLayout('HORIZONTAL', { itemSpacing: 28, counterAxisAlignItems: 'MAX' }); sprow.fills = []; sp.appendChild(sprow);
for (const n of [4, 8, 12, 16, 24, 32, 48, 64, 96, 128]) {
  const c = figma.createAutoLayout('VERTICAL', { itemSpacing: 8, counterAxisAlignItems: 'CENTER' }); c.fills = []; sprow.appendChild(c);
  const r = figma.createRectangle(); r.resize(n, n); r.fills = [await paint(TH.primary)]; r.opacity = 0.85; c.appendChild(r); c.appendChild(await text(String(n), 'Small', 'text/muted'));
}
sp.appendChild(await text('Base unit 4px. Section padding 96–128 desktop / 64 mobile. Radius: sm 4 (inputs), md 8 (cards), full (buttons, badges).', 'Small', 'text/muted', 1100));

// Components
const cm = await section('04 — Components', 'Components');
const crow = figma.createAutoLayout('HORIZONTAL', { itemSpacing: 48, counterAxisAlignItems: 'MIN' }); crow.fills = []; cm.appendChild(crow);
const left = figma.createAutoLayout('VERTICAL', { itemSpacing: 28 }); left.fills = []; crow.appendChild(left);
const btnSet = await figma.getNodeByIdAsync('2:70');
const br = figma.createAutoLayout('HORIZONTAL', { itemSpacing: 16 }); br.fills = []; left.appendChild(br);
for (const n of ['Style=Primary, State=Default', 'Style=Secondary, State=Default', 'Style=Ghost, State=Default']) br.appendChild(btnSet.children.find(c => c.name === n).createInstance());
const inSet = await figma.getNodeByIdAsync('2:84');
for (const c of inSet.children) left.appendChild(c.createInstance());
const bSet = await figma.getNodeByIdAsync('2:91');
const bdr = figma.createAutoLayout('HORIZONTAL', { itemSpacing: 12 }); bdr.fills = []; left.appendChild(bdr);
for (const c of bSet.children) bdr.appendChild(c.createInstance());
crow.appendChild((await figma.getNodeByIdAsync('2:92')).createInstance());

return { board: board.id, size: [board.width, board.height], swatches: prims.length };
