# Small Africa

**Three kitchens. One table.** A fine-dining restaurant and lounge platform for Lagos, serving Nigerian, Polish and Continental cuisine. It covers online ordering, reservations, the *Small Africa Interest Account* loyalty programme, and a full admin panel.

> 🚧 In development. Phases 1–3 are complete. See *Build progress* below.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS 4, React Router, TanStack Query, React Hook Form + Zod |
| Backend | PHP 8.1+ (Slim 4), PDO, MySQL 8 / MariaDB 10.4+ |
| Payments | Paystack (test mode in development) |
| Email | PHPMailer over SMTP (`log` driver in development) |
| Testing | PHPUnit, Vitest + Testing Library |

## Repository layout

```
frontend/      React app (Vite)
backend/       PHP API: public/index.php front controller, src/, migrations/, seeds/, tests/
design/        Logo, brand guide, social templates, menu card, Figma notes, asset build scripts
docs/          Security, deployment, presentation and marketing guides
presentation/  Client pitch deck (Phase 8)
```

## Local setup (Windows + XAMPP)

Prerequisites: XAMPP (Apache + MariaDB, PHP 8.1+), Composer, Node.js 20+.

1. Clone into `C:\xampp\htdocs\SmallAfrica` and start Apache and MySQL in the XAMPP control panel.
2. **Database**: create the databases and a dedicated user (in the XAMPP shell or phpMyAdmin):
   ```sql
   CREATE DATABASE small_africa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE DATABASE small_africa_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'small_africa'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
   GRANT ALL PRIVILEGES ON small_africa.* TO 'small_africa'@'localhost';
   GRANT ALL PRIVILEGES ON small_africa_test.* TO 'small_africa'@'localhost';
   ```
3. **Backend**:
   ```bash
   cd backend
   composer install
   cp .env.example .env          # set DB_PASSWORD
   php bin/generate-key.php      # paste the APP_KEY line into .env
   composer fresh                # migrate + seed (incl. demo members, orders and Interest Account history; never use --demo in production)
   composer test                 # 110 tests
   ```
   Check it works: <http://localhost/SmallAfrica/backend/public/api/health>
4. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev                   # http://localhost:5173 (proxies /api to XAMPP)
   npm test
   ```
   Optional asset rebuilds (design/tools): `npm run photos` (Unsplash photos → AVIF/WebP), `npm run hero` (hero poster + loop video; needs the dev server and ffmpeg), `npm run brand`, `npm run logo`.

5. **Scheduled jobs** (Interest Account): run once a day, around 00:10 Lagos time. Every step is safe to repeat.
   - Windows/XAMPP: Task Scheduler → daily → program `C:\xampp\php\php.exe`, arguments `C:\xampp\htdocs\SmallAfrica\backend\bin\loyalty.php daily`
   - Linux: `10 0 * * * php /path/to/backend/bin/loyalty.php daily`
   - Also: `php bin/loyalty.php interest 2026-09` (pay one month) and `php bin/loyalty.php reconcile` (check every balance against its ledger).

In development, emails are written to `backend/storage/mail/` as `.html` files rather than sent.

## Demo accounts (seeded)

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@smallafrica.demo | SmallAfrica@Admin2026 |
| Manager | manager@smallafrica.demo | SmallAfrica@Manager2026 |
| Customer | guest@smallafrica.demo | SmallAfrica@Guest2026 |
| Staff (kitchen) | kitchen@smallafrica.demo | SmallAfrica@Kitchen2026 |
| Staff (front desk) | frontdesk@smallafrica.demo | SmallAfrica@Desk2026 |

These exist for demos and testing only. Remove or change them before going live.

## Build progress

- [x] **Phase 1 — Brand & design**: logo (SA Monogram Crest) and exports, brand guide PDF, Instagram templates, A4 menu card, Figma tokens and components
- [x] **Phase 2 — Foundation**: schema (40 tables) + seeds, secure auth API, frontend shell, auth pages, living style guide (`/style-guide`)
- [x] **Phase 3 — Public site**: 3D hero (with poster and video fallbacks), menu with filters (incl. No pork), dish detail, basket, about, gallery, events, contact, FAQ, privacy (NDPA 2023), terms; Dark/Light/System appearance
- [x] **Phase 4 — Reservations & ordering**: checkout (delivery/pickup, scheduling, coupons), Paystack + simulated payments, order tracking, reservations with live availability, account tabs
- [x] **Phase 5 — Interest Account**: dining wallet with Paystack top-ups and bonus, monthly interest job, points, tiers, stamp card, streaks, birthday/anniversary/referral rewards, win-back and favourite-kitchen offers, notification centre, append-only ledgers
- [ ] Phase 6 — Admin panel
- [ ] Phase 7 — Demo mode, testing & hardening
- [ ] Phase 8 — Deploy & deliver

See [docs/SECURITY.md](docs/SECURITY.md) for the security model and [CREDITS.md](CREDITS.md) for asset licences.
