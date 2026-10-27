import { ButtonLink } from '@/components/ui/Button';

/** Routes that exist in the navigation but are built in later phases. */
export function PlaceholderPage({ title, phase }) {
  return (
    <section className="container-luxe flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-accent eyebrow">{phase}</p>
      <h1 className="mt-4 text-5xl sm:text-6xl">{title}</h1>
      <div className="gold-rule my-8" />
      <p className="text-secondary max-w-md">
        This page is being prepared and arrives in a later build phase.
      </p>
      <ButtonLink to="/" variant="secondary" className="mt-10">
        Back to home
      </ButtonLink>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="container-luxe flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-accent eyebrow">404</p>
      <h1 className="mt-4 text-5xl sm:text-6xl">This table isn’t set</h1>
      <div className="gold-rule my-8" />
      <p className="text-secondary max-w-md">The page you’re looking for has moved or never existed.</p>
      <div className="mt-10 flex gap-4">
        <ButtonLink to="/">Home</ButtonLink>
        <ButtonLink to="/menu" variant="secondary">
          Menu
        </ButtonLink>
      </div>
    </section>
  );
}
