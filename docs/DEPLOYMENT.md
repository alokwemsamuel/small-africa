# Small Africa — Deployment guide

Small Africa runs in three places:

| Where | What it is | Server needed |
|---|---|---|
| **Local (XAMPP)** | Development on a Windows PC: React dev server + PHP API + MariaDB | XAMPP |
| **GitHub Pages demo** | The whole site and admin running in the browser on invented data, for presentations | None |
| **Production** | The real restaurant website: pre-built pages + PHP API + MySQL, real Paystack payments | A PHP host |

The [go-live checklist](GO-LIVE-CHECKLIST.md) lists everything to confirm before taking real orders.

---

## 1. Local (XAMPP)

The setup steps are in the [README](../README.md#local-setup-windows--xampp). In short:

```bash
cd backend && composer install && composer fresh     # database with demo data
cd ../frontend && npm install && npm run dev          # http://localhost:5173
```

`composer fresh` wipes the local database and reseeds it. Use it whenever you want the demo
accounts back to their starting values (for example the guest member: Gold tier, ₦68,500
balance, 2,340 points).

---

## 2. GitHub Pages demo

The demo is deployed automatically by GitHub Actions
([`.github/workflows/deploy-demo.yml`](../.github/workflows/deploy-demo.yml)). Every push to
`main` lints, tests, builds the demo and publishes it to
**https://alokwemsamuel.github.io/small-africa/**.

Before publishing, the workflow also runs a Playwright test that opens every public, member and admin
page at phone widths from 320px to 430px, in dark and light, and fails (so nothing is deployed) if any
page is wider than the screen.

**One-time setup** (on github.com, in the `small-africa` repository):

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push to `main` (or open **Actions → Deploy demo to GitHub Pages → Run workflow**).
3. The run takes about 3 minutes. The link appears on the run's summary page.

**Build it yourself** (for example to check it before pushing):

```bash
cd frontend
npm run build:demo     # writes dist/ for https://<user>.github.io/small-africa/
```

If the repository or GitHub user name changes, update `base` in `frontend/vite.config.js`
(`/small-africa/`) and `VITE_SITE_URL` in `frontend/.env.demo`.

How the demo works (in-browser API, data, reset) is in [DEMO.md](DEMO.md).

---

## 3. Production on a PHP host

### What the host must have

- PHP **8.1+** with `pdo_mysql`, `mbstring`, `openssl`, `curl` (Paystack) and `gd` with WebP (menu photo uploads)
- MySQL 8 or MariaDB 10.4+
- Apache with `mod_rewrite` and `mod_headers` (most cPanel hosts), or nginx with equivalent rules
- HTTPS (free with Let's Encrypt on almost every host)
- SSH access and cron jobs (needed for the daily Interest Account job)
- Composer on the server, or upload the `vendor/` folder built locally

A small VPS or a good cPanel plan in a Lagos- or Europe-hosted data centre is plenty.

### How the files are laid out

Only two folders are public: the built website and the API's entry point. The backend's
code, `.env`, uploads and logs stay outside the web root.

```
/home/<account>/
├── smallafrica/backend/       ← the whole backend folder (NOT public)
│   ├── .env                   ← production settings
│   ├── storage/               ← uploads, logs, sessions
│   └── public/                ← the API's entry point
└── public_html/               ← the web root: contents of frontend/dist/
    ├── index.html, menu.html, menu/…, assets/, .htaccess …
    └── api/                   ← two small files that hand /api requests to the backend
        ├── index.php
        └── .htaccess
```

### Step by step

**1. Database.** In the host's control panel, create a database and a user with a strong
password. Note the name, user and password.

**2. Backend.** Upload the `backend/` folder to `/home/<account>/smallafrica/backend/`
(without `.env`, `storage/logs/*` or `vendor/`), then over SSH:

```bash
cd ~/smallafrica/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
php bin/generate-key.php        # paste the APP_KEY line into .env, and keep a safe copy of it
nano .env                       # fill in the production settings below
php bin/migrate.php
php bin/seed.php                # menu, settings and rewards only: with APP_ENV=production it creates no accounts. Never use --demo here.
ADMIN_PASSWORD='a long passphrase' php bin/create-admin.php you@yourdomain.com "First" "Last"   # the first Super Admin
chmod -R 750 storage            # includes storage/cache, where sign-in providers' public keys are kept for an hour
```

**3. The `/api` folder.** In `public_html/api/` create these two files.

`public_html/api/index.php`:

```php
<?php
// Hands every /api request to the backend, which lives outside the web root.
require '/home/<account>/smallafrica/backend/public/index.php';
```

`public_html/api/.htaccess`: copy `backend/public/.htaccess` as it is.

With `APP_BASE_PATH=` (empty) the API answers at `https://<domain>/api/…`. Check
`https://<domain>/api/health`; it should return `{"status":"ok"…}`.

**4. Frontend.** On your own computer:

```bash
cd frontend
# .env.production (not committed): VITE_SITE_URL=https://<domain>
PRERENDER_API_URL=https://<domain>/api npm run build
```

This builds the app and **pre-builds the public pages** (home, menu, every dish, reservations,
about, gallery, events, contact, FAQ, legal and rewards) as ready-made HTML using the live
menu, so phones see the page straight away. Without `PRERENDER_API_URL` the pages are built
from the seeded menu instead.

Upload **everything inside `frontend/dist/`** (including the hidden `.htaccess`) into
`public_html/`, next to the `api/` folder. Don't delete `api/`.

**5. HTTPS.** Turn on the host's free SSL certificate for the domain (and `www.`) and force
HTTPS. Then set `APP_HTTPS=true` and `SESSION_SECURE=true` in `.env`.

**6. First sign-in.** Sign in as the Super Admin you created with `bin/create-admin.php`, turn on
two-factor authentication and invite the real staff from **Admin → Staff & roles**. The demo accounts
(`…@smallafrica.demo`, with public passwords) are never created on a production database: the seeder
refuses to.

### What the web server does (`frontend/public/.htaccess`)

- `/api/…` goes to the PHP API.
- `/`, `/menu`, `/menu/<dish>` and the other public pages are served from their pre-built
  `.html` files.
- Everything else (account, checkout, admin…) gets `app.html`, the app shell, and is drawn in
  the browser.
- Strict security headers: Content Security Policy (no inline scripts or styles, Paystack the
  only outside script), HSTS, no framing. The build refuses to finish if a pre-built page
  contains an inline `style="…"`, because the policy would block it.
- Hashed files in `assets/` are cached for a year; HTML is always checked for updates.

On **nginx**, the equivalent is: `try_files $uri $uri.html /app.html;` for the site,
`location /api/ { try_files $uri /api/index.php$is_args$args; }` with PHP-FPM for the API,
and the same headers as in `.htaccess`.

### Keeping the pre-built pages fresh

Pre-built pages show the menu as it was at build time, and then refresh from the API a
moment after they open. So menu changes made in the admin panel appear for visitors at once.
To also update what search engines and the very first paint show, **rebuild and re-upload
the frontend** after big menu changes (or once a week).

---

## 4. Production settings (`backend/.env`)

| Setting | Production value | Notes |
|---|---|---|
| `APP_ENV` | `production` | Turns off demo tools, the simulated payment gateway and demo seeding |
| `APP_DEBUG` | `false` | Never `true` in production |
| `APP_KEY` | from `php bin/generate-key.php` | Encrypts 2FA secrets. Back it up: losing it disables everyone's 2FA |
| `APP_HTTPS` | `true` | Adds HSTS |
| `APP_BASE_PATH` | *(empty)* | The API is at `/api` on the site's own domain |
| `FRONTEND_URL` | `https://<domain>` | Used in emails and payment return links |
| `CORS_ALLOWED_ORIGINS` | `https://<domain>` | Same domain, so this is only a safety net |
| `TRUSTED_PROXIES` | the host's proxy/CDN IPs, or empty | Only if behind Cloudflare or a load balancer |
| `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | from step 1 | |
| `SESSION_SECURE` | `true` | Cookies only over HTTPS |
| `SESSION_IDLE_MINUTES` | `120` | Sign-out after 2 hours idle |
| `MAIL_DRIVER` | `smtp` | Plus `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` |
| `PAYMENT_DRIVER` | `paystack` | `simulated` is refused in production |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_…` | |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` | Secret: only ever in this file |
| `DEMO_TOOLS` | `false` | |
| `OAUTH_REDIRECT_BASE`, `GOOGLE_*`, `FACEBOOK_*`, `APPLE_*` | see [SOCIAL-LOGIN-SETUP.md](SOCIAL-LOGIN-SETUP.md) | Optional: sign in with Google, Apple and Facebook. A provider with any value missing is switched off and its button hidden. Keep the Apple `.p8` key outside the web folder. |

Frontend build settings (`frontend/.env.production`, never committed):

| Setting | Value |
|---|---|
| `VITE_SITE_URL` | `https://<domain>` (canonical links, sitemap, social previews) |
| `VITE_API_BASE` | `/api` (the default) |
| `PRERENDER_API_URL` | `https://<domain>/api` when building (a build-time variable, not in the `.env` file) |

---

## 5. Going live with Paystack

1. In the Paystack dashboard, complete business verification (CAC documents, bank account).
2. **Settings → API Keys & Webhooks**: copy the **live** public and secret keys into
   `backend/.env` (`PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`). Keep `PAYMENT_DRIVER=paystack`.
3. Set the **live webhook URL** to `https://<domain>/api/payments/paystack/webhook`. The API
   checks every webhook's signature with the secret key and ignores anything unsigned.
4. Make one small real order and one Interest Account top-up, then refund them from the
   Paystack dashboard. Check that both appear in **Admin → Orders** and in the member's history.

Test keys (`pk_test_…`, `sk_test_…`) stay in local `.env` files only.

---

## 6. The daily Interest Account job (cron)

One command runs everything the loyalty programme needs each day: monthly interest on the
1st, tier reviews, points expiry, birthday and anniversary rewards, referral rewards, win-back
offers and expiring unpaid orders. Every step is safe to run twice.

In the host's **Cron Jobs** page (or `crontab -e` over SSH), add:

```
10 0 * * *  /usr/bin/php /home/<account>/smallafrica/backend/bin/loyalty.php daily >> /home/<account>/smallafrica/backend/storage/logs/cron.log 2>&1
```

That runs at 00:10 each night. **The time is in the server's time zone**: if the server
isn't on Lagos time (WAT, UTC+1), adjust it, for example `10 23 * * *` on a UTC server. Use
the PHP path your host shows (often `/usr/local/bin/php` on cPanel).

Check it the next morning in `storage/logs/cron.log`. Once a week, run:

```bash
php bin/loyalty.php reconcile      # should say "All balances match their ledgers"
```

---

## 7. Email (SMTP)

Email-address checks, password resets, staff invitations, order confirmations and updates,
and booking confirmations are sent by email. Use
the host's mailbox (for example `hello@<domain>`) or a sending service (Brevo, Mailgun,
Amazon SES). Put the SMTP details in `.env`, set `MAIL_DRIVER=smtp`, then send yourself a
password reset to check it. Add the SPF and DKIM records the provider gives you to the
domain's DNS so emails don't land in spam.

---

## 8. Backups

- **Database:** a daily automatic backup kept for 30 days (most hosts offer this), plus a
  copy stored off the server, encrypted. Over SSH:
  `mysqldump --single-transaction -u <user> -p <database> | gzip > backup-$(date +%F).sql.gz`
- **Uploads:** `backend/storage/uploads/` (menu photos) with the same schedule.
- **Secrets:** `backend/.env` (especially `APP_KEY`) in a password manager.
- **Test a restore** once before launch and every few months. A backup that has never been
  restored is not yet a backup.

---

## 9. Updating the live site

1. Locally: `npm run lint`, `npm test` and `composer test` must pass.
2. **Backend:** upload the changed files, then `composer install --no-dev` and
   `php bin/migrate.php` (it only runs new migrations).
3. **Frontend:** `PRERENDER_API_URL=https://<domain>/api npm run build`, then upload
   `frontend/dist/` again (keep `public_html/api/`). Visitors get the new version on their next
   page load.
4. Open the home page, the menu, a checkout and the admin dashboard to check.
