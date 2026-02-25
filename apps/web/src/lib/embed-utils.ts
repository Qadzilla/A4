export interface EmbedCardData {
  url: string;
  title: string;
}

export function createDefaultEmbedData(): EmbedCardData {
  return { url: '', title: '' };
}

export function isValidEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
