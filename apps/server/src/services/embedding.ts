import OpenAI from 'openai';
import { env } from '../env';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Lazy singleton — created on first use
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is not set. Add it to your environment variables to enable embeddings.',
      );
    }
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const openai = getClient();
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

// For testing — reset the lazy singleton
export function _resetClient(): void {
  client = null;
}
