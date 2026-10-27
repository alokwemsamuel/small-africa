import { Link } from 'react-router-dom';
import { useSite } from '@/features/menu/hooks';
import { LegalLayout } from './LegalLayout';

const naira = (n) => `₦${n.toLocaleString('en-NG')}`;

/** Rules of the Small Africa Interest Account. Figures come from the live loyalty settings. */
export function RewardsTermsPage() {
  const { data: site } = useSite();
  const l = site?.loyalty;
  const rate = l ? `${l.interestRateBp / 100}%` : '2%';
  const cap = naira(l?.interestCapNaira ?? 5000);
  const min = naira(l?.interestMinBalanceNaira ?? 20000);
  const referral = naira(l?.referralCreditNaira ?? 2000);

  const sections = [
    {
      id: 'what',
      title: 'What the Interest Account is',
      body: (
        <>
          <p>
            The Small Africa Interest Account is a <strong>loyalty programme</strong>. It has a dining wallet,
            reward points, membership tiers, a stamp card and member offers. Every registered guest has one.
          </p>
          <p>
            <strong>
              The wallet holds dining credit, not money. Dining credit and “interest” are not cash, are not a
              deposit or savings product, cannot be withdrawn, refunded to a bank account, transferred to
              another person or exchanged for cash, and can only be spent at Small Africa.
            </strong>{' '}
            Small Africa is a restaurant, not a bank or financial institution.
          </p>
        </>
      ),
    },
    {
      id: 'wallet',
      title: 'Dining wallet and top-ups',
      body: (
        <ul>
          <li>
            You can add dining credit with a card through Paystack. Credit appears once the payment is
            verified.
          </li>
          <li>
            Some top-up amounts include bonus dining credit (for example 5% on ₦50,000 and 10% on ₦100,000).
            Bonus levels may change; the amount shown before you pay is the one you get.
          </li>
          <li>
            Use dining credit for online orders, reservation deposits and event bookings, alone or with a
            card.
          </li>
          <li>
            If an order paid partly with dining credit is cancelled or not completed, the credit goes back to
            your wallet.
          </li>
          <li>
            A top-up can be reversed only within 14 days, only if none of it has been spent, and only to the
            card that paid for it. Bonus credit is removed if a top-up is reversed.
          </li>
        </ul>
      ),
    },
    {
      id: 'interest',
      title: 'Monthly interest (dining credit)',
      body: (
        <ul>
          <li>
            If your wallet balance stays at <strong>{min} or more for a whole calendar month</strong>, you
            earn interest of <strong>{rate}</strong> of the lowest balance you held that month, up to{' '}
            <strong>{cap}</strong> a month.
          </li>
          <li>
            Interest is added as dining credit on the 1st of the following month and is rounded down to the
            naira.
          </li>
          <li>Interest is a loyalty reward. It is not a return on a deposit and has no cash value.</li>
          <li>
            We may change the rate, cap or minimum with 30 days’ notice; changes never affect interest already
            earned.
          </li>
        </ul>
      ),
    },
    {
      id: 'points',
      title: 'Points',
      body: (
        <ul>
          <li>
            You earn {l?.earnPointsPer1000Naira ?? 5} points per ₦1,000 spent on food and drink in completed
            orders and dine-in bills (not on delivery fees, packaging or service charges).
          </li>
          <li>
            Some things earn more: your tier (for example 1.5× at Gold), double-points days (2× on Tuesdays
            and Wednesdays), featured dishes (2×) and your birthday week (2×).{' '}
            <strong>Multipliers don’t add up or multiply together:</strong> each item earns at the single
            highest multiplier that applies to it. For example, a Gold member ordering a featured dish on a
            Tuesday during their birthday week earns 2× on that dish, not more.
          </li>
          <li>Points are added when an order is delivered or collected.</li>
          <li>
            Swap points for dining credit or items from the Rewards Menu. Redeemed points can’t be returned.
          </li>
          <li>
            Points expire after <strong>12 months without any order, visit or redemption</strong>. We’ll email
            you 30 days before.
          </li>
        </ul>
      ),
    },
    {
      id: 'tiers',
      title: 'Membership tiers',
      body: (
        <>
          <p>Your tier follows what you spent with us in the last 12 months:</p>
          <ul>
            {(l?.tiers ?? []).map((t) => (
              <li key={t.key}>
                <strong>{t.name}</strong>
                {t.min_spend_naira > 0 ? ` (${naira(t.min_spend_naira)}+)` : ' (on sign-up)'}:{' '}
                {t.perks.join(', ')}.
              </li>
            ))}
          </ul>
          <p>
            You move up as soon as you qualify. Tiers are reviewed on the 1st of each month, when they can
            also move down.
          </p>
        </>
      ),
    },
    {
      id: 'stamps',
      title: 'Stamp card, streaks and special moments',
      body: (
        <ul>
          <li>
            Each completed order or visit adds a stamp: the 5th earns a free dessert and the 10th a free main
            course.
          </li>
          <li>Order or dine with us three times in a calendar month for bonus points.</li>
          <li>
            Add your birthday to your profile for a free dessert voucher and double points in your birthday
            week, plus bonus points on the anniversary of joining.
          </li>
          <li>Reward vouchers are valid for the period shown on them and can be used once.</li>
        </ul>
      ),
    },
    {
      id: 'referrals',
      title: 'Referrals',
      body: (
        <ul>
          <li>
            When a friend joins with your code, confirms their email and completes their first order, you each
            get {referral} of dining credit.
          </li>
          <li>
            One reward per new guest. Referrals from the same person, phone number or device, or that look
            automated, don’t qualify. There is a monthly limit per member.
          </li>
        </ul>
      ),
    },
    {
      id: 'fair',
      title: 'Fair use and changes',
      body: (
        <>
          <p>
            We may cancel credit, points or vouchers obtained through fraud, error or abuse, and close the
            account of anyone misusing the programme. Every movement of credit and points is recorded in your
            statement.
          </p>
          <p>
            We can change or end the programme with 30 days’ notice. If it ends, you will have at least 90
            days to spend your dining credit. These terms sit alongside our{' '}
            <Link to="/terms">Terms of Use</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalLayout
      title="Rewards Terms"
      description="The rules of the Small Africa Interest Account: dining credit, monthly interest, points, tiers, stamps and referrals."
      updated="25 October 2026"
      intro="The rules of the Small Africa Interest Account, in plain English."
      sections={sections}
    />
  );
}
