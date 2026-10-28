import { expect, test } from '@playwright/test';
import { waitForApp } from './helpers';

/**
 * The simulated "Continue with Google / Apple / Facebook" of the demo build (the live site has
 * real providers; the demo has no server, so each button opens a clearly labelled consent screen):
 * the buttons, the consent screen, the welcome step and the new account, on phones in both themes.
 */
const PHONES = [320, 360, 430];
const THEMES = ['dark', 'light'];

const noSideways = async (page, width) => {
  const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth));
  expect(w).toBeLessThanOrEqual(width);
};

for (const theme of THEMES) {
  for (const width of PHONES) {
    test.describe(`${theme} theme, ${width}px phone`, () => {
      test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

      test.beforeEach(async ({ context }) => {
        await context.addInitScript((t) => {
          localStorage.setItem('sa-theme', t);
          localStorage.setItem('sa-cookie-notice', '1');
        }, theme);
      });

      test('sign-up page: three provider buttons in the brand colours, then the email form', async ({
        page,
      }) => {
        await page.goto('register');
        await waitForApp(page);
        const names = ['Continue with Google', 'Continue with Apple', 'Continue with Facebook'];
        const buttons = page
          .getByRole('group', { name: 'Continue with a social account' })
          .getByRole('button');
        await expect(buttons).toHaveText(names);
        await expect(page.getByRole('separator')).toHaveText('or sign up with email');
        // The email form is still below, unchanged.
        await expect(page.getByLabel('Email')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

        const colours = (name) =>
          page.getByRole('button', { name }).evaluate((el) => {
            const cs = getComputedStyle(el);
            return { background: cs.backgroundColor, color: cs.color };
          });
        expect((await colours('Continue with Google')).background).toBe('rgb(255, 255, 255)');
        expect((await colours('Continue with Facebook')).background).toBe('rgb(24, 119, 242)');
        // Apple: white with a black logo on dark, black with a white logo on light.
        const apple = await colours('Continue with Apple');
        expect(apple.background).toBe(theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)');
        expect(apple.color).toBe(theme === 'dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
        await noSideways(page, width);
      });

      test('sign-in page: the same buttons above the password form', async ({ page }) => {
        await page.goto('login');
        await waitForApp(page);
        await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
        await expect(page.getByRole('separator')).toHaveText('or sign in with email');
        await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
        await noSideways(page, width);
      });

      test('a simulated Google sign-up: consent screen, welcome step, account', async ({ page }) => {
        await page.goto('register?ref=GUEST2026');
        await waitForApp(page);
        await page.getByRole('button', { name: 'Continue with Google' }).tap();

        // The simulated consent screen: labelled as a demo, with a way out.
        const consent = page.getByRole('dialog', { name: 'Demo: Continue as Ada Okafor with Google?' });
        await expect(consent).toBeVisible();
        await expect(consent.getByText('This is a simulation')).toBeVisible();
        await expect(consent.getByText('ada.okafor@example.com')).toBeVisible();
        await noSideways(page, width);
        await consent.getByRole('button', { name: 'Cancel' }).tap();
        await expect(consent).toBeHidden();
        await expect(page).toHaveURL(/\/register/);

        await page.getByRole('button', { name: 'Continue with Google' }).tap();
        await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).tap();

        // The "almost there" step, with the referral code carried over.
        await expect(page).toHaveURL(/\/welcome\?ref=GUEST2026$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Welcome to the table' })).toBeVisible();
        await expect(page.getByText('Almost there')).toBeVisible();
        await expect(page.getByText('Ada Okafor')).toBeVisible();
        await expect(page.getByLabel(/Referral code/)).toHaveValue('GUEST2026');
        await noSideways(page, width);

        // Needs a phone number and the terms.
        await page.getByRole('button', { name: 'Finish and start earning' }).tap();
        await expect(page.getByText('Enter your phone number.')).toBeVisible();
        await page.getByLabel('Phone').fill('0803 555 0199');
        await page.getByRole('combobox', { name: 'Birthday: day' }).selectOption('14');
        await page.getByRole('combobox', { name: 'Birthday: month' }).selectOption('7');
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Finish and start earning' }).tap();

        // Done: a Bronze member on their account page, signed in.
        // (the account page tidies "?welcome=1" out of the address once it has seen it)
        await expect(page).toHaveURL(/\/account(\?welcome=1)?$/);
        await expect(page.getByRole('heading', { level: 1, name: /Hello, Ada/ })).toBeVisible();
        await noSideways(page, width);
        // Back on /welcome there is nothing left to do.
        await page.goto('welcome');
        await expect(page).toHaveURL(/\/account$/);
      });
    });
  }
}

test.describe('the demo ribbon and the other providers', () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

  test('the demo ribbon is still there, and Apple and Facebook sign in too', async ({ page, context }) => {
    await context.addInitScript(() => localStorage.setItem('sa-cookie-notice', '1'));
    await page.goto('login');
    await waitForApp(page);
    await expect(page.getByText(/Demo/).first()).toBeVisible();
    for (const [provider, name] of [
      ['Apple', 'Kasia Nowak'],
      ['Facebook', 'Tunde Bello'],
    ]) {
      await page.goto('login');
      await waitForApp(page);
      await page.getByRole('button', { name: `Continue with ${provider}` }).tap();
      await expect(
        page.getByRole('dialog', { name: `Demo: Continue as ${name} with ${provider}?` }),
      ).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).tap();
      await expect(page).toHaveURL(/\/welcome$/);
      await expect(page.getByText(name)).toBeVisible();
      // Sign out (and forget the account) for the next provider.
      await page.evaluate(() => localStorage.clear());
      await page.context().clearCookies();
      await page.goto('login');
    }
  });
});
