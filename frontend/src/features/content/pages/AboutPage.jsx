import { PageHeader } from '@/components/layout/PageHeader';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { Photo } from '@/components/ui/Photo';
import { useSeo } from '@/lib/seo';

const VALUES = [
  [
    'Cooked from scratch',
    'Stocks simmered overnight, pierogi pinched by hand, jollof finished over firewood. Nothing arrives frozen from a factory.',
  ],
  [
    'Three brigades, one standard',
    'Each kitchen keeps its own traditions and its own spice cupboard, but every plate leaves the pass under the same eye.',
  ],
  [
    'Lagos produce first',
    'Fish from Epe, peppers from Mile 12, beef from trusted suppliers. Polish essentials like rye starter and twaróg we make in-house.',
  ],
  [
    'Everyone at the table',
    'Vegetarian, gluten-free and pork-free choices across all three kitchens, clearly labelled, never an afterthought.',
  ],
];

export function AboutPage() {
  useSeo({
    title: 'Our Story',
    description:
      'How Small Africa brought Nigerian, Polish and Continental kitchens together under one roof in Victoria Island, Lagos.',
  });
  return (
    <>
      <PageHeader
        eyebrow="Our story"
        title="Three kitchens grew up at one family table"
        photo="ambience/dining-room"
        intro="Small Africa is a love letter to the cities that raised us: Lagos, Kraków and the grand dining rooms of Europe."
      />
      <section className="container-luxe grid gap-12 py-20 lg:grid-cols-2 lg:gap-20">
        <Reveal className="text-secondary flex flex-col gap-5 text-lg leading-relaxed">
          <p className="text-primary font-serif text-3xl leading-snug">
            “Whose cooking makes people happiest?” It was a dinner-table argument that never ended, so we
            built a restaurant instead.
          </p>
          <p>
            Our Nigerian aunties swore by smoky party jollof and egusi thick enough to stand a spoon in. Our
            Polish grandmother answered with pierogi, żurek and a cheesecake recipe nobody else was allowed to
            see. The Continental-trained chef in the family quietly carved a Beef Wellington and said: why
            choose?
          </p>
          <p>
            Small Africa opened in Victoria Island in 2026 with three kitchens under one roof. Each has its
            own brigade and its own traditions. They meet at your table, in a gold-lit dining room, a lounge
            with live music on Fridays, an open-air terrace and a private room for the occasions that matter.
          </p>
        </Reveal>
        <Reveal effect="clip">
          <Photo
            name="ambience/pierogi-making"
            alt="Hand-made pierogi on wooden boards"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[16/10] rounded-md"
          />
        </Reveal>
      </section>

      <section aria-labelledby="values-h" className="bg-surface-raised py-20">
        <div className="container-luxe">
          <p className="eyebrow text-accent">What we believe</p>
          <h2 id="values-h" className="mt-4 text-4xl sm:text-5xl">
            How we cook
          </h2>
          <Reveal stagger={0.12} as="ul" className="mt-12 grid gap-8 md:grid-cols-2">
            {VALUES.map(([title, body], i) => (
              <li key={title} className="border-line flex gap-6 border-t pt-6">
                <span className="text-accent font-serif text-4xl">0{i + 1}</span>
                <div>
                  <h3 className="text-2xl">{title}</h3>
                  <p className="text-secondary mt-2 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="container-luxe grid items-center gap-12 py-20 lg:grid-cols-[1fr_1.1fr]">
        <Reveal effect="clip">
          <Photo
            name="ambience/chef-sauce"
            alt="A chef spooning sauce over a plated course"
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="aspect-[16/10] rounded-md"
          />
        </Reveal>
        <Reveal>
          <p className="eyebrow text-accent">Chef’s Tasting Menu</p>
          <h2 className="mt-4 text-4xl sm:text-5xl">Seven courses, three kitchens, one evening</h2>
          <p className="text-secondary mt-6 text-lg leading-relaxed">
            Suya tartare, a barszcz shot, seared scallop, pepper-soup consommé, a pierogi duo, beef fillet
            with jollof arancini, and sernik with zobo. The best way to understand Small Africa is to taste
            all of it.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <ButtonLink to="/menu/chefs-tasting-menu">See the tasting menu</ButtonLink>
            <ButtonLink to="/reservations" variant="secondary">
              Reserve
            </ButtonLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
