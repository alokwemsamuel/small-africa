import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useSite } from '@/hooks/useMenu';
import { cn } from '@/lib/cn';
import { isStaff } from '@/lib/roles';
import { whatsappLink } from '@/lib/whatsapp';
import { lockScroll } from '../motion/scrollLock';
import { useReducedMotion } from '../motion/useReducedMotion';
import { ButtonLink } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { DAY_GROUPS, hoursText } from './hours';
import { MOBILE_NAV } from './nav';
import { ThemeSegmented } from './ThemeSwitcher';

// The page is pinned and un-pinned in the same step the panel is added and removed (no frame in
// between). The server (pre-built pages) has no layout phase, and never has the menu open.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SLIDE_MS = 300;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const roundButton =
  'border-accent/40 text-accent hover:border-accent grid size-11 place-items-center rounded-full border transition-colors';

/**
 * The phone menu: a full-screen dialog that slides in from the right.
 *
 * It is drawn through a portal into <body>. Inside the header it would be trapped: the header
 * has a backdrop blur, and that makes a `position: fixed` child measure against the header
 * (72px tall) instead of the screen, so the menu came out with no height at all.
 *
 * Opening adds a history entry, so the phone's back button closes the menu instead of leaving
 * the page. The rest of the page is made inert while it is open (no tabbing or screen-reader
 * access behind it), scrolling is locked, and focus goes back to the hamburger on close.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose called once the menu should be closed
 * @param {{ current: HTMLElement | null }} props.returnFocusRef the hamburger button
 */
