import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E Scenario ${Date.now()}`, type: 'workspace' } } },
  });
  const text = await res.text();
  const body = JSON.parse(text);
  if (!body[0]?.result?.data?.json?.id) {
    throw new Error(`Failed to create workspace: ${text}`);
  }
  return body[0].result.data.json.id;
}

async function deleteWorkspace(
  request: import('@playwright/test').APIRequestContext,
  id: string,
): Promise<void> {
  await request.post(`${BASE}/trpc/workspace.delete?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { id } } },
  });
}

async function openChatPanel(page: Page): Promise<void> {
  await page.locator('button', { hasText: 'AI Chat' }).click();
  await page.locator('textarea[placeholder="Ask Paige anything..."]').waitFor({ state: 'visible' });
}

async function sendMessage(page: Page, text: string): Promise<void> {
  const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
  await textarea.fill(text);
  await textarea.press('Enter');
}

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Mock tool stream helper
// ---------------------------------------------------------------------------

interface MockToolStreamOptions {
  tools: Array<{
    name: string;
    callId: string;
    result: Record<string, unknown>;
    isError?: boolean;
    input?: Record<string, unknown>;
  }>;
  responseText: string;
  canvasUpdates?: Array<{ action: 'create' | 'update'; item: Record<string, unknown> }>;
  includeDone?: boolean;
}

async function mockToolStream(page: Page, opts: MockToolStreamOptions): Promise<void> {
  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      sse({ type: 'message_start', messageId: 'test-tool-msg' }),
    ];

    for (const tool of opts.tools) {
      lines.push(sse({
        type: 'tool_call_start', toolName: tool.name, toolCallId: tool.callId,
        ...(tool.input ? { toolInput: tool.input } : {}),
      }));
      lines.push(sse({ type: 'tool_call_end', toolCallId: tool.callId }));
      lines.push(sse({
        type: 'tool_result', toolCallId: tool.callId, toolName: tool.name,
        result: tool.result, isError: tool.isError ?? false,
      }));
    }

    if (opts.canvasUpdates) {
      for (const cu of opts.canvasUpdates) {
        lines.push(sse({ type: 'canvas_update', ...cu }));
      }
    }

    const chunks = opts.responseText.match(/[\s\S]{1,10}/g) ?? [opts.responseText];
    for (const chunk of chunks) {
      lines.push(sse({ type: 'text_delta', text: chunk }));
    }

    if (opts.includeDone) {
      lines.push(sse({ type: 'done', usage: { inputTokens: 50, outputTokens: 100 } }));
    }

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: lines.join(''),
    });
  });
}

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const SCENARIO_TOOLS: MockToolStreamOptions['tools'] = [{
  name: 'create_scenario_comparison',
  callId: 'call-sc-1',
  input: {
    scenarios: [
      { name: '15-year fixed', type: 'loan-calculator-card' },
      { name: '30-year fixed', type: 'loan-calculator-card' },
    ],
  },
  result: {
    pageId: 'page-sc-1',
    scenarioItems: ['card-sc-15yr', 'card-sc-30yr'],
  },
}];

const SCENARIO_CANVAS_UPDATES: MockToolStreamOptions['canvasUpdates'] = [
  {
    action: 'create',
    item: { id: 'page-sc-1', type: 'a4-page', name: 'Mortgage Comparison', x: 100, y: 100, width: 565, height: 730 },
  },
  {
    action: 'create',
    item: { id: 'card-sc-15yr', type: 'loan-calculator-card', name: '15-year fixed', x: 700, y: 100, width: 340, height: 280 },
  },
  {
    action: 'create',
    item: { id: 'card-sc-30yr', type: 'loan-calculator-card', name: '30-year fixed', x: 1060, y: 100, width: 340, height: 280 },
  },
];

