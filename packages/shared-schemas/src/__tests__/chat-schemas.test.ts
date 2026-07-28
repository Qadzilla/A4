import { describe, expect, it } from 'vitest';
import {
  citationSchema,
  conversationListItemSchema,
  conversationSchema,
  createConversationSchema,
  messageRoleSchema,
  messageSchema,
  sendMessageSchema,
  sseEventSchema,
} from '../chat';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const NOW = new Date().toISOString();

describe('messageSchema', () => {
  it('validates a valid user message', () => {
    const result = messageSchema.safeParse({
      id: UUID,
      conversationId: UUID,
      userId: 'user_123',
      role: 'user',
      content: 'Hello',
      createdAt: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('validates an assistant message with token count and model', () => {
    const result = messageSchema.safeParse({
      id: UUID,
      conversationId: UUID,
      userId: 'user_123',
      role: 'assistant',
      content: 'Hi there!',
      tokenCount: 42,
      model: 'claude-sonnet-4-6',
      createdAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tokenCount).toBe(42);
      expect(result.data.model).toBe('claude-sonnet-4-6');
    }
  });

  it('rejects missing required fields', () => {
    const result = messageSchema.safeParse({
      id: UUID,
      role: 'user',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = messageSchema.safeParse({
      id: UUID,
      conversationId: UUID,
      userId: 'user_123',
      role: 'system',
      content: 'test',
      createdAt: NOW,
    });
    expect(result.success).toBe(false);
  });
});

describe('conversationSchema', () => {
  it('validates with all fields', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user_123',
      title: 'My Chat',
      model: 'claude-sonnet-4-6',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
  });

  it('allows null title', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user_123',
      title: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeNull();
    }
  });

  it('rejects missing workspaceId', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      userId: 'user_123',
      title: 'Chat',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(false);
  });

  it('allows optional summary field', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user_123',
      title: 'My Chat',
      model: 'claude-sonnet-4-6',
      summary: 'Discussion about Q1 budget.',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe('Discussion about Q1 budget.');
    }
  });

  it('allows null summary', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user_123',
      title: 'My Chat',
      summary: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBeNull();
    }
  });

  it('validates without summary field', () => {
    const result = conversationSchema.safeParse({
      id: UUID,
      workspaceId: UUID,
      userId: 'user_123',
      title: 'My Chat',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(result.success).toBe(true);
  });
});

