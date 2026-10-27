import { expect, test } from '@playwright/test';
import { hamburgerButton, menuDialog, openMobileMenu, waitForApp } from './helpers';

/**
 * The hamburger menu, on phones and tablets, in both themes, on the pre-built pages (the demo
 * build is what is tested: the first page a visitor gets is pre-built HTML, and the menu has to
 * work once the page's JavaScript attaches).
 *
 * It used to open with no height at all: drawn inside the header, whose backdrop blur trapped
 * its `position: fixed` box, so the tap seemed to do nothing while page scrolling was locked.
 */
const PHONES = [320, 360, 430];
const THEMES = ['dark', 'light'];
const HEIGHT = 800;

const setUp = (context, theme, { cookieNotice = true } = {}) =>
  context.addInitScript(
    ([t, notice]) => {
      localStorage.setItem('sa-theme', t);
      localStorage.setItem('sa-cookie-notice', notice ? '0' : '1');
    },
    [theme, cookieNotice],
  );

/** The element on top at a point, and whether it belongs to the menu (panel or backdrop). */
const topmostIsMenu = (page, x, y) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return !!el?.closest('[data-mobile-menu]');
    },
    [x, y],
  );

for (const theme of THEMES) {
  for (const width of PHONES) {
    test.describe(`${theme} theme, ${width}px phone`, () => {
      test.use({ viewport: { width, height: HEIGHT }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

      test('opens full screen above everything, locks the page, and closes with ✕, Esc and Back', async ({
        page,
        context,
      }) => {
        await setUp(context, theme);
        await page.goto('menu');
        // The app scrolls to the top as it starts, so scrolling any sooner would be undone.
        await waitForApp(page);
        await page.evaluate(() => window.scrollTo(0, 400));
        const scrollBefore = await page.evaluate(() => window.scrollY);
        const mainTop = () => page.evaluate(() => document.querySelector('main').getBoundingClientRect().top);
        const hamburger = hamburgerButton(page);
        const dialog = menuDialog(page);
        await expect(hamburger).toHaveAttribute('aria-controls', 'mobile-nav');
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');

        await openMobileMenu(page);

        // On screen, and the whole screen: not squashed into the header.
        const box = await dialog.boundingBox();
        expect(Math.round(box.x)).toBe(0);
        expect(Math.round(box.y)).toBe(0);
        expect(Math.round(box.width)).toBe(width);
        expect(Math.round(box.height)).toBe(HEIGHT);
        // Above the header (top right), the demo ribbon (top), the cookie notice and WhatsApp (bottom).
        for (const [x, y] of [
          [width - 30, 90],
          [width / 2, 8],
          [width / 2, HEIGHT - 60],
          [width - 40, HEIGHT - 40],
          [width / 2, HEIGHT / 2],
        ]) {
          expect(await topmostIsMenu(page, x, y), `menu on top at ${x},${y}`).toBe(true);
        }
        // Dialog semantics and focus.
        expect(await dialog.getAttribute('aria-modal')).toBe('true');
        await expect(page.locator('#mobile-nav')).toBeVisible();
        await expect(hamburger).toHaveAttribute('aria-expanded', 'true');
        await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeFocused();
        // Slides in from the right over 300ms.
        const motion = await dialog.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { property: cs.transitionProperty, duration: cs.transitionDuration };
        });
        expect(motion.property).toContain('transform');
        expect(motion.duration).toBe('0.3s');
        // Fits the phone, with no sideways scroll, inside and out.
        const widths = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          return {
            doc: document.documentElement.scrollWidth,
            panel: d.scrollWidth,
            panelClient: d.clientWidth,
          };
        });
        expect(widths.doc).toBeLessThanOrEqual(width);
        expect(widths.panel).toBeLessThanOrEqual(widths.panelClient);

        // The page behind can't be scrolled (wheel and touch drag).
        const behind = await mainTop();
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(250);
        expect(await mainTop()).toBe(behind);
        expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');

        // ✕ closes; the page is back where it was, and focus is back on the hamburger.
        await dialog.getByRole('button', { name: 'Close menu' }).tap();
        await expect(dialog).toBeHidden();
        expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.body.style.position)).toBe('');
        await expect(hamburger).toBeFocused();
        await expect(hamburger).toHaveAttribute('aria-expanded', 'false');

        // Esc closes.
        await openMobileMenu(page);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(hamburger).toBeFocused();

        // The phone's Back button closes it and stays on the same page.
        await openMobileMenu(page);
        const url = page.url();
        await page.goBack();
        await expect(dialog).toBeHidden();
        expect(page.url()).toBe(url);
        expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1);
      });

      test('links go to their page and close it; one Back returns to the page before', async ({
        page,
        context,
      }) => {
        await setUp(context, theme);
        await page.goto('menu');
        await openMobileMenu(page);
        const dialog = menuDialog(page);
        // Seven numbered links; the current page is marked.
        const links = dialog.getByRole('navigation').getByRole('link');
        await expect(links).toHaveCount(7);
        await expect(links.nth(0)).toContainText('Home');
        await expect(links.nth(0)).toContainText('01');
        await expect(links.nth(6)).toContainText('Contact');
        await expect(links.nth(6)).toContainText('07');
        await expect(dialog.locator('a[aria-current="page"]')).toHaveText(/Menu/);

        await dialog.getByRole('link', { name: /Reservations/ }).tap();
        await expect(page).toHaveURL(/\/reservations$/);
        await expect(dialog).toBeHidden();
        expect(await page.evaluate(() => document.body.style.position)).toBe('');

        // No leftover history entry from the menu: one Back goes to /menu.
        await page.goBack();
        await expect(page).toHaveURL(/\/menu$/);
        await expect(dialog).toBeHidden();
        // The address changes at once; the page follows a moment later. Wait for it before going on.
        await expect(page.getByRole('heading', { level: 1, name: 'The Menu' })).toBeVisible();

        // Each of the other pages loads from the menu (including the combined About & gallery).
        for (const [name, path, title] of [
          ['Home', /\/small-africa\/?$/, /Fine Dining in Lagos/],
          ['Events & catering', /\/events$/, /^Events & Catering/],
          ['Rewards', /\/rewards$/, /^Interest Account/],
          ['About & gallery', /\/about$/, /^Our Story/],
          ['Contact', /\/contact$/, /^Contact/],
        ]) {
          await openMobileMenu(page);
          await dialog.getByRole('link', { name: new RegExp(`^${name}`) }).tap();
          await expect(page).toHaveURL(path);
          await expect(dialog).toBeHidden();
          // The address changes at once; the page (and its title) follow a moment later.
          await expect(page).toHaveTitle(title);
        }
      });

      test('works on other pre-built pages, with the two buttons and the footer details', async ({
        page,
        context,
      }) => {
        await setUp(context, theme);
        for (const path of ['', 'about', 'events']) {
          await page.goto(path);
          await openMobileMenu(page);
          const dialog = menuDialog(page);
          await expect(dialog.getByRole('link', { name: 'Reserve a table' })).toBeVisible();
          await expect(dialog.getByRole('link', { name: 'Order online' })).toBeVisible();
          await expect(dialog.getByRole('link', { name: /Sign in/ })).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
        // Hours, address and the four icons are further down the panel.
        await openMobileMenu(page);
        const dialog = menuDialog(page);
        await expect(dialog.getByText('Victoria Island')).toBeVisible();
        await expect(dialog.getByText('Mon – Thu')).toBeVisible();
        for (const name of [/WhatsApp/, /Call/, /Instagram/, /TikTok/]) {
          await expect(dialog.getByRole('link', { name })).toBeVisible();
        }
        // Order online opens the menu page.
        await dialog.getByRole('link', { name: 'Order online' }).tap();
        await expect(page).toHaveURL(/\/menu$/);
      });

      test('the theme switch works inside the menu', async ({ page, context }) => {
        await setUp(context, theme);
        await page.goto('');
        await openMobileMenu(page);
        const dialog = menuDialog(page);
        const other = theme === 'dark' ? 'light' : 'dark';
        await dialog.getByRole('radio', { name: new RegExp(other, 'i') }).check({ force: true });
        await expect(page.locator('html')).toHaveAttribute('data-theme', other);
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('radio', { name: /Auto/ })).toBeAttached();
      });

      test('a member sees their first name; staff also get Admin', async ({ page, context }) => {
        await setUp(context, theme, { cookieNotice: false });
        await page.goto('login');
        await page.locator('input[name="email"]').fill('guest@smallafrica.demo');
        await page.locator('input[name="password"]').fill('SmallAfrica@Guest2026');
        await page.locator('form button[type="submit"]').click();
        await expect(page).not.toHaveURL(/\/login$/);
        // The address changes first; wait for the account page itself before opening the menu.
        await expect(page.getByRole('heading', { level: 1, name: /Hello, Chiamaka/ })).toBeVisible();
        await openMobileMenu(page);
        let dialog = menuDialog(page);
        await expect(dialog.getByRole('link', { name: /Chiamaka/ })).toHaveAttribute('href', /\/account$/);
        await expect(dialog.getByRole('link', { name: 'Admin' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Sign out' }).tap();
        await expect(dialog).toBeHidden();

        await page.goto('login');
        await page.locator('input[name="email"]').fill('admin@smallafrica.demo');
        await page.locator('input[name="password"]').fill('SmallAfrica@Admin2026');
        await page.locator('form button[type="submit"]').click();
        await expect(page).not.toHaveURL(/\/login$/);
        await page.goto('menu');
        await openMobileMenu(page);
        dialog = menuDialog(page);
        await expect(dialog.getByRole('link', { name: 'Admin' })).toBeVisible();
      });
    });
  }
}

