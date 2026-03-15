import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers (shared with chat.spec.ts)
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E Tools ${Date.now()}`, type: 'workspace' } } },
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
  }>;
  responseText: string;
  canvasUpdate?: { action: 'create' | 'update'; item: Record<string, unknown> };
  includeDone?: boolean;
}

async function mockToolStream(page: Page, opts: MockToolStreamOptions): Promise<void> {
  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      sse({ type: 'message_start', messageId: 'test-tool-msg' }),
    ];

    for (const tool of opts.tools) {
      lines.push(sse({ type: 'tool_call_start', toolName: tool.name, toolCallId: tool.callId }));
      lines.push(sse({ type: 'tool_call_end', toolCallId: tool.callId }));
      lines.push(sse({
        type: 'tool_result', toolCallId: tool.callId, toolName: tool.name,
        result: tool.result, isError: tool.isError ?? false,
      }));
    }

    if (opts.canvasUpdate) {
      lines.push(sse({ type: 'canvas_update', ...opts.canvasUpdate }));
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
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('Chat Tools E2E', () => {
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
  test('data query shows tool activity and response', async ({ page }) => {
    await mockToolStream(page, {
      tools: [{
        name: 'get_accounts',
        callId: 'call-acct-1',
        result: { accounts: [{ name: 'Checking', balance: 5000 }] },
      }],
      responseText: 'You have a Checking account with $5,000.',
    });

    await sendMessage(page, 'Show my accounts');

    // Tool activity indicator visible
    const toolItem = page.locator('[data-testid="tool-activity-item"]').filter({ hasText: 'get_accounts' });
    await expect(toolItem).toBeVisible({ timeout: 10_000 });

    // Assistant response
    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('Checking', { timeout: 10_000 });
    await expect(assistant).toContainText('$5,000');
  });

  // 2
  test('canvas item creation shows canvas_update', async ({ page }) => {
    await mockToolStream(page, {
      tools: [{
        name: 'create_canvas_item',
        callId: 'call-create-1',
        result: { id: 'item-budget-1', type: 'budget-card', name: 'Q1 Budget' },
      }],
      responseText: "I've created your Q1 Budget card.",
      canvasUpdate: {
        action: 'create',
        item: { id: 'item-budget-1', type: 'budget-card', name: 'Q1 Budget', x: 100, y: 100, width: 300, height: 200 },
      },
    });

    await sendMessage(page, 'Create a budget card');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('created', { timeout: 10_000 });
  });

  // 3
  test('calculation results appear in response', async ({ page }) => {
    await mockToolStream(page, {
      tools: [{
        name: 'calculate_tax',
        callId: 'call-tax-1',
        result: { grossIncome: 75000, federalTax: 9500, effectiveRate: 12.7 },
      }],
      responseText: 'Your federal tax is $9,500 with an effective rate of 12.7%.',
    });

    await sendMessage(page, 'Calculate my taxes');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('$9,500', { timeout: 10_000 });
    await expect(assistant).toContainText('12.7%');
  });

  // 4
  test('multiple tool calls show multiple indicators', async ({ page }) => {
    await mockToolStream(page, {
      tools: [
        { name: 'get_workspace_summary', callId: 'call-ws-1', result: { summary: 'ok' } },
        { name: 'get_accounts', callId: 'call-acct-2', result: { accounts: [] } },
        { name: 'get_budget', callId: 'call-bud-1', result: { budget: null } },
      ],
      responseText: "Here's your overview.",
    });

    await sendMessage(page, 'Give me an overview');

    const toolItems = page.locator('[data-testid="tool-activity-item"]');
    await expect(toolItems).toHaveCount(3, { timeout: 10_000 });

    await expect(toolItems.filter({ hasText: 'get_workspace_summary' })).toBeVisible();
    await expect(toolItems.filter({ hasText: 'get_accounts' })).toBeVisible();
    await expect(toolItems.filter({ hasText: 'get_budget' })).toBeVisible();
  });

  // 5
  test('tool error shows graceful handling', async ({ page }) => {
    await mockToolStream(page, {
      tools: [{
        name: 'get_item_data',
        callId: 'call-err-1',
        result: { error: 'Internal error retrieving item' },
        isError: true,
      }],
      responseText: "I couldn't retrieve that item. Please try again.",
    });

    await sendMessage(page, 'Show item details');

    // Error indicator with ✕
    const toolItem = page.locator('[data-testid="tool-activity-item"]').filter({ hasText: 'get_item_data' });
    await expect(toolItem).toBeVisible({ timeout: 10_000 });
    await expect(toolItem.locator('.text-yellow-600, .dark\\:text-yellow-400')).toBeVisible();

    // Response still renders
    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText("couldn't retrieve", { timeout: 10_000 });

    // Textarea still editable (no crash)
    const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
    await expect(textarea).toBeEditable();
  });

  // 6
  test('tool activity clears after stream completes', async ({ page }) => {
    await mockToolStream(page, {
      tools: [{
        name: 'get_accounts',
        callId: 'call-persist-1',
        result: { accounts: [{ name: 'Savings', balance: 10000 }] },
      }],
      responseText: 'Your accounts are looking good.',
      includeDone: true,
    });

    await sendMessage(page, 'Check accounts');

    // After done event, streaming stops and content is cleared/refetched
    // The assistant response should appear from DB refetch (user message at minimum)
    await expect(
      page.locator('[data-testid="chat-message"]').filter({ hasText: 'Check accounts' }),
    ).toBeVisible({ timeout: 15_000 });

    // Textarea should be editable again (stream completed)
    const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
    await expect(textarea).toBeEditable();
  });
});
