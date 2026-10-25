# Small Africa — Security & Data Protection

This document explains how the Small Africa platform protects guests, their payments and their data. It is written for the restaurant's management and for any technical reviewer. Each section names where the protection lives in the code.

> Status: measures for **Phases 1–3** are implemented and tested. Items marked *(Phase n)* arrive with that feature.

---

## 1. Accounts & passwords

| Measure | Detail | Code |
|---|---|---|
| Strong password hashing | Argon2id (`password_hash`, memory-hard), rehashed automatically if parameters change | `backend/src/Security/PasswordPolicy.php` |
| Password rules | ≥ 10 characters, at least 3 of lower/upper/digit/symbol, blocks common passwords and the user's own name/email. The same rules run in the browser for instant feedback, but the server decides | `PasswordPolicy.php`, `frontend/src/features/auth/schemas.ts` |
| Account lockout | 5 wrong passwords lock the account for 15 minutes (logged in the audit trail) | `AuthService::recordFailedLogin` |
| No account enumeration | Unknown emails get the same error *and the same response time* as wrong passwords (a real dummy hash is checked). "Forgot password" always replies the same way | `AuthService::login`, `requestPasswordReset` |
| Email verification | Single-use link, valid 24 h | `AuthService::verifyEmail` |
| Password reset | Single-use link, valid 60 min; older links are cancelled; on success **all other sessions are signed out** and a "password changed" email is sent | `AuthService::resetPassword` |
| Change password | Requires current password; signs out every other device | `AuthService::changePassword` |
| Two-factor authentication | TOTP (Google Authenticator, Authy, 1Password…) for staff/admin accounts. Secrets are **encrypted at rest** (AES-256-GCM with `APP_KEY`); a code can't be replayed | `Security/Totp.php`, `Security/Crypto.php` |
| One-time tokens stored hashed | Verification and reset tokens are stored only as SHA-256 hashes, so a database leak cannot be used to take over accounts | `Crypto::hashToken` |

## 2. Sessions, cookies & CSRF

