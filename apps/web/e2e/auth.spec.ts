import { expect, test } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('redirects unauthenticated user to sign-in', async ({ page }) => {
    await page.goto('/');
    // Should redirect to sign-in when not authenticated
    await expect(page).toHaveURL(/sign-in/);
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
