import fs from 'node:fs/promises';
import Papa from 'papaparse';
import { unzipSync } from 'fflate';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function extractText(filePath: string, mimeType: string): Promise<string> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      console.warn(`[text-extraction] File too large (${stat.size} bytes), skipping: ${filePath}`);
      return '';
    }
  } catch {
    console.warn(`[text-extraction] Cannot stat file: ${filePath}`);
    return '';
  }

  if (mimeType === 'text/plain') {
    return extractPlainText(filePath);
  }
  if (mimeType === 'text/csv') {
    return extractCsv(filePath);
  }
  if (mimeType === 'application/pdf') {
    return extractPdf(filePath);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocx(filePath);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) {
    return extractXlsx(filePath);
  }
  if (mimeType.startsWith('image/')) {
    return extractImage(filePath);
  }

  console.warn(`[text-extraction] Unsupported MIME type: ${mimeType}`);
  return '';
}

async function extractPlainText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[text-extraction] Failed to read text file: ${filePath}`, err);
    return '';
  }
}

async function extractCsv(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const result = Papa.parse<string[]>(content, { header: false, skipEmptyLines: true });
    return (result.data as string[][])
      .map((row) => row.join(' | '))
      .join('\n');
  } catch (err) {
    console.warn(`[text-extraction] Failed to parse CSV: ${filePath}`, err);
    return '';
  }
}

async function extractImage(filePath: string): Promise<string> {
  try {
    const { ocrImage } = await import('./ocr.js');
    return await ocrImage(filePath);
  } catch (err) {
    console.warn(`[text-extraction] Failed to OCR image: ${filePath}`, err);
    return '';
  }
}

async function extractPdf(filePath: string): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = result.text.trim();

    if (text.length >= 50) {
      return text;
    }

    // Text-layer is too short — likely a scanned PDF, try OCR
    console.log(`[text-extraction] PDF text too short (${text.length} chars), attempting OCR: ${filePath}`);
    try {
      const { ocrPdfPages } = await import('./ocr.js');
      const ocrText = await ocrPdfPages(filePath);
      if (ocrText.length > text.length) {
        return ocrText;
      }
    } catch (ocrErr) {
      console.warn(`[text-extraction] PDF OCR fallback failed: ${filePath}`, ocrErr);
    }

    return text;
  } catch (err) {
    console.warn(`[text-extraction] Failed to parse PDF: ${filePath}`, err);
    return '';
  }
}

async function extractDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (err) {
    console.warn(`[text-extraction] Failed to parse DOCX: ${filePath}`, err);
    return '';
  }
}

async function extractXlsx(filePath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
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
    console.warn(`[text-extraction] Failed to parse XLSX: ${filePath}`, err);
    return '';
  }
}
