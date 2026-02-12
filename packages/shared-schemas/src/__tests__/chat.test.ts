import { describe, expect, it } from 'vitest';
import { createConversationSchema, messageRoleSchema, sendMessageSchema } from '../chat';

describe('sendMessageSchema', () => {
  it('validates a valid message', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello, AI!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content over 10000 characters', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'a'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid uuid', () => {
    const result = sendMessageSchema.safeParse({
      conversationId: 'not-a-uuid',
      content: 'Hello',
    });
    expect(result.success).toBe(false);
  });
});

describe('createConversationSchema', () => {
  it('validates with optional fields', () => {
    const result = createConversationSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('validates with title', () => {
    const result = createConversationSchema.safeParse({ title: 'My Chat' });
    expect(result.success).toBe(true);
  });
});

describe('messageRoleSchema', () => {
  it('accepts valid roles', () => {
    expect(messageRoleSchema.safeParse('user').success).toBe(true);
    expect(messageRoleSchema.safeParse('assistant').success).toBe(true);
  });

  it('rejects invalid roles', () => {
    expect(messageRoleSchema.safeParse('admin').success).toBe(false);
  });
});
