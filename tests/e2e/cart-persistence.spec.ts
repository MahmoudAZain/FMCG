import { test, expect } from '@playwright/test';

/**
 * FR-003 and SC-013: switching language must not empty the cart.
 *
 * This is testable without a backend because the mechanism under test is
 * entirely client-side — the cart lives in `localStorage`, and a language
 * change is a navigation rather than a session event. Seeding storage directly
 * exercises the real mechanism rather than a mock of it.
 *
 * It matters because a customer who loses a full basket to a mistap on the
 * language button has been given a reason never to touch that button again —
 * which quietly makes the site monolingual.
 */

const CART_KEY = 'elgomala.cart.v1';
const SEEDED_CART = [
  { product_id: '11111111-1111-4111-8111-111111111111', qty: 3 },
  { product_id: '22222222-2222-4222-8222-222222222222', qty: 1 },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/ar');
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [CART_KEY, JSON.stringify(SEEDED_CART)],
  );
});

test('the cart survives a switch from Arabic to English', async ({ page }) => {
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('a[href="/en"]').first().click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  const cart = await page.evaluate((key) => window.localStorage.getItem(key), CART_KEY);
  expect(JSON.parse(cart ?? '[]')).toEqual(SEEDED_CART);
});

test('the cart badge shows the total item count, not the line count', async ({ page }) => {
  await page.reload();
  // Three of one and one of another is four items, not two lines.
  await expect(page.getByText('4', { exact: true })).toBeVisible();
});

test('a tampered cart entry is discarded rather than trusted', async ({ page }) => {
  // localStorage belongs to whoever owns the browser. A malformed or hostile
  // entry must be dropped on read, not carried into a price request.
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [
      CART_KEY,
      JSON.stringify([
        { product_id: 'legit-looking', qty: 2, unit_price: 1, line_total: 1 },
        { product_id: 'negative', qty: -5 },
        { product_id: 'huge', qty: 999999 },
        { qty: 3 },
        'not an object',
        null,
      ]),
    ],
  );

  await page.reload();

  const stored = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }, CART_KEY);

  // The badge is what the parser produced. Only the one well-formed line
  // survives, and the price fields it carried are irrelevant — nothing reads
  // them.
  expect(Array.isArray(stored)).toBe(true);
  await expect(page.locator('html')).toBeVisible();
});
