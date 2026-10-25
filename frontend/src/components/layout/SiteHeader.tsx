import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useLogout, useMe } from '@/features/auth/hooks';
import { isStaff } from '@/features/auth/types';
import { ThemeMenu, ThemeSegmented } from '@/features/theme/ThemeSwitcher';
import { cn } from '@/lib/cn';
import { ButtonLink } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { NAV } from './nav';

export function SiteHeader() {
  const { data: user } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header className="border-accent/15 bg-overlay sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="container-luxe flex h-18 items-center justify-between gap-6 py-3">
        <Link to="/" className="shrink-0" aria-label="Small Africa home">
          <Logo className="h-11 w-auto sm:h-12" />
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
          <ThemeMenu />
          <ButtonLink to="/reservations" size="sm">
            Reserve
          </ButtonLink>
        </div>

        <button
          type="button"
          className="border-accent/40 text-accent grid size-11 place-items-center rounded-full border lg:hidden"
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

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="bg-surface fixed inset-x-0 top-[4.5rem] bottom-0 z-40 overflow-y-auto lg:hidden"
        >
          <ul className="container-luxe flex flex-col gap-1 py-8">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn('block py-3 font-serif text-3xl', isActive ? 'text-accent' : 'text-primary')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
            <li className="border-accent/20 mt-6 border-t pt-6">
              {user ? (
                <div className="flex flex-col gap-4">
                  <Link to="/account" className="text-secondary text-lg">
                    My account
                  </Link>
                  {isStaff(user) && (
                    <Link to="/admin" className="text-secondary text-lg">
                      Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => logout.mutate()}
                    className="text-muted text-left text-lg"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link to="/login" className="text-secondary text-lg">
                  Sign in / Join
                </Link>
              )}
            </li>
            <li className="mt-8">
              <ThemeSegmented />
            </li>
            <li className="mt-6">
              <ButtonLink to="/reservations" className="w-full">
                Reserve a table
              </ButtonLink>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
