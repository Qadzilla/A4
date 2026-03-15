import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, Tool, ToolChoice } from '@anthropic-ai/sdk/resources/messages';
import { env } from '../env';

// Custom error type for mapped Anthropic errors
export type AnthropicErrorType =
  | 'ANTHROPIC_AUTH_ERROR'
  | 'ANTHROPIC_RATE_LIMIT'
  | 'ANTHROPIC_OVERLOADED'
  | 'ANTHROPIC_NETWORK_ERROR'
  | 'ANTHROPIC_UNKNOWN_ERROR';

export class AnthropicServiceError extends Error {
  constructor(
    public readonly type: AnthropicErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'AnthropicServiceError';
  }
}

// Lazy singleton — created on first use
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new AnthropicServiceError(
        'ANTHROPIC_AUTH_ERROR',
        'ANTHROPIC_API_KEY is not set. Add it to your environment variables.',
      );
    }
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export interface StreamChatOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlockParam[] }>;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  tools?: Tool[];
  toolChoice?: ToolChoice;
}

export async function streamChatCompletion(options: StreamChatOptions) {
  const { messages, systemPrompt, model = 'claude-sonnet-4-6', maxTokens = 4096 } = options;
  const anthropic = getClient();
  const hasTools = options.tools && options.tools.length > 0;

  try {
    const stream = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      stream: true,
      ...(hasTools && {
        tools: options.tools,
        tool_choice: options.toolChoice ?? { type: 'auto' },
      }),
    });
    return stream;
  } catch (error) {
    throw mapAnthropicError(error);
  }
}

function mapAnthropicError(error: unknown): AnthropicServiceError {
  // Anthropic SDK throws APIError for HTTP errors
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 401) {
      return new AnthropicServiceError('ANTHROPIC_AUTH_ERROR', 'Invalid Anthropic API key');
    }
    if (status === 429) {
      return new AnthropicServiceError('ANTHROPIC_RATE_LIMIT', 'Anthropic API rate limit exceeded');
    }
    if (status === 529) {
      return new AnthropicServiceError('ANTHROPIC_OVERLOADED', 'Anthropic API is overloaded');
    }
    return new AnthropicServiceError('ANTHROPIC_UNKNOWN_ERROR', error.message);
  }

  // Network errors (ECONNREFUSED, DNS failures, etc.)
  if (error instanceof Error && ('code' in error || error.message.includes('fetch'))) {
    return new AnthropicServiceError('ANTHROPIC_NETWORK_ERROR', `Network error: ${error.message}`);
  }

  return new AnthropicServiceError(
    'ANTHROPIC_UNKNOWN_ERROR',
    error instanceof Error ? error.message : 'Unknown error',
  );
}

// For testing — reset the lazy singleton
export function _resetClient(): void {
  client = null;
}
