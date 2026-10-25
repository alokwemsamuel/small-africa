import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Photo } from '@/components/ui/Photo';
import { dishPhoto } from '@/content/photoKeys';
import { formatNaira } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cart, useCart } from './cart';

/** Review the order. Prices here are indicative; checkout shows the server-calculated total. */
export function CartPage() {
  useSeo({ title: 'Your order' });
  const { items, count, subtotalKobo } = useCart();

  return (
    <>
      <PageHeader eyebrow="Online ordering" title="Your order" />
      <div className="container-luxe pb-24">
        {count === 0 ? (
          <div className="flex flex-col items-start gap-6 py-10">
            <p className="text-secondary text-lg">Your order is empty. Let’s fix that.</p>
            <ButtonLink to="/menu">Browse the menu</ButtonLink>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
            <ul className="flex flex-col">
              {items.map((l) => (
                <li key={l.key} className="border-line flex gap-4 border-b py-5">
                  <Photo
                    name={dishPhoto(l.slug)}
                    alt=""
                    sizes="96px"
                    fallbackKitchen={l.kitchen}
                    className="aspect-square w-20 shrink-0 rounded-sm sm:w-24"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <Link to={`/menu/${l.slug}`} className="hover:text-accent font-serif text-xl">
                      {l.name}
                    </Link>
                    {(l.portionName || l.addonNames.length > 0) && (
                      <p className="text-muted text-sm">
                        {[l.portionName, ...l.addonNames].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {l.containsPork && <p className="text-accent text-xs font-semibold">Contains pork</p>}
                    <div className="mt-2 flex items-center gap-4">
                      <div
                        className="border-line flex items-center rounded-full border"
                        role="group"
                        aria-label={`Quantity of ${l.name}`}
                      >
                        <button
                          type="button"
                          className="grid size-9 place-items-center"
                          onClick={() => cart.setQuantity(l.key, l.quantity - 1)}
                          aria-label={`Remove one ${l.name}`}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                        <button
                          type="button"
                          className="grid size-9 place-items-center"
                          onClick={() => cart.setQuantity(l.key, l.quantity + 1)}
                          aria-label={`Add one ${l.name}`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(l.key)}
                        className="text-muted hover:text-danger text-sm underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="font-semibold">{formatNaira(l.unitPriceKobo * l.quantity)}</p>
                </li>
              ))}
            </ul>
            <aside className="border-line bg-surface-raised flex h-fit flex-col gap-4 rounded-md border p-6">
              <h2 className="text-2xl">Summary</h2>
              <div className="flex justify-between">
                <span className="text-secondary">
                  Subtotal ({count} {count === 1 ? 'item' : 'items'})
                </span>
                <span className="font-semibold">{formatNaira(subtotalKobo)}</span>
              </div>
              <p className="text-muted text-sm">
                Prices include VAT. Delivery fee, coupons and dining credit are applied at checkout.
              </p>
              <ButtonLink to="/checkout" size="lg">
                Checkout
              </ButtonLink>
              <button
                type="button"
                onClick={() => cart.clear()}
                className="text-muted self-start text-sm underline"
              >
                Clear order
              </button>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