describe('createConversationSchema', () => {
  it('validates with only workspaceId', () => {
    const result = createConversationSchema.safeParse({
      workspaceId: UUID,
    });
    expect(result.success).toBe(true);
  });

  it('validates with all optional fields', () => {
    const result = createConversationSchema.safeParse({
      workspaceId: UUID,
      title: 'My Chat',
      model: 'claude-opus-4-6',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing workspaceId', () => {
    const result = createConversationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('sendMessageSchema', () => {
  it('validates a normal message', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: UUID,
      content: 'Hello!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: UUID,
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content over 10000 characters', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: UUID,
      content: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });
});

describe('sseEventSchema', () => {
  it('validates text_delta event', () => {
    const result = sseEventSchema.safeParse({
      type: 'text_delta',
      text: 'Hello',
    });
    expect(result.success).toBe(true);
  });

  it('validates done event with usage', () => {
    const result = sseEventSchema.safeParse({
      type: 'done',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    expect(result.success).toBe(true);
  });

  it('validates error event', () => {
    const result = sseEventSchema.safeParse({
      type: 'error',
      message: 'Something went wrong',
    });
    expect(result.success).toBe(true);
  });

  it('validates message_start event', () => {
    const result = sseEventSchema.safeParse({
      type: 'message_start',
      messageId: UUID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown event type', () => {
    const result = sseEventSchema.safeParse({
      type: 'unknown_event',
      data: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('conversationListItemSchema', () => {
  it('validates a valid list item', () => {
    const result = conversationListItemSchema.safeParse({
      id: UUID,
      title: 'Budget Discussion',
      model: 'claude-sonnet-4-6',
      createdAt: NOW,
      updatedAt: NOW,
      messageCount: 5,
    });
    expect(result.success).toBe(true);
  });

  it('allows null title', () => {
    const result = conversationListItemSchema.safeParse({
      id: UUID,
      title: null,
      model: 'claude-sonnet-4-6',
      createdAt: NOW,
      updatedAt: NOW,
      messageCount: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeNull();
    }
  });

  it('allows optional summary field', () => {
    const result = conversationListItemSchema.safeParse({
      id: UUID,
      title: 'Budget Discussion',
      model: 'claude-sonnet-4-6',
      summary: 'Talked about Q1 numbers.',
      createdAt: NOW,
      updatedAt: NOW,
      messageCount: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe('Talked about Q1 numbers.');
    }
  });
});

describe('citationSchema', () => {
  it('validates a valid citation', () => {
    const result = citationSchema.safeParse({
      index: 0,
      fileId: 'file-1',
      fileName: 'report.pdf',
      chunkContent: 'Revenue was $1.2M in Q4.',
      score: 0.95,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = citationSchema.safeParse({
      index: 0,
      fileId: 'file-1',
    });
    expect(result.success).toBe(false);
  });
});

describe('messageRoleSchema — tool support', () => {
  it('accepts tool as a valid role', () => {
    const result = messageRoleSchema.safeParse('tool');
    expect(result.success).toBe(true);
  });

  it('still accepts user and assistant', () => {
    expect(messageRoleSchema.safeParse('user').success).toBe(true);
    expect(messageRoleSchema.safeParse('assistant').success).toBe(true);
  });
});

describe('sseEventSchema — tool events', () => {
  it('validates tool_call_start event', () => {
    const result = sseEventSchema.safeParse({
      type: 'tool_call_start',
      toolCallId: 'tc_1',
      toolName: 'query_data',
      toolInput: { table: 'transactions', filter: { year: 2026 } },
    });
    expect(result.success).toBe(true);
  });

  it('validates tool_call_end event', () => {
    const result = sseEventSchema.safeParse({
      type: 'tool_call_end',
      toolCallId: 'tc_1',
      toolName: 'query_data',
      durationMs: 230,
    });
    expect(result.success).toBe(true);
  });

  it('validates tool_result event', () => {
    const result = sseEventSchema.safeParse({
      type: 'tool_result',
      toolCallId: 'tc_1',
      toolName: 'query_data',
      result: { rows: [{ revenue: 50000 }] },
    });
    expect(result.success).toBe(true);
  });

  it('validates tool_result with isError=true', () => {
    const result = sseEventSchema.safeParse({
      type: 'tool_result',
      toolCallId: 'tc_1',
      toolName: 'query_data',
      result: 'Table not found',
      isError: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('isError', true);
    }
  });

  it('validates canvas_update with create action', () => {
    const result = sseEventSchema.safeParse({
      type: 'canvas_update',
      action: 'create',
      item: {
        id: UUID,
        type: 'kpi-card',
        name: 'Revenue KPI',
        x: 100,
        y: 200,
        width: 300,
        height: 200,
        zIndex: 5,
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates canvas_update with data field', () => {
    const result = sseEventSchema.safeParse({
      type: 'canvas_update',
      action: 'update',
      item: {
        id: UUID,
        type: 'chart-card',
        name: 'Revenue Chart',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        zIndex: 1,
        data: { chartType: 'bar', series: [1, 2, 3] },
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates done event with citations array', () => {
    const result = sseEventSchema.safeParse({
      type: 'done',
      usage: { inputTokens: 100, outputTokens: 50 },
      citations: [
        {
          index: 0,
          fileId: 'file-1',
          fileName: 'report.pdf',
          chunkContent: 'Revenue was $1.2M',
          score: 0.95,
        },
        {
          index: 1,
          fileId: 'file-2',
          fileName: 'forecast.csv',
          chunkContent: 'Q2 projection',
          score: 0.82,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('validates done event without citations (backward compatible)', () => {
    const result = sseEventSchema.safeParse({
      type: 'done',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('still validates all Phase 1 event types', () => {
    expect(sseEventSchema.safeParse({ type: 'message_start', messageId: UUID }).success).toBe(true);
    expect(sseEventSchema.safeParse({ type: 'text_delta', text: 'hi' }).success).toBe(true);
    expect(sseEventSchema.safeParse({ type: 'error', message: 'fail' }).success).toBe(true);
    expect(
      sseEventSchema.safeParse({ type: 'done', usage: { inputTokens: 10, outputTokens: 5 } })
        .success,
    ).toBe(true);
  });
});
