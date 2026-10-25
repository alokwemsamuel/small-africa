import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Adds a show/hide toggle for password fields. */
  revealable?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
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
      <label htmlFor={inputId} className="text-smoke eyebrow">
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
            'bg-ebony text-ivory placeholder:text-smoke/80 min-h-12 w-full rounded-sm border px-4 py-3 text-base transition-colors duration-200',
            'focus:border-gold focus:outline-none focus-visible:outline-none',
            error ? 'border-danger' : 'border-sand/25 hover:border-sand/40',
            revealable && 'pr-20',
          )}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="tracking-button text-gold hover:text-gold-light absolute inset-y-0 right-0 px-4 text-xs font-semibold uppercase"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <div id={hintId} className="text-smoke text-sm">
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
