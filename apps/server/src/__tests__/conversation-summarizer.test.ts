import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { conversations, messages } from '../db/schema';

// Mock the anthropic service
vi.mock('../services/anthropic', () => ({
  chatCompletion: vi.fn(),
  isByokAnthropicUser: vi.fn(async () => false),
}));

import { chatCompletion } from '../services/anthropic';
import { summarizeConversation } from '../services/conversation-summarizer';

const mockChatCompletion = chatCompletion as ReturnType<typeof vi.fn>;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      summary TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER,
      model TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

function seedConversation(
  db: ReturnType<typeof createTestDb>,
  id: string,
  opts?: { summary?: string; updatedAt?: Date },
) {
  const now = opts?.updatedAt ?? new Date();
  return db.insert(conversations).values({
    id,
    workspaceId: 'ws-1',
    userId: 'user-1',
    model: 'claude-sonnet-4-6',
    createdAt: now,
    updatedAt: now,
    summary: opts?.summary ?? null,
  });
}

function seedMessages(
  db: ReturnType<typeof createTestDb>,
  conversationId: string,
  msgs: Array<{ role: string; content: string }>,
) {
  const base = new Date('2026-03-01T10:00:00Z').getTime();
  return db.insert(messages).values(
    msgs.map((m, i) => ({
      id: `msg-${conversationId}-${i}`,
      conversationId,
      userId: 'user-1',
      role: m.role,
      content: m.content,
      createdAt: new Date(base + i * 60_000),
    })),
  );
}

describe('summarizeConversation', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    mockChatCompletion.mockReset();
  });

  it('generates summary when conversation has 4+ user messages', async () => {
    await seedConversation(db, 'conv-1');
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'What was Q1 revenue?' },
      { role: 'assistant', content: 'Q1 revenue was $500k.' },
      { role: 'user', content: 'And Q2?' },
      { role: 'assistant', content: 'Q2 was $600k.' },
      { role: 'user', content: 'Compare them.' },
      { role: 'user', content: 'Also show margins.' },
    ]);

    mockChatCompletion.mockResolvedValueOnce('Discussed Q1 ($500k) and Q2 ($600k) revenue with margin comparison.');

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).toHaveBeenCalledOnce();
    expect(mockChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 200,
        temperature: 0,
      }),
    );

    const [conv] = await db.select().from(conversations);
    expect(conv?.summary).toBe('Discussed Q1 ($500k) and Q2 ($600k) revenue with margin comparison.');
  });

  it('skips summarization when fewer than 4 user messages', async () => {
    await seedConversation(db, 'conv-1');
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'What is revenue?' },
    ]);

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).not.toHaveBeenCalled();
    const [conv] = await db.select().from(conversations);
    expect(conv?.summary).toBeNull();
  });

  it('skips summarization when summary was updated within 10 minutes', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    await seedConversation(db, 'conv-1', { summary: 'Old summary', updatedAt: fiveMinAgo });
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Q1?' },
      { role: 'user', content: 'Q2?' },
      { role: 'user', content: 'Q3?' },
      { role: 'user', content: 'Q4?' },
    ]);

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).not.toHaveBeenCalled();
  });

  it('re-summarizes when summary is older than 10 minutes', async () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    await seedConversation(db, 'conv-1', { summary: 'Stale summary', updatedAt: fifteenMinAgo });
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Q1?' },
      { role: 'user', content: 'Q2?' },
      { role: 'user', content: 'Q3?' },
      { role: 'user', content: 'Q4?' },
    ]);

    mockChatCompletion.mockResolvedValueOnce('Updated summary.');

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).toHaveBeenCalledOnce();
    const [conv] = await db.select().from(conversations);
    expect(conv?.summary).toBe('Updated summary.');
  });

  it('excludes tool messages from summarization prompt', async () => {
    await seedConversation(db, 'conv-1');
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Query revenue' },
      { role: 'user', content: 'Show expenses' },
      { role: 'user', content: 'Compare them' },
      { role: 'user', content: 'Summarize findings' },
      { role: 'assistant', content: 'Let me look that up.' },
      { role: 'tool', content: '{"result": 42}' },
    ]);

    mockChatCompletion.mockResolvedValueOnce('Summary without tool data.');

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).toHaveBeenCalledOnce();
    const callArgs = mockChatCompletion.mock.calls[0]![0];
    const promptContent = callArgs.messages[0].content as string;
    expect(promptContent).not.toContain('Tool:');
    expect(promptContent).not.toContain('{"result": 42}');
  });

  it('truncates to 50 most recent messages for long conversations', async () => {
    await seedConversation(db, 'conv-1');
    const manyMessages: Array<{ role: string; content: string }> = [];
    for (let i = 0; i < 80; i++) {
      manyMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });
    }
    await seedMessages(db, 'conv-1', manyMessages);

    mockChatCompletion.mockResolvedValueOnce('Long conversation summary.');

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).toHaveBeenCalledOnce();
    const callArgs = mockChatCompletion.mock.calls[0]![0];
    const promptContent = callArgs.messages[0].content as string;
    const lines = promptContent.split('\n\n');
    expect(lines.length).toBeLessThanOrEqual(50);
  });

  it('handles API errors gracefully', async () => {
    await seedConversation(db, 'conv-1');
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Q1?' },
      { role: 'user', content: 'Q2?' },
      { role: 'user', content: 'Q3?' },
      { role: 'user', content: 'Q4?' },
    ]);

    mockChatCompletion.mockRejectedValueOnce(new Error('API down'));

    // Should not throw
    await expect(summarizeConversation(db, 'conv-1')).resolves.toBeUndefined();

    const [conv] = await db.select().from(conversations);
    expect(conv?.summary).toBeNull();
  });

  it('handles empty assistant content', async () => {
    await seedConversation(db, 'conv-1');
    await seedMessages(db, 'conv-1', [
      { role: 'user', content: 'Q1?' },
      { role: 'user', content: 'Q2?' },
      { role: 'user', content: 'Q3?' },
      { role: 'user', content: 'Q4?' },
      { role: 'assistant', content: '' },
      { role: 'assistant', content: 'Real response here.' },
    ]);

    mockChatCompletion.mockResolvedValueOnce('Summary.');

    await summarizeConversation(db, 'conv-1');

    expect(mockChatCompletion).toHaveBeenCalledOnce();
    const callArgs = mockChatCompletion.mock.calls[0]![0];
    const promptContent = callArgs.messages[0].content as string;
    expect(promptContent).not.toContain('Assistant: \n');
    expect(promptContent).toContain('Assistant: Real response here.');
  });
});
