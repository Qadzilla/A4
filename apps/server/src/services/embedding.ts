import OpenAI from 'openai';
import type { DB } from '../db';
import { env } from '../env';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/** Passed by bulk-ingestion call sites so BYOK users embed on their own key. */
export interface EmbeddingAuthContext {
  userId: string;
  db: DB;
}

// Clients cached per API key — house key plus one per active BYOK user
const MAX_CLIENT_CACHE = 20;
const clients = new Map<string, OpenAI>();

function getClientForKey(apiKey: string): OpenAI {
  const existing = clients.get(apiKey);
  if (existing) return existing;
  if (clients.size >= MAX_CLIENT_CACHE) {
    const oldest = clients.keys().next().value;
    if (oldest !== undefined) clients.delete(oldest);
  }
  const created = new OpenAI({ apiKey });
  clients.set(apiKey, created);
  return created;
}

async function resolveClient(auth?: EmbeddingAuthContext): Promise<OpenAI> {
  if (auth) {
    const { getUserApiKey } = await import('./key-vault');
    const userKey = await getUserApiKey(auth.userId, 'openai', auth.db);
    if (userKey) return getClientForKey(userKey);
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to your environment variables to enable embeddings.',
    );
  }
  return getClientForKey(env.OPENAI_API_KEY);
}

export async function embedTexts(
  texts: string[],
  auth?: EmbeddingAuthContext,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const openai = await resolveClient(auth);
  const results: Float32Array[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await callWithRetry(openai, batch);

    // Sort by index to preserve order
    const sorted = response.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(new Float32Array(item.embedding));
    }
  }

  return results;
}

export async function embedSingle(text: string): Promise<Float32Array> {
  const [result] = await embedTexts([text]);
  return result!;
}

async function callWithRetry(
  openai: OpenAI,
  input: string[],
  attempt = 0,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  try {
    return await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input,
    });
  } catch (error: unknown) {
    const isRetryable =
      error instanceof OpenAI.APIError && (error.status === 429 || (error.status ?? 0) >= 500);

    if (isRetryable && attempt < MAX_RETRIES) {
      const delay = INITIAL_BACKOFF_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callWithRetry(openai, input, attempt + 1);
    }
    throw error;
  }
}

// For testing — reset the client cache
export function _resetClient(): void {
  clients.clear();
}
