/** Same alphabet as the API's Crypto::code (no 0/O, 1/I/L look-alikes). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Seeded generator (mulberry32) so the busy demo data is the same on every rebuild of a day. */
export function seeded(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Inclusive, like PHP's mt_rand(lo, hi). */
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (list) => list[int(0, list.length - 1)];
  /** Index chosen in proportion to its weight. */
  const index = (weights) => {
    let r = int(
      1,
      weights.reduce((s, w) => s + w, 0),
    );
    for (const [i, w] of weights.entries()) {
      r -= w;
      if (r <= 0) return i;
    }
    return 0;
  };
  /** Key chosen in proportion to its weight. */
  const weighted = (weights) => {
    const keys = Object.keys(weights);
    return keys[index(keys.map((k) => weights[k]))];
  };
  const code = (length, prefix = '') =>
    prefix + Array.from({ length }, () => ALPHABET[int(0, ALPHABET.length - 1)]).join('');
  return { next, int, pick, index, weighted, code };
}

/** Unpredictable codes for things created while the demo runs (orders, vouchers…). */
export function code(length, prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return prefix + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
