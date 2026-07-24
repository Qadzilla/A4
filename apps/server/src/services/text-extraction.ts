import Papa from 'papaparse';
import { unzipSync } from 'fflate';

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return extractPlainText(buffer);
  }
  if (mimeType === 'text/csv') {
    return extractCsv(buffer);
  }
  if (mimeType === 'application/pdf') {
    return extractPdf(buffer);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocx(buffer);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return extractXlsx(buffer);
  }
  if (mimeType.startsWith('image/')) {
    return extractImage(buffer);
  }

  console.warn(`[text-extraction] Unsupported MIME type: ${mimeType}`);
  return '';
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString('utf-8');
}

function extractCsv(buffer: Buffer): string {
  try {
    const content = buffer.toString('utf-8');
    const result = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true });
    return (result.data as string[][])
      .map((row) => row.join(' | '))
      .join('\n');
  } catch (err) {
    console.warn('[text-extraction] Failed to parse CSV:', err);
    return '';
  }
}

async function extractImage(buffer: Buffer): Promise<string> {
  try {
    const { ocrImage } = await import('./ocr.js');
    return await ocrImage(buffer);
  } catch (err) {
    console.warn('[text-extraction] Failed to OCR image:', err);
    return '';
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = result.text.trim();

    if (text.length >= 50) {
      return text;
    }

    // Text-layer is too short — likely a scanned PDF, try OCR
    console.log(`[text-extraction] PDF text too short (${text.length} chars), attempting OCR`);
    try {
      const { ocrPdfPages } = await import('./ocr.js');
      const ocrText = await ocrPdfPages(buffer);
      if (ocrText.length > text.length) {
        return ocrText;
      }
    } catch (ocrErr) {
      console.warn('[text-extraction] PDF OCR fallback failed:', ocrErr);
    }

    return text;
  } catch (err) {
    console.warn('[text-extraction] Failed to parse PDF:', err);
    return '';
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    console.warn('[text-extraction] Failed to parse DOCX:', err);
    return '';
  }
}

function extractXlsx(buffer: Buffer): string {
  try {
    const decompressed = unzipSync(new Uint8Array(buffer));

    const decoder = new TextDecoder();
    const sharedStrings: string[] = [];
    const ssData = decompressed['xl/sharedStrings.xml'];
    if (ssData) {
      const ssXml = decoder.decode(ssData);
      for (const siMatch of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
        let text = '';
        for (const tMatch of (siMatch[1] ?? '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
          text += tMatch[1];
        }
        sharedStrings.push(text);
      }
    }

    const sheetData = decompressed['xl/worksheets/sheet1.xml'];
    if (!sheetData) return '';
    // Cap at 5MB of XML to avoid OOM on huge spreadsheets
    const MAX_XML_BYTES = 5 * 1024 * 1024;
    const sheetXml = decoder.decode(sheetData.length > MAX_XML_BYTES ? sheetData.slice(0, MAX_XML_BYTES) : sheetData);

    function colIndex(ref: string): number {
      const letters = ref.replace(/\d+/g, '');
      let idx = 0;
      for (let i = 0; i < letters.length; i++) {
        idx = idx * 26 + (letters.charCodeAt(i) - 64);
      }
      return idx - 1;
    }

    const MAX_ROWS = 2000;
    const grid: string[][] = [];
    for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      if (grid.length >= MAX_ROWS) break;
      const cells: [number, string][] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\s([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1] ?? '';
        const inner = cellMatch[2] ?? '';
        const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
        const ci = refMatch?.[1] ? colIndex(refMatch[1]) : cells.length;
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const val = vMatch?.[1] ?? '';
        if (attrs.includes('t="s"') && val) {
          cells.push([ci, sharedStrings[Number(val)] ?? val]);
        } else {
          cells.push([ci, val]);
        }
      }
      const maxCol = cells.reduce((m, [ci]) => Math.max(m, ci), 0);
      const row: string[] = Array(maxCol + 1).fill('');
      for (const [ci, val] of cells) row[ci] = val;
      grid.push(row);
    }

    return grid.map((row) => row.join(' | ')).join('\n');
  } catch (err) {
    console.warn('[text-extraction] Failed to parse XLSX:', err);
    return '';
  }
}
