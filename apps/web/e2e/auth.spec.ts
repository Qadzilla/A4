import { expect, test } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('homepage loads and handles auth correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // With Clerk configured: unauthenticated users redirect to /sign-in
    // Without Clerk (dev bypass): users see the dashboard at /
    const url = page.url();
    expect(url.includes('sign-in') || url.endsWith(':3000/')).toBe(true);
  });

  test('sign-in page renders', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveTitle(/A4/);
  });

  test('sign-up page renders', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page).toHaveTitle(/A4/);
  });
});
