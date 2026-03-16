export interface Chunk {
  content: string;
  tokenCount: number;
  chunkIndex: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(
  text: string,
  options?: { maxTokens?: number; overlap?: number },
): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  const maxTokens = options?.maxTokens ?? 500;
  const overlap = options?.overlap ?? 50;

  // Split into sentences
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);

  // If no sentence boundaries found, split on whitespace
  if (sentences.length === 1 && estimateTokens(sentences[0]!) > maxTokens) {
    return splitOnWhitespace(sentences[0]!, maxTokens, overlap);
  }

  const chunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // Force-split a single very long sentence
    if (sentenceTokens > maxTokens) {
      // Flush current buffer first
      if (currentSentences.length > 0) {
        const content = currentSentences.join(' ');
        chunks.push({ content, tokenCount: estimateTokens(content), chunkIndex: chunks.length });
      }
      // Split the long sentence on whitespace
      const subChunks = splitOnWhitespace(sentence, maxTokens, overlap);
      for (const sub of subChunks) {
        chunks.push({ ...sub, chunkIndex: chunks.length });
      }
      currentSentences = [];
      currentTokens = 0;
      continue;
    }

    if (currentTokens + sentenceTokens > maxTokens && currentSentences.length > 0) {
      // Finalize current chunk
      const content = currentSentences.join(' ');
      chunks.push({ content, tokenCount: estimateTokens(content), chunkIndex: chunks.length });

      // Overlap: carry over last sentences that fit within overlap budget
      const overlapSentences: string[] = [];
      let overlapTokens = 0;
      for (let i = currentSentences.length - 1; i >= 0; i--) {
        const st = estimateTokens(currentSentences[i]!);
        if (overlapTokens + st > overlap) break;
        overlapSentences.unshift(currentSentences[i]!);
        overlapTokens += st;
      }
      currentSentences = overlapSentences;
      currentTokens = overlapTokens;
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Final chunk
  if (currentSentences.length > 0) {
    const content = currentSentences.join(' ');
    chunks.push({ content, tokenCount: estimateTokens(content), chunkIndex: chunks.length });
  }

  return chunks;
}

function splitOnWhitespace(text: string, maxTokens: number, overlap: number): Chunk[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < words.length) {
    let end = start;
    let tokens = 0;

    while (end < words.length) {
      const wordTokens = estimateTokens(words[end]!);
      if (tokens + wordTokens > maxTokens && end > start) break;
      tokens += wordTokens;
      end++;
    }

    const content = words.slice(start, end).join(' ');
    chunks.push({ content, tokenCount: estimateTokens(content), chunkIndex: chunks.length });

    // Next chunk starts at `end` minus overlap words
    let nextStart = end;
    let overlapTokens = 0;
    for (let i = end - 1; i > start; i--) {
      const wt = estimateTokens(words[i]!);
      if (overlapTokens + wt > overlap) break;
      nextStart = i;
      overlapTokens += wt;
    }
    // Always advance at least one word to avoid infinite loops
    start = Math.max(nextStart, start + 1);
  }

  return chunks;
}
