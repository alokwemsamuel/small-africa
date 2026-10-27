import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { cn } from '@/lib/cn';
import { GoldParticles } from './GoldParticles';

const asset = (f) => `${import.meta.env.BASE_URL}hero/${f}`;
/** Phones and portrait tablets get the 720×1280 vertical cut; everything else the 1920×1080 one. */
const PORTRAIT = '(orientation: portrait) and (max-width: 1024px)';

/** Data Saver (Chrome/Android) or the prefers-reduced-data media query. */
function saveData() {
  const nav = navigator;
  return !!nav.connection?.saveData || !!window.matchMedia?.('(prefers-reduced-data: reduce)').matches;
}

/**
 * Cinematic video hero (Pexels footage, see CREDITS.md). The poster paints first and stays as
 * the only image for reduced motion and Data Saver; otherwise the muted loop fades in over it
 * once it is actually playing, so there is never a blank or flashing frame.
 */
export function Hero() {
  const reduced = useReducedMotion();
  const video = useRef(null);
  const [variant, setVariant] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false); // the visitor pressed pause

  // Decide after mount (no video in the server-rendered/first paint) and follow rotation.
  // The video (and the particles, which follow it) start once the page has loaded and the
  // browser is idle: the poster is the same frame, and decoding video while the page is still
  // starting up makes phones slow to respond.
  useEffect(() => {
    if (reduced || saveData()) {
      setVariant(null);
      return;
    }
    const mq = window.matchMedia(PORTRAIT);
    const pick = () => setVariant(mq.matches ? '720x1280' : '1920');
    let idle = 0;
    const whenIdle = () => {
      idle =
        'requestIdleCallback' in window
          ? requestIdleCallback(start, { timeout: 2000 })
          : setTimeout(start, 500);
    };
    function start() {
      pick();
      mq.addEventListener?.('change', pick);
    }
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });
    return () => {
      window.removeEventListener('load', whenIdle);
      if ('cancelIdleCallback' in window) cancelIdleCallback(idle);
      clearTimeout(idle);
      mq.removeEventListener?.('change', pick);
    };
  }, [reduced]);

  useEffect(() => {
    const v = video.current;
    if (!v || !variant) return;
    setPlaying(false);
    v.muted = true; // must be set as a property too for iOS autoplay
    v.load();
    if (!paused) {
      v.play().catch(() => setPaused(true)); // autoplay refused (e.g. Low Power Mode): show Play
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      setPaused(false);
      void v.play().catch(() => setPaused(true));
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const moving = !!variant && !paused;

  return (
    <section
      aria-labelledby="hero-title"
      className="bg-obsidian relative isolate flex min-h-[100svh] items-end overflow-hidden lg:items-center"
    >
      {/* Poster: first paint, reduced-motion and Data Saver view */}
      <picture>
        <source media={PORTRAIT} type="image/avif" srcSet={asset('poster-720x1280.avif')} />
        <source media={PORTRAIT} type="image/webp" srcSet={asset('poster-720x1280.webp')} />
        <source type="image/avif" srcSet={asset('poster-1920.avif')} />
        <source
          type="image/webp"
          srcSet={`${asset('poster-1280.webp')} 1280w, ${asset('poster-1920.webp')} 1920w`}
          sizes="100vw"
        />
        <img
          src={asset('poster-1920.webp')}
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          decoding="async"
          {...{ fetchpriority: 'high' }}
          className="absolute inset-0 -z-30 size-full object-cover object-[50%_60%]"
        />
      </picture>
      {variant && (
        <video
          ref={video}
          className={cn(
            'absolute inset-0 -z-20 size-full object-cover object-[50%_60%] transition-opacity duration-1000',
            playing ? 'opacity-100' : 'opacity-0',
          )}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
          onPlaying={() => setPlaying(true)}
          key={variant}
        >
          <source src={asset(`hero-${variant}.webm`)} type="video/webm" />
          <source src={asset(`hero-${variant}.mp4`)} type="video/mp4" />
        </video>
      )}

      {/* Dark grade so the type reads in both themes: deeper at the bottom (and left on desktop). */}
      <div
        aria-hidden="true"
        className="from-obsidian/90 via-obsidian/45 to-obsidian/30 lg:from-obsidian/70 lg:via-obsidian/15 lg:to-obsidian/10 absolute inset-0 -z-10 bg-gradient-to-t"
      />
      <div
        aria-hidden="true"
        className="from-obsidian/80 via-obsidian/35 absolute inset-0 -z-10 hidden bg-gradient-to-r to-transparent lg:block"
      />
      {!reduced && (
        <GoldParticles running={moving} className="pointer-events-none absolute inset-0 -z-10 size-full" />
      )}
      {/* Melt into the page below, whichever theme it is */}
      <div
        aria-hidden="true"
        className="from-surface absolute inset-x-0 bottom-0 -z-10 h-16 bg-gradient-to-t to-transparent"
      />

      <div className="container-luxe relative pt-40 pb-20 sm:pb-24 lg:py-0">
        <div className="max-w-2xl">
          {[
            <p key="e" className="eyebrow text-gold-light">
              Lagos · Nigerian · Polish · Continental
            </p>,
            <h1
              key="h"
              id="hero-title"
              className="text-ivory mt-5 text-6xl leading-[0.95] sm:text-8xl lg:text-[7.5rem]"
            >
              Three kitchens.
              <br />
              <span className="font-script text-gold-light">One table.</span>
            </h1>,
            <p key="p" className="text-ivory/85 mt-7 max-w-lg text-lg leading-relaxed">
              Smoky party jollof, hand-pinched pierogi and a Wellington carved at your table, under one
              gold-leaf roof in Victoria Island.
            </p>,
            <div key="c" className="mt-10 flex flex-col gap-4 sm:flex-row">
              <ButtonLink to="/reservations" size="lg">
                Reserve a table
              </ButtonLink>
              <ButtonLink to="/menu" variant="onDark" size="lg">
                Explore the menu
              </ButtonLink>
            </div>,
          ].map((child, i) => (
            // Text is in the DOM from the start (SEO, screen readers); only its appearance animates.
            <div key={child.key} className={reduced ? undefined : `rise-in hero-rise hero-rise-${i}`}>
              {child}
            </div>
          ))}
        </div>
      </div>

      {variant && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={paused}
          aria-label={paused ? 'Play background video' : 'Pause background video'}
          className="border-gold-light/60 text-gold-light hover:bg-gold-light/15 focus-visible:outline-focus absolute top-5 right-4 grid size-11 place-items-center rounded-full border backdrop-blur-sm sm:top-6 sm:right-6"
        >
          {paused ? (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
            </svg>
          )}
        </button>
      )}
    </section>
  );
}