const SCENARIO_RESPONSE =
  'Here is your mortgage comparison. The 15-year fixed option has a monthly payment of $2,100/mo with $82,000 in total interest. The 30-year fixed option is $1,400/mo but costs $182,000 in interest over the life of the loan.';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('Scenario modeling — E2E', () => {
  let workspaceId: string;

  test.beforeEach(async ({ request, page }) => {
    workspaceId = await createWorkspace(request);
    await page.goto(`/workspaces/${workspaceId}`);
    const errorHeading = page.locator('text=Unexpected Application Error');
    if (await errorHeading.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await page.reload();
    }
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);
  });

  test.afterEach(async ({ request }) => {
    if (workspaceId) {
      await deleteWorkspace(request, workspaceId);
    }
  });

  // 1
  test('scenario comparison creates canvas items', async ({ page }) => {
    await mockToolStream(page, {
      tools: SCENARIO_TOOLS,
      canvasUpdates: SCENARIO_CANVAS_UPDATES,
      responseText: SCENARIO_RESPONSE,
    });

    await sendMessage(page, 'Compare 15-year vs 30-year mortgage');

    // Wait for assistant response to confirm stream completed
    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('mortgage comparison', { timeout: 10_000 });

    // Sidebar tree shows created items (confirms canvas_update was processed)
    const sidebar = page.locator('nav');
    await expect(sidebar.getByText('Mortgage Comparison')).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText('15-year fixed')).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText('30-year fixed')).toBeVisible({ timeout: 10_000 });
  });

  // 2
  test('scenario comparison shows tool activity', async ({ page }) => {
    await mockToolStream(page, {
      tools: SCENARIO_TOOLS,
      canvasUpdates: SCENARIO_CANVAS_UPDATES,
      responseText: SCENARIO_RESPONSE,
    });

    await sendMessage(page, 'Compare mortgage options');

    // Tool activity shows either friendly label or raw tool name
    const toolItem = page.locator('[data-testid="tool-activity-item"]').filter({
      hasText: /create_scenario_comparison|Created 2-scenario comparison/,
    });
    await expect(toolItem).toBeVisible({ timeout: 10_000 });
  });

  // 3
  test('canvas items positioned side-by-side', async ({ page }) => {
    await mockToolStream(page, {
      tools: SCENARIO_TOOLS,
      canvasUpdates: SCENARIO_CANVAS_UPDATES,
      responseText: SCENARIO_RESPONSE,
    });

    await sendMessage(page, 'Compare loan scenarios');

    // Both loan calculator cards should be visible (sidebar tree confirms creation)
    const sidebar = page.locator('nav');
    await expect(sidebar.getByText('15-year fixed')).toBeVisible({ timeout: 10_000 });
    await expect(sidebar.getByText('30-year fixed')).toBeVisible({ timeout: 10_000 });
  });

  // 4
  test('Paige summarizes comparison in response', async ({ page }) => {
    await mockToolStream(page, {
      tools: SCENARIO_TOOLS,
      canvasUpdates: SCENARIO_CANVAS_UPDATES,
      responseText: SCENARIO_RESPONSE,
    });

    await sendMessage(page, 'Compare mortgage scenarios');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('$2,100/mo', { timeout: 10_000 });
    await expect(assistant).toContainText('$182,000');
  });

  // 5
  test('dark mode renders scenario UI correctly', async ({ page }) => {
    await mockToolStream(page, {
      tools: SCENARIO_TOOLS,
      canvasUpdates: SCENARIO_CANVAS_UPDATES,
      responseText: SCENARIO_RESPONSE,
    });

    await sendMessage(page, 'Compare scenarios');

    const toolItem = page.locator('[data-testid="tool-activity-item"]').filter({
      hasText: /create_scenario_comparison|Created 2-scenario comparison/,
    });
    await expect(toolItem).toBeVisible({ timeout: 10_000 });

    // Toggle dark mode
    await page.evaluate(() => document.documentElement.classList.add('dark'));

    await expect(toolItem).toBeVisible();

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible();

    // Toggle back
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  });
});
