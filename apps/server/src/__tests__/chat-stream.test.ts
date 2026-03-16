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
  buildDocumentContext: vi.fn().mockResolvedValue({ section: '', citations: [] }),
}));
vi.mock('../services/ai-tools', () => ({
  getToolDefinitions: vi.fn().mockReturnValue([
    { name: 'get_accounts', description: 'List accounts', input_schema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_budget', description: 'Get budget', input_schema: { type: 'object', properties: {}, required: [] } },
    { name: 'create_canvas_item', description: 'Create item', input_schema: { type: 'object', properties: {}, required: [] } },
  ]),
  executeTool: vi.fn(),
  safeExecuteTool: vi.fn(),
}));

const envRef = { devBypass: true };

import { chatStreamRouter } from '../routes/chat-stream';
import { AnthropicServiceError, streamChatCompletion } from '../services/anthropic';
import { safeExecuteTool } from '../services/ai-tools';
import { buildDocumentContext } from '../services/ai-context';

const mockBuildDocumentContext = buildDocumentContext as ReturnType<typeof vi.fn>;

const mockStreamChatCompletion = streamChatCompletion as ReturnType<typeof vi.fn>;
const mockExecuteTool = safeExecuteTool as ReturnType<typeof vi.fn>;

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
      tool_calls TEXT,
      tool_call_id TEXT,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      token_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

// Mock async iterable for Anthropic stream (text-only)
async function* mockAnthropicStream(
  texts: string[],
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  yield { type: 'message_start', message: { usage: { input_tokens: usage.input_tokens } } };
  for (let i = 0; i < texts.length; i++) {
    yield { type: 'content_block_start', index: i, content_block: { type: 'text' } };
    yield { type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: texts[i] } };
    yield { type: 'content_block_stop', index: i };
  }
  yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output_tokens } };
  yield { type: 'message_stop' };
}

