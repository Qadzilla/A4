import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

/** Create a workspace via tRPC and return its id. */
async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E Insights ${Date.now()}`, type: 'workspace' } } },
  });
  const text = await res.text();
  const body = JSON.parse(text);
  if (!body[0]?.result?.data?.json?.id) {
    throw new Error(`Failed to create workspace: ${text}`);
  }
  return body[0].result.data.json.id;
}

/** Delete a workspace via tRPC (soft-delete). */
async function deleteWorkspace(
  request: import('@playwright/test').APIRequestContext,
  id: string,
): Promise<void> {
  await request.post(`${BASE}/trpc/workspace.delete?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { id } } },
  });
}

/** Seed a budget category with overspend (triggers budget_overspend analyzer). */
async function seedBudgetOverspend(
  request: import('@playwright/test').APIRequestContext,
  workspaceId: string,
): Promise<void> {
  await request.post(`${BASE}/trpc/budget.createCategory?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { workspaceId, name: 'Dining', budgeted: 500, actual: 900 } } },
  });
}

/** Seed an account with low balance (triggers low_cash analyzer). */
async function seedLowCash(
  request: import('@playwright/test').APIRequestContext,
  workspaceId: string,
): Promise<void> {
  await request.post(`${BASE}/trpc/account.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      '0': {
        json: { workspaceId, name: 'Checking', institution: 'Test Bank', type: 'checking', balance: 50 },
      },
    },
  });
}

