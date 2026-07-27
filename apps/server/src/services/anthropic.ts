import Anthropic from '@anthropic-ai/sdk';
import type { ContentBlockParam, Tool, ToolChoice } from '@anthropic-ai/sdk/resources/messages';
import type { DB } from '../db';
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

/** Passed by call sites that want the user's own key (BYOK) considered. */
export interface AuthContext {
  userId: string;
  db: DB;
}

interface ResolvedAuth {
  apiKey: string;
  byok: boolean;
}

// Clients are cached per API key — the house key plus one per active BYOK user
const MAX_CLIENT_CACHE = 20;
const clients = new Map<string, Anthropic>();

function getClientForKey(apiKey: string): Anthropic {
  const existing = clients.get(apiKey);
  if (existing) return existing;
  if (clients.size >= MAX_CLIENT_CACHE) {
    const oldest = clients.keys().next().value;
    if (oldest !== undefined) clients.delete(oldest);
  }
  const created = new Anthropic({ apiKey });
  clients.set(apiKey, created);
  return created;
}

/** User key when configured, house key otherwise. Throws when neither exists. */
async function resolveAuth(auth?: AuthContext): Promise<ResolvedAuth> {
  if (auth) {
    const { getUserApiKey } = await import('./key-vault');
    const userKey = await getUserApiKey(auth.userId, 'anthropic', auth.db);
    if (userKey) return { apiKey: userKey, byok: true };
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new AnthropicServiceError(
      'ANTHROPIC_AUTH_ERROR',
      'ANTHROPIC_API_KEY is not set. Add it to your environment variables.',
    );
  }
  return { apiKey: env.ANTHROPIC_API_KEY, byok: false };
}

/** True when this user's AI calls run on their own Anthropic key (for usage tagging). */
export async function isByokAnthropicUser(userId: string, db: DB): Promise<boolean> {
  const { getUserApiKey } = await import('./key-vault');
  return (await getUserApiKey(userId, 'anthropic', db)) !== null;
}

/**
 * A rejected user key must surface as the user's problem to fix — never
 * silently burn house quota as a fallback.
 */
function mapAuthAwareError(error: unknown, byok: boolean): AnthropicServiceError {
  const mapped = error instanceof AnthropicServiceError ? error : mapAnthropicError(error);
  if (byok && mapped.type === 'ANTHROPIC_AUTH_ERROR') {
    return new AnthropicServiceError(
      'ANTHROPIC_AUTH_ERROR',
      'Your Anthropic API key was rejected. Update or remove it in Settings → API Keys.',
    );
  }
  return mapped;
}

export interface StreamChatOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlockParam[] }>;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  auth?: AuthContext;
}

export async function streamChatCompletion(options: StreamChatOptions) {
  const { messages, systemPrompt, model = 'claude-sonnet-4-6', maxTokens = 4096 } = options;
  const { apiKey, byok } = await resolveAuth(options.auth);
  const anthropic = getClientForKey(apiKey);
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
    throw mapAuthAwareError(error, byok);
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

export interface ChatCompletionOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  auth?: AuthContext;
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const {
    messages,
    systemPrompt,
    model = 'claude-sonnet-4-6',
    maxTokens = 4096,
    temperature,
  } = options;
  const { apiKey, byok } = await resolveAuth(options.auth);
  const anthropic = getClientForKey(apiKey);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(temperature !== undefined && { temperature }),
    });
    const block = response.content[0];
    return block && block.type === 'text' ? block.text : '';
  } catch (error) {
    throw mapAuthAwareError(error, byok);
  }
}

export interface StructuredCompletionOptions {
  systemPrompt: string;
  userMessage: string;
  /** JSON Schema the model's output must conform to (enforced via forced tool use) */
  outputSchema: Record<string, unknown>;
  toolName?: string;
  model?: string;
  maxTokens?: number;
  auth?: AuthContext;
}

export interface StructuredCompletionResult {
  /** The tool input the model produced — validate with Zod before trusting it */
  data: unknown;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Non-streaming completion that forces the model to emit JSON matching
 * `outputSchema` by requiring a single tool call. Used by background pipelines
 * (entity extraction) rather than chat.
 */
export async function structuredCompletion(
  options: StructuredCompletionOptions,
): Promise<StructuredCompletionResult> {
  const {
    systemPrompt,
    userMessage,
    outputSchema,
    toolName = 'emit_result',
    model = 'claude-sonnet-4-6',
    maxTokens = 4096,
  } = options;
  const { apiKey, byok } = await resolveAuth(options.auth);
  const anthropic = getClientForKey(apiKey);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: toolName,
          description: 'Emit the structured result.',
          input_schema: outputSchema as Tool['input_schema'],
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
    });

    const toolBlock = response.content.find((block) => block.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new AnthropicServiceError(
        'ANTHROPIC_UNKNOWN_ERROR',
        'Model did not produce the required tool call',
      );
    }

    return {
      data: toolBlock.input,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    if (error instanceof AnthropicServiceError) throw error;
    throw mapAuthAwareError(error, byok);
  }
}

// For testing — reset the client cache
export function _resetClient(): void {
  clients.clear();
}
