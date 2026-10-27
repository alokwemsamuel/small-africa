import { forwardRef, useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Labelled input with hint and error text wired up for screen readers. Other props go to the <input>.
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.error]
 * @param {import('react').ReactNode} [props.hint]
 * @param {boolean} [props.revealable] adds a show/hide toggle for password fields
 */
export const TextField = forwardRef(function TextField(
  { label, error, hint, revealable, className, type = 'text', id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [revealed, setRevealed] = useState(false);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-muted eyebrow">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={revealable && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'bg-surface-raised text-primary placeholder:text-muted/80 min-h-12 w-full rounded-sm border px-4 py-3 text-base transition-colors duration-200',
            'focus:border-accent focus:outline-none focus-visible:outline-none',
            error ? 'border-danger' : 'border-input hover:border-accent',
            revealable && 'pr-20',
          )}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="tracking-button text-accent hover:text-accent-hover absolute inset-y-0 right-0 px-4 text-xs font-semibold uppercase"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <div id={hintId} className="text-muted text-sm">
          {hint}
        </div>
      )}
      {error && (
        <p id={errorId} className="text-danger text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
