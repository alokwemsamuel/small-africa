import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { NAV } from './nav';

const LEGAL = [
  { to: '/faq', label: 'FAQ' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms' },
  { to: '/rewards-terms', label: 'Rewards Terms' },
];

export function SiteFooter() {
  return (
    <footer className="border-accent/15 bg-surface-raised relative mt-auto border-t">
      <div className="bg-pattern pointer-events-none absolute inset-0 opacity-[0.04]" aria-hidden="true" />
      <div className="container-luxe relative grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-5">
          <Logo className="h-14 w-auto self-start" />
          <p className="text-muted max-w-sm text-sm leading-relaxed">
            Nigerian, Polish and Continental cooking under one roof in Lagos. Fine dining, a lounge with live
            music, and a table that always has room for one more.
          </p>
        </div>
        <nav aria-label="Footer">
          <h2 className="text-accent eyebrow mb-4 font-sans">Explore</h2>
          <ul className="text-secondary flex flex-col gap-2.5 text-sm">
            {NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="hover:text-accent-hover">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="text-accent eyebrow mb-4 font-sans">Hours</h2>
          <dl className="text-secondary grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt>Mon – Thu</dt>
            <dd>12:00 – 23:00</dd>
            <dt>Fri – Sat</dt>
            <dd>12:00 – late</dd>
            <dt>Sunday</dt>
            <dd>13:00 – 22:00</dd>
          </dl>
          <p className="text-muted mt-5 text-sm">Victoria Island, Lagos</p>
        </div>
      </div>
      <div className="container-luxe border-accent/10 text-muted relative flex flex-col gap-3 border-t py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Small Africa. All rights reserved.</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="hover:text-primary">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
