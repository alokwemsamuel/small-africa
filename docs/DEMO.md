# Small Africa — Demo mode

The demo is the whole website and admin panel running in the browser, with no server: it is
what goes on GitHub Pages for the presentation. Everything works (sign-in, ordering with
simulated Paystack, reservations, the Interest Account and every admin screen) against
invented data. A ribbon on every page says it is a demo and offers **Reset demo data**.

An offline backup of the main flow is in [`presentation/small-africa-demo-walkthrough.mp4`](../presentation/small-africa-demo-walkthrough.mp4)
(2½ minutes, 1280×720): ordering Jollof and Pierogi, a scheduled pickup paid with the simulated
Paystack popup, booking a table, a member topping up their Interest Account, then the admin
dashboard, moving the order to "Preparing" and simulating month-end interest.

## Building it

```bash
cd frontend
npm run build:demo        # dist/ for https://<user>.github.io/small-africa/
```

`VITE_DEMO_MODE=true` (in `.env.demo`) swaps the API client for the in-browser API in
`frontend/src/demo/`. The production build (`npm run build`) contains none of this code.

GitHub Pages has no server-side routing, so the demo build also writes a `404.html` that sends
deep links (for example `/small-africa/admin/orders`) back to the app, which restores the URL
before it starts (see `githubPagesSpa` in `vite.config.ts`).

## How it works

- **Data.** `frontend/src/demo/snapshot.json` is an export of the seeded database: the menu,
  settings, the 30 demo members and their whole Interest Account history, reviews, coupons and
  enquiries. It never contains password hashes, 2FA secrets, sessions or tokens.
- **Always current.** When the demo opens, member history is moved forward by whole months so
  it is recent, and a busy last 30 days is generated around today with the same rules as the
  PHP seeder: orders every day (more on Fridays and weekends, lunch and dinner peaks), all three
  kitchens, Jollof and Pierogi the favourites, orders still in the kitchen, and bookings around
  today. The database is built in a Web Worker so the page stays responsive.
- **The API.** `frontend/src/demo/routes/` ports every endpoint of the PHP API with the same
  rules, response shapes and error messages: pricing and coupons, payment attempts, the Interest
  Account ledgers, reservations against capacity, and admin permissions per role.
- **Storage.** Changes are kept in the browser's localStorage. Each new day starts from fresh
  data; **Reset demo data** starts over at any time.

## Refreshing the snapshot

After changing the menu, seeds or schema:

```bash
cd backend
composer fresh                 # migrate + seed with demo data (local only)
php bin/export-demo.php        # writes frontend/src/demo/snapshot.json
```

## Demo sign-ins

The same as the README: `admin@`, `manager@`, `guest@`, `kitchen@` and `frontdesk@smallafrica.demo`.
They are shown on the sign-in page under "Demo credentials".

## Checks done in Phase 7

**Cross-device** (built demo, Chrome device emulation): iPhone SE (375×667), iPhone 15
(393×852, Safari user agent), Android mid-range (Galaxy A54, 412×915), iPad (820×1180), laptop
1366×768 and desktop 1920×1080. Home, menu, checkout, reservations, the Interest Account and
the admin dashboard: no horizontal scrolling and no errors on any of them. The video hero plays
muted and inline on all six, with the 720×1280 portrait cut on phones and the portrait iPad and
the 1920 cut on laptop and desktop. The same pages were also checked in the real **WebKit**
engine (Safari's) with iPhone SE, iPhone 15 and iPad profiles: the hero video plays there too.

**Lighthouse** (built demo, gzip as on GitHub Pages):

| Page | Desktop: perf / a11y / best practices / SEO | Mobile: perf / a11y / best practices / SEO |
|---|---|---|
| Home | 100 / 100 / 100 / 100 | 78 / 100 / 100 / 100 |
| Menu | 100 / 100 / 96 / 100 | 71 / 100 / 96 / 100 |
| Reservations | 99 / 100 / 96 / 100 | 83 / 100 / 96 / 100 |

The production build's home page scores 82–85 on mobile. "Best practices 96" is the 404 that
GitHub Pages returns for a deep link before the redirect; it cannot be avoided on Pages.
Mobile performance is below 90 because Lighthouse simulates a slow phone on a slow 4G link and
everything waits for the app's JavaScript (about 120 KB gzipped, mostly React) to run. Real
first paint is about 2.5 s on that simulated phone. The way to 90+ on mobile is to prerender the
public pages to static HTML at build time; that fits best with the production hosting in Phase 8.
