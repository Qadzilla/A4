import { env } from '../env';

const VOYAGE_URL = 'https://api.voyageai.com/v1/multimodalembeddings';
const MODEL = 'voyage-multimodal-3';

/**
 * Voyage multimodal embeddings put page images and text queries in the same
 * vector space — a text query like "organizational chart" can match the
 * *picture* of a chart on a scanned page. Plain fetch, no SDK; failures throw
 * and the job queue handles retries.
 */

interface VoyageResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

async function callVoyage(inputs: Array<{ content: unknown[] }>): Promise<Float32Array[]> {
  if (!env.VOYAGE_API_KEY) {
    throw new Error('VOYAGE_API_KEY is not set — visual retrieval is disabled');
  }

  const response = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, inputs }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Voyage API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as VoyageResponse;
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((item) => new Float32Array(item.embedding));
}

/** Embeds rendered page images (PNG buffers). */
export async function embedPageImages(pngBuffers: Buffer[]): Promise<Float32Array[]> {
  if (pngBuffers.length === 0) return [];
  return callVoyage(
    pngBuffers.map((png) => ({
      content: [
        {
          type: 'image_base64',
          image_base64: `data:image/png;base64,${png.toString('base64')}`,
        },
      ],
    })),
  );
}

/** Embeds a text query into the same space as the page images. */
export async function embedVisualQuery(query: string): Promise<Float32Array> {
  const [result] = await callVoyage([{ content: [{ type: 'text', text: query }] }]);
  if (!result) throw new Error('Voyage API returned no embedding');
  return result;
}
