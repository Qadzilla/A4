import { type Page, expect, test } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3000';

/** Create a workspace via tRPC and return its id. */
async function createWorkspace(request: import('@playwright/test').APIRequestContext): Promise<string> {
  const res = await request.post(`${BASE}/trpc/workspace.create?batch=1`, {
    headers: { 'Content-Type': 'application/json' },
    data: { '0': { json: { name: `E2E Chat ${Date.now()}`, type: 'workspace' } } },
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


/** Open the chat panel by clicking the "AI Chat" button. */
async function openChatPanel(page: Page): Promise<void> {
  await page.locator('button', { hasText: 'AI Chat' }).click();
  await page.locator('textarea[placeholder="Ask Paige anything..."]').waitFor({ state: 'visible' });
}

/**
 * Mock SSE route that streams text chunks WITHOUT a `done` event.
 * The streaming content stays visible because isStreaming remains true.
 * This is the only reliable way to assert on streamed content in E2E tests
 * since `done` clears streamingContent and triggers a DB refetch.
 */
async function mockStreamResponse(page: Page, text: string): Promise<void> {
  // [\s\S] matches newlines too (`.` doesn't by default)
  const chunks = text.match(/[\s\S]{1,10}/g) ?? [text];

  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      `data: ${JSON.stringify({ type: 'message_start', messageId: 'test-msg-id' })}\n\n`,
    ];
    for (const chunk of chunks) {
      lines.push(`data: ${JSON.stringify({ type: 'text_delta', text: chunk })}\n\n`);
    }
    // Deliberately omit `done` event — streaming content persists in the UI

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

/**
 * Mock SSE route that streams text AND sends `done`.
 * The done event clears streaming content and refetches from DB.
 * Use this when testing post-stream behavior.
 */
async function mockStreamResponseWithDone(page: Page, text: string): Promise<void> {
  const chunks = text.match(/[\s\S]{1,10}/g) ?? [text];

  await page.route('**/api/chat/stream', async (route) => {
    const lines: string[] = [
      `data: ${JSON.stringify({ type: 'message_start', messageId: 'test-msg-id' })}\n\n`,
    ];
    for (const chunk of chunks) {
      lines.push(`data: ${JSON.stringify({ type: 'text_delta', text: chunk })}\n\n`);
    }
    lines.push(
      `data: ${JSON.stringify({ type: 'done', usage: { inputTokens: 10, outputTokens: 20 } })}\n\n`,
    );

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

/** Mock SSE route that returns an error event. */
async function mockStreamError(page: Page, message: string): Promise<void> {
  await page.route('**/api/chat/stream', async (route) => {
    const body = [
      `data: ${JSON.stringify({ type: 'message_start', messageId: 'test-err-id' })}\n\n`,
      `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
    ].join('');

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body,
    });
  });
}

/** Type a message and press Enter. */
async function sendMessage(page: Page, text: string): Promise<void> {
  const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
  await textarea.fill(text);
  await textarea.press('Enter');
}

/** Find a conversation tab by text pattern. */
function getConversationTab(page: Page, textPattern: RegExp) {
  return page.locator('[data-testid="conv-tab"]').filter({ hasText: textPattern }).first();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial' });
test.describe('Chat E2E', () => {
  let workspaceId: string;

  test.beforeEach(async ({ request, page }) => {
    workspaceId = await createWorkspace(request);
    await page.goto(`/workspaces/${workspaceId}`);
    // Retry on Vite HMR stale module errors
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
  test('sends a message and receives a streaming response', async ({ page }) => {
    await mockStreamResponse(page, 'Hello! How can I help you today?');
    await sendMessage(page, 'Hello');

    // User message bubble
    await expect(page.locator('[data-testid="chat-message"]').filter({ hasText: 'Hello' })).toBeVisible({
      timeout: 10_000,
    });

    // Assistant streaming response (stays visible since no `done` event)
    await expect(
      page.locator('[data-testid="chat-message-assistant"]').filter({ hasText: 'Hello! How can I help you today?' }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 2
  test('persists messages across page reload', async ({ page }) => {
    // Send a message with done (creates conversation + persists user message in DB)
    await mockStreamResponseWithDone(page, 'AI reply.');
    await sendMessage(page, 'Remember this');
    await expect(page.locator('[data-testid="chat-message"]').filter({ hasText: 'Remember this' })).toBeVisible({ timeout: 10_000 });

    // Reload and re-open chat
    await page.reload();
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);

    // Open conversation dropdown and click the conversation
    const dropdownTrigger = page.locator('button[title="Switch conversation"]');
    await expect(dropdownTrigger).toBeVisible({ timeout: 5_000 });
    await dropdownTrigger.click();
    const convTab = page.locator('[data-testid="conv-tab"]').first();
    await expect(convTab).toBeVisible({ timeout: 5_000 });
    await convTab.click();

    // User message should be visible from DB (the AI reply won't be since it was mocked)
    await expect(page.locator('[data-testid="chat-message"]').filter({ hasText: 'Remember this' })).toBeVisible({
      timeout: 10_000,
    });
  });

  // 3
  test('creates a new conversation on first message', async ({ page }) => {
    // Initially shows "New" tab indicator
    await expect(page.locator('[data-testid="conv-tab-new"]')).toBeVisible();

    await mockStreamResponse(page, 'Response to first message.');
    await sendMessage(page, 'First message');

    // Wait for the user message to appear (proves conversation was created)
    await expect(page.locator('[data-testid="chat-message"]').filter({ hasText: 'First message' })).toBeVisible({
      timeout: 10_000,
    });

    // The "New" tab should disappear once a conversation is active
    await expect(page.locator('[data-testid="conv-tab-new"]')).not.toBeVisible({ timeout: 5_000 });
  });

  // 4
  test('switches between conversations', async ({ page, request }) => {
    // Create two conversations directly via API for reliability
    const conv1Res = await request.post(`${BASE}/trpc/chat.createConversation?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { workspaceId } } },
    });
    const conv1Id = (await conv1Res.json())[0].result.data.json.id;
    await request.post(`${BASE}/trpc/chat.sendMessage?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { conversationId: conv1Id, content: 'Unique msg alpha' } } },
    });

    const conv2Res = await request.post(`${BASE}/trpc/chat.createConversation?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { workspaceId } } },
    });
    const conv2Id = (await conv2Res.json())[0].result.data.json.id;
    await request.post(`${BASE}/trpc/chat.sendMessage?batch=1`, {
      headers: { 'Content-Type': 'application/json' },
      data: { '0': { json: { conversationId: conv2Id, content: 'Unique msg beta' } } },
    });

    // Navigate fresh to workspace and open chat
    await page.goto(`/workspaces/${workspaceId}`);
    await page.waitForLoadState('networkidle');
    await openChatPanel(page);

    // Open conversation dropdown and click the first conversation
    const dropdownTrigger = page.locator('button[title="Switch conversation"]');
    await expect(dropdownTrigger).toBeVisible({ timeout: 5_000 });
    await dropdownTrigger.click();
    const convTabs = page.locator('[data-testid="conv-tab"]');
    await expect(convTabs.first()).toBeVisible({ timeout: 5_000 });
    await convTabs.first().click();

    // Wait for a user message bubble to appear
    const chatArea = page.locator('[data-testid="chat-messages"]');
    const userMsgBubble = chatArea.locator('[data-testid="chat-message"]');
    await expect(userMsgBubble.first()).toBeVisible({ timeout: 10_000 });
    const firstConvMessage = await userMsgBubble.first().textContent();
    expect(firstConvMessage).toBeTruthy();

    // Switch to the second conversation via dropdown
    await dropdownTrigger.click();
    await expect(convTabs.last()).toBeVisible({ timeout: 5_000 });
    await convTabs.last().click();

    // Wait until the displayed message changes
    await expect(async () => {
      const text = await userMsgBubble.first().textContent();
      expect(text).toBeTruthy();
      expect(text).not.toEqual(firstConvMessage);
    }).toPass({ timeout: 10_000 });
  });

  // 5
  test('deletes a conversation', async ({ page }) => {
    // Create a conversation via UI (with done so stream completes)
    await mockStreamResponseWithDone(page, 'To be deleted.');
    await sendMessage(page, 'Delete me');
    await expect(page.locator('[data-testid="chat-message"]').filter({ hasText: 'Delete me' })).toBeVisible({ timeout: 10_000 });

    // Open dropdown, hover tab and click delete
    await page.unroute('**/api/chat/stream');
    const dropdownTrigger = page.locator('button[title="Switch conversation"]');
    await expect(dropdownTrigger).toBeVisible({ timeout: 5_000 });
    await dropdownTrigger.click();
    const convTab = page.locator('[data-testid="conv-tab"]').first();
    await expect(convTab).toBeVisible({ timeout: 5_000 });
    await convTab.hover();
    await convTab.locator('[data-testid="conv-delete"]').click();

    // Should show empty state with Paige welcome
    await expect(page.getByText(/I'm Paige/)).toBeVisible({ timeout: 5_000 });
  });

  // 6
  test('disables send button while streaming', async ({ page }) => {
    // Mock without done — streaming stays active, send button stays disabled
    await mockStreamResponse(page, 'Thinking...');

    const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
    await textarea.fill('Test streaming');
    await textarea.press('Enter');

    // Wait for streaming content to appear
    await expect(
      page.locator('[data-testid="chat-message-assistant"]').filter({ hasText: 'Thinking...' }),
    ).toBeVisible({ timeout: 10_000 });

    // Send button should be disabled during streaming
    const sendBtn = page.locator('[data-testid="chat-send-btn"]');
    await expect(sendBtn).toBeDisabled();
  });

  // 7
  test('handles stream errors gracefully', async ({ page }) => {
    await mockStreamError(page, 'AI service is busy. Please try again in a moment.');
    await sendMessage(page, 'Trigger error');

    // Error banner should appear
    await expect(
      page.locator('[class*="bg-destructive"]').filter({ hasText: 'sending messages too quickly' }),
    ).toBeVisible({ timeout: 10_000 });

    // Input should still be editable
    const textarea = page.locator('textarea[placeholder="Ask Paige anything..."]');
    await expect(textarea).toBeEditable();
  });

  // 8
  test('auto-scrolls to latest message', async ({ page }) => {
    // Send multiple messages via UI to overflow the chat area
    for (let i = 0; i < 5; i++) {
      await page.unroute('**/api/chat/stream');
      await mockStreamResponseWithDone(page, `Response ${i + 1}: ${'lorem ipsum dolor sit amet. '.repeat(3)}`);
      await sendMessage(page, `Msg ${i + 1}: ${'padding text to make messages longer. '.repeat(2)}`);

      // Wait for user message to appear from DB (after done + invalidation)
      await expect(
        page.locator('[data-testid="chat-message"]').filter({ hasText: `Msg ${i + 1}` }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }

    // Wait for smooth scroll animation to complete
    const container = page.locator('[data-testid="chat-messages"]');
    await expect(async () => {
      const scrollInfo = await container.evaluate((el) => ({
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollInfo.scrollTop + scrollInfo.clientHeight).toBeGreaterThan(
        scrollInfo.scrollHeight - 200,
      );
    }).toPass({ timeout: 5_000 });
  });

  // 9
  test('renders markdown in assistant responses', async ({ page }) => {
    const markdown = '**bold** text\n- item 1\n- item 2\n\n```js\nconst x = 1;\n```';
    await mockStreamResponse(page, markdown);
    await sendMessage(page, 'Show me markdown');

    // Wait for assistant bubble with streaming content
    const assistantBubble = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(assistantBubble).toBeVisible({ timeout: 10_000 });

    // Bold text
    await expect(assistantBubble.locator('strong')).toContainText('bold');

    // List items
    await expect(assistantBubble.locator('ul')).toBeVisible();
    await expect(assistantBubble.locator('li').first()).toContainText('item 1');

    // Code block
    await expect(assistantBubble.locator('pre')).toBeVisible();
    await expect(assistantBubble.locator('code')).toContainText('const x = 1');
  });
});
