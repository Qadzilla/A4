import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers (shared pattern with chat.spec.ts / chat-tools.spec.ts)
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E RAG ${Date.now()}`, type: 'workspace' } } },
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
// Citation-specific helpers
// ---------------------------------------------------------------------------

interface Citation {
  index: number;
  fileId: string;
  fileName: string;
  chunkContent: string;
  score: number;
}

/**
 * Mock SSE stream WITHOUT done — streaming content persists in UI.
 * Used to test streaming-state behavior (citations as plain text).
 */
async function mockStreamResponse(page: Page, text: string): Promise<void> {
  const chunks = text.match(/[\s\S]{1,10}/g) ?? [text];

  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [sse({ type: 'message_start', messageId: 'test-rag-msg' })];
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

/**
 * Mock SSE stream WITH done + mock getConversation tRPC to return messages with citations.
 * After `done`, useChat invalidates getConversation — we intercept to return citation data.
 */
async function mockStreamWithCitations(
  page: Page,
  opts: {
    text: string;
    citations: Citation[];
    userMessage?: string;
    conversationId?: string;
  },
): Promise<void> {
  const convId = opts.conversationId ?? 'test-conv-rag';
  const chunks = opts.text.match(/[\s\S]{1,10}/g) ?? [opts.text];

  // Mock SSE stream with done
  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [sse({ type: 'message_start', messageId: 'test-rag-msg' })];
    for (const chunk of chunks) {
      lines.push(sse({ type: 'text_delta', text: chunk }));
    }
    lines.push(sse({ type: 'done', usage: { inputTokens: 10, outputTokens: 20 } }));
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: lines.join(''),
    });
  });

  // Mock getConversation tRPC to return messages with citations
  // This intercepts the refetch after `done` fires
  await page.route('**/trpc/chat.getConversation*', async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        result: {
          data: {
            json: {
              id: convId,
              workspaceId: 'test-ws',
              userId: 'test-user',
              title: 'Test Conversation',
              createdAt: now,
              updatedAt: now,
              messages: [
                {
                  id: 'msg-user-1',
                  conversationId: convId,
                  userId: 'test-user',
                  role: 'user',
                  content: opts.userMessage ?? 'Test question',
                  tokenCount: null,
                  model: null,
                  citations: null,
                  toolCalls: null,
                  createdAt: now,
                },
                {
                  id: 'msg-assistant-1',
                  conversationId: convId,
                  userId: '',
                  role: 'assistant',
                  content: opts.text,
                  tokenCount: 20,
                  model: 'claude-sonnet-4-20250514',
                  citations: JSON.stringify(opts.citations),
                  toolCalls: null,
                  createdAt: now,
                },
              ],
            },
          },
        },
      }]),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('RAG Citations E2E', () => {
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
  test('citation markers render as plain text during streaming', async ({ page }) => {
    await mockStreamResponse(page, 'Based on [1] and [2], your revenue is growing.');
    await sendMessage(page, 'Analyze my data');

    // Streaming assistant bubble should show the text
    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('Based on', { timeout: 10_000 });
    await expect(assistant).toContainText('[1]');
    await expect(assistant).toContainText('[2]');

    // During streaming, no citation badge buttons should exist
    await expect(assistant.locator('[data-testid="citation-badge"]')).toHaveCount(0);
  });

  // 2
  test('Sources section renders with citation details', async ({ page }) => {
    const citations: Citation[] = [
      { index: 1, fileId: 'file-1', fileName: 'Q4-Report.pdf', chunkContent: 'Revenue grew 15% quarter over quarter...', score: 0.92 },
      { index: 2, fileId: 'file-2', fileName: 'Budget-2025.xlsx', chunkContent: 'Total allocated budget for marketing...', score: 0.85 },
    ];

    await mockStreamWithCitations(page, {
      text: 'Based on [1] and [2], your finances look strong.',
      citations,
      userMessage: 'How are my finances?',
    });

    await sendMessage(page, 'How are my finances?');

    // Wait for refetched assistant message
    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    // Sources section should exist
    const sources = assistant.locator('[data-testid="citation-sources"]');
    await expect(sources).toBeVisible({ timeout: 5_000 });

    // Summary text
    const toggle = sources.locator('[data-testid="citation-sources-toggle"]');
    await expect(toggle).toContainText('Sources (2)');

    // Expand sources
    await toggle.click();

    // Assert source items
    const items = sources.locator('[data-testid="citation-source-item"]');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Q4-Report.pdf');
    await expect(items.first()).toContainText('92%');
    await expect(items.last()).toContainText('Budget-2025.xlsx');
    await expect(items.last()).toContainText('85%');
  });

  // 3
  test('citation badges are clickable buttons after finalization', async ({ page }) => {
    const citations: Citation[] = [
      { index: 1, fileId: 'file-abc', fileName: 'Invoice-Jan.pdf', chunkContent: 'Total amount due...', score: 0.88 },
    ];

    await mockStreamWithCitations(page, {
      text: 'According to [1], the invoice total is $5,000.',
      citations,
    });

    await sendMessage(page, 'Show invoice');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    // Badge button should exist with text "1"
    const badge = assistant.locator('[data-testid="citation-badge"]');
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await expect(badge).toHaveText('1');

    // Badge should have title matching the file name
    await expect(badge).toHaveAttribute('title', 'Invoice-Jan.pdf');
  });

  // 4
  test('chat works without citations', async ({ page }) => {
    await mockStreamResponse(page, 'Here is a plain response with no citations at all.');
    await sendMessage(page, 'Tell me something');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toContainText('plain response', { timeout: 10_000 });

    // No Sources section
    await expect(assistant.locator('[data-testid="citation-sources"]')).toHaveCount(0);

    // No citation badges
    await expect(assistant.locator('[data-testid="citation-badge"]')).toHaveCount(0);
  });

  // 5
  test('Sources section is collapsible', async ({ page }) => {
    const citations: Citation[] = [
      { index: 1, fileId: 'f1', fileName: 'Doc1.pdf', chunkContent: 'Content one...', score: 0.9 },
      { index: 2, fileId: 'f2', fileName: 'Doc2.csv', chunkContent: 'Content two...', score: 0.8 },
    ];

    await mockStreamWithCitations(page, {
      text: 'See [1] and [2] for details.',
      citations,
    });

    await sendMessage(page, 'Show sources');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    const sources = assistant.locator('[data-testid="citation-sources"]');
    await expect(sources).toBeVisible({ timeout: 5_000 });

    const toggle = sources.locator('[data-testid="citation-sources-toggle"]');
    const items = sources.locator('[data-testid="citation-source-item"]');

    // Initially collapsed — source items not visible
    await expect(items.first()).not.toBeVisible();

    // Expand
    await toggle.click();
    await expect(items.first()).toBeVisible();
    await expect(items).toHaveCount(2);

    // Collapse again
    await toggle.click();
    await expect(items.first()).not.toBeVisible();
  });

  // 6
  test('multiple citations from same response render correctly', async ({ page }) => {
    const citations: Citation[] = [
      { index: 1, fileId: 'f1', fileName: 'Report-A.pdf', chunkContent: 'First chunk...', score: 0.95 },
      { index: 2, fileId: 'f2', fileName: 'Report-B.xlsx', chunkContent: 'Second chunk...', score: 0.87 },
      { index: 3, fileId: 'f3', fileName: 'Report-C.csv', chunkContent: 'Third chunk...', score: 0.72 },
    ];

    await mockStreamWithCitations(page, {
      text: 'From [1], [2], and [3] we can conclude growth is steady.',
      citations,
    });

    await sendMessage(page, 'Summarize reports');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    // 3 badge buttons
    const badges = assistant.locator('[data-testid="citation-badge"]');
    await expect(badges).toHaveCount(3, { timeout: 5_000 });

    // Sources section shows count
    const sources = assistant.locator('[data-testid="citation-sources"]');
    const toggle = sources.locator('[data-testid="citation-sources-toggle"]');
    await expect(toggle).toContainText('Sources (3)');
  });

  // 7
  test('citation badge click does not throw errors', async ({ page }) => {
    const citations: Citation[] = [
      { index: 1, fileId: 'file-click-test', fileName: 'Clickable.pdf', chunkContent: 'Click test...', score: 0.91 },
    ];

    await mockStreamWithCitations(page, {
      text: 'Check [1] for the full details.',
      citations,
    });

    await sendMessage(page, 'Check details');

    const assistant = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistant).toBeVisible({ timeout: 10_000 });

    const badge = assistant.locator('[data-testid="citation-badge"]');
    await expect(badge).toBeVisible({ timeout: 5_000 });

    // Collect any page errors during click
    const errors: Error[] = [];
    page.on('pageerror', (err) => errors.push(err));

    await badge.click();

    // No JS errors should have been thrown
    expect(errors).toHaveLength(0);

    // Page should still be functional — textarea editable
    const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
    await expect(textarea).toBeEditable();
  });
});
