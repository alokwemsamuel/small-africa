import { useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { dismiss, getToasts, listeners, type Toast } from './toast';

/** Polite live region: announced by screen readers without stealing focus. */
export function Toaster() {
  const items = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getToasts,
    getToasts,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 sm:right-6 sm:left-auto sm:items-end"
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t }: { toast: Toast }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(t.id), 4500);
    return () => window.clearTimeout(timer);
  }, [t.id]);
  return (
    <div className="border-accent/40 bg-surface-raised text-primary pointer-events-auto flex items-center gap-4 rounded-full border py-2.5 pr-2.5 pl-5 text-sm shadow-xl shadow-black/25">
      <span>{t.message}</span>
      {t.action && (
        <Link
          to={t.action.to}
          onClick={() => dismiss(t.id)}
          className="bg-accent-fill text-on-accent hover:bg-accent-fill-hover rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase"
        >
          {t.action.label}
        </Link>
      )}
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        className="text-muted hover:text-primary grid size-7 place-items-center rounded-full"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
