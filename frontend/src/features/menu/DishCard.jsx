import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { DietaryTags } from '@/components/ui/DietaryTags';
import { Photo } from '@/components/ui/Photo';
import { dishPhoto } from '@/content/photoKeys';
import { mediaUrl } from '@/lib/env';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';
import { KITCHEN_LABEL, quickAdd } from './actions';

export function DishCard({ dish, priority, className }) {
  const hasChoices = dish.options.portion.length > 1;
  return (
    <article
      className={cn(
        'group border-line bg-surface-raised ease-luxe relative flex flex-col overflow-hidden rounded-md border transition duration-500',
        'hover:border-accent/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/25',
        className,
      )}
    >
      <Link to={`/menu/${dish.slug}`} className="relative block" tabIndex={-1} aria-hidden="true">
        <Photo
          name={dishPhoto(dish.slug)}
          src={dish.imageUrl ? mediaUrl(dish.imageUrl) : null}
          alt=""
          sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          fallbackKitchen={dish.kitchen}
          className="[&_img]:ease-luxe aspect-[4/3] [&_img]:transition-transform [&_img]:duration-[1.2s] group-hover:[&_img]:scale-105"
        />
        {!dish.isAvailable && (
          <span className="bg-overlay text-primary absolute inset-x-0 bottom-0 py-2 text-center text-xs font-semibold tracking-wide uppercase">
            Sold out today
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          {dish.kitchen ? (
            <Badge kitchen={dish.kitchen}>{KITCHEN_LABEL[dish.kitchen]}</Badge>
          ) : (
            <Badge>{dish.category === 'tasting' ? 'All three kitchens' : 'Bar'}</Badge>
          )}
          {dish.isFeatured && <span className="eyebrow text-accent">Chef’s pick</span>}
        </div>
        <h3 className="text-2xl leading-tight">
          {/* Stretched link: the whole card is clickable, but only one link is announced. */}
          <Link to={`/menu/${dish.slug}`} className="hover:text-accent-hover after:absolute after:inset-0">
            {dish.name}
          </Link>
        </h3>
        <p className="text-secondary text-sm leading-relaxed">{dish.shortDescription}</p>
        <DietaryTags info={dish} compact />
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <p className="text-accent font-semibold">
            {hasChoices && <span className="text-muted mr-1 text-xs font-normal">from</span>}
            {formatNaira(
              dish.priceKobo + (dish.options.portion.find((p) => p.isDefault)?.priceDeltaKobo ?? 0),
            )}
          </p>
          <button
            type="button"
            disabled={!dish.isAvailable}
            onClick={() => quickAdd(dish)}
            className="border-accent text-accent hover:bg-accent-fill hover:text-on-accent relative z-10 min-h-10 rounded-full border px-4 text-xs font-semibold tracking-wide uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Add ${dish.name} to order`}
          >
            Add to order
          </button>
        </div>
      </div>
    </article>
  );
}
