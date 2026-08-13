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

for (const path of ['/ar', '/en']) {
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
  await page.goto('/ar');
  await page.getByRole('button', { name: /language|اللغة/i }).click();

  await expect(page).toHaveURL(/\/en$/);
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
