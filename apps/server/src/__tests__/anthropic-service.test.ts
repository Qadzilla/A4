import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock env before importing the service
vi.mock('../env', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key-123',
  },
}));

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  const APIError = class APIError extends Error {
    status: number;
    error: object | undefined;
    headers: Headers | undefined;
    constructor(
      status: number,
      error: object | undefined,
      message: string | undefined,
      headers: Headers | undefined,
    ) {
      super(message ?? 'API Error');
      this.status = status;
      this.error = error;
      this.headers = headers;
      this.name = 'APIError';
    }
  };

  const MockAnthropic = vi.fn().mockImplementation(function (this: any) {
    this.messages = { create: mockCreate };
  });

  // Attach APIError as a static property
  (MockAnthropic as any).APIError = APIError;

  return { default: MockAnthropic, APIError };
});

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import {
  AnthropicServiceError,
  _resetClient,
  chatCompletion,
  streamChatCompletion,
} from '../services/anthropic';

describe('AnthropicService', () => {
  beforeEach(() => {
    _resetClient();
    mockCreate.mockReset();
    // Reset to valid key
    (env as any).ANTHROPIC_API_KEY = 'test-key-123';
  });

  describe('initialization', () => {
    it('throws ANTHROPIC_AUTH_ERROR when ANTHROPIC_API_KEY is missing', async () => {
      (env as any).ANTHROPIC_API_KEY = undefined;

      await expect(
        streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'You are helpful.',
        }),
      ).rejects.toThrow(AnthropicServiceError);

      try {
        await streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'You are helpful.',
        });
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_AUTH_ERROR');
        expect((e as AnthropicServiceError).message).toContain('ANTHROPIC_API_KEY is not set');
      }
    });

    it('creates client lazily on first call', async () => {
      const mockStream = { type: 'stream' };
      mockCreate.mockResolvedValueOnce(mockStream);

      // Client not created yet — Anthropic constructor not called
      expect(Anthropic).not.toHaveBeenCalled();

      await streamChatCompletion({
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'test',
      });

      // Now Anthropic constructor should have been called
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'test-key-123' });
    });
  });

  describe('streamChatCompletion', () => {
    it('passes messages, system prompt, model, and stream:true to SDK', async () => {
      const mockStream = { type: 'stream' };
      mockCreate.mockResolvedValueOnce(mockStream);

      const messages = [
        { role: 'user' as const, content: 'What is 2+2?' },
        { role: 'assistant' as const, content: '4' },
        { role: 'user' as const, content: 'Thanks' },
      ];

      const result = await streamChatCompletion({
        messages,
        systemPrompt: 'You are a math tutor.',
        model: 'claude-opus-4-6',
        maxTokens: 8192,
      });

      expect(result).toBe(mockStream);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: 'You are a math tutor.',
        messages,
        stream: true,
      });
    });

    it('uses default model and maxTokens when not specified', async () => {
      mockCreate.mockResolvedValueOnce({ type: 'stream' });

      await streamChatCompletion({
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'test',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
        }),
      );
    });
  });

  describe('StreamChatOptions — tools support', () => {
    it('accepts options with tools array', async () => {
      mockCreate.mockResolvedValueOnce({ type: 'stream' });

      const tools = [
        {
          name: 'get_weather',
          description: 'Get weather for a location',
          input_schema: {
            type: 'object' as const,
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      ];

      await streamChatCompletion({
        messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
        systemPrompt: 'You are helpful.',
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools,
          tool_choice: { type: 'auto' },
        }),
      );
    });

    it('accepts options with multi-content-block messages', async () => {
      mockCreate.mockResolvedValueOnce({ type: 'stream' });

      const messages = [
        { role: 'user' as const, content: 'Use the tool' },
        {
          role: 'assistant' as const,
          content: [
            { type: 'text' as const, text: 'I will call the tool.' },
            {
              type: 'tool_use' as const,
              id: 'toolu_1',
              name: 'get_weather',
              input: { location: 'NYC' },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            { type: 'tool_result' as const, tool_use_id: 'toolu_1', content: 'Sunny, 72°F' },
          ],
        },
      ];

      await streamChatCompletion({
        messages,
        systemPrompt: 'You are helpful.',
      });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ messages }));
    });

    it('accepts options without tools (backward compatibility)', async () => {
      mockCreate.mockResolvedValueOnce({ type: 'stream' });

      await streamChatCompletion({
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'test',
      });

      const callArgs = mockCreate.mock.calls[0]![0];
      expect(callArgs).not.toHaveProperty('tools');
      expect(callArgs).not.toHaveProperty('tool_choice');
    });
  });

  describe('chatCompletion', () => {
    it('returns text from non-streaming response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Summary text' }],
      });

      const result = await chatCompletion({
        messages: [{ role: 'user', content: 'Summarize this' }],
        systemPrompt: 'You are a summarizer.',
      });

      expect(result).toBe('Summary text');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
        }),
      );
      // Should NOT have stream: true
      const callArgs = mockCreate.mock.calls[0]![0];
      expect(callArgs.stream).toBeUndefined();
    });

    it('passes temperature and model options', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Result' }],
      });

      await chatCompletion({
        messages: [{ role: 'user', content: 'test' }],
        systemPrompt: 'test',
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 200,
        temperature: 0,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          temperature: 0,
        }),
      );
    });

    it('throws AnthropicServiceError on API failure', async () => {
      mockCreate.mockRejectedValueOnce(
        new Anthropic.APIError(500, undefined, 'Server error', undefined),
      );

      try {
        await chatCompletion({
          messages: [{ role: 'user', content: 'test' }],
          systemPrompt: 'test',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_UNKNOWN_ERROR');
      }
    });
  });

  describe('error mapping', () => {
    it('maps 401 APIError to ANTHROPIC_AUTH_ERROR', async () => {
      mockCreate.mockRejectedValueOnce(
        new Anthropic.APIError(401, undefined, 'Unauthorized', undefined),
      );

      try {
        await streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'test',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_AUTH_ERROR');
      }
    });

    it('maps 429 APIError to ANTHROPIC_RATE_LIMIT', async () => {
      mockCreate.mockRejectedValueOnce(
        new Anthropic.APIError(429, undefined, 'Rate limited', undefined),
      );

      try {
        await streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'test',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_RATE_LIMIT');
      }
    });

    it('maps 529 APIError to ANTHROPIC_OVERLOADED', async () => {
      mockCreate.mockRejectedValueOnce(
        new Anthropic.APIError(529, undefined, 'Overloaded', undefined),
      );

      try {
        await streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'test',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_OVERLOADED');
      }
    });

    it('maps network errors to ANTHROPIC_NETWORK_ERROR', async () => {
      const networkError = new Error('fetch failed');
      mockCreate.mockRejectedValueOnce(networkError);

      try {
        await streamChatCompletion({
          messages: [{ role: 'user', content: 'hello' }],
          systemPrompt: 'test',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(AnthropicServiceError);
        expect((e as AnthropicServiceError).type).toBe('ANTHROPIC_NETWORK_ERROR');
      }
    });
  });
});