// Mock stream with tool_use blocks
async function* mockToolStream(
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  text = '',
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  yield { type: 'message_start', message: { usage: { input_tokens: usage.input_tokens } } };

  let blockIndex = 0;

  // Emit text block if present
  if (text) {
    yield { type: 'content_block_start', index: blockIndex, content_block: { type: 'text' } };
    yield { type: 'content_block_delta', index: blockIndex, delta: { type: 'text_delta', text } };
    yield { type: 'content_block_stop', index: blockIndex };
    blockIndex++;
  }

  // Emit tool_use blocks
  for (const tu of toolUses) {
    yield {
      type: 'content_block_start',
      index: blockIndex,
      content_block: { type: 'tool_use', id: tu.id, name: tu.name },
    };
    yield {
      type: 'content_block_delta',
      index: blockIndex,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(tu.input) },
    };
    yield { type: 'content_block_stop', index: blockIndex };
    blockIndex++;
  }

  yield { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: usage.output_tokens } };
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

  // --- Original tests ---

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
      yield { type: 'content_block_start', index: 0, content_block: { type: 'text' } };
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial' } };
      await new Promise((resolve) => setTimeout(resolve, 500));
      yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' response' } };
      yield { type: 'content_block_stop', index: 0 };
      yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } };
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

  // --- Tool execution tests ---

  it('executes a single read-only tool call', async () => {
    await seedConversation();

    // Round 1: Claude returns tool_use
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-1', name: 'get_accounts', input: {} }],
        'Let me check your accounts.',
        { input_tokens: 100, output_tokens: 30 },
      ),
    );

    // Tool returns account data
    mockExecuteTool.mockResolvedValueOnce({
      result: { accounts: [{ id: 'a1', name: 'Checking', balance: 5000 }] },
      isError: false,
    });

    // Round 2: Claude responds with text
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['You have a Checking account with $5,000.'], { input_tokens: 200, output_tokens: 40 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    // Check SSE events
    expect(events.find((e) => e.type === 'tool_call_start')).toEqual({
      type: 'tool_call_start',
      toolName: 'get_accounts',
      toolCallId: 'tool-1',
    });
    expect(events.find((e) => e.type === 'tool_call_end')).toEqual({
      type: 'tool_call_end',
      toolCallId: 'tool-1',
    });
    expect(events.find((e) => e.type === 'tool_result')).toEqual({
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'get_accounts',
      result: { accounts: [{ id: 'a1', name: 'Checking', balance: 5000 }] },
      isError: false,
    });

    // Final text from round 2
    const textDeltas = events.filter((e) => e.type === 'text_delta');
    expect(textDeltas.map((e) => e.text).join('')).toContain('Checking account');

    // Done event with summed tokens
    const done = events.find((e) => e.type === 'done');
    expect(done!.usage.inputTokens).toBe(300);
    expect(done!.usage.outputTokens).toBe(70);
  });

  it('sends canvas_update for create_canvas_item', async () => {
    await seedConversation();

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-2', name: 'create_canvas_item', input: { type: 'budget-card' } }],
        'Creating a budget card.',
        { input_tokens: 100, output_tokens: 30 },
      ),
    );

    mockExecuteTool.mockResolvedValueOnce({
      result: {
        id: 'item-1',
        type: 'budget-card',
        name: 'Budget',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        _canvasUpdate: true,
      },
      isError: false,
    });

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(["I've created a budget card."], { input_tokens: 200, output_tokens: 30 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    // canvas_update event
    const canvasUpdate = events.find((e) => e.type === 'canvas_update');
    expect(canvasUpdate).toEqual({
      type: 'canvas_update',
      action: 'create',
      item: { id: 'item-1', type: 'budget-card', name: 'Budget', x: 0, y: 0, width: 400, height: 300 },
    });

    // tool_result should NOT contain _canvasUpdate
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult!.result._canvasUpdate).toBeUndefined();
  });

  it('handles multi-tool-call in single round', async () => {
    await seedConversation();

    // Claude requests 2 tools at once
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [
          { id: 'tool-a', name: 'get_accounts', input: {} },
          { id: 'tool-b', name: 'get_budget', input: {} },
        ],
        'Let me fetch both.',
        { input_tokens: 100, output_tokens: 40 },
      ),
    );

    mockExecuteTool
      .mockResolvedValueOnce({ result: { accounts: [{ id: 'a1', name: 'Savings', balance: 10000 }] }, isError: false })
      .mockResolvedValueOnce({ result: { categories: [{ name: 'Food', budgeted: 500, actual: 420 }] }, isError: false });

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['Here is your summary.'], { input_tokens: 300, output_tokens: 50 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    // Should have 2 tool_call_start and 2 tool_call_end events
    const starts = events.filter((e) => e.type === 'tool_call_start');
    const ends = events.filter((e) => e.type === 'tool_call_end');
    const results = events.filter((e) => e.type === 'tool_result');

    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);
    expect(results).toHaveLength(2);

    // Verify Claude was called again with both tool results
    expect(mockStreamChatCompletion).toHaveBeenCalledTimes(2);
    const secondCall = mockStreamChatCompletion.mock.calls[1]![0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toHaveLength(2);
    expect(lastMsg.content[0].type).toBe('tool_result');
    expect(lastMsg.content[1].type).toBe('tool_result');
  });

  it('handles multi-round tool execution', async () => {
    await seedConversation();

    // Round 1: get_accounts
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-r1', name: 'get_accounts', input: {} }],
        '',
        { input_tokens: 100, output_tokens: 20 },
      ),
    );
    mockExecuteTool.mockResolvedValueOnce({ result: { accounts: [] }, isError: false });

    // Round 2: get_budget
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-r2', name: 'get_budget', input: {} }],
        '',
        { input_tokens: 200, output_tokens: 30 },
      ),
    );
    mockExecuteTool.mockResolvedValueOnce({ result: { categories: [] }, isError: false });

    // Round 3: final text
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['No data found.'], { input_tokens: 300, output_tokens: 40 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    expect(mockStreamChatCompletion).toHaveBeenCalledTimes(3);
    expect(events.filter((e) => e.type === 'tool_call_start')).toHaveLength(2);

    const done = events.find((e) => e.type === 'done');
    expect(done!.usage.inputTokens).toBe(600);
    expect(done!.usage.outputTokens).toBe(90);
  });

  it('enforces MAX_TOOL_ROUNDS limit', async () => {
    await seedConversation();

    // 11 streamChatCompletion calls (1 initial + 10 in loop), but only 10 executeTool calls
    for (let i = 0; i < 11; i++) {
      mockStreamChatCompletion.mockResolvedValueOnce(
        mockToolStream(
          [{ id: `tool-loop-${i}`, name: 'get_accounts', input: {} }],
          '',
          { input_tokens: 10, output_tokens: 5 },
        ),
      );
    }
    for (let i = 0; i < 10; i++) {
      mockExecuteTool.mockResolvedValueOnce({ result: { accounts: [] }, isError: false });
    }

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    // Should have stopped after 10 rounds (11 streamChatCompletion calls: 1 initial + 10 loop)
    expect(mockStreamChatCompletion).toHaveBeenCalledTimes(11);
    expect(mockExecuteTool).toHaveBeenCalledTimes(10);

    // Done event should still be sent
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });

  it('persists tool messages in DB', async () => {
    await seedConversation();

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-db', name: 'get_accounts', input: {} }],
        'Checking...',
        { input_tokens: 100, output_tokens: 30 },
      ),
    );
    mockExecuteTool.mockResolvedValueOnce({ result: { accounts: [{ id: 'a1', name: 'Main' }] }, isError: false });

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['You have one account.'], { input_tokens: 200, output_tokens: 40 }),
    );

    await postStream(port, { conversationId: 'conv-1' });

    const dbMsgs = await dbRef.current
      .select()
      .from(messages)
      .where(eq(messages.conversationId, 'conv-1'));

    // user, intermediate assistant (with toolCalls), tool, final assistant
    expect(dbMsgs).toHaveLength(4);

    const userMsg = dbMsgs.find((m: any) => m.role === 'user');
    expect(userMsg).toBeDefined();

    const intermediateAssistant = dbMsgs.find((m: any) => m.role === 'assistant' && m.toolCalls);
    expect(intermediateAssistant).toBeDefined();
    expect(intermediateAssistant!.content).toBe('Checking...');
    const toolCalls = JSON.parse(intermediateAssistant!.toolCalls!);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('get_accounts');

    const toolMsg = dbMsgs.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.toolCallId).toBe('tool-db');
    expect(JSON.parse(toolMsg!.content)).toEqual({ accounts: [{ id: 'a1', name: 'Main' }] });

    const finalAssistant = dbMsgs.find((m: any) => m.role === 'assistant' && !m.toolCalls);
    expect(finalAssistant).toBeDefined();
    expect(finalAssistant!.content).toBe('You have one account.');
    expect(finalAssistant!.tokenCount).toBe(370); // 100+200 input + 30+40 output
  });

  it('sums tokens across rounds', async () => {
    await seedConversation();

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-t1', name: 'get_accounts', input: {} }],
        '',
        { input_tokens: 150, output_tokens: 25 },
      ),
    );
    mockExecuteTool.mockResolvedValueOnce({ result: { accounts: [] }, isError: false });

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['Done.'], { input_tokens: 250, output_tokens: 35 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    const done = events.find((e) => e.type === 'done');
    expect(done).toEqual({
      type: 'done',
      usage: { inputTokens: 400, outputTokens: 60 },
    });
  });

  it('handles tool executor errors', async () => {
    await seedConversation();

    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-err', name: 'get_accounts', input: {} }],
        'Checking...',
        { input_tokens: 100, output_tokens: 30 },
      ),
    );

    // Tool returns an error
    mockExecuteTool.mockResolvedValueOnce({
      result: { error: 'Database connection failed' },
      isError: true,
    });

    // Claude responds after getting error
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(["I couldn't fetch your accounts."], { input_tokens: 200, output_tokens: 40 }),
    );

    const result = await postStream(port, { conversationId: 'conv-1' });
    const events = parseSSE(result.body);

    // tool_result should have isError=true
    const toolResult = events.find((e) => e.type === 'tool_result');
    expect(toolResult).toEqual({
      type: 'tool_result',
      toolCallId: 'tool-err',
      toolName: 'get_accounts',
      result: { error: 'Database connection failed' },
      isError: true,
    });

    // Claude should have received is_error tool_result
    const secondCall = mockStreamChatCompletion.mock.calls[1]![0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.content[0].is_error).toBe(true);

    // Flow should continue with final text
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
  });

  it('handles client disconnect during tool loop', async () => {
    await seedConversation();

    // Set up tool call that takes time
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockToolStream(
        [{ id: 'tool-dc', name: 'get_accounts', input: {} }],
        'Let me check.',
        { input_tokens: 100, output_tokens: 30 },
      ),
    );

    // Tool execution is slow
    mockExecuteTool.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ result: { accounts: [] }, isError: false }), 600)),
    );

    // Set up a second call in case it gets there
    mockStreamChatCompletion.mockResolvedValueOnce(
      mockAnthropicStream(['Done.'], { input_tokens: 200, output_tokens: 40 }),
    );

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
          // Wait for first data then disconnect
          res.once('data', () => {
            setTimeout(() => {
              req.destroy();
              setTimeout(resolve, 1000);
            }, 100);
          });
        },
      );
      req.write(data);
      req.end();
    });

    // Should not crash — intermediate assistant message should be persisted
    const dbMsgs = await dbRef.current
      .select()
      .from(messages)
      .where(eq(messages.conversationId, 'conv-1'));

    // At least the user message and intermediate assistant should exist
    expect(dbMsgs.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = dbMsgs.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
  });

  // --- RAG integration tests ---

  describe('RAG integration', () => {
    async function insertChunk(workspaceId = 'ws-1') {
      const embedding = new Float32Array(256).fill(0);
      const buf = Buffer.from(embedding.buffer);
      await dbRef.current.insert(schema.documentChunks).values({
        id: 'chunk-1',
        fileId: 'file-1',
        workspaceId,
        userId: 'dev-user-001',
        chunkIndex: 0,
        content: 'Sample document chunk content',
        embedding: buf,
        tokenCount: 10,
        createdAt: new Date(),
      });
    }

    it('skips RAG when workspace has no document chunks', async () => {
      await seedConversation();
      mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Hello']));

      await postStream(port, { conversationId: 'conv-1' });

      expect(mockBuildDocumentContext).not.toHaveBeenCalled();
    });

    it('includes document context in system prompt when chunks exist', async () => {
      await seedConversation();
      await insertChunk();
      mockBuildDocumentContext.mockResolvedValueOnce({
        section: '## Relevant Documents\n\n[1] bank.pdf (relevance: 92%)\n> Transaction data',
        citations: [{ index: 1, fileId: 'file-1', fileName: 'bank.pdf', chunkContent: 'Transaction data', score: 0.92 }],
      });
      mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Based on your bank statement...']));

      await postStream(port, { conversationId: 'conv-1' });

      // Verify buildDocumentContext was called
      expect(mockBuildDocumentContext).toHaveBeenCalledWith('Hello', 'ws-1', expect.anything());

      // Verify system prompt includes RAG section
      const callArgs = mockStreamChatCompletion.mock.calls[0]![0];
      expect(callArgs.systemPrompt).toContain('## Relevant Documents');
    });

    it('sends citations in done event', async () => {
      await seedConversation();
      await insertChunk();
      mockBuildDocumentContext.mockResolvedValueOnce({
        section: '## Relevant Documents\n\n[1] bank.pdf',
        citations: [{ index: 1, fileId: 'file-1', fileName: 'bank.pdf', chunkContent: 'Data', score: 0.90 }],
      });
      mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Answer']));

      const result = await postStream(port, { conversationId: 'conv-1' });
      const events = parseSSE(result.body);
      const doneEvent = events.find((e) => e.type === 'done');

      expect(doneEvent!.citations).toBeDefined();
      expect(doneEvent!.citations).toHaveLength(1);
      expect(doneEvent!.citations[0].fileId).toBe('file-1');
    });

    it('persists citations on assistant message', async () => {
      await seedConversation();
      await insertChunk();
      const testCitations = [{ index: 1, fileId: 'file-1', fileName: 'bank.pdf', chunkContent: 'Data', score: 0.90 }];
      mockBuildDocumentContext.mockResolvedValueOnce({
        section: '## Relevant Documents\n\n[1] bank.pdf',
        citations: testCitations,
      });
      mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Answer']));

      await postStream(port, { conversationId: 'conv-1' });

      const dbMsgs = await dbRef.current
        .select()
        .from(messages)
        .where(eq(messages.conversationId, 'conv-1'));

      const assistantMsg = dbMsgs.find((m: any) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.citations).toBeDefined();
      const parsed = JSON.parse(assistantMsg!.citations!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].fileId).toBe('file-1');
    });

    it('continues normally when RAG fails', async () => {
      await seedConversation();
      await insertChunk();
      mockBuildDocumentContext.mockRejectedValueOnce(new Error('Embedding service down'));
      mockStreamChatCompletion.mockResolvedValueOnce(mockAnthropicStream(['Hello there']));

      const result = await postStream(port, { conversationId: 'conv-1' });
      const events = parseSSE(result.body);

      // Stream should complete normally
      const textDeltas = events.filter((e) => e.type === 'text_delta');
      expect(textDeltas.map((e) => e.text).join('')).toBe('Hello there');

      // Done event should have no citations
      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.citations).toBeUndefined();
    });
  });
});
