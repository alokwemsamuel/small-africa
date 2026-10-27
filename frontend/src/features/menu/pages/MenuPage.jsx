import { useDeferredValue, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/layout/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { useSeo } from '@/lib/seo';
import { DishCard } from '@/components/menu/DishCard';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filterDishes,
  filtersFromParams,
  paramsFromFilters,
} from '@/features/menu/filters';
import { useMenu } from '@/hooks/useMenu';

const KITCHEN_TABS = [
  { value: 'all', label: 'All kitchens' },
  { value: 'nigerian', label: 'Nigerian' },
  { value: 'polish', label: 'Polish' },
  { value: 'continental', label: 'Continental' },
];

const DIETARY = [
  { key: 'noPork', label: 'No pork' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'glutenFree', label: 'Gluten-free' },
  { key: 'noNuts', label: 'No nuts' },
];

export function MenuPage() {
  useSeo({
    title: 'Menu',
    description:
      'Explore the Small Africa menu: smoky party jollof, hand-pinched pierogi, Beef Wellington and more from our Nigerian, Polish and Continental kitchens. Filter by vegetarian, gluten-free, no pork and spice level.',
  });
  const { data, isPending, isError, refetch } = useMenu();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const deferredQuery = useDeferredValue(filters.q);

  const update = (patch) =>
    setParams(paramsFromFilters({ ...filters, ...patch }), { replace: true, preventScrollReset: true });

  const results = useMemo(
    () => (data ? filterDishes(data.dishes, { ...filters, q: deferredQuery }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, params.toString(), deferredQuery],
  );
  const showAlcoholNotice = results.some((d) => d.isAlcoholic);

  return (
    <>
      <PageHeader
        eyebrow="Nigerian · Polish · Continental"
        title="The Menu"
        intro="Three kitchens, one table. Every dish is cooked to order. Prices include VAT; a 10% service charge applies to dine-in bills."
        photo="ambience/jollof-table"
      />

      <div className="container-luxe py-10">
        <section
          aria-label="Filter the menu"
          className="border-line bg-surface-raised flex flex-col gap-5 rounded-md border p-4 sm:p-6"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Kitchen" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {KITCHEN_TABS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  aria-pressed={filters.kitchen === k.value}
                  onClick={() => update({ kitchen: k.value })}
                  className={cn(
                    'min-h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap transition-colors',
                    filters.kitchen === k.value
                      ? 'bg-accent-fill text-on-accent font-semibold'
                      : 'text-secondary hover:text-primary hover:bg-line',
                  )}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1 sm:w-72 sm:flex-none">
                <span className="sr-only">Search dishes</span>
                <input
                  type="search"
                  value={filters.q}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Search: jollof, pierogi, steak…"
                  className="border-input bg-surface-inset text-primary placeholder:text-muted focus:border-accent min-h-11 w-full rounded-full border px-5 text-sm focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted shrink-0">Sort</span>
                <select
                  value={filters.sort}
                  onChange={(e) => update({ sort: e.target.value })}
                  className="border-input bg-surface-inset text-primary focus:border-accent min-h-11 flex-1 rounded-full border px-4 focus:outline-none"
                >
                  <option value="recommended">Chef’s picks</option>
                  <option value="popular">Most popular</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Course" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              <CategoryChip
                label="Everything"
                active={filters.category === 'all'}
                onClick={() => update({ category: 'all' })}
              />
              {data?.categories.map((c) => (
                <CategoryChip
                  key={c.slug}
                  label={c.name}
                  active={filters.category === c.slug}
                  onClick={() => update({ category: c.slug })}
                />
              ))}
            </div>
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Dietary preferences</legend>
              {DIETARY.map((d) => (
                <label
                  key={d.key}
                  className={cn(
                    'flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-colors',
                    'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                    filters[d.key]
                      ? 'border-accent text-accent'
                      : 'border-line text-secondary hover:text-primary',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={filters[d.key]}
                    onChange={(e) => update({ [d.key]: e.target.checked })}
                    className="sr-only"
                  />
                  <span aria-hidden="true">{filters[d.key] ? '✓' : '+'}</span>
                  {d.label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Spice</span>
                <select
                  value={filters.maxSpice ?? ''}
                  onChange={(e) =>
                    update({ maxSpice: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  className="border-input bg-surface-inset text-primary focus:border-accent min-h-10 rounded-full border px-3 focus:outline-none"
                >
                  <option value="">Any</option>
                  <option value="0">Not spicy</option>
                  <option value="1">Up to mild</option>
                  <option value="2">Up to medium</option>
                  <option value="3">Hot welcome</option>
                </select>
              </label>
            </fieldset>
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between gap-4">
          <p role="status" className="text-muted text-sm">
            {data && `${results.length} ${results.length === 1 ? 'dish' : 'dishes'}`}
            {data && filters.noPork && ' · pork-free'}
          </p>
          {(activeFilterCount(filters) > 0 ||
            filters.q ||
            filters.kitchen !== 'all' ||
            filters.category !== 'all') && (
            <button
              type="button"
              onClick={() => setParams(paramsFromFilters(DEFAULT_FILTERS), { replace: true })}
              className="text-accent text-sm underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>

        {showAlcoholNotice && (
          <p className="text-muted mt-4 text-sm">
            <strong className="text-primary">18+ only:</strong> wine and spirits are served to guests aged 18
            and over. Please drink responsibly.
          </p>
        )}

        {isPending && (
          <div className="text-accent grid min-h-[40vh] place-items-center">
            <Spinner label="Loading the menu" />
          </div>
        )}
        {isError && (
          <Alert tone="error" className="mt-8" title="We couldn’t load the menu">
            Please check your connection.{' '}
            <button type="button" className="underline" onClick={() => refetch()}>
              Try again
            </button>
          </Alert>
        )}
        {data && results.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="font-serif text-3xl">Nothing matches those filters</p>
            <p className="text-secondary">Try removing a filter or searching for something else.</p>
            <Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Show the full menu
            </Button>
          </div>
        )}
        {/* Keeps the heading order (h1 → h2 → dish h3s) for screen-reader navigation. */}
        <h2 className="sr-only">Dishes</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((d) => (
            // Off-screen cards skip layout until they are scrolled near (54 dishes on one page).
            <li key={d.id} className="flex [contain-intrinsic-size:auto_520px] [content-visibility:auto]">
              <DishCard dish={d} className="w-full" />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function CategoryChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-10 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap transition-colors',
        active ? 'border-accent text-accent font-semibold' : 'border-line text-secondary hover:text-primary',
      )}
    >
      {label}
    </button>
  );
}