test.describe('tablet in portrait', () => {
  for (const [width, height] of [
    [768, 1024],
    [820, 1180],
  ]) {
    test(`${width}px: the panel slides over a dark backdrop that closes it`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        baseURL: test.info().project.use.baseURL,
      });
      await setUp(context, 'dark');
      const page = await context.newPage();
      await page.goto('about');
      await openMobileMenu(page);
      const dialog = menuDialog(page);
      const box = await dialog.boundingBox();
      // A side panel (28rem), not a full-width screen, with the page dimmed beside it.
      expect(Math.round(box.width)).toBe(448);
      expect(Math.round(box.x + box.width)).toBe(width);
      expect(Math.round(box.height)).toBe(height);
      expect(await topmostIsMenu(page, 100, 300)).toBe(true); // the backdrop is part of the menu
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.touchscreen.tap(100, 300);
      await expect(dialog).toBeHidden();
      await context.close();
    });
  }
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the normal header links and has no hamburger', async ({ page, context }) => {
    await setUp(context, 'dark');
    await page.goto('menu');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Menu' }),
    ).toBeVisible();
    await expect(hamburgerButton(page)).toBeHidden();
    await expect(menuDialog(page)).toHaveCount(0);
  });
});

test.describe('reduced motion', () => {
  test.use({
    viewport: { width: 360, height: HEIGHT },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });

  test('fades instead of sliding', async ({ page, context }) => {
    await setUp(context, 'dark');
    await page.goto('menu');
    await openMobileMenu(page);
    const dialog = menuDialog(page);
    const motion = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, transform: cs.transform, opacity: cs.opacity };
    });
    expect(motion.property).toBe('opacity');
    expect(motion.transform).toBe('none');
    expect(motion.opacity).toBe('1');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
