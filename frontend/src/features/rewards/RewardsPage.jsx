import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Reveal } from '@/components/motion/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { useMe } from '@/features/auth/hooks';
import { useSite } from '@/features/menu/hooks';
import { useSeo } from '@/lib/seo';
import { loyaltyApi } from './api';

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/** Public explainer for the Small Africa Interest Account. */
export function RewardsPage() {
  useSeo({
    title: 'Interest Account',
    description:
      'Earn monthly interest as dining credit, points on every order, tier perks, a stamp card and referral rewards at Small Africa, Lagos.',
  });
  const { data: user } = useMe();
  const { data: site } = useSite();
  const { data: rewards } = useQuery({
    queryKey: ['public', 'rewards'],
    queryFn: ({ signal }) => loyaltyApi.catalog(signal),
  });
  const l = site?.loyalty;
  const rate = (l?.interestRateBp ?? 200) / 100;
  const min = l?.interestMinBalanceNaira ?? 20000;
  const cap = l?.interestCapNaira ?? 5000;
  const example = 50000;
  const exampleInterest = Math.min(cap, Math.floor((example * rate) / 100));

  const cta = user ? (
    <ButtonLink to="/account?tab=rewards">Open my Interest Account</ButtonLink>
  ) : (
    <div className="flex flex-wrap gap-3">
      <ButtonLink to="/register">Join free</ButtonLink>
      <ButtonLink to="/login" state={{ from: '/account?tab=rewards' }} variant="secondary">
        Sign in
      </ButtonLink>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Small Africa Interest Account"
        title="Dine often. Earn more."
        intro="A dining wallet that pays monthly interest as dining credit, points on every order, perks that grow with you, and treats for the moments that matter."
        photo="ambience/chef-plating"
      >
        <div className="mt-8">{cta}</div>
      </PageHeader>

      <div className="container-luxe flex flex-col gap-20 pb-24">
        <section aria-labelledby="r-wallet" className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow text-accent">Dining wallet</p>
            <h2 id="r-wallet" className="mt-3 text-4xl sm:text-5xl">
              Your balance earns {rate}% a month
            </h2>
            <p className="text-secondary mt-5 max-w-prose text-lg">
              Top up with Paystack (bonus credit on larger top-ups). Keep {naira(min)} or more in your wallet
              for a whole month and we add {rate}% of it as dining credit on the 1st, up to {naira(cap)} a
              month.
            </p>
            <p className="text-muted mt-4 text-sm">
              Dining credit is for spending at Small Africa. It isn’t cash and can’t be withdrawn or
              transferred.
            </p>
          </Reveal>
          <Reveal className="border-line bg-surface-raised rounded-md border p-8">
            <p className="eyebrow text-muted">Example</p>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-3 text-lg">
              <dt className="text-secondary">Lowest balance in October</dt>
              <dd>{naira(example)}</dd>
              <dt className="text-secondary">Interest at {rate}%</dt>
              <dd className="text-accent">+{naira(exampleInterest)}</dd>
              <dt className="text-secondary">Added on 1 November</dt>
              <dd>{naira(example + exampleInterest)}</dd>
            </dl>
          </Reveal>
        </section>

        <section aria-labelledby="r-tiers">
          <p className="eyebrow text-accent">Membership tiers</p>
          <h2 id="r-tiers" className="mt-3 text-4xl sm:text-5xl">
            Perks that grow with every visit
          </h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(l?.tiers ?? []).map((t) => (
              <li
                key={t.key}
                className="border-line bg-surface-raised flex flex-col gap-3 rounded-md border p-6"
              >
                <p className="font-serif text-2xl">{t.name}</p>
                <p className="text-accent text-sm font-semibold">
                  {t.min_spend_naira > 0 ? `${naira(t.min_spend_naira)}+ in 12 months` : 'From sign-up'}
                </p>
                <ul className="text-secondary flex list-disc flex-col gap-1 pl-5 text-sm">
                  {t.perks.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="r-points" className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow text-accent">Points and the Rewards Menu</p>
            <h2 id="r-points" className="mt-3 text-4xl sm:text-5xl">
              {l?.earnPointsPer1000Naira ?? 5} points for every ₦1,000
            </h2>
            <p className="text-secondary mt-5 max-w-prose text-lg">
              Earn more as your tier grows, and double points on Tuesdays and Wednesdays, on featured dishes
              and in your birthday week. Boosts don’t stack: you always get the single best one that applies.
              Swap points for dining credit or a treat from the Rewards Menu.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {rewards?.map((r) => (
              <li
                key={r.slug}
                className="border-line flex items-center justify-between gap-4 rounded-md border p-4"
              >
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-secondary text-sm">{r.description}</p>
                </div>
                <span className="text-accent shrink-0 font-semibold">
                  {r.pointsCost.toLocaleString('en-NG')} pts
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="r-more" className="grid gap-5 md:grid-cols-3">
          <h2 id="r-more" className="sr-only">
            More ways to be rewarded
          </h2>
          {[
            [
              'Stamp card',
              'Every order or visit is a stamp. Your 5th earns a free dessert, your 10th a free main course.',
            ],
            ['Monthly streak', 'Dine or order three times in a month for bonus points.'],
            [
              'Bring a friend',
              `Share your code: when a friend completes their first order, you both get ${naira(l?.referralCreditNaira ?? 2000)} of dining credit.`,
            ],
            [
              'Birthday treat',
              'A free dessert and double points all week, plus a thank-you on the anniversary of joining.',
            ],
            [
              'Offers for you',
              'Personal offers from your favourite kitchen, and a welcome-back treat if we haven’t seen you for a while.',
            ],
            [
              'Your statement',
              'Every naira of credit and every point is on your statement, so you can always see where it came from.',
            ],
          ].map(([title, body]) => (
            <Reveal key={title} className="border-line bg-surface-raised rounded-md border p-6">
              <h3 className="font-serif text-2xl">{title}</h3>
              <p className="text-secondary mt-2">{body}</p>
            </Reveal>
          ))}
        </section>

        <section className="border-accent/40 bg-accent-fill/10 flex flex-col items-start gap-5 rounded-md border p-8 sm:p-12">
          <h2 className="text-4xl">Join the table</h2>
          <p className="text-secondary max-w-prose">
            Membership is free. Read the{' '}
            <Link to="/rewards-terms" className="text-accent underline">
              Rewards Terms
            </Link>{' '}
            for the full rules.
          </p>
          {cta}
        </section>
      </div>
    </>
  );
}
