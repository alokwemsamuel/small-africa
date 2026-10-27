import { cn } from '@/lib/cn';

const asset = (file) => `${import.meta.env.BASE_URL}brand/${file}`;

const FILES = {
  mark: { dark: 'small-africa-mark-gold.svg', light: 'small-africa-mark-obsidian.svg', w: 200, h: 200 },
  horizontal: {
    dark: 'small-africa-horizontal-gold.svg',
    light: 'small-africa-horizontal-obsidian.svg',
    w: 676,
    h: 200,
  },
};

/**
 * Gold logo on dark, obsidian logo on light. Both are rendered and CSS hides the wrong one
 * (see .on-dark-only / .on-light-only), so the swap is instant and correct before React loads.
 * Lazy loading means the browser only downloads the one that is showing.
 */
export function Logo({ variant = 'horizontal', className }) {
  const f = FILES[variant];
  const alt = variant === 'mark' ? 'Small Africa' : 'Small Africa: Three kitchens. One table.';
  const size = variant === 'mark' ? 'h-auto' : 'w-auto';
  return (
    <>
      <img
        src={asset(f.dark)}
        alt={alt}
        width={f.w}
        height={f.h}
        loading="lazy"
        className={cn('on-dark-only', size, className)}
      />
      <img
        src={asset(f.light)}
        alt={alt}
        width={f.w}
        height={f.h}
        loading="lazy"
        className={cn('on-light-only', size, className)}
      />
    </>
  );
}