export function MobileMenu({ open, onClose, returnFocusRef }) {
  const { data: user } = useMe();
  const logout = useLogout();
  const { data: site } = useSite();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const panel = useRef(null);
  const closeButton = useRef(null);
  const pendingTo = useRef(null);
  const latest = useRef({ onClose, navigate });
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    latest.current = { onClose, navigate };
  });

  // Mounted while open and while sliding out; `shown` drives the transition.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames: the closed position must be painted before the slide starts.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), reduced ? 200 : SLIDE_MS + 20);
    return () => clearTimeout(t);
  }, [open, reduced]);

  /** The menu is closing for good (and, after a link tap, the page changes). */
  const finish = useCallback(() => {
    const to = pendingTo.current;
    pendingTo.current = null;
    latest.current.onClose();
    if (to) latest.current.navigate(to);
  }, []);

  /**
   * Every way of closing goes through the history entry added on open, so the back button and
   * the close button leave the same history behind. A link tap navigates after the entry is gone.
   */
  const requestClose = useCallback(
    (to) => {
      pendingTo.current = to ?? null;
      if (window.history.state?.saMenu) window.history.back();
      else finish();
    },
    [finish],
  );

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...window.history.state, saMenu: true }, '', window.location.href);
    const onPop = () => {
      if (!window.history.state?.saMenu) finish();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed another way while the entry is still on top: take it off.
      if (window.history.state?.saMenu) window.history.back();
    };
  }, [open, finish]);

  // While on screen: no page scrolling, nothing behind it reachable, focus inside.
  useIsomorphicLayoutEffect(() => {
    if (!mounted) return;
    const unlock = lockScroll();
    const returnTo = returnFocusRef?.current;
    // The browser's own scroll restoration (on Back) would race with the restore in unlock().
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      unlock();
      window.history.scrollRestoration = restoration;
      root?.removeAttribute('inert');
      returnTo?.focus();
    };
  }, [mounted, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the menu.
      const items = [...panel.current.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = panel.current.contains(document.activeElement);
      if (!inside) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // The desktop header takes over from 1024px up.
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => wide.matches && requestClose();
    wide.addEventListener('change', onWide);
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
    };
  }, [open, requestClose]);

  if (!mounted) return null;

  /** Plain taps navigate through the menu's own close; new-tab clicks are left alone. */
  const go = (to) => (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    requestClose(to);
  };

  const r = site?.restaurant;
  const phone = r?.phone?.replace(/\s/g, '');

  return createPortal(
    <div data-mobile-menu className="fixed inset-0 z-[100] h-dvh lg:hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => requestClose()}
        className={cn(
          'absolute inset-0 cursor-default bg-black/70 transition-opacity duration-300',
          shown ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={panel}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className={cn(
          'bg-surface text-primary sm:border-accent/20 absolute inset-y-0 right-0 h-dvh w-full overflow-y-auto overscroll-contain shadow-2xl shadow-black/50 sm:max-w-md sm:border-l',
          reduced
            ? cn('transition-opacity duration-200', shown ? 'opacity-100' : 'opacity-0')
            : cn(
                'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                shown ? 'translate-x-0' : 'translate-x-full',
              ),
        )}
      >
        <div className="flex min-h-full flex-col">
          <div className="flex h-18 shrink-0 items-center justify-between gap-3 px-5">
            <Link to="/" onClick={go('/')} className="min-w-0 shrink" aria-label="Small Africa home">
              <Logo className="h-11 w-auto max-w-full object-contain object-left" />
            </Link>
            <button
              ref={closeButton}
              type="button"
              aria-label="Close menu"
              onClick={() => requestClose()}
              className={roundButton}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav aria-label="Main" className="px-5 pt-3">
            <ol>
              {MOBILE_NAV.map((item, i) => {
                const current = item.match(pathname);
                return (
                  <li key={item.to} className="border-accent/10 border-b last:border-b-0">
                    <Link
                      to={item.to}
                      onClick={go(item.to)}
                      aria-current={current ? 'page' : undefined}
                      className={cn(
                        'flex items-baseline justify-between gap-4 py-3.5',
                        current ? 'text-accent' : 'text-primary hover:text-accent-hover',
                      )}
                    >
                      <span className="font-serif text-[2rem] leading-tight">{item.label}</span>
                      <span
                        className={cn(
                          'text-xs tracking-widest tabular-nums',
                          current ? 'text-accent' : 'text-muted',
                        )}
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="border-accent/30 mx-5 my-6 border-t" aria-hidden="true" />

          <div className="grid grid-cols-2 gap-3 px-5">
            <ButtonLink
              to="/reservations"
              onClick={go('/reservations')}
              className="px-3 text-center text-xs leading-tight"
            >
              Reserve a table
            </ButtonLink>
            <ButtonLink
              to="/menu"
              variant="secondary"
              onClick={go('/menu')}
              className="px-3 text-center text-xs leading-tight"
            >
              Order online
            </ButtonLink>
          </div>

          <div className="mt-7 flex flex-wrap items-start justify-between gap-x-4 gap-y-6 px-5">
            <div className="flex min-w-0 flex-col gap-1.5">
              {user ? (
                <>
                  <Link to="/account" onClick={go('/account')} className="flex flex-col">
                    <span className="eyebrow text-muted">My account</span>
                    <span className="font-serif text-2xl leading-tight break-words">{user.firstName}</span>
                  </Link>
                  {isStaff(user) && (
                    <Link
                      to="/admin"
                      onClick={go('/admin')}
                      className="text-secondary hover:text-accent-hover text-sm"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      logout.mutate();
                      requestClose();
                    }}
                    className="text-muted hover:text-primary self-start text-sm"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={go('/login')} className="flex flex-col">
                  <span className="eyebrow text-muted">Welcome</span>
                  <span className="font-serif text-2xl leading-tight">Sign in / Join</span>
                </Link>
              )}
            </div>
            <ThemeSegmented hideLegend legend="Theme" labels={{ system: 'Auto' }} />
          </div>

          <div className="bg-surface-raised border-accent/15 mt-10 flex flex-1 flex-col justify-end gap-5 border-t px-5 pt-6 pb-8">
            <address className="text-secondary text-sm leading-relaxed not-italic">
              <span className="eyebrow text-muted mb-1 block">Visit</span>
              {r?.address ?? 'Victoria Island, Lagos'}
            </address>
            <dl className="text-secondary grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm">
              {DAY_GROUPS.map((g) => (
                <div key={g.label} className="contents">
                  <dt>{g.label}</dt>
                  <dd>{hoursText(site, g.day) || '…'}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex gap-3" aria-label="Contact and social media">
              <li>
                <a
                  href={whatsappLink(r?.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp (opens in a new tab)"
                  className={roundButton}
                >
                  <Icon>
                    <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.5 8.5 0 1 1 21 11.5Z" />
                    <path d="M9 9.5c.5 2 2.3 3.9 4.5 4.6" />
                  </Icon>
                </a>
              </li>
              {phone && (
                <li>
                  <a href={`tel:${phone}`} aria-label={`Call ${r.phone}`} className={roundButton}>
                    <Icon>
                      <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                    </Icon>
                  </a>
                </li>
              )}
              <li>
                <a
                  href={r?.instagram ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram (opens in a new tab)"
                  className={roundButton}
                >
                  <Icon>
                    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="0.7" fill="currentColor" />
                  </Icon>
                </a>
              </li>
              <li>
                <a
                  href={r?.tiktok ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok (opens in a new tab)"
                  className={roundButton}
                >
                  <Icon>
                    <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
                    <path d="M14 4c.5 2.5 2.2 4 5 4.2" />
                  </Icon>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Line icon (generic shapes, no brand logos). */
function Icon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
