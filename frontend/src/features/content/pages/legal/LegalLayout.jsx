import { PageHeader } from '@/components/layout/PageHeader';
import { useSeo } from '@/lib/seo';

/** Shared layout for legal pages: table of contents + readable long-form typography. */
export function LegalLayout({ title, description, updated, intro, sections }) {
  useSeo({ title, description });
  return (
    <>
      <PageHeader eyebrow={`Last updated ${updated}`} title={title} intro={intro} />
      <div className="container-luxe grid gap-12 pb-24 lg:grid-cols-[260px_1fr]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow text-muted mb-4">On this page</p>
          <ol className="flex flex-col gap-2 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-secondary hover:text-accent">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="text-secondary [&_a]:text-accent [&_strong]:text-primary flex max-w-3xl flex-col gap-12 leading-relaxed [&_a]:underline [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-28">
              <h2 id={`${s.id}-h`} className="text-primary text-3xl">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-4 flex flex-col gap-4">{s.body}</div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
