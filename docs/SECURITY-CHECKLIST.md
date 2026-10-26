# Small Africa — Security checklist

Reviewed in Phase 7 (October 2026). Each line says how it was checked. The full security model
is in [SECURITY.md](SECURITY.md); the launch steps for the client are in
[GO-LIVE-CHECKLIST.md](GO-LIVE-CHECKLIST.md).

✅ done and checked · ⏳ to do at deployment (Phase 8) or by the client before launch

## Accounts and sessions

- ✅ Passwords hashed with Argon2id; strong-password rules on the server (SECURITY.md §1). *Integration tests.*
- ✅ Login lockout after 5 failures for 15 minutes; same answer for "wrong password" and "no such account". *Integration tests.*
- ✅ Session cookie is httpOnly, SameSite=Lax, Secure in production; session ID regenerated at sign-in; other devices signed out on password change (§2). *Integration tests.*
- ✅ CSRF token on every state-changing request, kept in memory only (never localStorage) (§2). *Tests and an ESLint rule that blocks storing tokens in localStorage.*
- ✅ Two-factor sign-in (TOTP) available for staff; Super Admin can reset a lost authenticator (§1, §3).
- ⏳ Turn on 2FA for every Super Admin and Manager account before launch.

## Access control

- ✅ Every admin route names its permission and the server checks it on each request; the menu only hides what the server already refuses (§3). *AdminTest covers each role.*
- ✅ Customers can only see their own orders, bookings, wallet and reviews; order and booking links use unguessable tokens (§3). *Integration tests.*
- ✅ Manual wallet/points adjustments: Super Admin only, reason required, audit-logged (§8).

## Input, uploads and output

- ✅ Server-side validation of every field with an allow-list validator; prepared statements only (§4).
- ✅ Prices, discounts and totals are always calculated on the server; the browser sends only dish IDs and choices (§4, §7).
- ✅ Image uploads: type checked from the file's bytes, size and dimension limits, re-encoded to WebP, stored outside the web root, served by a controller (§3 "Image uploads").
- ✅ React escapes all output; no `dangerouslySetInnerHTML` with user content. *Code search.*

## Payments and the Interest Account

- ✅ Payments are confirmed by asking Paystack from the server; webhooks are verified by HMAC signature; each payment is applied exactly once (§7). *Integration tests, live test-mode payment in Phase 4.*
- ✅ Wallet and points move only through append-only ledgers (database triggers) with idempotency keys; balances reconcile with the ledgers (§8). *`php bin/loyalty.php reconcile`, integration tests.*
- ✅ Interest can never be paid twice for the same month (§8). *Integration tests; demo test.*
- ⏳ Client to confirm the 14-day top-up reversal rule and have the Rewards Terms reviewed by a lawyer and an accountant (see GO-LIVE-CHECKLIST.md).

## Transport, headers and abuse

- ✅ Security headers and a strict Content-Security-Policy with no `unsafe-inline` scripts (§5, §5b). The page's own scripts (theme, hero preload) are external files for this reason.
- ✅ Rate limits on sign-in, sign-up, password reset, checkout, payments, reservations, forms and redemptions (§6).
- ⏳ HTTPS only with HSTS, on the production host (Phase 8 deployment guide).

## Secrets, dependencies and data

- ✅ No secrets in the repository: `.env` files are git-ignored and `.env.example` files are committed. *`git check-ignore`.*
- ✅ No secrets in the browser builds: the production and demo bundles contain no Paystack secret key, and the demo snapshot contains no password hashes, 2FA secrets, sessions, tokens or audit data. *Searched the built files and `frontend/src/demo/snapshot.json`.*
- ✅ The demo code and data are left out of the production build entirely. *Searched `dist/` after `npm run build`.*
- ✅ Dependencies: `npm audit --omit=dev` and `composer audit` report no known vulnerabilities (26 October 2026).
- ✅ Personal data handling follows the Nigeria Data Protection Act 2023 (§12); privacy notice at `/privacy`.
- ⏳ Change or remove the demo accounts (README "Demo accounts") and never run `bin/seed.php --demo` in production.
- ⏳ Daily database backups and the daily loyalty job as a cron job (Phase 8 deployment guide).

## Demo build (GitHub Pages)

- ✅ Runs entirely in the browser with invented data; no real payments, bookings or emails, and a ribbon on every page says so.
- ✅ Only the five public demo accounts can sign in; the other demo members have no usable password, as in the seeded database.
- ✅ Passwords created in the demo are kept only as salted SHA-256 hashes in that browser's storage. (The real API uses Argon2id on the server.)
