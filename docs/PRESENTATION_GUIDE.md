# Small Africa — Presentation guide

How to present Small Africa to the client: what to prepare, a 15-minute demo script, the
questions they are likely to ask (with answers), and what to do if something goes wrong.

The pitch deck is [`presentation/Small-Africa-Client-Pitch.pptx`](../presentation/Small-Africa-Client-Pitch.pptx)
(18 slides, speaker notes on each). The live demo is
**https://alokwemsamuel.github.io/small-africa/**.

---

## Before the meeting

**The day before**

- [ ] Open the live demo on your laptop **and** your phone. Click **Reset demo data** in the
      ribbon so it starts fresh (each new day also starts fresh on its own).
- [ ] Check the backup plan works: XAMPP starts, `http://localhost:5173` opens, and the video
      `presentation/small-africa-demo-walkthrough.mp4` plays.
- [ ] Charge the laptop and phone; bring an HDMI/USB-C adapter and a phone hotspot.
- [ ] Have the five demo sign-ins ready (they are also on the sign-in page under "Demo credentials"):

| Role | Email | Password |
|---|---|---|
| Customer | guest@smallafrica.demo | SmallAfrica@Guest2026 |
| Super Admin | admin@smallafrica.demo | SmallAfrica@Admin2026 |
| Manager | manager@smallafrica.demo | SmallAfrica@Manager2026 |
| Kitchen | kitchen@smallafrica.demo | SmallAfrica@Kitchen2026 |
| Front desk | frontdesk@smallafrica.demo | SmallAfrica@Desk2026 |

**On the day**

- Open two browser windows before you start: **window 1** signed out on the home page,
  **window 2** signed in as `admin@` on the admin dashboard. Switching windows is faster than
  signing in and out.
- Zoom the browser to 110–125% so people at the back can read it.
- Turn off notifications. Close other tabs.
- Have the deck open on slide 1.

---

## The 15-minute script

Timings are a guide. The deck sets the scene (slides 1–5) and the demo carries the rest.
Say less, show more.

### 0:00–2:00 · The idea (slides 1–5)

> "Lagos has great Nigerian restaurants and good European ones, but nowhere does all of it
> under one roof at this level. Small Africa is *three kitchens, one table*: Nigerian, Polish
> and Continental. The website has to feel like the restaurant: warm, confident, luxurious.
> And it has to work hard: take orders, take bookings, and bring people back."

Move quickly through vision, problem, solution and brand. Stop on the brand slide for a few
seconds: logo, gold on near-black, the serif type.

### 2:00–4:00 · First impression (window 1, home page)

1. Show the home page as it loads: the **video hero**. *"This is the first thing a customer
   sees on Instagram when they tap the link in bio."*
2. Scroll slowly: the three kitchens, signature dishes, the Interest Account preview, reviews.
3. Click the **theme switcher** (sun/moon) to show light mode, then back to dark.
4. **Pick up your phone** and open the same link. *"Most of your customers will be on a
   phone. It's fast even on a weak 4G signal, because the pages are ready-made."*

### 4:00–7:00 · Ordering (window 1)

1. **Menu** → filter by **Polish** → then tick **No pork**. *"Every dish is tagged; your
   Muslim guests can hide pork in one tap."*
2. Open **Smoky Party Jollof**: the photo, description, allergens. Add it to the order.
3. Add **Pierogi Ruskie** too. Open the basket.
4. **Checkout:** choose **Pickup**, schedule it for later today, apply `WELCOME10`.
   Point out the totals: VAT included, ₦500 packaging, discount.
5. Pay with the **simulated Paystack** popup. *"In the live site this is the real Paystack
   window: cards, bank transfer, USSD. In the demo no money moves."*
6. Show the **order tracking** page with its status.

### 7:00–8:30 · Reservations (window 1)

1. **Reservations** → pick a date, 4 guests, the **Terrace**, a time slot.
2. *"It only offers times that still have space. The front desk sees this immediately and
   can confirm, seat or move the booking."*

### 8:30–11:00 · The Interest Account (window 1, sign in as guest@)

1. Sign in as `guest@smallafrica.demo`. Open **Rewards / Interest Account**.
2. Show the **membership card**: **Gold tier, ₦68,500 balance, 2,340 points**.
3. *"Customers top up dining credit, for example ₦50,000, and get a 5% bonus. Every month,
   balances of ₦20,000 or more earn 2% interest as extra dining credit, up to ₦5,000. That
   money can only be spent here, so it brings them back."*
4. Show points, tiers (Bronze → Silver → Gold → Black Diamond), the stamp card and the history.
5. Do a quick **top-up** of ₦50,000 with the simulated popup; the balance and bonus update.

> Say clearly: **it's dining credit, not a bank account.** (See the questions below.)

### 11:00–14:00 · Running the restaurant (window 2, admin@)

