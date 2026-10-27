import { toast } from '@/components/ui/toast';
import { cart } from '@/features/cart/cart';

export const KITCHEN_LABEL = { nigerian: 'Nigerian', polish: 'Polish', continental: 'Continental' };

/** Adds the dish with its default portion and no add-ons. */
export function quickAdd(dish) {
  const portion = dish.options.portion.find((p) => p.isDefault) ?? dish.options.portion[0] ?? null;
  cart.add({
    dishId: dish.id,
    slug: dish.slug,
    name: dish.name,
    kitchen: dish.kitchen,
    unitPriceKobo: dish.priceKobo + (portion?.priceDeltaKobo ?? 0),
    portionId: portion?.id ?? null,
    portionName: dish.options.portion.length > 1 ? (portion?.name ?? null) : null,
    addonIds: [],
    addonNames: [],
    containsPork: dish.containsPork,
  });
  toast(`${dish.name} added to your order`, { label: 'View order', to: '/cart' });
}
