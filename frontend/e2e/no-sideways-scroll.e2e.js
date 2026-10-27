import { expect, test } from '@playwright/test';
import { menuDialog, openMobileMenu } from './helpers';

/**
 * No page may be wider than the phone. Phones from 320px to 430px wide, dark and light, every
 * public page, the signed-in member's pages and every admin page.
 *
 * Why this exists: a page that is even slightly too wide makes Chrome on Android zoom the whole
 * page out (the left edge and the header look cut off, with an empty strip on the right). Tests
 * at one width, or with `scrollWidth > clientWidth`, miss it, because the browser has already
 * widened the screen. So the page is measured against the width the phone really has.
 */
const WIDTHS = [320, 360, 375, 390, 412, 430];
const THEMES = ['dark', 'light'];

const PUBLIC = [
  '',
  'menu',
  'menu?kitchen=polish',
  'menu/smoky-party-jollof',
  'reservations',
  'about',
  'gallery',
  'events',
  'contact',
  'faq',
  'privacy',
  'terms',
  'rewards',
  'rewards-terms',
  'login',
  'register',
];
const MEMBER = [
  'account',
  'account?tab=rewards',
  'account?tab=orders',
  'account?tab=reservations',
  'account?tab=addresses',
  'account?tab=reviews',
  'account?tab=settings',
];
const ADMIN = [
  'admin',
  'admin/orders',
  'admin/reservations',
  'admin/menu',
  'admin/customers',
  'admin/rewards',
  'admin/reviews',
  'admin/coupons',
  'admin/enquiries',
  'admin/staff',
  'admin/settings',
  'admin/audit',
];

/**
 * Runs in the page: how wide it really is, and which visible elements stick out past `width`.
 *
 * The page wrappers carry `overflow-x: clip` as a last-resort guard (data-overflow-guard). It stops
 * the page from scrolling sideways but would also hide a layout bug, so it doesn't count as
 * clipping here: whatever it is hiding is reported.
 */
function measure(width) {
  const doc = document.documentElement;
  const clippedByParent = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.hasAttribute('data-overflow-guard')) continue;
      if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(p).overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= width + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const outside = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || getComputedStyle(el).display === 'none') continue;
    // Entirely off to the left (e.g. a spam-trap field parked at -9999px) can't be seen or scrolled to.
    if ((r.right > width + 1 || (r.left < -1 && r.right > 0)) && !clippedByParent(el)) {
      outside.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)}`);
    }
  }
  return {
    scrollWidth: doc.scrollWidth,
    innerWidth: window.innerWidth,
    outside: outside.slice(0, 4),
    outsideCount: outside.length,
  };
}

async function checkPages(page, width, paths) {
  const problems = [];
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const m = await page.evaluate(measure, width);
    const pageWidth = Math.max(m.scrollWidth, m.innerWidth);
    if (pageWidth > width) {
      problems.push(
        `/${path}: page is ${pageWidth}px wide on a ${width}px phone. Sticking out: ${m.outside.join(' | ') || 'nothing found (check overflow on a wrapper)'}`,
      );
    } else if (m.outsideCount > 0) {
      problems.push(
        `/${path}: ${m.outsideCount} element(s) stick out past the ${width}px screen edge (hidden by the overflow guard): ${m.outside.join(' | ')}`,
      );
    }
  }
  return problems;
}

/** Opens something (menu, panel) and checks the page is still no wider and the panel is on screen. */
async function checkOpened(page, width, label, open, panel, minHeight = 0) {
  const problems = [];
  await open();
  await page.waitForTimeout(500);
  const m = await page.evaluate(measure, width);
  if (Math.max(m.scrollWidth, m.innerWidth) > width) {
    problems.push(
      `${label} open: page is ${Math.max(m.scrollWidth, m.innerWidth)}px wide on a ${width}px phone`,
    );
  }
  const box = await panel().boundingBox();
  if (!box || box.x < -1 || box.x + box.width > width + 1) {
    problems.push(`${label} open: panel is not fully on screen (${JSON.stringify(box)})`);
  } else if (box.height < minHeight) {
    // A panel squashed to nothing (it once was, inside the blurred header) still has its edges on screen.
    problems.push(
      `${label} open: panel is only ${Math.round(box.height)}px tall, expected at least ${minHeight}px`,
    );
  }
  return problems;
}

async function signIn(page, email, password) {
  await page.goto('login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login$/);
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test.describe(`${theme} theme, ${width}px wide`, () => {
      test.use({
        viewport: { width, height: 800 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        colorScheme: theme,
      });

      const setUp = (context, showCookieNotice) =>
        context.addInitScript(
          ([t, notice]) => {
            localStorage.setItem('sa-theme', t);
            localStorage.setItem('sa-cookie-notice', notice ? '0' : '1');
          },
          [theme, showCookieNotice],
        );

      test('public pages, basket and checkout fit', async ({ page, context }) => {
        // The cookie notice is left showing here: it is part of what has to fit.
        await setUp(context, true);
        const problems = await checkPages(page, width, PUBLIC);
        // The mobile menu, opened.
        for (const path of ['', 'menu']) {
          await page.goto(path);
          problems.push(
            ...(await checkOpened(
              page,
              width,
              `/${path} mobile menu`,
              () => openMobileMenu(page),
              () => menuDialog(page),
              500,
            )),
          );
        }
        // The basket and checkout need something in the basket.
        await page.goto('menu');
        try {
          await page
            .getByRole('button', { name: /^Add .* to order$/ })
            .first()
            .click({ timeout: 10_000 });
          problems.push(...(await checkPages(page, width, ['cart', 'checkout'])));
        } catch {
          // Report what was found so far instead of hanging: a button a visitor can't reach is a bug too.
          problems.push('/menu: the "Add to order" button cannot be tapped (it is off screen or covered)');
        }
        expect(problems).toEqual([]);
      });

      test('member pages and order tracking fit', async ({ page, context }) => {
        await setUp(context, false);
        await signIn(page, 'guest@smallafrica.demo', 'SmallAfrica@Guest2026');
        const problems = await checkPages(page, width, MEMBER);
        await page.goto('account');
        problems.push(
          ...(await checkOpened(
            page,
            width,
            'notifications',
            () =>
              page
                .getByRole('button', { name: /^Notifications/ })
                .first()
                .click(),
            () => page.getByRole('region', { name: 'Notifications' }),
          )),
        );
        await page.goto('account?tab=orders');
        const order = page.locator('a[href*="/orders/"]').first();
        if (await order.count()) {
          const href = await order.getAttribute('href');
          problems.push(...(await checkPages(page, width, [href.replace(/^.*\/small-africa\//, '')])));
        }
        expect(problems).toEqual([]);
      });

      test('admin pages fit', async ({ page, context }) => {
        await setUp(context, false);
        await signIn(page, 'admin@smallafrica.demo', 'SmallAfrica@Admin2026');
        expect(await checkPages(page, width, ADMIN)).toEqual([]);
      });
    });
  }
}
