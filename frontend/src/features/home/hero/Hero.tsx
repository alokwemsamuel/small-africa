import { motion } from 'framer-motion';
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { useReducedMotion } from '@/components/motion/useReducedMotion';
import { useTheme } from '@/features/theme/context';

const HeroScene = lazy(() => import('./HeroScene'));

type Mode = 'poster' | 'video' | 'scene';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Low-power heuristics: Data Saver, little memory, or few cores on a phone. */
function lowPower(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return true;
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  return !!touch && (navigator.hardwareConcurrency ?? 8) <= 4;
}

const asset = (f: string) => `${import.meta.env.BASE_URL}hero/${f}`;

export function Hero() {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();
  const [mode, setMode] = useState<Mode>('poster');
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (reduced) setMode('poster');
    else if (!webglAvailable() || lowPower()) setMode('video');
    else setMode('scene');
  }, [reduced]);

  // Without the live scene, reveal the text straight away; with it, never wait more than 3.5s.
  useEffect(() => {
    if (mode !== 'scene') {
      setRevealed(true);
      return;
    }
    const t = window.setTimeout(() => setRevealed(true), 3500);
    return () => window.clearTimeout(t);
  }, [mode]);

  const poster = asset(`poster-${resolved}.webp`);
  const show = revealed || reduced;

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] items-end overflow-hidden lg:items-center"
    >
      {/* Poster underlay: first paint, reduced-motion view and Suspense fallback in one */}
      <img
        src={poster}
        alt=""
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-20 h-[62svh] w-full object-cover object-[72%_55%] lg:inset-0 lg:h-full lg:object-[50%_35%]"
        {...{ fetchpriority: 'high' }}
        decoding="async"
      />
      {mode === 'video' && (
        <video
          className="absolute inset-x-0 top-0 -z-20 h-[62svh] w-full object-cover object-[72%_55%] lg:inset-0 lg:h-full lg:object-[50%_35%]"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          aria-hidden="true"
          key={resolved}
        >
          <source src={asset(`hero-${resolved}.webm`)} type="video/webm" />
          <source src={asset(`hero-${resolved}.mp4`)} type="video/mp4" />
        </video>
      )}
      {mode === 'scene' && (
        <SceneBoundary onError={() => setMode('video')}>
          <Suspense fallback={null}>
            <div className="absolute inset-0 -z-20">
              <HeroScene key={resolved} theme={resolved} onRevealed={() => setRevealed(true)} />
            </div>
          </Suspense>
        </SceneBoundary>
      )}
      {/* Readability: fade the scene into the page surface behind the text */}
      <div
        className="from-surface via-surface/60 lg:via-surface/30 lg:from-surface/90 absolute inset-0 -z-10 bg-gradient-to-t to-transparent lg:bg-gradient-to-r lg:to-transparent"
        aria-hidden="true"
      />

      <div className="container-luxe relative pt-40 pb-16 sm:pb-24 lg:py-0">
        <motion.div
          initial={false}
          animate={show ? 'in' : 'out'}
          variants={{ out: {}, in: { transition: { staggerChildren: 0.14 } } }}
          className="max-w-2xl"
        >
          {[
            <p key="e" className="eyebrow text-accent">
              Lagos · Nigerian · Polish · Continental
            </p>,
            <h1 key="h" id="hero-title" className="mt-5 text-6xl leading-[0.95] sm:text-8xl lg:text-[7.5rem]">
              Three kitchens.
              <br />
              <span className="font-script text-accent">One table.</span>
            </h1>,
            <p key="p" className="text-secondary mt-7 max-w-lg text-lg leading-relaxed">
              Smoky party jollof, hand-pinched pierogi and a Wellington carved at your table, under one
              gold-leaf roof in Victoria Island.
            </p>,
            <div key="c" className="mt-10 flex flex-col gap-4 sm:flex-row">
              <ButtonLink to="/reservations" size="lg">
                Reserve a table
              </ButtonLink>
              <ButtonLink to="/menu" variant="secondary" size="lg">
                Explore the menu
              </ButtonLink>
            </div>,
          ].map((child) => (
            <motion.div
              key={child.key}
              variants={{
                out: { opacity: 0, y: 24 },
                in: { opacity: 1, y: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
              }}
              // Text is in the DOM from the start (SEO, screen readers); only its appearance animates.
              style={reduced ? { opacity: 1, transform: 'none' } : undefined}
            >
              {child}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/** If WebGL crashes (driver issues, context loss), fall back to the video instead of a blank hero. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
