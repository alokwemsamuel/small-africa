import { Link } from 'react-router-dom';
import { useSite } from '@/features/menu/hooks';
import { whatsappLink } from '@/lib/whatsapp';
import { Logo } from '../ui/Logo';
import { NAV } from './nav';

const LEGAL = [
  { to: '/faq', label: 'FAQ' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms' },
  { to: '/rewards-terms', label: 'Rewards Terms' },
];

const DAY_GROUPS = [
  { label: 'Mon – Thu', day: 1 },
  { label: 'Fri – Sat', day: 5 },
  { label: 'Sunday', day: 0 },
];

export function SiteFooter() {
  const { data } = useSite();
  const r = data?.restaurant;
  const hours = (day: number) => {
    const h = data?.openingHours.find((o) => o.dayOfWeek === day);
    if (!h) return '';
    if (h.isClosed) return 'Closed';
    return `${h.opensAt} – ${h.closesAt === '23:59' ? 'late' : h.closesAt}`;
  };
  return (
    <footer className="border-accent/15 bg-surface-raised relative mt-auto border-t">
      <div className="bg-pattern pointer-events-none absolute inset-0 opacity-[0.04]" aria-hidden="true" />
      <div className="container-luxe relative grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-5">
          <Logo className="h-14 w-auto self-start" />
          <p className="text-muted max-w-sm text-sm leading-relaxed">
            Nigerian, Polish and Continental cooking under one roof in Lagos. Fine dining, a lounge with live
            music, and a table that always has room for one more.
          </p>
          <ul className="flex gap-3" aria-label="Social media">
            {[
              ['Instagram', r?.instagram],
              ['TikTok', r?.tiktok],
            ].map(([label, href]) => (
              <li key={label}>
                <a
                  href={href ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-accent/40 text-accent hover:border-accent rounded-full border px-4 py-2 text-xs font-semibold tracking-wide uppercase"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
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
            {DAY_GROUPS.map((g) => (
              <div key={g.label} className="contents">
                <dt>{g.label}</dt>
                <dd>{hours(g.day) || '…'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="text-accent eyebrow mb-4 font-sans">Visit & contact</h2>
          <address className="text-secondary flex flex-col gap-2 text-sm not-italic">
            <span>{r?.address ?? 'Victoria Island, Lagos'}</span>
            {r?.phone && (
              <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="hover:text-accent-hover">
                {r.phone}
              </a>
            )}
            <a
              href={whatsappLink(r?.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent-hover"
            >
              WhatsApp us
            </a>
            <a href={`mailto:${r?.email ?? 'hello@smallafrica.ng'}`} className="hover:text-accent-hover">
              {r?.email ?? 'hello@smallafrica.ng'}
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r?.map_embed_query ?? 'Victoria Island, Lagos')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent mt-1 underline underline-offset-4"
            >
              Get directions
            </a>
          </address>
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
