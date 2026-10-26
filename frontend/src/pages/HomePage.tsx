import { lazy, Suspense } from 'react';
import { Hero } from '@/features/home/hero/Hero';
import { useSeo } from '@/lib/seo';

// Below-the-fold sections load as their own chunk, so the hero renders first on slow phones.
const HomeSections = lazy(() =>
  import('@/features/home/HomeSections').then((m) => ({ default: m.HomeSections })),
);

export function HomePage() {
  useSeo({});
  return (
    <>
      <Hero />
      {/* Holds the space the sections will take, so the footer doesn't jump when they arrive. */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <HomeSections />
      </Suspense>
    </>
  );
}
