import { DEFAULT_FILTERS, filterDishes, filtersFromParams, normalise, paramsFromFilters } from './filters';
import type { Dish } from './types';

const dish = (over: Partial<Dish>): Dish => ({
  id: 1,
  slug: 'x',
  name: 'X',
  kitchen: 'nigerian',
  category: 'mains',
  shortDescription: '',
  description: '',
  ingredients: null,
  allergens: [],
  priceKobo: 1000000,
  spiceLevel: 0,
  isVegetarian: false,
  isGlutenFree: false,
  containsNuts: false,
  containsPork: false,
  isAlcoholic: false,
  isFeatured: false,
  isAvailable: true,
  popularity: 0,
  imageUrl: null,
  imageAlt: '',
  options: { portion: [], addon: [] },
  ...over,
});

const menu = [
  dish({
    id: 1,
    slug: 'jollof',
    name: 'Smoky Party Jollof',
    spiceLevel: 2,
    popularity: 98,
    isFeatured: true,
    priceKobo: 1850000,
  }),
  dish({
    id: 2,
    slug: 'zurek',
    name: 'Żurek',
    kitchen: 'polish',
    category: 'soups',
    containsPork: true,
    popularity: 57,
    priceKobo: 1250000,
  }),
  dish({ id: 3, slug: 'golabki', name: 'Gołąbki', kitchen: 'polish', popularity: 37, priceKobo: 1400000 }),
  dish({
    id: 4,
    slug: 'ruskie',
    name: 'Pierogi Ruskie',
    kitchen: 'polish',
    isVegetarian: true,
    popularity: 84,
    priceKobo: 1350000,
  }),
  dish({
    id: 5,
    slug: 'suya',
    name: 'Beef Suya',
    containsNuts: true,
    spiceLevel: 2,
    isGlutenFree: true,
    popularity: 90,
    priceKobo: 1450000,
  }),
  dish({
    id: 6,
    slug: 'wellington',
    name: 'Beef Wellington',
    kitchen: 'continental',
    containsPork: true,
    isAvailable: false,
    popularity: 99,
    priceKobo: 4800000,
  }),
];

describe('menu filters', () => {
  it('"No pork" removes every dish that contains pork', () => {
    const out = filterDishes(menu, { ...DEFAULT_FILTERS, noPork: true });
    expect(out.map((d) => d.slug)).not.toContain('zurek');
    expect(out.map((d) => d.slug)).not.toContain('wellington');
    expect(out.every((d) => !d.containsPork)).toBe(true);
  });

  it('combines kitchen, dietary and spice filters', () => {
    expect(
      filterDishes(menu, { ...DEFAULT_FILTERS, kitchen: 'polish', vegetarian: true }).map((d) => d.slug),
    ).toEqual(['ruskie']);
    expect(
      filterDishes(menu, { ...DEFAULT_FILTERS, noNuts: true, maxSpice: 1 }).map((d) => d.slug),
    ).not.toContain('jollof');
    expect(filterDishes(menu, { ...DEFAULT_FILTERS, glutenFree: true }).map((d) => d.slug)).toEqual(['suya']);
  });

  it('search ignores Polish diacritics', () => {
    expect(normalise('Żurek Gołąbki')).toBe('zurek golabki');
    expect(filterDishes(menu, { ...DEFAULT_FILTERS, q: 'zurek' }).map((d) => d.slug)).toEqual(['zurek']);
    expect(filterDishes(menu, { ...DEFAULT_FILTERS, q: 'golabki' }).map((d) => d.slug)).toEqual(['golabki']);
  });

  it('sorts by price and keeps sold-out dishes last', () => {
    const asc = filterDishes(menu, { ...DEFAULT_FILTERS, sort: 'price-asc' });
    expect(asc.at(-1)?.slug).toBe('wellington'); // most expensive AND sold out
    expect(asc[0]?.slug).toBe('zurek');
    const recommended = filterDishes(menu, DEFAULT_FILTERS);
    expect(recommended[0]?.slug).toBe('jollof'); // featured first
    expect(recommended.at(-1)?.slug).toBe('wellington');
  });

  it('round-trips through URL parameters and ignores junk', () => {
    const f = {
      ...DEFAULT_FILTERS,
      kitchen: 'polish' as const,
      noPork: true,
      maxSpice: 1,
      sort: 'popular' as const,
      q: 'pierogi',
    };
    expect(filtersFromParams(paramsFromFilters(f))).toEqual(f);
    expect(filtersFromParams(new URLSearchParams('kitchen=<script>&spice=9&sort=drop'))).toEqual(
      DEFAULT_FILTERS,
    );
    expect(paramsFromFilters(f).toString()).toContain('nopork=1');
  });
});
