import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadGsap } from '@/components/motion/loadGsap';
import { Reveal } from '@/components/motion/Reveal';
import { prefersReducedMotion } from '@/components/motion/useReducedMotion';
import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Photo } from '@/components/ui/Photo';
import { DishCard } from '@/components/menu/DishCard';
import { useMenu, useSite } from '@/hooks/useMenu';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNaira } from '@/lib/format';

function SectionHeading({ eyebrow, title, intro, center }) {
  return (
    <Reveal className={cn('max-w-3xl', center && 'mx-auto text-center')}>
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h2 className="mt-4 text-4xl leading-tight sm:text-6xl">{title}</h2>
      <div className={cn('gold-rule mt-6', center && 'mx-auto')} />
      {intro && <p className="text-secondary mt-6 text-lg leading-relaxed">{intro}</p>}
    </Reveal>
  );
}

/* ───────────────────────── Signature dishes carousel ───────────────────────── */

export function SignatureDishes() {
  const { data } = useMenu();
  const track = useRef(null);
  const featured = data?.dishes.filter((d) => d.isFeatured && d.category !== 'drinks') ?? [];
  const scroll = (dir) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  return (
    <section aria-labelledby="signature-h" className="py-24 sm:py-32">
      <div className="container-luxe flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div id="signature-h">
          <SectionHeading eyebrow="Signature dishes" title="The plates guests come back for" />
        </div>
        <div className="flex gap-3">
          {[-1, 1].map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => scroll(dir)}
              aria-label={dir < 0 ? 'Previous dishes' : 'Next dishes'}
              aria-controls="signature-track"
              className="border-accent/50 text-accent hover:border-accent hover:bg-accent-fill hover:text-on-accent grid size-12 place-items-center rounded-full border transition-colors"
            >
              <span aria-hidden="true">{dir < 0 ? '←' : '→'}</span>
            </button>
          ))}
        </div>
      </div>
      <ul
        id="signature-track"
        ref={track}
        className="container-luxe mt-12 flex snap-x snap-mandatory [scrollbar-width:thin] gap-6 overflow-x-auto pb-6"
        aria-label="Signature dishes"
      >
        {featured.map((d, i) => (
          <li key={d.id} className="flex w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
            <DishCard dish={d} priority={i < 2} className="w-full" />
          </li>
        ))}
        {!data &&
          Array.from({ length: 3 }, (_, i) => (
            <li
              key={i}
              className="bg-surface-raised h-[480px] w-[82%] shrink-0 animate-pulse rounded-md sm:w-[46%] lg:w-[31%]"
            />
          ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── Three kitchens (pinned horizontal scroll) ───────────────────────── */

const KITCHEN_PHOTOS = {
  nigerian: 'dishes/smoky-party-jollof',
  polish: 'dishes/pierogi-ruskie',
  continental: 'dishes/beef-wellington',
};
const KITCHEN_NUMERALS = ['I', 'II', 'III'];

export function ThreeKitchens() {
  const { data } = useMenu();
  const section = useRef(null);
  const track = useRef(null);
  const kitchens = data?.kitchens ?? [];

  useEffect(() => {
    // The pinned horizontal scroll is for wide screens only; smaller ones never load GSAP.
    if (!kitchens.length || prefersReducedMotion() || !window.matchMedia?.('(min-width: 1024px)').matches)
      return;
    let cancelled = false;
    let mm = null;
    void loadGsap().then(({ gsap }) => {
      if (cancelled) return;
      mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        const el = track.current;
        const distance = () => el.scrollWidth - window.innerWidth;
        gsap.to(el, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section.current,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
      });
    });
    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, [kitchens.length]);

  return (
    <section
      ref={section}
      aria-labelledby="kitchens-h"
      className="bg-surface-raised relative overflow-hidden"
    >
      <div ref={track} className="flex flex-col lg:h-svh lg:w-max lg:flex-row lg:items-stretch">
        <div className="flex shrink-0 flex-col justify-center px-4 py-24 sm:px-10 lg:w-[38vw] lg:py-0 lg:pl-[max(2.5rem,calc((100vw-1320px)/2+2.5rem))]">
          <p className="eyebrow text-accent">Three kitchens</p>
          <h2 id="kitchens-h" className="mt-4 text-5xl leading-tight sm:text-7xl">
            One roof.
            <br />
            Three traditions.
          </h2>
          <div className="gold-rule mt-6" />
          <p className="text-secondary mt-6 max-w-md text-lg leading-relaxed">
            Each kitchen has its own brigade, its own spice cupboard and its own grandmothers to answer to.
            They meet at your table.
          </p>
        </div>
        {kitchens.map((k, i) => (
          <KitchenPanel key={k.slug} kitchen={k} numeral={KITCHEN_NUMERALS[i] ?? ''} />
        ))}
      </div>
    </section>
  );
}

function KitchenPanel({ kitchen, numeral }) {
  return (
    <article className="border-line relative flex shrink-0 flex-col border-t lg:h-full lg:w-[min(560px,42vw)] lg:border-t-0 lg:border-l">
      <Photo
        name={KITCHEN_PHOTOS[kitchen.slug] ?? ''}
        alt=""
        sizes="(min-width: 1024px) 560px, 100vw"
        className="aspect-[4/3] lg:aspect-auto lg:h-[55%]"
      />
      <div className="flex flex-1 flex-col gap-4 px-4 py-10 sm:px-10">
        <div className="flex items-baseline gap-4">
          {/* The kitchen's colour, blended toward the text colour so it keeps 3:1+ contrast in both themes. */}
          <span
            className="font-serif text-5xl"
            style={{ color: `color-mix(in oklab, ${kitchen.accentColor} 60%, var(--sa-text-primary))` }}
            aria-hidden="true"
          >
            {numeral}
          </span>
          <h3 className="text-3xl sm:text-4xl">{kitchen.name}</h3>
        </div>
        <p className="font-script text-accent text-2xl">{kitchen.tagline}</p>
        <p className="text-secondary leading-relaxed">{kitchen.description}</p>
        <Link
          to={`/menu?kitchen=${kitchen.slug}`}
          className="text-accent hover:text-accent-hover mt-auto self-start text-sm font-semibold tracking-wide uppercase underline-offset-8 hover:underline"
        >
          Explore the {kitchen.name.replace(' Kitchen', '')} menu →
        </Link>
      </div>
    </article>
  );
}

/* ───────────────────────── Counters ───────────────────────── */

function Counter({ to, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    // Counts up (ease-out over 1.8s) once the number scrolls into view. A few lines of rAF,
    // so phones don't download an animation library for it.
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - start) / 1800);
          el.textContent = String(Math.round(to * (1 - (1 - p) ** 2)));
          if (p < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = String(to);
    };
  }, [to]);
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span ref={ref} className="text-accent font-serif text-6xl sm:text-7xl">
        {to}
      </span>
      <span className="eyebrow text-muted">{label}</span>
    </div>
  );
}

