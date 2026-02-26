import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export { pdfjsLib };

export interface FileTablePreview {
  columns: string[];
  rows: string[][];
}

export interface FileCardData {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  previewData?: string;
  textPreview?: string;
  tablePreview?: FileTablePreview;
}

export async function uploadFile(
  file: File,
  workspaceId: string,
  getToken: () => Promise<string | null>,
): Promise<{ fileId: string; fileName: string; fileSize: number; mimeType: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', workspaceId);

  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(body.error ?? 'Upload failed');
  }

  return res.json();
}

export function getFileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'text/csv': 'CSV',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.ms-excel': 'Excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/webp': 'WebP',
    'text/plain': 'Text',
  };
  return map[mimeType] ?? 'File';
}

// ── Full file parsing (for transaction import) ──

export function parseFullCsv(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const grid = results.data as string[][];
        if (grid.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        const headers = (grid[0] ?? []).map(String);
        const rows = grid.slice(1).filter((row) => row.some((cell) => cell.trim()));
        resolve({ headers, rows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function parseFullExcel(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const arrayBuffer = await file.arrayBuffer();
  const { unzipSync } = await import('fflate');
  const decompressed = unzipSync(new Uint8Array(arrayBuffer));

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
  if (!sheetData) return { headers: [], rows: [] };
  const sheetXml = decoder.decode(sheetData);

  // Parse column reference (e.g. "A1" → 0, "B2" → 1, "AA3" → 26)
  function colIndex(ref: string): number {
    const letters = ref.replace(/\d+/g, '');
    let idx = 0;
    for (let i = 0; i < letters.length; i++) {
      idx = idx * 26 + (letters.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  const grid: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
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
    // Convert sparse cells to dense row
    const maxCol = cells.reduce((m, [ci]) => Math.max(m, ci), 0);
    const row: string[] = Array(maxCol + 1).fill('');
    for (const [ci, val] of cells) row[ci] = val;
    grid.push(row);
  }

  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = (grid[0] ?? []).map(String);
  const rows = grid.slice(1).filter((row) => row.some((cell) => cell.trim()));
  return { headers, rows };
}

// ── Preview generation (existing, limited to 6 rows) ──

function generateCsvPreview(file: File): Promise<FileTablePreview | undefined> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      preview: 6,
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length === 0) {
          resolve(undefined);
          return;
        }
        const columns = results.meta.fields;
        const rows = (results.data as Record<string, string>[])
          .slice(0, 5)
          .map((row) => columns.map((col) => row[col] ?? ''));
        resolve({ columns, rows });
      },
      error: () => resolve(undefined),
    });
  });
}

async function generateExcelPreview(file: File): Promise<FileTablePreview | undefined> {
  // Parse XLSX (which is a ZIP of XML files) without the vulnerable SheetJS library.
  // We only need the first sheet's first few rows for a preview.
  try {
    const arrayBuffer = await file.arrayBuffer();
    const { unzipSync } = await import('fflate');
    const decompressed = unzipSync(new Uint8Array(arrayBuffer));

    // Find shared strings (cell values are often stored here)
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

    // Parse first sheet
    const sheetData = decompressed['xl/worksheets/sheet1.xml'];
    if (!sheetData) return undefined;
    const sheetXml = decoder.decode(sheetData);

    // Extract rows (first 6 only for preview)
    const grid: string[][] = [];
    for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      if (grid.length >= 6) break;
      const cells: string[] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(
        /<c\s([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const attrs = cellMatch[1] ?? '';
        const inner = cellMatch[2] ?? '';
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const val = vMatch?.[1] ?? '';
        // t="s" means shared string reference
        if (attrs.includes('t="s"') && val) {
          cells.push(sharedStrings[Number(val)] ?? val);
        } else {
          cells.push(val);
        }
      }
      grid.push(cells);
    }

    if (grid.length < 1) return undefined;
    const columns = (grid[0] ?? []).map(String);
    const rows = grid.slice(1, 6).map((row) => columns.map((_, i) => String(row[i] ?? '')));
    return { columns, rows };
  } catch {
    return undefined;
  }
}

async function generateDocxPreview(file: File): Promise<string | undefined> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.slice(0, 500) || undefined;
  } catch {
    return undefined;
  }
}

async function generateTxtPreview(file: File): Promise<string | undefined> {
  try {
    const text = await file.text();
    return text.slice(0, 500) || undefined;
  } catch {
    return undefined;
  }
}

export async function generatePreview(
  file: File,
): Promise<{ previewData?: string; textPreview?: string; tablePreview?: FileTablePreview }> {
  const mime = file.type;

  if (mime === 'application/pdf') {
    // PDFs are rendered on-demand via <canvas> in file-card-content — no stored preview
    return {};
  }
  if (mime.startsWith('image/')) {
    // Images served directly from /api/files/{fileId} — no stored preview needed
    return {};
  }
  if (mime === 'text/csv') {
    return { tablePreview: await generateCsvPreview(file) };
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return { tablePreview: await generateExcelPreview(file) };
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return { textPreview: await generateDocxPreview(file) };
  }
  if (mime === 'text/plain') {
    return { textPreview: await generateTxtPreview(file) };
  }

  return {};
}
