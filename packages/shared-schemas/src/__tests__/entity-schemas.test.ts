import { describe, expect, it } from 'vitest';
import {
  entityEdgeSchema,
  entityExtractionResultSchema,
  entityMentionSchema,
  entitySchema,
  entityTypeSchema,
} from '../entity';

const uuid = () => crypto.randomUUID();

describe('entityTypeSchema', () => {
  it('accepts all five entity types', () => {
    for (const t of ['merchant', 'institution', 'person', 'organization', 'account_ref']) {
      expect(entityTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects unknown types', () => {
    expect(entityTypeSchema.safeParse('company').success).toBe(false);
  });
});

describe('entitySchema', () => {
  const valid = {
    id: uuid(),
    workspaceId: uuid(),
    userId: 'user-1',
    type: 'merchant',
    canonicalName: 'Amazon',
    normalizedName: 'amazon',
    aliases: ['AMZN Mktp US'],
    mentionCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('parses a valid entity', () => {
    expect(entitySchema.parse(valid).canonicalName).toBe('Amazon');
  });

  it('rejects empty canonicalName', () => {
    expect(entitySchema.safeParse({ ...valid, canonicalName: '' }).success).toBe(false);
  });

  it('rejects negative mentionCount', () => {
    expect(entitySchema.safeParse({ ...valid, mentionCount: -1 }).success).toBe(false);
  });

  it('coerces timestamp numbers to dates', () => {
    const parsed = entitySchema.parse({ ...valid, createdAt: 1753632000000 });
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });
});

describe('entityMentionSchema', () => {
  const valid = {
    id: uuid(),
    entityId: uuid(),
    workspaceId: uuid(),
    userId: 'user-1',
    sourceType: 'chunk',
    sourceId: 'chunk-1',
    snippet: 'context text',
    confidence: 0.9,
    amount: 52.0,
    date: new Date(),
    createdAt: new Date(),
  };

  it('parses a valid mention', () => {
    expect(entityMentionSchema.parse(valid).sourceType).toBe('chunk');
  });

  it('accepts all six source types', () => {
    for (const s of ['chunk', 'transaction', 'invoice', 'receipt', 'subscription', 'account']) {
      expect(entityMentionSchema.safeParse({ ...valid, sourceType: s }).success).toBe(true);
    }
  });

  it('allows null snippet', () => {
    expect(entityMentionSchema.safeParse({ ...valid, snippet: null }).success).toBe(true);
  });

  it('rejects confidence outside [0, 1]', () => {
    expect(entityMentionSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    expect(entityMentionSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false);
  });
});

describe('entityEdgeSchema', () => {
  const valid = {
    id: uuid(),
    workspaceId: uuid(),
    userId: 'user-1',
    fromEntityId: uuid(),
    toEntityId: uuid(),
    relationship: 'pays',
    evidence: ['m1'],
    createdAt: new Date(),
  };

  it('parses a valid edge', () => {
    expect(entityEdgeSchema.parse(valid).relationship).toBe('pays');
  });

  it('rejects empty relationship', () => {
    expect(entityEdgeSchema.safeParse({ ...valid, relationship: '' }).success).toBe(false);
  });
});

describe('entityExtractionResultSchema', () => {
  it('parses a model extraction payload', () => {
    const result = entityExtractionResultSchema.parse({
      entities: [
        { name: 'Chase Bank', type: 'institution', confidence: 0.98, snippet: 'Chase •••8842' },
        { name: 'Netflix', type: 'merchant', confidence: 0.95 },
      ],
      relationships: [
        { fromName: 'Netflix', toName: 'Chase Bank', relationship: 'charged to', confidence: 0.8 },
      ],
    });
    expect(result.entities).toHaveLength(2);
    expect(result.relationships[0]!.relationship).toBe('charged to');
  });

  it('accepts empty results', () => {
    const result = entityExtractionResultSchema.parse({ entities: [], relationships: [] });
    expect(result.entities).toEqual([]);
  });

  it('rejects entities with unknown type', () => {
    expect(
      entityExtractionResultSchema.safeParse({
        entities: [{ name: 'X', type: 'thing', confidence: 0.9 }],
        relationships: [],
      }).success,
    ).toBe(false);
  });
});