/** Force-generate insights for a workspace. */
async function triggerInsightGeneration(
  request: import('@playwright/test').APIRequestContext,
  workspaceId: string,
): Promise<void> {
  await request.post(`${BASE}/trpc/insights.generate?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { workspaceId } } },
  });
}

/** The right-side tools/chat/insights panel (not the sidebar). */
function getRightPanel(page: Page) {
  // The right panel aside has class "absolute right-0"
  return page.locator('aside.absolute');
}

/** Get the Insights button in the tools panel footer. */
function getInsightsButton(page: Page) {
  // The button text is "Insights" possibly followed by a badge number (e.g. "Insights2").
  return getRightPanel(page).locator('button', { hasText: /Insights/ });
}

/** Open the insights panel by clicking the "Insights" button in the tools panel footer. */
async function openInsightsPanel(page: Page): Promise<void> {
  await getInsightsButton(page).click();
  // Wait for panel to switch to insights mode
  const panel = getRightPanel(page);
  await panel.locator('button', { hasText: 'Dismiss' }).first()
    .or(panel.getByText('No insights right now'))
    .or(panel.getByText('Analyzing workspace'))
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

/**
 * Mock SSE route that streams text chunks WITHOUT a `done` event.
 * Same pattern as chat.spec.ts.
 */
async function mockStreamResponse(page: Page, text: string): Promise<void> {
  const chunks = text.match(/[\s\S]{1,10}/g) ?? [text];

  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      `data: ${JSON.stringify({ type: 'message_start', messageId: 'test-msg-id' })}\n\n`,
    ];
    for (const chunk of chunks) {
      lines.push(`data: ${JSON.stringify({ type: 'text_delta', text: chunk })}\n\n`);
    }

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: lines.join(''),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('Insights E2E', () => {
  let workspaceId: string;

  test.beforeEach(async ({ request, page }) => {
    workspaceId = await createWorkspace(request);
    // Seed financial data that triggers analyzers
    await seedBudgetOverspend(request, workspaceId);
    await seedLowCash(request, workspaceId);

    await page.goto(`/workspaces/${workspaceId}`);
    // Retry on Vite HMR stale module errors
    const errorHeading = page.locator('text=Unexpected Application Error');
    if (await errorHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.reload();
    }
    await page.waitForLoadState('networkidle');

    // Force-generate insights (don't rely on auto-generation timing)
    await triggerInsightGeneration(request, workspaceId);
  });

  test.afterEach(async ({ request }) => {
    if (workspaceId) {
      await deleteWorkspace(request, workspaceId);
    }
  });

  // 1
  test('insight generation shows badge on Insights button', async ({ page }) => {
    const insightsBtn = getInsightsButton(page);
    await expect(insightsBtn).toBeVisible({ timeout: 10_000 });

    // Wait for badge count to appear (auto-generation + query invalidation)
    await expect(async () => {
      const text = (await insightsBtn.textContent()) ?? '';
      // Button text is "Insights" + optional badge number, e.g. "Insights2"
      const match = text.match(/Insights\s*(\d+)/);
      expect(match).toBeTruthy();
      expect(Number(match![1])).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
  });

  // 2
  test('view insights in panel', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openInsightsPanel(page);

    // Assert panel is visible (header with "Insights" text)
    await expect(page.locator('span.text-\\[13px\\].font-semibold', { hasText: 'Insights' })).toBeVisible();

    // Assert at least 1 insight card visible (card with title + summary + buttons)
    const cards = page.locator('button', { hasText: 'Dismiss' });
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Assert card has Ask Paige button
    await expect(page.locator('button', { hasText: 'Ask Paige' }).first()).toBeVisible();
  });

  // 3
  test('dismiss an insight', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openInsightsPanel(page);

    // Count initial dismiss buttons (one per insight card)
    const dismissButtons = page.locator('button', { hasText: 'Dismiss' });
    await expect(dismissButtons.first()).toBeVisible({ timeout: 10_000 });
    const initialCount = await dismissButtons.count();

    // Click Dismiss on first card
    await dismissButtons.first().click();

    // Wait for dismiss animation (200ms) and card removal
    await expect(async () => {
      const currentCount = await page.locator('button', { hasText: 'Dismiss' }).count();
      expect(currentCount).toBe(initialCount - 1);
    }).toPass({ timeout: 5_000 });
  });

  // 4
  test('engage an insight — opens chat with context', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openInsightsPanel(page);

    // Wait for insight cards to load
    const askPaigeBtn = page.locator('button', { hasText: 'Ask Paige' }).first();
    await expect(askPaigeBtn).toBeVisible({ timeout: 10_000 });

    // Mock the stream response for the auto-sent insight context message
    await mockStreamResponse(page, 'I can see your budget is over the allocated amount...');

    // Click "Ask Paige" on first insight
    await askPaigeBtn.click();

    // Assert chat panel is visible
    await expect(page.locator('[data-testid="chat-messages"]')).toBeVisible({ timeout: 10_000 });

    // Assert insight context banner visible
    await expect(page.getByText('This conversation started from an insight')).toBeVisible({ timeout: 10_000 });

    // Assert streamed response appears
    await expect(
      page.locator('[data-testid="chat-message-assistant"]').filter({ hasText: 'budget is over' }),
    ).toBeVisible({ timeout: 15_000 });
  });

  // 5
  test('re-engage same insight — opens existing conversation', async ({ page, request }) => {
    // Engage an insight via API to create a conversation
    const input = encodeURIComponent(JSON.stringify({ '0': { json: { workspaceId, status: 'active' } } }));
    const listRes = await request.get(`${BASE}/trpc/insights.list?batch=1&input=${input}`);
    const insights = (await listRes.json())[0].result.data.json;
    expect(insights.length).toBeGreaterThan(0);

    const firstInsight = insights[0];
    const engageRes = await request.post(`${BASE}/trpc/insights.engage?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { id: firstInsight.id } } },
    });
    const engageResult = (await engageRes.json())[0].result.data.json;
    const conversationId = engageResult.conversationId;

    // Reload page so the engaged conversation appears in chat
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Re-engage the same insight via API (should return same conversationId)
    const reEngageRes = await request.post(`${BASE}/trpc/insights.engage?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { id: firstInsight.id } } },
    });
    const reEngageResult = (await reEngageRes.json())[0].result.data.json;
    expect(reEngageResult.conversationId).toEqual(conversationId);
  });

  // 6
  test('empty state when no insights', async ({ request, page }) => {
    // Create a NEW workspace with no financial data
    const emptyWorkspaceId = await createWorkspace(request);

    try {
      await page.goto(`/workspaces/${emptyWorkspaceId}`);
      const errorHeading = page.locator('text=Unexpected Application Error');
      if (await errorHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.reload();
      }
      await page.waitForLoadState('networkidle');

      // Open insights panel
      await openInsightsPanel(page);

      // Assert "No insights right now" text visible
      await expect(page.getByText('No insights right now')).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteWorkspace(request, emptyWorkspaceId);
    }
  });

  // 7
  test('dark mode rendering', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Toggle dark mode by adding class to html element
    await page.evaluate(() => document.documentElement.classList.add('dark'));

    await openInsightsPanel(page);

    // Assert insight cards are visible in dark mode
    const askPaigeBtn = page.locator('button', { hasText: 'Ask Paige' }).first();
    await expect(askPaigeBtn).toBeVisible({ timeout: 10_000 });

    // Assert severity section headers are visible
    const severityHeaders = page.locator('span.uppercase.tracking-wider');
    await expect(severityHeaders.first()).toBeVisible();

    // Toggle back to light mode
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  });
});
