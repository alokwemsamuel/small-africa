import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Reveal } from '@/components/motion/Reveal';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DietaryTags } from '@/components/ui/DietaryTags';
import { Photo } from '@/components/ui/Photo';
import { dishPhoto } from '@/content/photoKeys';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/toast';
import { cart } from '@/features/cart/cart';
import { NotFoundPage } from '@/pages/PlaceholderPage';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { KITCHEN_LABEL } from './actions';
import { DishCard } from './DishCard';
import { useDish } from './hooks';
import type { DishDetail } from './types';

const ALLERGEN_LABEL: Record<string, string> = {
  gluten: 'Gluten',
  dairy: 'Milk',
  egg: 'Egg',
  nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  fish: 'Fish',
  shellfish: 'Shellfish / crustaceans',
  soy: 'Soy',
  sesame: 'Sesame',
  celery: 'Celery',
  mustard: 'Mustard',
  sulphites: 'Sulphites',
};

export function DishDetailPage() {
  const { slug = '' } = useParams();
  const { data: dish, isPending, error } = useDish(slug);
  useSeo({ title: dish?.name, description: dish?.shortDescription });

  if (isPending) {
    return (
      <div className="text-accent grid min-h-[60vh] place-items-center">
        <Spinner label="Loading dish" />
      </div>
    );
  }
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (!dish) {
    return (
      <div className="container-luxe py-24">
        <Alert tone="error">We couldn’t load this dish. Please try again.</Alert>
      </div>
    );
  }
  return <DishView dish={dish} />;
}