- **Cookie-based sessions** (`sa_session`): `HttpOnly` (JavaScript can't read it), `Secure` in production (HTTPS only), `SameSite=Lax`. **No tokens are ever stored in `localStorage`**; an ESLint rule blocks it.
- Session ID is **regenerated** on sign-in, 2FA and password change (prevents session fixation). Strict mode rejects unknown session IDs.
- **Idle timeout** of 120 minutes, enforced server-side.
- **Session versioning**: a password reset or change bumps `users.session_version`, instantly invalidating sessions on other devices.
- **CSRF protection** on every state-changing request: a per-session synchronizer token sent in the `X-CSRF-Token` header (constant-time compare), **plus** an `Origin`/`Referer` allow-list check. The token is rotated at sign-in/out. Payment webhooks are exempt and verified by signature instead *(Phase 4)*.

Code: `Security/NativeSession.php`, `Security/Csrf.php`, `Http/Middleware/VerifyCsrf.php`, `frontend/src/lib/api.ts`.

## 3. Authorisation (RBAC)

Roles: **Super Admin**, **Manager**, **Staff** (kitchen / front desk), **Customer**.

- Every protected endpoint is guarded **on the server** by `RequireRole` middleware. Hiding buttons in the UI is a convenience, never the security boundary.
- Responses never include password hashes, 2FA secrets or lockout counters (`UserRepository::toPublic`).
- Inputs are whitelisted: unexpected fields such as `role` in a profile update are dropped (tested).
- Wallet/points adjustments will require **Super Admin + a written reason**, and are audit-logged *(Phase 6)*.

## 4. Input handling & injection

- **SQL injection**: every query uses PDO prepared statements with native (non-emulated) prepares. The only identifiers ever interpolated (table/column names in the insert helper) are pattern-whitelisted.
- **Validation**: every endpoint validates server-side (`Support/Validator.php`) and returns only declared fields; the frontend mirrors rules with Zod.
- **XSS**: React escapes all output by default; no `dangerouslySetInnerHTML` with user content. Emails escape every dynamic value. The API itself serves JSON with `Content-Security-Policy: default-src 'none'` and `nosniff`.
- **Request size**: JSON bodies over 1 MB are rejected (413).
- **Uploads** *(Phase 6)*: type and size checks, images re-encoded with GD (strips scripts/metadata), random filenames, stored outside executable paths.

## 5. Transport & HTTP headers

Every API response carries:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` |
| `X-Frame-Options` | `DENY` (clickjacking) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera, microphone and geolocation disabled; payment limited to Paystack |
| `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` | `same-origin` / `same-site` |
| `Strict-Transport-Security` | 1 year, including subdomains (production / HTTPS) |
| `Cache-Control` | `no-store` (no personal data in shared caches) |

The website (SPA) itself gets its own CSP from the web server, allowing only our own scripts plus Paystack checkout. There is **no inline script**: the appearance bootstrap that prevents a flash of the wrong theme is an external file (`/theme-init.js`), so `script-src` never needs `unsafe-inline`. `localStorage` holds only the appearance preference (`sa-theme`), never authentication data. See `docs/DEPLOYMENT.md` *(Phase 8)*.

**CORS** is restricted to an explicit allow-list of origins (`CORS_ALLOWED_ORIGINS`); credentials are never shared with other sites. `X-Forwarded-For` is only trusted from configured proxy IPs.

## 5b. Website (SPA) Content-Security-Policy

`frontend/public/.htaccess` (copied into the build) sends, for the website itself:

```
default-src 'self'; script-src 'self' https://js.paystack.co; style-src 'self' https://paystack.com;
img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.paystack.co;
frame-src https://checkout.paystack.com https://www.google.com; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

- **No inline scripts.** Fonts and every photo are self-hosted, so the site makes no third-party requests except Paystack at checkout.
- The Google map on the Contact page loads **only after the visitor clicks “Show map”** (privacy by default).
- Public read endpoints (`/api/menu`, `/api/site`) are cacheable only privately (`Cache-Control: private, max-age=60`); everything else is `no-store`.

## 6. Abuse protection (rate limiting)

Database-backed fixed-window limits (shared across all server workers):

| Action | Limit |
|---|---|
| Sign-in | 20 / 10 min per IP **and** 10 / 15 min per email |
| 2FA code | 5 / 5 min per pending sign-in |
| Sign-up | 5 / hour per IP |
| Password reset request | 5 / 15 min per IP **and** 3 / hour per email |
| Resend verification | 3 / hour per user |
| Contact form | 5 / hour per IP (plus a hidden honeypot field for bots) |
| Newsletter sign-up | 10 / hour per IP (same response whether or not the email is already subscribed) |
| Event enquiries | 5 / hour per IP |
| Reservations, checkout, referrals, redemptions | *(Phases 4–5)* |

Exceeding a limit returns `429` with a `Retry-After` header and a friendly message.

## 7. Payments *(Phase 4)*

- Prices and totals are **always recalculated on the server**; amounts from the browser are ignored.
- Every Paystack transaction is **verified server-side** with the secret key before an order is marked paid or a wallet is credited.
- Webhooks are accepted only with a valid `x-paystack-signature` (HMAC-SHA512) and are de-duplicated (`webhook_events`).
- Order creation and top-ups use **idempotency keys**, so double-clicks or retries never create duplicate orders or credits.
- Card details never touch our servers (Paystack Inline checkout).
- **Payment attempts**: Paystack refuses a reused transaction reference, so a retry after a declined card gets a new reference (`SA-ABC123-2`); an abandoned popup resumes its saved access code. A payment arriving for an order that is already paid or cancelled is never applied twice: it is logged and audit-flagged for refund (`payment.needs_refund`).
- Unpaid orders expire after 2 hours (daily job); any dining credit or voucher they held is returned.

## 8. Interest Account integrity

- Every movement of dining credit or points is a row in an **append-only ledger** (`wallet_ledger`, `points_ledger`) with type, reference, balance after and who made it. **Database triggers reject any UPDATE or DELETE** on these tables and on `audit_logs` (tested).
- All moves go through one class (`App\Loyalty\Ledger`): it locks the member's account row (`SELECT … FOR UPDATE`), writes the ledger row and the cached balance in the **same transaction**, refuses to go below zero, and accepts an **idempotency key** (replays change nothing). `php bin/loyalty.php reconcile` rebuilds every balance from its ledger and reports any mismatch.
- **Top-ups** are credited only after server-side verification with Paystack (browser callback or signed webhook, whichever arrives first, exactly once). Top-ups need a verified email and are rate-limited (10/hour).
- **Monthly interest** is paid on the lowest balance held through the month. A run must first claim its month (`interest_runs.period` is unique; a completed month is refused), and each credit carries the key `interest:{month}:{member}`, so a crashed run can be re-run safely and a month can never be paid twice (tested).
- **Checkout with dining credit**: the credit is debited when the order is created (under the account lock) and returned automatically if the order is cancelled or expires unpaid. Reward vouchers are claimed with a conditional update, so one voucher can't be used on two orders.
- **Referrals** pay only after the friend's first completed order and email verification, and are rejected for self-referral, the referrer's phone number, a phone or device already rewarded (keyed hash of a random browser id, never the id itself) and above a monthly limit. Redemptions are rate-limited (10/hour).
- Manual credit/debit adjustments require a reason and are audit-logged with the admin's id *(admin screen in Phase 6)*.
- Wallet and interest are **dining credit only**: not cash, not withdrawable or transferable (stated in the Rewards Terms).

## 9. Audit trail

`audit_logs` records who did what, when, from which IP: sign-ins, lockouts, 2FA changes, password changes, profile edits, and (Phase 6) every admin action. The table is append-only at the database level.

## 10. Errors & logging

- Users see friendly messages; unexpected errors show a short **reference ID** only.
- Full details (exception, file, stack trace) go to `backend/storage/logs/` as JSON lines and are never sent to the browser. PHP `display_errors` is off.
- Logs and session files are excluded from git.

## 11. Secrets & configuration

- All secrets live in `backend/.env` (git-ignored). `.env.example` documents every variable without values.
- `APP_KEY` (32 random bytes) encrypts 2FA secrets: generate with `php bin/generate-key.php`, back it up securely, and never change it casually.
- The database user `small_africa` has rights only on the Small Africa databases.
- On XAMPP, `.htaccess` files deny web access to everything outside `backend/public` (`.env`, `vendor/`, `storage/`, source); this is verified with HTTP checks. In production the document root is `backend/public` only.

## 12. Data protection: Nigeria Data Protection Act 2023

- **Lawful basis & consent**: marketing emails are strictly opt-in (unchecked by default) and can be withdrawn at any time.
- **Data minimisation**: we collect only what's needed to serve guests (name, contact, delivery address, optional birthday for rewards).
- **Security of processing**: the measures above (encryption in transit, hashing, access control, audit logs).
- **Data subject rights**: guests can view and update their profile; export and deletion requests are handled by the Super Admin *(tooling in Phase 6)*.
- **Retention**: rate-limit and session data expire automatically; audit logs are retained for accountability.
- The Privacy Policy *(Phase 3)* explains all of this in plain language.

## 13. Testing

- **Backend (PHPUnit, 110 tests)**: Interest Account rules (interest, caps and rounding, top-up bonus, tiers, points multipliers, stamps, streaks, expiry, birthday week, referral anti-abuse); top-ups credited once, interest paid once, dining-credit holds returned on expiry, vouchers single-use, referral device checks; payment retries with fresh references; TOTP against RFC 6238 vectors; password policy; validator mass-assignment protection; encryption tamper detection; registration, lockout, enumeration resistance, rate limits, reset flow signing out sessions, 2FA enrolment and login, append-only ledgers; HTTP security headers on success and error responses, CSRF, Origin checks, CORS, RBAC.
- **Frontend (Vitest, 113 tests)**: checkout sends identifiers only (never prices) with an idempotency key, dining-credit checkout, top-up and redemption flows; password rules match the backend, CSRF header sent, stale-token retry, open-redirect-safe return URLs, role guard, WCAG AA contrast of every theme token pair, theme persistence and the no-flash bootstrap, menu filters (incl. No pork), cart storage holding no secrets.
- `composer audit` and `npm audit` are run before each commit; high and critical issues are fixed.

## 14. Backups *(see DEPLOYMENT.md)*

Daily `mysqldump` with 30-day retention, stored off-server and encrypted; monthly restore test. Instructions in `docs/DEPLOYMENT.md`.
