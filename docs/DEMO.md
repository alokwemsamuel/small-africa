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
`frontend/src/lib/demo/`. The production build (`npm run build`) contains none of this code.

The public pages (home, menu, every dish, reservations, about, gallery, events, contact, FAQ,
legal and rewards) are **pre-built as HTML** from the demo data (`scripts/prerender.mjs`), so
they appear straight away and React then attaches to them. GitHub Pages serves `/menu` from
`menu.html` on its own. Every other address (for example `/small-africa/admin/orders`) gets
`404.html`, which is the app shell: the app starts there and draws the page for that address.

It is deployed by GitHub Actions on every push to `main`; see [DEPLOYMENT.md](DEPLOYMENT.md#2-github-pages-demo).

## How it works

- **Data.** `frontend/src/lib/demo/snapshot.json` is an export of the seeded database: the menu,
  settings, the 30 demo members and their whole Interest Account history, reviews, coupons and
  enquiries. It never contains password hashes, 2FA secrets, sessions or tokens.
- **Always current.** When the demo opens, member history is moved forward by whole months so
  it is recent, and a busy last 30 days is generated around today with the same rules as the
  PHP seeder: orders every day (more on Fridays and weekends, lunch and dinner peaks), all three
  kitchens, Jollof and Pierogi the favourites, orders still in the kitchen, and bookings around
  today. The database is built in a Web Worker so the page stays responsive.
- **The API.** `frontend/src/lib/demo/routes/` ports every endpoint of the PHP API with the same
  rules, response shapes and error messages: pricing and coupons, payment attempts, the Interest
  Account ledgers, reservations against capacity, and admin permissions per role.
- **Storage.** Changes are kept in the browser's localStorage. Each new day starts from fresh
  data; **Reset demo data** starts over at any time.

## Refreshing the snapshot

After changing the menu, seeds or schema:

```bash
cd backend
composer fresh                 # migrate + seed with demo data (local only)
php bin/export-demo.php        # writes frontend/src/lib/demo/snapshot.json
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

**Lighthouse** (Phase 8, built demo served like GitHub Pages: HTTP/2 and gzip; Lighthouse's
default mobile test, which simulates a mid-range phone on a slow 4G connection):

| Page | Mobile: perf / a11y / best practices / SEO | Desktop |
|---|---|---|
| Home | 95 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Menu | 96 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Dish page (Smoky Party Jollof) | 95 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Reservations | 93 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| About | 94 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Gallery | 93 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Events | 91 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Contact | 95 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| FAQ | 98 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Privacy | 97 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Terms | 96 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Rewards | 98 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| Rewards Terms | 95 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

Mobile performance varies by a few points from run to run. What got it from 71–83 to 90+:

- **Pre-built pages.** The public pages arrive as finished HTML, so the phone paints them before
  the app's JavaScript has run.
- **Nothing hidden until the app starts.** The cookie notice is part of the pre-built page
  (hidden before the first paint for visitors who already closed it), and scroll reveals leave
  content that is already on screen alone.
- **Less layout work.** Long pages (the home page and the 54-dish menu) let the browser skip
  laying out sections that are off screen until they're scrolled near (`content-visibility`).
- **Fewer bytes before the first paint.** Only the logo for the current theme downloads, the
  logo files are a third smaller, the script font is preloaded only on the home page, and the
  hero video starts once the page has loaded (its poster is the same first frame).
