import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useLogout, useMe } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { isStaff } from '@/lib/roles';
import { ThemeMenu } from './ThemeSwitcher';
import { cn } from '@/lib/cn';
import { ButtonLink } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { MobileMenu } from './MobileMenu';
import { NAV } from './nav';
import { NotificationBell } from './NotificationBell';

export function SiteHeader() {
  const { data: user } = useMe();
  const logout = useLogout();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="border-accent/15 bg-overlay sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="container-luxe flex h-18 items-center justify-between gap-3 py-3 sm:gap-6">
        <Link to="/" className="min-w-0 shrink" aria-label="Small Africa home">
          <Logo className="h-11 w-auto max-w-full object-contain object-left sm:h-12" />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'hover:text-accent-hover text-sm tracking-wide transition-colors',
                      isActive ? 'text-accent' : 'text-secondary',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          {user ? (
            <>
              {isStaff(user) && (
                <Link to="/admin" className="text-secondary hover:text-accent-hover text-sm">
                  Admin
                </Link>
              )}
              <Link to="/account" className="text-secondary hover:text-accent-hover text-sm">
                {user.firstName}
              </Link>
              <button
                type="button"
                onClick={() => logout.mutate()}
                className="text-muted hover:text-primary text-sm"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login" className="text-secondary hover:text-accent-hover text-sm">
              Sign in
            </Link>
          )}
          {user && <NotificationBell />}
          <ThemeMenu />
          <CartLink count={count} />
          <ButtonLink to="/reservations" size="sm">
            Reserve
          </ButtonLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {user && <NotificationBell />}
          <CartLink count={count} />
          <button
            ref={menuButton}
            type="button"
            className="border-accent/40 text-accent grid size-11 place-items-center rounded-full border"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>

      <MobileMenu open={open} onClose={() => setOpen(false)} returnFocusRef={menuButton} />
    </header>
  );
}

function CartLink({ count }) {
  const label = count ? `Your order, ${count} ${count === 1 ? 'item' : 'items'}` : 'Your order (empty)';
  return (
    <Link
      to="/cart"
      className="border-accent/40 text-accent hover:border-accent relative grid size-10 place-items-center rounded-full border transition-colors"
      aria-label={label}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
      {count > 0 && (
        <span
          className="bg-accent-fill text-on-accent absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
