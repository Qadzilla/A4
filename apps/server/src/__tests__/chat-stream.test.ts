import http from 'node:http';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { conversations, messages } from '../db/schema';

// Create a mutable db ref that tests can swap
const dbRef = { current: null as any };

vi.mock('../db', () => ({
  get db() {
    return dbRef.current;
  },
}));
vi.mock('../env', () => ({
  get DEV_AUTH_BYPASS() {
    return envRef.devBypass;
  },
}));
vi.mock('../services/anthropic', () => ({
  streamChatCompletion: vi.fn(),
  AnthropicServiceError: class AnthropicServiceError extends Error {
    type: string;
    constructor(type: string, message: string) {
      super(message);
      this.type = type;
      this.name = 'AnthropicServiceError';
    }
  },
}));
vi.mock('../services/ai-context', () => ({
  buildWorkspaceContext: vi.fn().mockResolvedValue('You are Paige, a financial AI assistant.'),
}));

const envRef = { devBypass: true };

import { chatStreamRouter } from '../routes/chat-stream';
import { AnthropicServiceError, streamChatCompletion } from '../services/anthropic';

const mockStreamChatCompletion = streamChatCompletion as ReturnType<typeof vi.fn>;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      thumbnail TEXT,
      type TEXT NOT NULL DEFAULT 'workspace',
      parent_id TEXT,
      deleted_at INTEGER
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
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
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

// Mock async iterable for Anthropic stream
async function* mockAnthropicStream(
  texts: string[],
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  yield { type: 'message_start', message: { usage: { input_tokens: usage.input_tokens } } };
  for (const text of texts) {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
  }
  yield { type: 'message_delta', usage: { output_tokens: usage.output_tokens } };
  yield { type: 'message_stop' };
}

// Parse SSE response body into events
function parseSSE(body: string): any[] {
  return body
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.replace('data: ', '')));
}

// Helper to make POST request and collect SSE response
function postStream(
  port: number,
  body: object,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/chat/stream',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode!, headers: res.headers, body });
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('POST /api/chat/stream', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.use('/api/chat/stream', express.json());
    app.use('/api/chat/stream', chatStreamRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    dbRef.current = createTestDb();
    envRef.devBypass = true;
    vi.clearAllMocks();
  });

  async function seedConversation(userId = 'dev-user-001') {
    const now = new Date();
    await dbRef.current.insert(schema.workspaces).values({
      id: 'ws-1',
      name: 'Test Workspace',
      userId,
      type: 'workspace',
      createdAt: now,
      updatedAt: now,
    });
    await dbRef.current.insert(conversations).values({
      id: 'conv-1',
      workspaceId: 'ws-1',
      userId,
      model: 'claude-sonnet-4-6',
      createdAt: now,
      updatedAt: now,
    });
    await dbRef.current.insert(messages).values({
      id: 'msg-1',
      conversationId: 'conv-1',
      userId,
      role: 'user',
      content: 'Hello',
      createdAt: now,
    });
  }

  it('returns 401 without auth', async () => {
    envRef.devBypass = false;
    const result = await postStream(port, { conversationId: 'conv-1' });
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 if conversationId is missing', async () => {
    const result = await postStream(port, {});
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('conversationId is required');
  });

  it('returns 404 for non-existent conversation', async () => {
    await seedConversation();
    const result = await postStream(port, { conversationId: 'nonexistent' });
    expect(result.statusCode).toBe(404);
  });

  it("returns 404 for other user's conversation", async () => {
    await seedConversation('other-user');
    const result = await postStream(port, { conversationId: 'conv-1' });
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 if conversation has no messages', async () => {
    const now = new Date();
    await dbRef.current.insert(schema.workspaces).values({
      id: 'ws-1',
      name: 'Test',
      userId: 'dev-user-001',
      type: 'workspace',
      createdAt: now,
      updatedAt: now,
    });
    await dbRef.current.insert(conversations).values({
      id: 'conv-1',
      workspaceId: 'ws-1',
      userId: 'dev-user-001',
      model: 'claude-sonnet-4-6',
      createdAt: now,
      updatedAt: now,
    });

    const result = await postStream(port, { conversationId: 'conv-1' });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Conversation has no messages');
  });

  it('streams text_delta events', async () => {
    await seedConversation();
    mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Hello', ' world']));

    const result = await postStream(port, { conversationId: 'conv-1' });
    expect(result.statusCode).toBe(200);
    expect(result.headers['content-type']).toBe('text/event-stream');

    const events = parseSSE(result.body);
    expect(events[0]).toEqual({ type: 'message_start', messageId: expect.any(String) });
    expect(events[1]).toEqual({ type: 'text_delta', text: 'Hello' });
    expect(events[2]).toEqual({ type: 'text_delta', text: ' world' });
  });

  it('sends done event with token usage', async () => {
    await seedConversation();
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['Hi'], { input_tokens: 200, output_tokens: 75 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toEqual({
      type: 'done',
      usage: { inputTokens: 200, outputTokens: 75 },
    });
  });

  it('persists assistant message after stream completes', async () => {
    await seedConversation();
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['Hello', ' world'], { input_tokens: 100, output_tokens: 50 }),
    );

    await postStream(port, { conversationId: 'conv-1' });

    const dbMessages = await dbRef.current
      .select()
      .from(messages)
      .where(eq(messages.conversationId, 'conv-1'));

    const assistantMsg = dbMessages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Hello world');
    expect(assistantMsg!.tokenCount).toBe(150);
    expect(assistantMsg!.model).toBe('claude-sonnet-4-6');
  });

  it('sends error event on Anthropic failure', async () => {
    await seedConversation();
    mockStreamChatCompletion.mockRejectedValueOnce(
      new AnthropicServiceError('ANTHROPIC_RATE_LIMIT', 'Rate limited'),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toEqual({
      type: 'error',
      message: 'AI service is busy. Please try again in a moment.',
    });
  });

  it('handles client disconnect gracefully', async () => {
    await seedConversation();

    async function* slowStream() {
      yield { type: 'message_start', message: { usage: { input_tokens: 10 } } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial' } };
      await new Promise((resolve) => setTimeout(resolve, 500));
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' response' } };
      yield { type: 'message_delta', usage: { output_tokens: 5 } };
      yield { type: 'message_stop' };
    }

    mockStreamChatCompletion.mockResolvedValueOnce(slowStream());

    await new Promise<void>((resolve) => {
      const data = JSON.stringify({ conversationId: 'conv-1' });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/chat/stream',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          res.once('data', () => {
            req.destroy();
            setTimeout(resolve, 800);
          });
        },
      );
      req.write(data);
      req.end();
    });

    const dbMessages = await dbRef.current
      .select()
      .from(messages)
      .where(eq(messages.conversationId, 'conv-1'));

    const assistantMsg = dbMessages.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toContain('Partial');
  });
});
