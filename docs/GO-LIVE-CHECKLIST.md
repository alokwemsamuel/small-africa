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

## Sign in with Google, Apple and Facebook

Step by step in [SOCIAL-LOGIN-SETUP.md](SOCIAL-LOGIN-SETUP.md). Each provider is optional: a provider without keys is simply hidden.

- [ ] **Client: decide which providers to offer.** Google and Facebook are free; **Apple costs US$99 a year** (Apple Developer Program) and enrolment takes a few days. Leave a provider's keys empty to keep it off.
- [ ] **Client: create the developer accounts in the business's name** (a business email, logins in the business's password manager, the developer added as a team member), not on a developer's personal account.
- [ ] **Google:** OAuth consent screen published (*In production*), redirect URI `https://<domain>/api/auth/oauth/google/callback`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`.
- [ ] **Facebook:** app set to **Live**, privacy policy, terms and data-deletion URLs filled in, redirect URI `https://<domain>/api/auth/oauth/facebook/callback`, `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in `backend/.env`.
- [ ] **Apple:** Services ID with the domain and return URL `https://<domain>/api/auth/oauth/apple/callback`, domain verified, key downloaded (**one chance: keep the `.p8` file safe**), the four `APPLE_*` values in `backend/.env` with the `.p8` file outside the web root (`chmod 600`). Sending domain registered for "Hide My Email" relay addresses.
- [ ] `OAUTH_REDIRECT_BASE=https://<domain>/api`, `APP_HTTPS=true`, `FRONTEND_URL=https://<domain>` (Apple sign-in needs the HTTPS cookie).
- [ ] Each provider tested from a private browser window: sign up and finish "Almost there", sign out and sign in, connect and disconnect from Settings. A staff member is refused with a clear message.
- [ ] `backend/storage/cache` is writable (the providers' public keys are kept there for an hour).
- [ ] Privacy Policy reviewed by the lawyer together with the Rewards Terms: it now describes the data received from Google, Apple and Facebook and the temporary `sa_oauth` cookie.
- [ ] **Client: confirm the welcome bonus.** New customers get **200 bonus points** after their first completed order (email or social sign-up), once per customer, only if they had no completed order before and have a confirmed email; a phone number or device that already got a bonus is refused. Change the amount, or set it to 0 to switch it off, in Admin → Rewards → Rules ("Welcome bonus"). Facebook sign-ups wait until they confirm their email. It is a loyalty-economics decision (200 points is about ₦2,000 of dining credit at the default rate), so confirm the figure and have the Rewards Terms wording reviewed.

## Scheduled jobs

- [ ] **Daily cron job** for the Interest Account (interest on the 1st, tier review, points expiry, birthdays, anniversaries, referrals, win-back offers, unpaid-order expiry):
  `10 0 * * * php /path/to/backend/bin/loyalty.php daily` (server time zone Africa/Lagos). Set-up steps in [DEPLOYMENT.md](DEPLOYMENT.md#6-the-daily-interest-account-job-cron).
- [ ] `php bin/loyalty.php reconcile` returns “All balances match their ledgers” after go-live and weekly afterwards.

## Accounts and data

- [ ] No `@smallafrica.demo` account exists in the production database (the seeder never creates them when `APP_ENV=production`; the first Super Admin comes from `bin/create-admin.php`), and demo data is never seeded (`--demo` is refused).
- [ ] Super Admin and Manager accounts use strong passwords and two-factor authentication.
- [ ] `APP_KEY` generated for production and backed up securely (it encrypts 2FA secrets).
- [ ] SMTP email configured (`MAIL_DRIVER=smtp`) and a test email received (staff invitations, receipts and interest emails depend on it).
- [ ] Database backups scheduled and one restore tested; `backend/storage/uploads` (menu photos) included in the backups.
- [ ] `DEMO_TOOLS=false` (the "Simulate month-end interest" button is refused in production anyway).
- [ ] Real staff invited from Admin → Staff & roles.

## Security and quality

- [ ] HTTPS on the domain; `APP_HTTPS=true`, `SESSION_SECURE=true`.
- [ ] Frontend built with `VITE_SITE_URL=https://<domain>` and `PRERENDER_API_URL=https://<domain>/api`, so the pre-built pages carry the real menu and the right links ([DEPLOYMENT.md](DEPLOYMENT.md#3-production-on-a-php-host)).
- [ ] `composer audit` and `npm audit` clean; all tests pass.
- [ ] Lighthouse 90+ on mobile for Home, Menu and Checkout.
- [ ] Privacy Policy, Terms and Rewards Terms dates updated.
