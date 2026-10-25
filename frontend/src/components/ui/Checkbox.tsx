import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-3">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="border-input bg-surface-raised accent-accent-fill mt-0.5 size-5 shrink-0 cursor-pointer rounded-sm"
          {...rest}
        />
        <label htmlFor={inputId} className="text-secondary cursor-pointer text-sm leading-relaxed">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-danger pl-8 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
