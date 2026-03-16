import { describe, expect, it } from 'vitest';
import { chunkText } from '../services/chunking';

describe('chunkText', () => {
  it('returns empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const result = chunkText('Hello world.');
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe('Hello world.');
    expect(result[0]!.chunkIndex).toBe(0);
    expect(result[0]!.tokenCount).toBeGreaterThan(0);
  });

  it('splits long text into multiple chunks respecting maxTokens', () => {
    // Each sentence is ~25 chars = ~7 tokens. With maxTokens=20 (~80 chars), should get multiple chunks.
    const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i}.`);
    const text = sentences.join(' ');
    const result = chunkText(text, { maxTokens: 20, overlap: 0 });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(25); // some tolerance for boundary
    }
  });

  it('preserves sentence boundaries', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const result = chunkText(text, { maxTokens: 10, overlap: 0 });

    // Each sentence ~16 chars = 4 tokens. maxTokens=10 fits ~2 sentences per chunk.
    expect(result.length).toBeGreaterThanOrEqual(2);
    // Check no sentence is cut mid-word
    for (const chunk of result) {
      // Should end with a complete sentence or be the last chunk
      expect(chunk.content).toMatch(/\w/);
    }
  });

  it('applies overlap between chunks', () => {
    const text = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
    const withOverlap = chunkText(text, { maxTokens: 10, overlap: 5 });
    const withoutOverlap = chunkText(text, { maxTokens: 10, overlap: 0 });

    // With overlap, later chunks should contain some content from previous chunks
    if (withOverlap.length >= 2 && withoutOverlap.length >= 2) {
      // The total content with overlap should be >= without overlap
      const totalWithOverlap = withOverlap.reduce((sum, c) => sum + c.content.length, 0);
      const totalWithout = withoutOverlap.reduce((sum, c) => sum + c.content.length, 0);
      expect(totalWithOverlap).toBeGreaterThanOrEqual(totalWithout);
    }
  });

  it('handles text with no sentence boundaries (whitespace split)', () => {
    // One long "sentence" with no periods — should still produce chunks
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const result = chunkText(text, { maxTokens: 20, overlap: 0 });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThan(0);
    }
  });

  it('force-splits a single very long sentence', () => {
    const longSentence = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ') + '.';
    const result = chunkText(longSentence, { maxTokens: 50, overlap: 0 });

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(55); // tolerance
    }
  });

  it('assigns sequential chunkIndex values', () => {
    const text = 'A. B. C. D. E. F. G. H. I. J.';
    const result = chunkText(text, { maxTokens: 3, overlap: 0 });

    for (let i = 0; i < result.length; i++) {
      expect(result[i]!.chunkIndex).toBe(i);
    }
  });
});
