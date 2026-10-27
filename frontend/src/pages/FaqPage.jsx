import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useSeo } from '@/lib/seo';

const FAQ = [
  {
    group: 'Dining with us',
    items: [
      [
        'Do I need a reservation?',
        'We recommend booking, especially Thursday to Saturday evenings. Walk-ins are welcome when tables are free, and the lounge keeps space for drop-ins.',
      ],
      [
        'Is there a dress code?',
        'Smart casual. We’d love you to feel dressed for a special night, but there’s no tie rule.',
      ],
      [
        'Do you cater for allergies and dietary needs?',
        <>
          Yes. Every dish is labelled for vegetarian, gluten-free, nuts, pork and spice level, and you can{' '}
          <Link to="/menu?nopork=1">filter the menu</Link>. Please tell us about allergies before ordering:
          our kitchens handle nuts, gluten, fish and shellfish.
        </>,
      ],
      [
        'Do you serve pork?',
        <>
          Some Polish and Continental dishes contain pork and are clearly tagged “Contains pork”. Use the “No
          pork” filter to see everything without it, and ask us about pork-free alternatives.
        </>,
      ],
      [
        'Is there parking?',
        'Yes, valet parking is available from 6pm, and there is limited free parking in front of the restaurant during lunch.',
      ],
      [
        'Is alcohol served?',
        'Yes, to guests aged 18 and over. We also have a full menu of mocktails, fresh juices, Chapman and zobo.',
      ],
    ],
  },
  {
    group: 'Orders & delivery',
    items: [
      [
        'Where do you deliver?',
        'Victoria Island, Ikoyi, Lekki Phase 1, Yaba, Surulere, Ikeja and Ajah. The fee and estimated time for your area are shown at checkout.',
      ],
      [
        'How do I pay?',
        'Securely by card, bank transfer or USSD through Paystack, or with your Small Africa dining wallet.',
      ],
      ['Can I schedule an order?', 'Yes, up to 7 days ahead, for delivery or pickup.'],
    ],
  },
  {
    group: 'Interest Account & rewards',
    items: [
      [
        'What is the Small Africa Interest Account?',
        <>
          Our free membership. Top up a dining wallet for bonus credit, earn points on every order, climb
          tiers for perks, and earn monthly interest as dining credit on balances over ₦20,000.{' '}
          <Link to="/rewards">See how it works</Link>.
        </>,
      ],
      [
        'Can I withdraw my wallet balance?',
        'No. Wallet balance, bonus credit and interest are dining credit only. They can be spent at Small Africa but are not cash and can’t be withdrawn or transferred.',
      ],
      [
        'How do referrals work?',
        'Share your personal code. When a friend signs up with it and completes their first order, you both receive ₦2,000 dining credit.',
      ],
    ],
  },
  {
    group: 'Events',
    items: [
      [
        'Can I book the private dining room?',
        <>
          Yes: up to 16 guests with a set menu across all three kitchens.{' '}
          <Link to="/events">Send an enquiry</Link> and our events team will call you within one working day.
        </>,
      ],
      [
        'Do you cater weddings?',
        'Yes, for 50 to 200 guests, with exclusive venue hire or off-site catering.',
      ],
    ],
  },
];

export function FaqPage() {
  useSeo({
    title: 'Frequently asked questions',
    description:
      'Answers about reservations, dietary needs, delivery, the Interest Account and events at Small Africa, Lagos.',
  });
  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        intro={
          <>
            Can’t find your answer?{' '}
            <Link to="/contact" className="text-accent underline">
              Contact us
            </Link>
            ; we reply within one working day.
          </>
        }
      />
      <div className="container-luxe flex max-w-4xl flex-col gap-14 pb-24">
        {FAQ.map((g) => (
          <section key={g.group} aria-labelledby={g.group}>
            <h2 id={g.group} className="text-3xl">
              {g.group}
            </h2>
            <div className="mt-6 flex flex-col">
              {g.items.map(([q, a]) => (
                <details key={q} className="border-line group border-b py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span
                      className="text-accent text-2xl transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <div className="text-secondary [&_a]:text-accent mt-4 leading-relaxed [&_a]:underline">
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
