import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useInterestAccount';
import { cn } from '@/lib/cn';

const when = (iso) =>
  new Date(iso.replace(' ', 'T') + '+01:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

/** In-app notification centre: interest, points, tier upgrades and offers. */
export function NotificationBell() {
  const { data } = useNotifications(true);
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrap = useRef(null);
  const button = useRef(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    // On phones the panel is anchored to the full-width header (so it can span the screen with a
    // small margin); from sm up it hangs under the bell.
    <div ref={wrap} className="sm:relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
        className="border-accent/40 text-accent hover:border-accent relative grid size-11 place-items-center rounded-full border transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" strokeLinejoin="round" />
          <path d="M10 19.5a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="bg-accent-fill text-on-accent absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Notifications"
          className="border-line bg-surface-raised absolute inset-x-4 top-full z-50 mt-2 rounded-md border shadow-xl sm:inset-x-auto sm:right-0 sm:w-88"
        >
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(undefined)}
                className="text-accent text-sm underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 && (
              <li className="text-secondary px-4 py-6 text-sm">Nothing new yet.</li>
            )}
            {data?.items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'border-line border-b px-4 py-3 last:border-b-0',
                  !n.read && 'bg-accent-fill/5',
                )}
              >
                <p className="flex items-start justify-between gap-3 text-sm font-semibold">
                  <span>
                    {!n.read && <span className="sr-only">Unread: </span>}
                    {n.title}
                  </span>
                  <span className="text-muted shrink-0 text-xs font-normal">{when(n.at)}</span>
                </p>
                <p className="text-secondary mt-1 text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
          <Link
            to="/account?tab=rewards"
            onClick={() => setOpen(false)}
            className="text-accent block px-4 py-3 text-center text-sm font-semibold"
          >
            Open my Interest Account
          </Link>
        </div>
      )}
    </div>
  );
}