export function Counters() {
  const { data } = useMenu();
  return (
    <section aria-label="Small Africa in numbers" className="border-line border-y py-16">
      <div className="container-luxe grid grid-cols-2 gap-10 md:grid-cols-4">
        <Counter to={3} label="Kitchens" />
        <Counter to={data?.dishes.length ?? 54} label="Dishes on the menu" />
        <Counter to={7} label="Course tasting menu" />
        <Counter to={4} label="Places to dine" />
      </div>
    </section>
  );
}

/* ───────────────────────── Chef's story ───────────────────────── */

export function ChefStory() {
  return (
    <section aria-labelledby="story-h" className="py-24 sm:py-32">
      <div className="container-luxe grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <Reveal effect="clip">
          <Photo
            name="ambience/chef-plating"
            alt="A chef plating a dish with tweezers"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[4/5] rounded-md lg:aspect-[16/10]"
          />
        </Reveal>
        <div>
          <SectionHeading eyebrow="Our story" title="A Lagos table that remembers Kraków" />
          <Reveal className="text-secondary mt-6 flex flex-col gap-5 text-lg leading-relaxed">
            <p>
              Small Africa began with a simple argument at a family dinner: whose cooking makes people
              happiest? Our Nigerian aunties said jollof. Our Polish grandmother said pierogi. Our
              Continental-trained head chef said “why not both?”
            </p>
            <p>
              So we built three kitchens under one roof, each run by its own brigade, each cooking from
              scratch every day. What connects them is the table: the gold-lit room where a plate of suya can
              sit beside a bowl of barszcz and a carved Wellington, and nobody thinks it strange.
            </p>
          </Reveal>
          <Reveal className="mt-10 flex flex-wrap gap-4">
            <ButtonLink to="/about" variant="secondary">
              Read our story
            </ButtonLink>
            <ButtonLink to="/menu/chefs-tasting-menu" variant="ghost">
              The Chef’s Tasting Menu
            </ButtonLink>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Testimonials ───────────────────────── */

export function Testimonials() {
  const { data } = useSite();
  const items = data?.testimonials.slice(0, 6) ?? [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="reviews-h" className="bg-surface-raised py-24 sm:py-32">
      <div className="container-luxe">
        <div id="reviews-h">
          <SectionHeading eyebrow="Guests say" title="Kind words from our table" center />
        </div>
        <Reveal stagger={0.12} as="ul" className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <li key={t.id} className="border-line bg-surface flex flex-col gap-4 rounded-md border p-7">
              <p className="text-accent tracking-[0.3em]" aria-label={`${t.rating} out of 5 stars`}>
                {'★'.repeat(t.rating)}
                <span className="opacity-30">{'★'.repeat(5 - t.rating)}</span>
              </p>
              {t.title && <h3 className="text-2xl">{t.title}</h3>}
              <blockquote className="text-secondary leading-relaxed">“{t.body}”</blockquote>
              <p className="text-muted mt-auto text-sm">
                {t.author}
                {t.dish && <> · {t.dish}</>}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Interest Account teaser ───────────────────────── */

export function InterestTeaser() {
  const { data } = useSite();
  const l = data?.loyalty;
  return (
    <section aria-labelledby="interest-h" className="py-24 sm:py-32">
      <div className="container-luxe grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading
            eyebrow="Small Africa Interest Account"
            title="Your table earns while you’re away"
            intro={`Top up your dining wallet for bonus credit, earn ${l?.earnPointsPer1000Naira ?? 5} points on every ₦1,000, and receive monthly interest as dining credit (${(l?.interestRateBp ?? 200) / 100}% a month, up to ${formatNaira((l?.interestCapNaira ?? 5000) * 100)}) on balances over ${formatNaira((l?.interestMinBalanceNaira ?? 20000) * 100)}.`}
          />
          <Reveal className="mt-10 flex flex-wrap gap-4">
            <ButtonLink to="/register">Join free</ButtonLink>
            <ButtonLink to="/rewards" variant="secondary">
              How it works
            </ButtonLink>
          </Reveal>
          <p className="text-muted mt-6 text-xs">
            Dining credit only: not cash, not withdrawable or transferable. Rewards Terms apply.
          </p>
        </div>
        <Reveal effect="fade">
          <MembershipCardPreview />
        </Reveal>
      </div>
    </section>
  );
}

/** Illustrative membership card (Phase 5 renders the real one with live balances). */
function MembershipCardPreview() {
  return (
    <div
      className="relative mx-auto aspect-[1.586] w-full max-w-lg overflow-hidden rounded-2xl p-7 text-[#F6EFE3] shadow-2xl shadow-black/40 sm:p-9"
      style={{ background: 'linear-gradient(135deg, #1A1612 0%, #0E0C0A 55%, #2a2010 100%)' }}
    >
      <div className="bg-pattern absolute inset-0 opacity-[0.12]" aria-hidden="true" />
      <div
        className="absolute -top-24 -right-16 size-64 rounded-full bg-[radial-gradient(circle,rgba(201,162,75,0.45),transparent_65%)]"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between">
          <img src={`${import.meta.env.BASE_URL}brand/small-africa-mark-gold.svg`} alt="" className="w-14" />
          <span className="rounded-full border border-[#C9A24B] px-3 py-1 text-xs font-semibold tracking-[0.2em] text-[#E6C97A] uppercase">
            Gold
          </span>
        </div>
        <p className="mt-auto text-xs tracking-[0.25em] text-[#E7D9C4] uppercase">Dining wallet</p>
        <p className="font-serif text-4xl text-[#E6C97A] sm:text-5xl">₦68,500</p>
        <div className="mt-4 flex items-end justify-between text-sm text-[#E7D9C4]">
          <span>Chiamaka Bello</span>
          <span>2,340 pts</span>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Reservation CTA + events teaser ───────────────────────── */

export function ReserveBand() {
  return (
    <section aria-labelledby="reserve-h" className="relative isolate overflow-hidden py-32 sm:py-44">
      <Photo name="ambience/lounge" alt="" sizes="100vw" className="absolute inset-0 -z-20 size-full" />
      <div className="bg-surface/80 absolute inset-0 -z-10" aria-hidden="true" />
      <Reveal className="container-luxe flex flex-col items-center text-center">
        <p className="eyebrow text-accent">Reservations</p>
        <h2 id="reserve-h" className="mt-4 max-w-3xl text-5xl leading-tight sm:text-7xl">
          Your table is waiting
        </h2>
        <p className="text-secondary mt-6 max-w-xl text-lg">
          Main hall, lounge, terrace or a private room for up to sixteen. Live highlife and jazz every Friday.
        </p>
        <ButtonLink to="/reservations" size="lg" className="mt-10">
          Book a table
        </ButtonLink>
      </Reveal>
    </section>
  );
}

export function EventsTeaser() {
  return (
    <section aria-labelledby="events-h" className="py-24 sm:py-32">
      <div className="container-luxe grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <div className="order-2 lg:order-1">
          <SectionHeading
            eyebrow="Events & catering"
            title="Celebrations, three kitchens deep"
            intro="Private dinners, corporate lunches, engagements and weddings for up to 200 guests, with menus built across all three of our kitchens."
          />
          <Reveal className="mt-10">
            <ButtonLink to="/events" variant="secondary">
              Plan an event
            </ButtonLink>
          </Reveal>
        </div>
        <Reveal effect="clip" className="order-1 lg:order-2">
          <Photo
            name="ambience/celebration-hall"
            alt="Celebration tables with candelabras and festoon lights"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[16/10] rounded-md"
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────── Gallery strip ───────────────────────── */

const STRIP = [
  'dishes/pierogi-z-miesem',
  'ambience/cocktails',
  'dishes/egusi-pounded-yam',
  'ambience/dining-room',
  'dishes/ribeye-peppercorn',
  'dishes/zobo',
  'ambience/pierogi-making',
  'dishes/creme-brulee',
];

export function GalleryStrip() {
  return (
    <section aria-label="From our gallery" className="overflow-hidden py-16">
      <div className="flex w-max gap-4 hover:[animation-play-state:paused] motion-safe:animate-[marquee_60s_linear_infinite]">
        {[...STRIP, ...STRIP].map((p, i) => (
          <Link
            key={i}
            to="/gallery"
            tabIndex={i < STRIP.length ? 0 : -1}
            aria-hidden={i >= STRIP.length}
            className="block w-64 shrink-0 sm:w-80"
          >
            <Photo name={p} sizes="320px" className="aspect-square rounded-md" />
            {i === 0 && <span className="sr-only">Open the gallery</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Newsletter ───────────────────────── */

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const r = await api('/newsletter', {
        method: 'POST',
        body: { email, source: 'home' },
      });
      setState({ tone: 'success', text: r.message });
      setEmail('');
    } catch (err) {
      setState({
        tone: 'error',
        text: err instanceof ApiError ? (err.fields.email ?? err.message) : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="news-h" className="border-line border-t py-24">
      <div className="container-luxe grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="eyebrow text-accent">Newsletter</p>
          <h2 id="news-h" className="mt-4 text-4xl sm:text-5xl">
            Menus, events and member offers
          </h2>
          <p className="text-secondary mt-4">One thoughtful email a fortnight. Unsubscribe any time.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="border-input bg-surface-inset text-primary placeholder:text-muted focus:border-accent min-h-13 w-full rounded-full border px-6 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-13 rounded-full px-8 text-sm font-semibold tracking-wide uppercase disabled:opacity-60"
            >
              {busy ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
          {state && <Alert tone={state.tone}>{state.text}</Alert>}
        </form>
      </div>
    </section>
  );
}
