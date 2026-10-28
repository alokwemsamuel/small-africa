import { Link } from 'react-router-dom';
import { LegalLayout } from './LegalLayout';

const sections = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Small Africa (“we”, “us”) operates the Small Africa restaurant and lounge in Victoria Island, Lagos,
          and this website. We are the <strong>data controller</strong> for the personal data described here,
          under the <strong>Nigeria Data Protection Act 2023</strong> (NDPA) and the regulations of the
          Nigeria Data Protection Commission (NDPC).
        </p>
        <p>
          Questions or requests: email <a href="mailto:privacy@smallafrica.ng">privacy@smallafrica.ng</a> or
          write to us at the restaurant, marked “Data Protection”.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <ul>
        <li>
          <strong>Account details:</strong> name, email, phone number, password (stored only as a one-way
          hash), and optionally your birthday and favourite kitchen.
        </li>
        <li>
          <strong>If you sign in with Google, Apple or Facebook:</strong> the provider tells us your name,
          your email address (Apple may give a private relay address instead) and whether that address is
          confirmed, plus a unique number that identifies you at that provider. We do <em>not</em> receive
          your provider password, your contacts or friends, or your posts, and we don’t keep your profile
          picture. If you sign up this way we then ask for your phone number, and optionally your birthday
          (day and month only).
        </li>
        <li>
          <strong>Orders and reservations:</strong> what you order, delivery address, date, time, party size,
          seating preference, special occasions and notes you give us (for example dietary needs or
          allergies).
        </li>
        <li>
          <strong>Payments:</strong> processed by Paystack. We never see or store your full card number; we
          keep the payment reference, amount and status.
        </li>
        <li>
          <strong>Interest Account:</strong> wallet top-ups, dining credit, points, tier, stamps and referral
          activity.
        </li>
        <li>
          <strong>Messages:</strong> what you send through our contact and events forms.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, browser type and security logs, used to keep accounts
          safe and stop abuse.
        </li>
      </ul>
    ),
  },
  {
    id: 'why',
    title: 'Why we use it, and our lawful basis',
    body: (
      <ul>
        <li>
          <strong>To provide what you ask for</strong> (performance of a contract): taking orders and
          payments, delivering food, holding tables, running your account and Interest Account, and letting
          you sign in with Google, Apple or Facebook if you choose to.
        </li>
        <li>
          <strong>To keep you safe</strong> (legitimate interests and legal obligation): fraud prevention,
          account security, handling allergy information carefully, and keeping tax and accounting records.
        </li>
        <li>
          <strong>Marketing</strong> (consent): menus, events and member offers by email or WhatsApp, only if
          you opt in. You can withdraw consent at any time from your account or the link in every email.
        </li>
        <li>
          <strong>Improving our service</strong> (legitimate interests): understanding which dishes and times
          are popular, using aggregated data wherever possible.
        </li>
      </ul>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <p>
          We never sell your personal data. We share it only with service providers who act on our
          instructions:
        </p>
        <ul>
          <li>
            <strong>Paystack</strong>, to process card and bank payments.
          </li>
          <li>
            <strong>Google, Apple or Facebook</strong>, only if you choose to sign in with them. They learn
            that you signed in to Small Africa, under their own privacy policies. You can disconnect any of
            them from <em>Settings</em> in your account at any time (once you have another way to sign in).
          </li>
          <li>
            <strong>Our email provider</strong>, to send confirmations, receipts and (if you opt in)
            newsletters.
          </li>
          <li>
            <strong>Our hosting provider</strong>, which stores the website and database securely.
          </li>
          <li>
            <strong>Delivery riders</strong>, who receive only your name, phone number and delivery address
            for that order.
          </li>
          <li>
            <strong>Authorities</strong>, where the law requires it.
          </li>
        </ul>
        <p>
          If any provider processes data outside Nigeria, we make sure the transfer meets the NDPA’s
          requirements, for example through contractual safeguards.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Account data: while your account is open, and up to 12 months after you close it.</li>
        <li>Order, payment and Interest Account ledger records: 6 years, for tax and accounting law.</li>
        <li>Reservations: 24 months.</li>
        <li>Contact and events messages: 24 months after the last reply.</li>
        <li>Security logs: up to 12 months.</li>
      </ul>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the NDPA you have the right to:</p>
        <ul>
          <li>be informed about how we use your data (this page);</li>
          <li>access a copy of your personal data;</li>
          <li>have inaccurate data corrected;</li>
          <li>have your data deleted where we no longer need it;</li>
          <li>restrict or object to certain processing, including direct marketing;</li>
          <li>receive your data in a portable format;</li>
          <li>withdraw consent at any time, without affecting earlier processing;</li>
          <li>
            not be subject to decisions based solely on automated processing that significantly affect you.
          </li>
        </ul>
        <p>
          To use any of these rights, email <a href="mailto:privacy@smallafrica.ng">privacy@smallafrica.ng</a>
          . We reply within 30 days. If you’re unhappy with our response, you can complain to the{' '}
          <strong>Nigeria Data Protection Commission</strong> (ndpc.gov.ng).
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <p>
        We use encrypted connections (HTTPS), hashed passwords, optional two-factor authentication for staff,
        strict access controls, rate limiting and an audit trail of staff actions. Read more in our security
        overview, which is available on request.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>
          We use <strong>one essential cookie</strong> (<code>sa_session</code>) to keep you signed in and
          protect forms against forgery. While you sign in with Google, Apple or Facebook we also set a
          temporary, encrypted cookie (<code>sa_oauth</code>) that lasts at most ten minutes and is deleted as
          soon as you are back. Neither can be switched off without breaking the site, so they don’t need
          consent.
        </p>
        <p>
          Your browser’s local storage remembers your appearance setting (dark, light or system), your order
          basket and whether you’ve dismissed our cookie notice. None of these identify you, and we use{' '}
          <strong>no advertising or third-party tracking cookies</strong>.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Accounts are for people aged 18 and over. We don’t knowingly collect data from children; parents can
        contact us to have it removed.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We’ll post updates here and change the date at the top. If a change is significant, we’ll tell account
        holders by email. See also our <Link to="/terms">Terms</Link>.
      </p>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="How Small Africa collects, uses and protects your personal data under the Nigeria Data Protection Act 2023."
      updated="28 October 2026"
      intro="We keep this simple: we collect only what we need to feed you well, we protect it carefully, and you stay in control."
      sections={sections}
    />
  );
}
