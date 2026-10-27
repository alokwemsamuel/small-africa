# Go-live checklist

Everything that must be confirmed or switched before Small Africa takes real orders. Items marked **Client** need a decision or information from the restaurant; the rest are technical steps covered in the [deployment guide](DEPLOYMENT.md).

## Client decisions and reviews

- [ ] **Client: Rewards Terms reviewed by a lawyer and an accountant.** The Interest Account must stay a loyalty programme (dining credit, not a deposit or savings product). Have them confirm the wording in `/rewards-terms`, the tax treatment of dining credit and bonus credit, and that the programme needs no financial licence.
- [ ] **Client: confirm the top-up reversal rule.** The Rewards Terms currently say a top-up can be reversed only within 14 days, only if none of it has been spent, and only to the paying card (bonus credit removed). This was a starting point, not a client decision: confirm or change it, then update the Rewards Terms.
- [ ] **Client: confirm the rewards economics.** Defaults: 5 points per ₦1,000, 100 points = ₦1,000 (about 5% back), tier multipliers up to 2×, and multipliers never stack (the single highest applies). Interest: 2% a month on balances of ₦20,000+, capped at ₦5,000. All are editable in the admin panel.
- [ ] **Client: real business details** to replace placeholders: address, phone, WhatsApp number, email, Instagram/TikTok handles, map location, domain name.
- [ ] **Client: delivery zones and fees**, minimum order, packaging fee, opening hours.
- [ ] **Client: FAQ claims** (for example valet parking, dress code, corkage) confirmed as true.
- [ ] **Client: menu prices, dish descriptions, allergens and “Contains pork” tags** checked by the kitchen.

## Payments

- [ ] Paystack account verified for live payments; **live keys** (`pk_live_…`, `sk_live_…`) in the production `.env` only.
- [ ] `PAYMENT_DRIVER=paystack` in production (the simulated gateway refuses to run with `APP_ENV=production`).
- [ ] Webhook URL set in the Paystack dashboard: `https://<domain>/api/payments/paystack/webhook`.
- [ ] One small real payment and refund made end to end.

## Scheduled jobs

- [ ] **Daily cron job** for the Interest Account (interest on the 1st, tier review, points expiry, birthdays, anniversaries, referrals, win-back offers, unpaid-order expiry):
  `10 0 * * * php /path/to/backend/bin/loyalty.php daily` (server time zone Africa/Lagos). Set-up steps in [DEPLOYMENT.md](DEPLOYMENT.md#6-the-daily-interest-account-job-cron).
- [ ] `php bin/loyalty.php reconcile` returns “All balances match their ledgers” after go-live and weekly afterwards.

## Accounts and data

- [ ] Demo accounts removed or given new passwords; demo data never seeded in production (`--demo` is refused when `APP_ENV=production`).
- [ ] Super Admin and Manager accounts use strong passwords and two-factor authentication.
- [ ] `APP_KEY` generated for production and backed up securely (it encrypts 2FA secrets).
- [ ] SMTP email configured (`MAIL_DRIVER=smtp`) and a test email received (staff invitations, receipts and interest emails depend on it).
- [ ] Database backups scheduled and one restore tested; `backend/storage/uploads` (menu photos) included in the backups.
- [ ] `DEMO_TOOLS=false` (the "Simulate month-end interest" button is refused in production anyway).
- [ ] Real staff invited from Admin → Staff & roles; demo staff accounts suspended.

## Security and quality

- [ ] HTTPS on the domain; `APP_HTTPS=true`, `SESSION_SECURE=true`.
- [ ] Frontend built with `VITE_SITE_URL=https://<domain>` and `PRERENDER_API_URL=https://<domain>/api`, so the pre-built pages carry the real menu and the right links ([DEPLOYMENT.md](DEPLOYMENT.md#3-production-on-a-php-host)).
- [ ] `composer audit` and `npm audit` clean; all tests pass.
- [ ] Lighthouse 90+ on mobile for Home, Menu and Checkout.
- [ ] Privacy Policy, Terms and Rewards Terms dates updated.
