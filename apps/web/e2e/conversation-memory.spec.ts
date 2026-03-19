import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E Memory ${Date.now()}`, type: 'workspace' } } },
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

async function mockStreamResponse(page: Page, text: string): Promise<void> {
  const chunks = text.match(/[\s\S]{1,10}/g) ?? [text];

  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      sse({ type: 'message_start', messageId: 'test-msg-id' }),
    ];
    for (const chunk of chunks) {
      lines.push(sse({ type: 'text_delta', text: chunk }));
    }

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: lines.join(''),
    });
  });
}

// ---------------------------------------------------------------------------
// Conversation seeding helper
// ---------------------------------------------------------------------------

async function createConversationWithMessages(
  request: import('@playwright/test').APIRequestContext,
  workspaceId: string,
  title: string,
  userMessages: string[],
): Promise<string> {
  // Create conversation
  const createRes = await request.post(`${BASE}/trpc/chat.createConversation?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { workspaceId, title } } },
  });
  const createBody = JSON.parse(await createRes.text());
  const conversationId = createBody[0]?.result?.data?.json?.id;
  if (!conversationId) {
    throw new Error(`Failed to create conversation: ${await createRes.text()}`);
  }

  // Send user messages sequentially
  for (const msg of userMessages) {
    await request.post(`${BASE}/trpc/chat.sendMessage?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { conversationId, content: msg } } },
    });
  }

  return conversationId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('Conversation memory — E2E', () => {
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
  test('prior conversation context referenced in new chat', async ({ page, request }) => {
    // Seed a prior conversation about budgeting
    await createConversationWithMessages(request, workspaceId, 'Budget Planning', [
      'How should I allocate my monthly budget?',
      'What percentage should go to savings?',
      'How much for housing costs?',
      'What about entertainment spending?',
      'Can you summarize the budget breakdown?',
    ]);

    // Reload to pick up seeded conversation
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);

    // Start new conversation — click + button
    await page.locator('button[title="New conversation"]').click();

    // Mock response that references prior budget discussion
    await mockStreamResponse(page, 'Based on our earlier budget discussion, I recall we talked about allocating 50% to needs, 30% to wants, and 20% to savings.');

    await sendMessage(page, 'What did we discuss about my finances?');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('budget discussion', { timeout: 10_000 });
  });

  // 2
  test('no memory for first conversation in fresh workspace', async ({ page }) => {
    // No prior conversations seeded — this is a fresh workspace

    await mockStreamResponse(page, 'Welcome! I\'m Paige, your AI financial analyst. How can I help you today?');

    await sendMessage(page, 'Hello');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('Welcome', { timeout: 10_000 });
    // Should NOT reference prior conversations
    await expect(assistant).not.toContainText('earlier discussion');
    await expect(assistant).not.toContainText('previous conversation');
  });

  // 3
  test('multiple prior conversations referenced', async ({ page, request }) => {
    // Seed 3 conversations on different topics
    await createConversationWithMessages(request, workspaceId, 'Tax Strategy', [
      'What tax deductions can I claim?',
      'How do I optimize my tax bracket?',
    ]);
    await createConversationWithMessages(request, workspaceId, 'Investment Portfolio', [
      'Should I invest in index funds?',
      'What about bond allocation?',
    ]);
    await createConversationWithMessages(request, workspaceId, 'Monthly Budget', [
      'Help me create a zero-based budget',
      'How to reduce discretionary spending?',
    ]);

    // Reload to pick up seeded conversations
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);

    // Start new conversation
    await page.locator('button[title="New conversation"]').click();

    // Mock response mentioning all 3 prior topics
    await mockStreamResponse(page, 'Looking at your history, we\'ve covered tax strategy including deductions, your investment portfolio with index funds and bonds, and your monthly budget with zero-based budgeting.');

    await sendMessage(page, 'Give me a summary of everything we\'ve discussed');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('tax strategy', { timeout: 10_000 });
    await expect(assistant).toContainText('investment portfolio', { timeout: 10_000 });
    await expect(assistant).toContainText('monthly budget', { timeout: 10_000 });
  });

  // 4
  test('conversation list shows prior conversations', async ({ page, request }) => {
    // Seed 2 conversations with distinctive titles
    await createConversationWithMessages(request, workspaceId, 'Q1 Revenue Analysis', [
      'Show me Q1 revenue',
    ]);
    await createConversationWithMessages(request, workspaceId, 'Expense Tracking Setup', [
      'Help set up expense categories',
    ]);

    // Reload to pick up seeded conversations
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);

    // Click the conversation switcher dropdown
    const dropdownTrigger = page.locator('button[title="Switch conversation"]');
    await expect(dropdownTrigger).toBeVisible({ timeout: 10_000 });
    await dropdownTrigger.click();

    // Assert both conversation titles appear in the dropdown
    const convTabs = page.locator('[data-testid="conv-tab"]');
    await expect(convTabs.filter({ hasText: 'Q1 Revenue Analysis' })).toBeVisible({ timeout: 5_000 });
    await expect(convTabs.filter({ hasText: 'Expense Tracking Setup' })).toBeVisible({ timeout: 5_000 });
  });
});
