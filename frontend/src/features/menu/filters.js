/**
 * Menu filters as kept in the URL.
 * @typedef {object} MenuFilters
 * @property {string} kitchen kitchen slug or 'all'
 * @property {string} category category slug or 'all'
 * @property {string} q search text
 * @property {boolean} vegetarian
 * @property {boolean} glutenFree
 * @property {boolean} noNuts
 * @property {boolean} noPork
 * @property {number | null} maxSpice 0–3, null = any
 * @property {string} sort
 */

/** @type {MenuFilters} */
export const DEFAULT_FILTERS = {
  kitchen: 'all',
  category: 'all',
  q: '',
  vegetarian: false,
  glutenFree: false,
  noNuts: false,
  noPork: false,
  maxSpice: null,
  sort: 'recommended',
};

const KITCHENS = ['nigerian', 'polish', 'continental'];
const CATEGORIES = ['starters', 'soups', 'mains', 'grills', 'sides', 'desserts', 'drinks', 'tasting'];
const SORTS = ['recommended', 'popular', 'price-asc', 'price-desc'];

/** Strips accents so "zurek" finds "Żurek" and "golabki" finds "Gołąbki". */
export function normalise(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0142/g, 'l');
}

export function filterDishes(dishes, f) {
  const terms = normalise(f.q).split(/\s+/).filter(Boolean);
  const out = dishes.filter((d) => {
    if (f.kitchen !== 'all' && d.kitchen !== f.kitchen) return false;
    if (f.category !== 'all' && d.category !== f.category) return false;
    if (f.vegetarian && !d.isVegetarian) return false;
    if (f.glutenFree && !d.isGlutenFree) return false;
    if (f.noNuts && d.containsNuts) return false;
    if (f.noPork && d.containsPork) return false;
    if (f.maxSpice !== null && d.spiceLevel > f.maxSpice) return false;
    if (terms.length) {
      const hay = normalise(`${d.name} ${d.shortDescription} ${d.ingredients ?? ''} ${d.kitchen ?? ''}`);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const by = {
    recommended: (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.popularity - a.popularity,
    popular: (a, b) => b.popularity - a.popularity,
    'price-asc': (a, b) => a.priceKobo - b.priceKobo,
    'price-desc': (a, b) => b.priceKobo - a.priceKobo,
  }[f.sort];
  // Available dishes first so sold-out items never lead the list.
  return [...out].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || by(a, b));
}

export function filtersFromParams(p) {
  const kitchen = p.get('kitchen') ?? '';
  const category = p.get('category') ?? '';
  const spice = p.get('spice');
  const sort = p.get('sort') ?? '';
  return {
    kitchen: KITCHENS.includes(kitchen) ? kitchen : 'all',
    category: CATEGORIES.includes(category) ? category : 'all',
    q: (p.get('q') ?? '').slice(0, 60),
    vegetarian: p.get('veg') === '1',
    glutenFree: p.get('gf') === '1',
    noNuts: p.get('nonuts') === '1',
    noPork: p.get('nopork') === '1',
    maxSpice: spice !== null && /^[0-3]$/.test(spice) ? Number(spice) : null,
    sort: SORTS.includes(sort) ? sort : 'recommended',
  };
}

export function paramsFromFilters(f) {
  const p = new URLSearchParams();
  if (f.kitchen !== 'all') p.set('kitchen', f.kitchen);
  if (f.category !== 'all') p.set('category', f.category);
  if (f.q) p.set('q', f.q);
  if (f.vegetarian) p.set('veg', '1');
  if (f.glutenFree) p.set('gf', '1');
  if (f.noNuts) p.set('nonuts', '1');
  if (f.noPork) p.set('nopork', '1');
  if (f.maxSpice !== null) p.set('spice', String(f.maxSpice));
  if (f.sort !== 'recommended') p.set('sort', f.sort);
  return p;
}

export function activeFilterCount(f) {
  return [f.vegetarian, f.glutenFree, f.noNuts, f.noPork, f.maxSpice !== null].filter(Boolean).length;
}
