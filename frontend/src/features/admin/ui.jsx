import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { cn } from '@/lib/cn';
import { fmt } from './format';

/* ------------------------------------------------------------------ layout bits */

export function AdminHeader({ title, intro, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl">{title}</h1>
        {intro && <p className="text-secondary mt-2 max-w-2xl text-sm">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className }) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      // min-w-0: inside a grid or flex parent, a wide table (which scrolls on its own) must not stretch the page.
      className={cn('border-line bg-surface-raised min-w-0 rounded-md border p-5 sm:p-6', className)}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 id={id} className="font-sans text-base font-semibold">
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ error, label = 'Loading' }) {
  if (error)
    return <Alert tone="error">{error instanceof Error ? error.message : 'Could not load this page.'}</Alert>;
  return (
    <div className="grid min-h-40 place-items-center">
      <Spinner label={label} />
    </div>
  );
}

export function Empty({ children }) {
  return (
    <p className="text-secondary border-line rounded-md border border-dashed p-6 text-center text-sm">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ status pills */

const TONE = {
  neutral: 'border-line text-secondary',
  info: 'border-accent/50 text-primary',
  progress: 'border-accent text-primary bg-accent-fill/10',
  good: 'border-success/60 text-primary bg-success/10',
  warn: 'border-accent text-primary bg-accent-fill/15',
  bad: 'border-danger/60 text-primary bg-danger/10',
};
const DOT = {
  neutral: 'bg-muted',
  info: 'bg-accent',
  progress: 'bg-accent-fill',
  good: 'bg-success',
  warn: 'bg-accent-fill',
  bad: 'bg-danger',
};

const STATUS_TONE = {
  pending_payment: 'neutral',
  received: 'info',
  preparing: 'progress',
  ready: 'warn',
  out_for_delivery: 'progress',
  delivered: 'good',
  completed: 'good',
  cancelled: 'bad',
  pending: 'info',
  confirmed: 'info',
  seated: 'progress',
  no_show: 'bad',
  approved: 'good',
  hidden: 'neutral',
  new: 'warn',
  contacted: 'info',
  quoted: 'progress',
  booked: 'good',
  closed: 'neutral',
  read: 'neutral',
  replied: 'good',
  archived: 'neutral',
  live: 'good',
  ended: 'neutral',
  active: 'good',
  suspended: 'bad',
  failed: 'bad',
  running: 'progress',
};

/** A status always shows its name: colour is never the only signal. */
export function StatusPill({ status, label }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONE[tone],
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOT[tone])} />
      {label ?? fmt.label(status)}
    </span>
  );
}

/* ------------------------------------------------------------------ inputs */

const fieldClass =
  'border-input bg-surface-inset text-primary focus:border-accent min-h-11 w-full rounded-sm border px-3 text-sm focus:outline-none disabled:opacity-60';

export function SelectField({ label, value, onChange, options, className, hideLabel }) {
  return (
    <label className={cn('flex flex-col justify-end gap-1.5', className)}>
      <span className={cn('eyebrow text-muted', hideLabel && 'sr-only')}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function InputField({ label, className, hideLabel, error, ...rest }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col justify-end gap-1.5', className)}>
      <label htmlFor={id} className={cn('eyebrow text-muted', hideLabel && 'sr-only')}>
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : undefined}
        className={fieldClass}
        {...rest}
      />
      {error && (
        <span id={`${id}-e`} role="alert" className="text-danger text-xs">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextAreaField({ label, className, ...rest }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col justify-end gap-1.5', className)}>
      <label htmlFor={id} className="eyebrow text-muted">
        {label}
      </label>
      <textarea id={id} rows={3} className={cn(fieldClass, 'py-2')} {...rest} />
    </div>
  );
}

export function CheckField({ label, checked, onChange, className }) {
  return (
    <label className={cn('flex min-h-11 items-center gap-2 text-sm', className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent-fill size-4"
      />
      {label}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <InputField
      label="Search"
      hideLabel
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="min-w-56 flex-1"
    />
  );
}

/* ------------------------------------------------------------------ pagination */

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-end gap-2 text-sm">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="text-secondary" aria-current="page">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

/* ------------------------------------------------------------------ modal */

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'border-line bg-surface-raised text-primary m-auto max-h-[90vh] w-[min(36rem,94vw)] overflow-y-auto rounded-md border p-0 backdrop:bg-black/60',
        wide && 'w-[min(56rem,94vw)]',
      )}
    >
      <div className="border-line bg-surface-raised sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-4">
        <h2 id={id} className="text-2xl">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-secondary hover:text-primary grid size-9 place-items-center rounded-full text-xl"
        >
          ×
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ stat tile */

export function StatTile({ label, value, delta }) {
  return (
    <div className="border-line bg-surface-raised rounded-md border p-5">
      <p className="text-secondary text-sm">{label}</p>
      <p className="mt-2 font-sans text-3xl font-semibold">{value}</p>
      {delta && (
        <p
          className={cn(
            'mt-1 text-xs',
            delta.good === null ? 'text-muted' : delta.good ? 'text-success' : 'text-danger',
          )}
        >
          {delta.text}
        </p>
      )}
    </div>
  );
}
