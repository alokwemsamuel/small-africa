import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { buttonClasses } from './buttonStyles';
import { Spinner } from './Spinner';

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="size-4" label="" />}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, ...rest }) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
