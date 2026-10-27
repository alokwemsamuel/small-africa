import { useEffect, useRef, useState } from 'react';
import { PHOTOS, PHOTO_WIDTHS } from '@/lib/photos';
import { cn } from '@/lib/cn';

/** Placeholder backgrounds in kitchen colours (classes in styles/index.css). */
const KITCHEN_ART = {
  nigerian: 'art-nigerian',
  polish: 'art-polish',
  continental: 'art-continental',
  bar: 'art-bar',
};

/** Callers may position the photo themselves (e.g. absolute backgrounds); otherwise it is relative. */
const position = (className) =>
  /(^|\s)(absolute|fixed|sticky)(\s|$)/.test(className ?? '') ? '' : 'relative';

/**
 * Responsive AVIF/WebP image from frontend/public/img with a blurred placeholder,
 * explicit aspect ratio (no layout shift) and lazy loading.
 *
 * @param {object} props
 * @param {string} props.name key in the generated photo manifest, e.g. "dishes/smoky-party-jollof"
 * @param {string} [props.alt]
 * @param {string} props.sizes `sizes` attribute: how wide the image renders, so the browser picks the right file
 * @param {string} [props.className]
 * @param {boolean} [props.priority] above-the-fold images load eagerly with high priority; everything else is lazy
 * @param {string | null} [props.fallbackKitchen] shown when no photo exists for `name`: an illustrated placeholder in kitchen colours
 * @param {string} [props.fallbackLabel]
 * @param {string | null} [props.src] an uploaded photo (admin menu manager) that replaces the stock one
 */
export function Photo({ name, alt, sizes, className, priority, fallbackKitchen, fallbackLabel, src }) {
  const photo = PHOTOS[name];
  const [loaded, setLoaded] = useState(false);
  const img = useRef(null);
  // On a pre-built page the photo can finish loading before React attaches, so its load event
  // is missed: check once attached, or it would stay hidden behind the blurred placeholder.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true);
  }, []);

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
    const art = KITCHEN_ART[fallbackKitchen ?? 'bar'] ?? KITCHEN_ART.bar;
    return (
      <div
        role="img"
        aria-label={alt ?? fallbackLabel ?? 'Dish illustration'}
        className={cn(position(className), 'grid place-items-center overflow-hidden', art, className)}
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
  const srcset = (ext) => widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');
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
          ref={img}
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
