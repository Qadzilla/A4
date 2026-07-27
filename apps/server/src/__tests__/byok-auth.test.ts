import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  constructedWith: [] as string[],
  userKey: null as string | null,
  createImpl: vi.fn(),
}));

vi.mock('../env', () => ({
  env: { ANTHROPIC_API_KEY: 'sk-ant-house-key' },
  BYOK_ENABLED: true,
  DEV_AUTH_BYPASS: false,
  USE_R2: false,
}));

vi.mock('../services/key-vault', () => ({
  getUserApiKey: vi.fn(async () => state.userKey),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class MockAnthropic {
    messages = { create: state.createImpl };
    constructor(opts: { apiKey: string }) {
      state.constructedWith.push(opts.apiKey);
    }
    static APIError = MockAPIError;
  }
  return { default: MockAnthropic };
});

import {
  AnthropicServiceError,
  _resetClient,
  chatCompletion,
  isByokAnthropicUser,
} from '../services/anthropic';

const fakeDb = {} as never;

const okResponse = {
  content: [{ type: 'text', text: 'hello' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe('BYOK auth resolution', () => {
  beforeEach(() => {
    _resetClient();
    state.constructedWith.length = 0;
    state.userKey = null;
    state.createImpl.mockReset();
    state.createImpl.mockResolvedValue(okResponse);
  });

  it('uses the house key when no auth context is given', async () => {
    await chatCompletion({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys' });
    expect(state.constructedWith).toEqual(['sk-ant-house-key']);
  });

  it('uses the house key when the user has no stored key', async () => {
    await chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
      auth: { userId: 'user-1', db: fakeDb },
    });
    expect(state.constructedWith).toEqual(['sk-ant-house-key']);
  });

  it("uses the user's own key when configured", async () => {
    state.userKey = 'sk-ant-user-key';
    await chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'sys',
      auth: { userId: 'user-1', db: fakeDb },
    });
    expect(state.constructedWith).toEqual(['sk-ant-user-key']);
  });

  it('caches clients per key across calls', async () => {
    state.userKey = 'sk-ant-user-key';
    const opts = {
      messages: [{ role: 'user' as const, content: 'hi' }],
      systemPrompt: 'sys',
      auth: { userId: 'user-1', db: fakeDb },
    };
    await chatCompletion(opts);
    await chatCompletion(opts);
    expect(state.constructedWith).toEqual(['sk-ant-user-key']);
  });

  it('surfaces a rejected user key as the user’s problem, without house-key fallback', async () => {
    state.userKey = 'sk-ant-bad-key';
    const { default: MockAnthropic } = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (status: number, message: string) => Error };
    };
    state.createImpl.mockRejectedValue(new MockAnthropic.APIError(401, 'invalid x-api-key'));

    await expect(
      chatCompletion({
        messages: [{ role: 'user', content: 'hi' }],
        systemPrompt: 'sys',
        auth: { userId: 'user-1', db: fakeDb },
      }),
    ).rejects.toMatchObject({
      type: 'ANTHROPIC_AUTH_ERROR',
      message: expect.stringContaining('Your Anthropic API key was rejected'),
    });
    // Never retried on the house key
    expect(state.constructedWith).toEqual(['sk-ant-bad-key']);
  });

  it('keeps the generic auth error message for house-key failures', async () => {
    const { default: MockAnthropic } = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (status: number, message: string) => Error };
    };
    state.createImpl.mockRejectedValue(new MockAnthropic.APIError(401, 'invalid x-api-key'));

    await expect(
      chatCompletion({ messages: [{ role: 'user', content: 'hi' }], systemPrompt: 'sys' }),
    ).rejects.toMatchObject({ message: 'Invalid Anthropic API key' });
  });

  it('isByokAnthropicUser reflects stored-key presence', async () => {
    expect(await isByokAnthropicUser('user-1', fakeDb)).toBe(false);
    state.userKey = 'sk-ant-user-key';
    expect(await isByokAnthropicUser('user-1', fakeDb)).toBe(true);
  });

  it('error type is AnthropicServiceError for rejected keys', async () => {
    state.userKey = 'sk-ant-bad-key';
    const { default: MockAnthropic } = (await import('@anthropic-ai/sdk')) as unknown as {
      default: { APIError: new (status: number, message: string) => Error };
    };
    state.createImpl.mockRejectedValue(new MockAnthropic.APIError(401, 'nope'));

    try {
      await chatCompletion({
        messages: [{ role: 'user', content: 'hi' }],
        systemPrompt: 'sys',
        auth: { userId: 'user-1', db: fakeDb },
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AnthropicServiceError);
    }
  });
});