function DishView({ dish }: { dish: DishDetail }) {
  const defaultPortion = dish.options.portion.find((p) => p.isDefault) ?? dish.options.portion[0];
  const [portionId, setPortionId] = useState<number | null>(defaultPortion?.id ?? null);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setPortionId(defaultPortion?.id ?? null);
    setAddonIds([]);
    setQty(1);
  }, [dish.id, defaultPortion?.id]);

  const portion = dish.options.portion.find((p) => p.id === portionId) ?? null;
  const addons = dish.options.addon.filter((a) => addonIds.includes(a.id));
  const unit =
    dish.priceKobo + (portion?.priceDeltaKobo ?? 0) + addons.reduce((n, a) => n + a.priceDeltaKobo, 0);

  const add = () => {
    cart.add(
      {
        dishId: dish.id,
        slug: dish.slug,
        name: dish.name,
        kitchen: dish.kitchen,
        unitPriceKobo: unit,
        portionId,
        portionName: dish.options.portion.length > 1 ? (portion?.name ?? null) : null,
        addonIds,
        addonNames: addons.map((a) => a.name),
        containsPork: dish.containsPork,
      },
      qty,
    );
    toast(`${qty} × ${dish.name} added to your order`, { label: 'View order', to: '/cart' });
  };

  return (
    <article>
      <div className="container-luxe pt-8">
        <nav aria-label="Breadcrumb" className="text-muted text-sm">
          <ol className="flex flex-wrap gap-2">
            <li>
              <Link to="/menu" className="hover:text-accent">
                Menu
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            {dish.kitchen && (
              <>
                <li>
                  <Link to={`/menu?kitchen=${dish.kitchen}`} className="hover:text-accent">
                    {KITCHEN_LABEL[dish.kitchen]}
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
              </>
            )}
            <li aria-current="page" className="text-secondary">
              {dish.name}
            </li>
          </ol>
        </nav>
      </div>

      <div className="container-luxe grid gap-10 py-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <Reveal effect="clip" className="lg:sticky lg:top-24 lg:self-start">
          <Photo
            name={dishPhoto(dish.slug)}
            alt={dish.imageAlt}
            sizes="(min-width: 1024px) 55vw, 100vw"
            priority
            fallbackKitchen={dish.kitchen}
            className="aspect-[4/3] rounded-md"
          />
        </Reveal>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            {dish.kitchen ? (
              <Badge kitchen={dish.kitchen}>{KITCHEN_LABEL[dish.kitchen]} kitchen</Badge>
            ) : (
              <Badge>{dish.category === 'tasting' ? 'All three kitchens' : 'Bar'}</Badge>
            )}
            {dish.isFeatured && <span className="eyebrow text-accent">Chef’s pick</span>}
            {!dish.isAvailable && <span className="eyebrow text-danger">Sold out today</span>}
          </div>
          <h1 className="text-5xl leading-[1.02] sm:text-6xl">{dish.name}</h1>
          <p className="text-accent text-2xl font-semibold">
            {formatNaira(dish.priceKobo + (defaultPortion?.priceDeltaKobo ?? 0))}
            {dish.category === 'tasting' && (
              <span className="text-muted ml-2 text-base font-normal">per guest</span>
            )}
          </p>
          <p className="text-secondary text-lg leading-relaxed">{dish.description}</p>
          <DietaryTags info={dish} />
          {dish.containsPork && (
            <p className="text-muted text-sm">
              This dish contains pork. Ask us about pork-free alternatives, or{' '}
              <Link to="/menu?nopork=1" className="text-accent underline">
                browse pork-free dishes
              </Link>
              .
            </p>
          )}
          {dish.isAlcoholic && (
            <p className="text-muted text-sm">
              <strong className="text-primary">18+ only.</strong> Proof of age may be requested on delivery or
              at the table.
            </p>
          )}

          <form
            className="border-line bg-surface-raised mt-2 flex flex-col gap-6 rounded-md border p-6"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            {dish.options.portion.length > 1 && (
              <fieldset>
                <legend className="eyebrow text-muted mb-3">Choose</legend>
                <div className="flex flex-col gap-2">
                  {dish.options.portion.map((p) => (
                    <label
                      key={p.id}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-sm border px-4 transition-colors',
                        'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                        portionId === p.id ? 'border-accent' : 'border-line hover:border-input',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="portion"
                          checked={portionId === p.id}
                          onChange={() => setPortionId(p.id)}
                          className="accent-accent-fill size-4"
                        />
                        {p.name}
                      </span>
                      <span className="text-muted text-sm">
                        {p.priceDeltaKobo > 0 ? `+${formatNaira(p.priceDeltaKobo)}` : 'Included'}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {dish.options.addon.length > 0 && (
              <fieldset>
                <legend className="eyebrow text-muted mb-3">Add-ons</legend>
                <div className="flex flex-col gap-2">
                  {dish.options.addon.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-sm border px-4 transition-colors',
                        'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                        addonIds.includes(a.id) ? 'border-accent' : 'border-line hover:border-input',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={addonIds.includes(a.id)}
                          onChange={(e) =>
                            setAddonIds((ids) =>
                              e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id),
                            )
                          }
                          className="accent-accent-fill size-4"
                        />
                        {a.name}
                      </span>
                      <span className="text-muted text-sm">+{formatNaira(a.priceDeltaKobo)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="border-line flex items-center rounded-full border"
                role="group"
                aria-label="Quantity"
              >
                <button
                  type="button"
                  className="grid size-11 place-items-center text-lg"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={qty <= 1}
                >
                  −
                </button>
                <output className="w-8 text-center font-semibold" aria-live="polite">
                  {qty}
                </output>
                <button
                  type="button"
                  className="grid size-11 place-items-center text-lg"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <Button type="submit" size="lg" disabled={!dish.isAvailable} className="flex-1">
                {dish.isAvailable ? `Add to order · ${formatNaira(unit * qty)}` : 'Sold out today'}
              </Button>
            </div>
          </form>

          {dish.tastingCourses.length > 0 && (
            <section aria-labelledby="courses-h" className="mt-4">
              <h2 id="courses-h" className="text-3xl">
                The seven courses
              </h2>
              <ol className="mt-5 flex flex-col">
                {dish.tastingCourses.map((c) => (
                  <li key={c.courseNo} className="border-line flex gap-5 border-b py-4">
                    <span className="text-accent w-8 font-serif text-2xl">{c.courseNo}</span>
                    <div>
                      <p className="font-serif text-xl">
                        {c.name}{' '}
                        <Badge kitchen={c.kitchen} className="ml-2 align-middle">
                          {KITCHEN_LABEL[c.kitchen]}
                        </Badge>
                      </p>
                      <p className="text-secondary text-sm">{c.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <details className="border-line group rounded-md border p-5 open:pb-6">
            <summary className="cursor-pointer font-serif text-xl">Ingredients & allergens</summary>
            {dish.ingredients && (
              <p className="text-secondary mt-4 text-sm leading-relaxed">{dish.ingredients}</p>
            )}
            {dish.allergens.length > 0 ? (
              <p className="mt-3 text-sm">
                <strong>Contains:</strong> {dish.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(', ')}
                {dish.containsPork && ', Pork'}
              </p>
            ) : (
              <p className="mt-3 text-sm">
                No major allergens listed{dish.containsPork && '; contains pork'}.
              </p>
            )}
            <p className="text-muted mt-3 text-xs">
              Our kitchens handle nuts, gluten, fish and shellfish, so we can’t guarantee any dish is free
              from traces. Please tell us about allergies before ordering.
            </p>
          </details>
        </div>
      </div>

      {dish.reviews.length > 0 && (
        <section aria-labelledby="dish-reviews-h" className="container-luxe py-12">
          <h2 id="dish-reviews-h" className="text-3xl">
            What guests say
          </h2>
          <ul className="mt-6 grid gap-5 md:grid-cols-2">
            {dish.reviews.map((r) => (
              <li key={r.id} className="border-line rounded-md border p-6">
                <p className="text-accent tracking-[0.3em]" aria-label={`${r.rating} out of 5 stars`}>
                  {'★'.repeat(r.rating)}
                </p>
                {r.title && <h3 className="mt-2 text-xl">{r.title}</h3>}
                <p className="text-secondary mt-2 leading-relaxed">{r.body}</p>
                <p className="text-muted mt-3 text-sm">{r.author}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dish.related.length > 0 && (
        <section aria-labelledby="related-h" className="bg-surface-raised py-16">
          <div className="container-luxe">
            <h2 id="related-h" className="text-4xl">
              You may also love
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {dish.related.map((d) => (
                <li key={d.id} className="flex">
                  <DishCard dish={d} className="w-full" />
                </li>
              ))}
            </ul>
            <ButtonLink to="/menu" variant="secondary" className="mt-10">
              Back to the full menu
            </ButtonLink>
          </div>
        </section>
      )}
    </article>
  );
}
