import { cn } from '@/lib/cn';

const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-sans text-sm font-semibold uppercase tracking-button transition duration-300 ease-luxe disabled:cursor-not-allowed disabled:opacity-60 select-none';
const variants = {
  primary: 'bg-accent-fill text-on-accent hover:bg-accent-fill-hover active:translate-y-px',
  secondary:
    'border border-accent text-accent hover:border-accent-hover hover:text-accent-hover hover:bg-accent-fill/10',
  ghost: 'text-primary hover:text-accent-hover underline-offset-8 hover:underline',
  danger: 'border border-danger text-danger hover:bg-danger/10',
  // Over photography or video (the hero): the same in both themes.
  onDark: 'border border-gold-light text-gold-light hover:bg-gold-light/15 hover:text-ivory',
};
const sizes = {
  sm: 'px-4 py-2 text-xs min-h-9',
  md: 'px-6 py-3',
  lg: 'px-8 py-4 text-[0.95rem]',
};

export function buttonClasses(variant = 'primary', size = 'md', className) {
  return cn(base, variants[variant], sizes[size], className);
}
