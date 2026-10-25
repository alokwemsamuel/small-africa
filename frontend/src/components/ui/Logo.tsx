import { cn } from '@/lib/cn';

const asset = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;

/** The SA crest alone, or the horizontal lockup. Uses the outlined SVG exports from design/logo. */
export function Logo({
  variant = 'horizontal',
  className,
}: {
  variant?: 'mark' | 'horizontal';
  className?: string;
}) {
  if (variant === 'mark') {
    return (
      <img
        src={asset('small-africa-mark-gold.svg')}
        alt="Small Africa"
        width={200}
        height={200}
        className={cn('h-auto', className)}
      />
    );
  }
  return (
    <img
      src={asset('small-africa-horizontal-gold.svg')}
      alt="Small Africa: Three kitchens. One table."
      width={657}
      height={200}
      className={cn('w-auto', className)}
    />
  );
}
