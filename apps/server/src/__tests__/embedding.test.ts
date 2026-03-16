import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate, MockAPIError, mockEnv } = vi.hoisted(() => {
  const mockCreate = vi.fn();

  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  const mockEnv = { OPENAI_API_KEY: 'test-key' as string | undefined };

  return { mockCreate, MockAPIError, mockEnv };
});

vi.mock('openai', () => {
  class MockOpenAI {
    embeddings = { create: mockCreate };
  }
  (MockOpenAI as unknown as Record<string, unknown>).APIError = MockAPIError;
  return { default: MockOpenAI };
});

vi.mock('../env', () => ({
  env: mockEnv,
}));

import { _resetClient, embedTexts } from '../services/embedding';

describe('embedTexts', () => {
  beforeEach(() => {
    mockEnv.OPENAI_API_KEY = 'test-key';
    _resetClient();
    mockCreate.mockReset();
  });

  afterEach(() => {
    _resetClient();
  });

  it('returns Float32Array for each input text', async () => {
    mockCreate.mockResolvedValueOnce({
      data: [
        { index: 0, embedding: [0.1, 0.2, 0.3] },
        { index: 1, embedding: [0.4, 0.5, 0.6] },
      ],
    });

    const result = await embedTexts(['hello', 'world']);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Float32Array);
    expect(result[1]).toBeInstanceOf(Float32Array);
    expect(Array.from(result[0]!)).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
  });

  it('returns empty array for empty input', async () => {
    const result = await embedTexts([]);
    expect(result).toEqual([]);
  });

  it('batches inputs exceeding batch size', async () => {
    mockCreate.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, i) => ({ index: i, embedding: [i * 0.01] })),
    });
    mockCreate.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, i) => ({ index: i, embedding: [(100 + i) * 0.01] })),
    });

    const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`);
    const result = await embedTexts(texts);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(150);
  });

  it('retries on rate limit error', async () => {
    mockCreate.mockRejectedValueOnce(new MockAPIError(429, 'Rate limited'));
    mockCreate.mockResolvedValueOnce({
      data: [{ index: 0, embedding: [0.1] }],
    });

    const result = await embedTexts(['hello']);
    expect(result).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(429, 'Rate limited'));

    await expect(embedTexts(['hello'])).rejects.toThrow('Rate limited');
    // Initial + 3 retries = 4 calls
    expect(mockCreate).toHaveBeenCalledTimes(4);
  }, 30000);

  it('throws when OPENAI_API_KEY is not set', async () => {
    mockEnv.OPENAI_API_KEY = undefined;
    _resetClient();

    await expect(embedTexts(['hello'])).rejects.toThrow('OPENAI_API_KEY');
  });
});
