import css from './theme.css?raw';

/** WCAG 2.x relative luminance / contrast for opaque hex colours. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function tokens(selector) {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--sa-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]),
  );
}

const themes = { dark: tokens("[data-theme='dark']"), light: tokens("[data-theme='light']") };

describe.each(Object.entries(themes))('%s theme meets WCAG AA', (_name, t) => {
  const surfaces = ['surface', 'surface-raised', 'surface-inset'];
  const texts = [
    'text-primary',
    'text-secondary',
    'text-muted',
    'accent',
    'accent-hover',
    'danger',
    'success',
  ];

  it('defines every token', () => {
    for (const k of [
      ...surfaces,
      ...texts,
      'accent-fill',
      'accent-fill-hover',
      'on-accent',
      'border-input',
      'focus',
    ]) {
      expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(surfaces.flatMap((s) => texts.map((x) => [x, s])))('%s on %s ≥ 4.5:1', (text, surface) => {
    expect(contrast(t[text], t[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it('button text on gold fills ≥ 4.5:1', () => {
    expect(contrast(t['on-accent'], t['accent-fill'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['on-accent'], t['accent-fill-hover'])).toBeGreaterThanOrEqual(4.5);
  });

  it('status icons (surface colour on danger/success) ≥ 4.5:1', () => {
    expect(contrast(t['surface'], t['danger'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['surface'], t['success'])).toBeGreaterThanOrEqual(4.5);
  });

  it('input borders and focus ring ≥ 3:1 (non-text contrast)', () => {
    for (const s of ['surface', 'surface-inset']) {
      expect(contrast(t['border-input'], t[s])).toBeGreaterThanOrEqual(3);
      expect(contrast(t['focus'], t[s])).toBeGreaterThanOrEqual(3);
    }
  });
});

it('kitchen badges keep ivory text readable', () => {
  for (const bg of ['#b4492f', '#a3243b', '#2e4a3b'])
    expect(contrast('#f6efe3', bg)).toBeGreaterThanOrEqual(4.5);
});
