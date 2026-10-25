import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

/** Phase 2 placeholder hero. Phase 3 replaces this with the 3D hero and full home page. */
export function HomePage() {
  return (
    <section className="relative isolate flex min-h-[calc(100dvh-4.5rem)] items-center overflow-hidden">
      <div className="bg-pattern absolute inset-0 -z-10 opacity-[0.05]" aria-hidden="true" />
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_35%,rgba(201,162,75,0.18),transparent_60%)]"
        aria-hidden="true"
      />
      <div className="container-luxe flex flex-col items-center py-24 text-center">
        <Logo variant="mark" className="w-32 sm:w-40" />
        <p className="text-accent eyebrow mt-10">Lagos · Nigerian · Polish · Continental</p>
        <h1 className="mt-5 max-w-4xl text-5xl leading-[1.02] sm:text-7xl lg:text-8xl">
          Three kitchens. One table.
        </h1>
        <p className="text-secondary mt-7 max-w-xl text-lg leading-relaxed">
          Smoky party jollof, hand-pinched pierogi and a Wellington carved at your table, under one gold-leaf
          roof in Victoria Island.
        </p>
        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <ButtonLink to="/reservations" size="lg">
            Reserve a table
          </ButtonLink>
          <ButtonLink to="/menu" variant="secondary" size="lg">
            Explore the menu
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
