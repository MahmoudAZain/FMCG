import { test, expect } from '@playwright/test';

/**
 * Stage 1 acceptance: an Arabic right-to-left page renders at 360px, English is
 * reachable, and neither direction overflows sideways.
 *
 * These assertions stay useful for the life of the project — SC-012 forbids
 * horizontal overflow at 360px in either direction, and every later stage adds
 * screens that could break it.
 */

test('a visitor with no preference lands on Arabic, right-to-left', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ar$/);

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
});

test('English renders left-to-right', async ({ page }) => {
  await page.goto('/en');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'en');
  await expect(html).toHaveAttribute('dir', 'ltr');
});

// Every storefront route, in both directions. SC-012 is not a property of the
// home page — it is a property of the site, and each new screen is a chance to
// break it.
const ROUTES = ['/ar', '/en', '/ar/cart', '/en/cart', '/ar/login', '/ar/register', '/en/register'];

for (const path of ROUTES) {
  test(`${path} does not scroll sideways at 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(path);

    // SC-012. A page that scrolls sideways on a phone is broken, and the cause
    // is almost always a physical-property leak or an unconstrained element.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, `${path} overflows horizontally at 360px`).toBe(false);
  });
}

test('switching language keeps the visitor on the same page', async ({ page }) => {
  await page.goto('/ar/register');

  // Assert the link's href in the rendered HTML rather than clicking through:
  // the reason a link and not a button is that it must work on first paint,
  // and the href being right IS the mechanism. Clicking additionally is a
  // separate check.
  // The switcher on an Arabic page carries an Arabic aria-label and English
  // link text (it points AT the other language). Matching by href is what
  // actually identifies it.
  const switcher = page.locator('a[href="/en/register"]').first();
  await expect(switcher).toBeVisible();

  await switcher.click();
  await expect(page).toHaveURL(/\/en\/register$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('every tap target is at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/ar');

  // Constitution Principle IV. Below 44px, customers on phones miss.
  const controls = page.locator('button:visible, a[href]:visible');
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const box = await controls.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height, `control ${i} is only ${box.height}px tall`).toBeGreaterThanOrEqual(44);
  }
});
