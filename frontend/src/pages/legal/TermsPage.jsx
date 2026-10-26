import { Link } from 'react-router-dom';
import { LegalLayout, type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: (
      <p>
        These terms apply when you use the Small Africa website, create an account, order food, book a table
        or enquire about events. By using the site you agree to them. Our{' '}
        <Link to="/privacy">Privacy Policy</Link> explains how we handle your data, and our{' '}
        <Link to="/rewards-terms">Rewards Terms</Link> cover the Interest Account.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>You must be 18 or over to create an account.</li>
        <li>Keep your password private. You’re responsible for activity on your account.</li>
        <li>We may suspend accounts involved in fraud, abuse of offers or abuse of staff.</li>
      </ul>
    ),
  },
  {
    id: 'orders',
    title: 'Orders, prices and payment',
    body: (
      <ul>
        <li>
          Prices are in Nigerian Naira and include VAT. A 10% service charge applies to dine-in bills only.
        </li>
        <li>Delivery fees depend on your delivery zone and are shown before you pay.</li>
        <li>
          Your order is confirmed once payment succeeds. If a dish is unavailable, we’ll contact you to offer
          a replacement or a refund for that item.
        </li>
        <li>
          Payments are processed securely by Paystack. Refunds go back to the original payment method, or to
          your dining wallet if you prefer.
        </li>
        <li>Alcoholic drinks are sold only to people aged 18 and over; we may ask for ID on delivery.</li>
      </ul>
    ),
  },
  {
    id: 'cancellations',
    title: 'Cancellations',
    body: (
      <ul>
        <li>
          Delivery and pickup orders can be cancelled free of charge until the kitchen starts preparing them.
        </li>
        <li>
          Please cancel table bookings at least 4 hours ahead so we can offer the table to someone else. Where
          a deposit applies (for example private dining), the cancellation terms are shown when you book.
        </li>
        <li>Event bookings follow the terms in your written event proposal.</li>
      </ul>
    ),
  },
  {
    id: 'allergies',
    title: 'Allergies and dietary needs',
    body: (
      <p>
        We label vegetarian, gluten-free, nut and pork content in good faith, but our kitchens handle nuts,
        gluten, fish, shellfish and pork, so we can’t guarantee any dish is free from traces. Always tell us
        about allergies before ordering.
      </p>
    ),
  },
  {
    id: 'promotions',
    title: 'Coupons and promotions',
    body: (
      <p>
        Coupons have the conditions stated with them (minimum spend, days, kitchens, expiry, one per order
        unless stated) and have no cash value. We may withdraw a promotion that is being misused.
      </p>
    ),
  },
  {
    id: 'reviews',
    title: 'Reviews and content you post',
    body: (
      <p>
        Reviews must be honest and about your own experience. We moderate reviews for abuse and personal data,
        and we may reply publicly. We don’t edit the substance of genuine reviews.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Our responsibility to you',
    body: (
      <p>
        We take care to keep the site accurate and available, but it may occasionally be unavailable for
        maintenance. Nothing in these terms limits rights you have under Nigerian consumer protection law,
        including the Federal Competition and Consumer Protection Act 2018.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Law and contact',
    body: (
      <p>
        These terms are governed by the laws of the Federal Republic of Nigeria and the courts of Lagos State.
        Questions? <Link to="/contact">Contact us</Link>.
      </p>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      description="Terms for using the Small Africa website, ordering, reservations and events."
      updated="25 October 2026"
      intro="The plain-language rules for ordering, booking and using your Small Africa account."
      sections={sections}
    />
  );
}
