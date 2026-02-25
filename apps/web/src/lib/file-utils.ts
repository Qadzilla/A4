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
  try {
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return undefined;
    const ws = wb.Sheets[sheetName];
    if (!ws) return undefined;
    const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    if (raw.length < 1) return undefined;
    const columns = (raw[0] ?? []).map(String);
    const rows = raw.slice(1, 6).map((row) => columns.map((_, i) => String(row[i] ?? '')));
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
