import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { useMe } from '@/features/auth/hooks';
import { ThemeMenu, ThemeSegmented } from '@/features/theme/ThemeSwitcher';

/** Phase 6 builds the full admin panel; its top bar and settings keep this appearance switcher. */
export function AdminHomePage() {
  const { data: user } = useMe();
  return (
    <div className="container-luxe py-10">
      <div className="border-line flex items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-4">
          <Logo variant="mark" className="w-12" />
          <div>
            <p className="eyebrow text-accent">Admin</p>
            <p className="text-secondary text-sm">Signed in as {user?.firstName}</p>
          </div>
        </div>
        <ThemeMenu />
      </div>
      <section className="flex min-h-[40vh] flex-col items-center justify-center py-16 text-center">
        <p className="eyebrow text-accent">Phase 6</p>
        <h1 className="mt-4 text-5xl sm:text-6xl">Admin dashboard</h1>
        <div className="gold-rule my-8" />
        <p className="text-secondary max-w-md">
          The dashboard, orders, reservations and menu manager arrive in Phase 6.
        </p>
        <ThemeSegmented className="mt-10" legend="Admin appearance" />
        <Link to="/" className="text-accent mt-10 text-sm underline">
          Back to the website
        </Link>
      </section>
    </div>
  );
}
