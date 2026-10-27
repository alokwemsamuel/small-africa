import { expect } from '@playwright/test';

/** Waits until the app has attached to the (pre-built) page: taps and scrolling count from here. */
export const waitForApp = (page) =>
  page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');

/** The hamburger. Found by what it controls: its name flips between "Open menu" and "Close menu". */
export const hamburgerButton = (page) => page.locator('button[aria-controls="mobile-nav"]');

/** The phone menu dialog. */
export const menuDialog = (page) => page.getByRole('dialog', { name: 'Site menu' });

/**
 * Taps the hamburger until the menu is open. Pre-built pages show the button before the page's
 * JavaScript has attached, and a tap in that moment does nothing, so the tap is repeated.
 * Waits for the slide-in to finish.
 */
export async function openMobileMenu(page) {
  const dialog = menuDialog(page);
  await waitForApp(page);
  await expect(async () => {
    if (!(await dialog.isVisible())) await hamburgerButton(page).tap({ timeout: 2000 });
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  // The panel rests at the left edge of its box once it has slid in (full width on phones).
  try {
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? Math.round(box.x + box.width) : -1;
      })
      .toBe(await page.evaluate(() => window.innerWidth));
  } catch (error) {
    const state = await page.evaluate(() => {
      const d = document.getElementById('mobile-nav');
      return JSON.stringify({
        visibility: document.visibilityState,
        classes: d?.className.match(/translate-x-S+|opacity-S+/g),
        position: document.body.style.position,
        ariaExpanded: document
          .querySelector('button[aria-controls="mobile-nav"]')
          ?.getAttribute('aria-expanded'),
        url: location.pathname,
        historyState: history.state,
      });
    });
    throw new Error(`The menu did not finish opening: ${state}
${error.message}`);
  }
}
