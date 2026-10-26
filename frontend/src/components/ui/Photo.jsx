import { useState } from 'react';
import { PHOTOS, PHOTO_WIDTHS } from '@/content/photos';
import { cn } from '@/lib/cn';

const KITCHEN_ART: Record<string, { from: string; to: string }> = {
  nigerian: { from: '#B4492F', to: '#3a1a10' },
  polish: { from: '#A3243B', to: '#2a0c12' },
  continental: { from: '#2E4A3B', to: '#0f1a14' },
  bar: { from: '#C9A24B', to: '#2a2010' },
};

/** Callers may position the photo themselves (e.g. absolute backgrounds); otherwise it is relative. */
const position = (className?: string) =>
  /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? '') ? '' : 'relative';

interface PhotoProps {
  /** Key in the generated photo manifest, e.g. "dishes/smoky-party-jollof". */
  name: string;
  alt?: string;
  /** `sizes` attribute: how wide the image renders, so the browser picks the right file. */
  sizes: string;
  className?: string;
  /** Above-the-fold images load eagerly with high priority; everything else is lazy. */
  priority?: boolean;
  /** Shown when no photo exists for `name`: an elegant illustrated placeholder in kitchen colours. */
  fallbackKitchen?: string | null;
  fallbackLabel?: string;
  /** An uploaded photo (admin menu manager) that replaces the stock one. */
  src?: string | null;
}

/**
 * Responsive AVIF/WebP image from frontend/public/img with a blurred placeholder,
 * explicit aspect ratio (no layout shift) and lazy loading.
 */
export function Photo({
  name,
  alt,
  sizes,
  className,
  priority,
  fallbackKitchen,
  fallbackLabel,
  src,
}: PhotoProps) {
  const photo = PHOTOS[name];
  const [loaded, setLoaded] = useState(false);

  if (src) {
    return (
      <div className={cn(position(className), 'bg-surface-inset overflow-hidden', className)}>
        <img
          src={src}
          alt={alt ?? ''}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="relative size-full object-cover"
        />
      </div>
    );
  }

  if (!photo) {
    const art = KITCHEN_ART[fallbackKitchen ?? 'bar'] ?? KITCHEN_ART.bar!;
    return (
      <div
        role="img"
        aria-label={alt ?? fallbackLabel ?? 'Dish illustration'}
        className={cn(position(className), 'grid place-items-center overflow-hidden', className)}
        style={{ background: `radial-gradient(circle at 50% 40%, ${art.from}, ${art.to} 75%)` }}
      >
        <img
          src={`${import.meta.env.BASE_URL}brand/plate.svg`}
          alt=""
          aria-hidden="true"
          className="w-3/5 opacity-90 drop-shadow-xl"
          loading="lazy"
        />
        <div className="bg-pattern absolute inset-0 opacity-[0.07]" aria-hidden="true" />
      </div>
    );
  }

  const widths = photo.wide ? PHOTO_WIDTHS.wide : PHOTO_WIDTHS.dish;
  const base = `${import.meta.env.BASE_URL}img/${photo.file}`;
  const srcset = (ext: string) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');
  const [w, h] = photo.wide ? [16, 10] : [4, 3];

  return (
    <div className={cn(position(className), 'overflow-hidden', className)}>
      <img
        src={photo.blur}
        alt=""
        aria-hidden="true"
        className={cn(
          'absolute inset-0 size-full scale-110 object-cover blur-lg transition-opacity duration-700',
          loaded && 'opacity-0',
        )}
      />
      <picture>
        <source type="image/avif" srcSet={srcset('avif')} sizes={sizes} />
        <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
        <img
          src={`${base}-${widths[1]}.webp`}
          alt={alt ?? photo.alt}
          width={w * 100}
          height={h * 100}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          // React 18 doesn't know fetchPriority yet; lower-case passes it through to the DOM.
          {...{ fetchpriority: priority ? 'high' : 'auto' }}
          onLoad={() => setLoaded(true)}
          className={cn(
            'relative size-full object-cover transition-[opacity,scale] duration-700',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      </picture>
    </div>
  );
}
