import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Reveal } from '@/components/motion/Reveal';
import { Photo } from '@/components/ui/Photo';
import { PHOTOS } from '@/content/photos';
import { cn } from '@/lib/cn';
import { useSeo } from '@/lib/seo';

const FEATURED = [
  'ambience/lounge',
  'dishes/smoky-party-jollof',
  'dishes/pierogi-ruskie',
  'ambience/chandelier-room',
  'dishes/beef-wellington',
  'ambience/cocktails',
  'dishes/egusi-pounded-yam',
  'ambience/private-dining',
  'dishes/barszcz-uszka',
  'dishes/grilled-croaker',
  'ambience/lounge-sofa',
  'dishes/ribeye-peppercorn',
  'dishes/paczki',
  'ambience/celebration-hall',
  'dishes/zobo',
  'dishes/creme-brulee',
  'ambience/chef-plating',
  'dishes/kotlet-schabowy',
];

export function GalleryPage() {
  useSeo({
    title: 'Gallery',
    description:
      'Inside Small Africa: our dining room, lounge, private dining and dishes from three kitchens.',
  });
  const [open, setOpen] = useState(null);
  const dialog = useRef(null);
  const closeBtn = useRef(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) {
      d.showModal();
      closeBtn.current?.focus(); // predictable focus target for keyboard users
    }
    if (open === null && d.open) d.close();
  }, [open]);

  const move = (dir) => setOpen((i) => (i === null ? i : (i + dir + FEATURED.length) % FEATURED.length));
  const current = open !== null ? PHOTOS[FEATURED[open]] : null;

  return (
    <>
      <PageHeader
        eyebrow="Gallery"
        title="A look around the table"
        intro="The rooms, the plates and the people who make them."
      />
      <div className="container-luxe pb-16">
        <Reveal stagger={0.05} as="ul" className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {FEATURED.map((name, i) => {
            const p = PHOTOS[name];
            return (
              <li key={name} className="mb-4 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="group block w-full overflow-hidden rounded-md text-left"
                  aria-label={`Open photo: ${p?.alt ?? name}`}
                >
                  <Photo
                    name={name}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className={cn(
                      p?.wide ? 'aspect-[16/10]' : 'aspect-[4/3]',
                      '[&_img]:transition-transform [&_img]:duration-700 group-hover:[&_img]:scale-105',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </Reveal>

        <section aria-labelledby="credits-h" className="border-line mt-16 border-t pt-10">
          <h2 id="credits-h" className="text-2xl">
            Photography credits
          </h2>
          <p className="text-muted mt-2 text-sm">
            Photographs used under the Unsplash License. Thank you to these photographers.
          </p>
          <ul className="text-muted mt-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[...new Map(Object.values(PHOTOS).map((p) => [p.by, p])).values()].map((p) => (
              <li key={p.by}>
                <a
                  href={`https://unsplash.com/@${p.profile}?utm_source=small_africa&utm_medium=referral`}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="hover:text-accent"
                >
                  {p.by}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') move(1);
          if (e.key === 'ArrowLeft') move(-1);
        }}
        aria-label={current?.alt ?? 'Photo'}
        className="bg-surface text-primary m-auto max-h-[92vh] w-[min(1200px,94vw)] rounded-md p-0 backdrop:bg-black/80"
      >
        {open !== null && current && (
          <figure className="flex flex-col">
            <Photo
              name={FEATURED[open]}
              sizes="94vw"
              className={current.wide ? 'aspect-[16/10]' : 'aspect-[4/3]'}
            />
            <figcaption className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
              <span>
                {current.alt}
                <span className="text-muted">
                  {' '}
                  · Photo:{' '}
                  <a
                    href={`https://unsplash.com/@${current.profile}?utm_source=small_africa&utm_medium=referral`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {current.by}
                  </a>
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => move(-1)}
                  className="border-line rounded-full border px-4 py-2"
                  aria-label="Previous photo"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  className="border-line rounded-full border px-4 py-2"
                  aria-label="Next photo"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="bg-accent-fill text-on-accent rounded-full px-4 py-2 font-semibold"
                  ref={closeBtn}
                >
                  Close
                </button>
              </span>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
}