1. **Dashboard:** today's revenue, orders by kitchen, busy hours, the charts. *"This is
   your morning coffee screen."*
2. **Orders:** find the order you just placed and move it to **Preparing**. *"The kitchen
   screen shows only what the kitchen needs."*
3. **Menu:** mark a dish sold out for today, or open one and change its price.
   *"No developer needed."*
4. **Interest Account manager:** click **Simulate month-end interest** (demo only) and show
   the interest that would be paid.
5. **Staff & roles:** *"Your kitchen staff can't see revenue; the front desk can't change
   prices. Every change is in the audit log."*

### 14:00–15:00 · Close (slides 12–18)

Briefly cover security, performance, the marketing plan, roadmap and support packages.
End on the **QR code slide**: *"Scan this. It's the full demo on your own phone. Try to
break it; you can't hurt anything, and Reset puts it back."*

Then stop and take questions.

---

## Questions the client may ask

**Is the Interest Account legal? It sounds like a bank.**
It is designed as a **loyalty programme**, not a deposit or savings product. The balance is
dining credit that can only be spent at Small Africa: it can't be withdrawn as cash, and the
"interest" is bonus dining credit with a monthly cap. The Rewards Terms say this plainly. We
still recommend that a Nigerian lawyer and accountant review the terms before launch (it's
on the go-live checklist).

**What does it cost to run each month?**
Hosting for a PHP site with a database: a modest monthly fee for a good host. The domain:
a yearly fee. Paystack: a fee per successful payment (check Paystack's current Nigerian
pricing), no monthly fee. Email sending: free up to a few hundred emails a day with most
providers. There are no licence fees: all the software is open source.

**Can we change the menu, prices and photos ourselves?**
Yes. **Admin → Menu**: add dishes, change prices, upload photos, mark sold out, set tags like
pork or spicy. Changes show on the website straight away.

**What happens if the internet or the website goes down during service?**
The admin panel works on any phone or tablet with data, so the kitchen can keep using
it on a hotspot. Orders already paid are stored on the server; nothing is lost. Hosting
providers keep sites running around the clock, and daily backups are part of go-live.

**How are payments kept safe?**
Card details never touch our server: Paystack handles them. Every payment is checked
with Paystack before an order is confirmed, and Paystack's notifications are verified
with a secret signature. Staff accounts use strong passwords and two-factor authentication.

**What about customers' personal data?**
The site follows Nigeria's Data Protection Act 2023: a clear privacy policy, cookie notice,
marketing only with consent, passwords stored securely, and customers can ask for their
data or for it to be deleted.

**Can it work with Chowdeck or Glovo?**
Not connected automatically yet. Those apps have their own menus and tablets. The
website is for direct orders (no commission, and customers earn points). An integration
can be added later if the apps provide access.

**Can customers order on WhatsApp?**
The site links to your WhatsApp Business number, and the marketing plan sets up a WhatsApp
catalogue that links to each dish's page to order and pay.

**How long until we can go live?**
The software is ready. Going live needs your decisions and details: real address and phone,
Paystack business verification (usually a few days), domain and hosting, the legal review
of the Rewards Terms, and staff training. The go-live checklist lists every item.

**Will it be fast on a phone?**
Yes. The public pages are ready-made, scoring 90+ in Google's Lighthouse test on mobile
(performance, accessibility, best practices and SEO), and it was tested on iPhone, Android
and iPad.

**Will Google find us?**
Every dish has its own page with a proper title and description, there is a sitemap, and
the pages are ready-made so search engines read them easily. The marketing plan covers
Google Business Profile and local keywords.

**What if we want changes later?**
That's what the maintenance and support packages (slide 16) cover: updates, security
patches, backups, small changes each month, and new features quoted separately.

---

## Backup plan

If the venue's Wi-Fi is bad, use your **phone hotspot** first. After the first load the
demo runs in the browser and needs very little data.

**If the live link won't load at all:**

1. **Local copy (XAMPP).** Start Apache and MySQL in the XAMPP control panel, then in a
   terminal:
   ```bash
   cd C:\xampp\htdocs\SmallAfrica\frontend
   npm run dev
   ```
   Open `http://localhost:5173`. This is the full site running on your laptop with the real
   PHP API and database. Same sign-ins. To start from fresh data:
   `cd ..\backend && composer fresh` (takes about a minute).
2. **The demo build offline.** If you built the demo before (`npm run build:demo`), run
   `npm run preview -- --mode demo` in `frontend/` and open the address it prints
   (it ends in `/small-africa/`).
3. **The recording.** Play `presentation/small-africa-demo-walkthrough.mp4` (2½ minutes):
   ordering Jollof and Pierogi, paying, booking a table, an Interest Account top-up, the
   admin dashboard and month-end interest. Talk over it using the script above.

**If something odd happens mid-demo:** click **Reset demo data** in the ribbon, or say
*"Let me show you the recording of this part"* and move on. Never debug in front of the
client.
