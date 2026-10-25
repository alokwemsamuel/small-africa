import type { ReactNode } from 'react';
import { Photo } from '../ui/Photo';
import { Reveal } from '../motion/Reveal';

/**
 * Editorial page header. The optional photo sits under a gradient of the page's own surface
 * colour, so the heading keeps AA contrast in both Dark and Light themes.
 */
export function PageHeader({
  eyebrow,
  title,
  intro,
  photo,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  photo?: string;
  children?: ReactNode;
}) {
  return (
    <header className="relative isolate overflow-hidden">
      {photo && (
        <>
          <Photo name={photo} alt="" sizes="100vw" priority className="absolute inset-0 -z-20 size-full" />
          <div
            className="from-surface via-surface/85 to-surface/40 absolute inset-0 -z-10 bg-gradient-to-t"
            aria-hidden="true"
          />
        </>
      )}
      {!photo && <div className="bg-pattern absolute inset-0 -z-10 opacity-[0.05]" aria-hidden="true" />}
      <div className={`container-luxe ${photo ? 'pt-40 pb-14 sm:pt-56' : 'pt-20 pb-12 sm:pt-28'}`}>
        <Reveal>
          <p className="eyebrow text-accent">{eyebrow}</p>
          <h1 className="mt-4 max-w-4xl text-5xl leading-[1.02] sm:text-7xl">{title}</h1>
          <div className="gold-rule mt-6" />
          {intro && <div className="text-secondary mt-6 max-w-2xl text-lg leading-relaxed">{intro}</div>}
          {children}
        </Reveal>
      </div>
    </header>
  );
}
