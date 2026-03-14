import { describe, expect, it } from 'vitest';
import {
  conversationListItemSchema,
  conversationSchema,
  createConversationSchema,
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
});
