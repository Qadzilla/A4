import { describe, expect, it } from 'vitest';
import { createWorkspaceSchema, updateWorkspaceSchema, workspaceSchema } from '../workspace';

describe('workspaceSchema', () => {
  it('validates a valid workspace', () => {
    const result = workspaceSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Workspace',
      description: 'A test workspace',
      userId: 'user_123',
      createdAt: new Date(),
      updatedAt: new Date(),
      type: 'workspace',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = workspaceSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('createWorkspaceSchema', () => {
  it('validates a valid create input', () => {
    const result = createWorkspaceSchema.safeParse({ name: 'New Workspace' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createWorkspaceSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 characters', () => {
    const result = createWorkspaceSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('allows optional description', () => {
    const result = createWorkspaceSchema.safeParse({ name: 'Workspace', description: 'Details' });
    expect(result.success).toBe(true);
  });
});

describe('updateWorkspaceSchema', () => {
  it('validates partial update', () => {
    const result = updateWorkspaceSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('validates empty update', () => {
    const result = updateWorkspaceSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
