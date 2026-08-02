import http from 'node:http';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';
import { documentChunks, files } from '../db/schema';

// Mutable db ref
const dbRef = { current: null as any };

vi.mock('../db', () => ({
  get db() {
    return dbRef.current;
  },
}));
vi.mock('../env', () => ({
  get DEV_AUTH_BYPASS() {
    return true;
  },
  USE_R2: false,
}));

const mockEmbedFile = vi.fn().mockResolvedValue({ chunksCreated: 3 });
vi.mock('../services/embedding-pipeline', () => ({
  embedFile: (...args: any[]) => mockEmbedFile(...args),
}));

// Mock storage to avoid real disk writes
vi.mock('../services/storage', () => ({
  storage: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('fake content')),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock fs operations for multer disk storage tmp dir
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake content')),
  };
});

import { filesRouter } from '../routes/files';

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE page_embeddings (
      id TEXT PRIMARY KEY, file_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL, page INTEGER NOT NULL, embedding BLOB NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE investment_forms (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL,
      broker TEXT, broker_tin TEXT, corrected INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE income_forms (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      file_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, tax_year INTEGER NOT NULL,
      payer_name TEXT, payer_tin TEXT, corrected INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE w2_forms (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL,
      employer_name TEXT, employer_ein TEXT, corrected INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE fact_assertions (
      assertion_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      fact_id TEXT NOT NULL, tax_year INTEGER NOT NULL, value TEXT NOT NULL,
      source TEXT NOT NULL, asserted_at TEXT NOT NULL, supersedes TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE tax_1099s (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      file_id TEXT NOT NULL UNIQUE, tax_year INTEGER NOT NULL, broker TEXT,
      payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE document_chunks (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB NOT NULL,
      token_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

// Multipart body builder
function buildMultipart(
  boundary: string,
  fields: Record<string, string>,
  file: { fieldName: string; fileName: string; mimeType: string; content: Buffer },
) {
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ),
  );
  parts.push(file.content);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

function postUpload(
  port: number,
  fields: Record<string, string>,
  file: { fieldName: string; fileName: string; mimeType: string; content: Buffer },
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const body = buildMultipart(boundary, fields, file);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/files/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode!, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpDelete(port: number, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'DELETE' }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let server: http.Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use('/api/files', filesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  dbRef.current = createTestDb();
  mockEmbedFile.mockClear();
  mockEmbedFile.mockResolvedValue({ chunksCreated: 3 });
});

describe('file upload → embedding trigger', () => {
  it('calls embedFile after successful PDF upload', async () => {
    const result = await postUpload(
      port,
      { workspaceId: 'ws-1' },
      {
        fieldName: 'file',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('fake pdf content'),
      },
    );

    expect(result.status).toBe(200);
    expect(result.body.fileId).toBeTruthy();

    // embedFile is fire-and-forget, give it a tick to be called
    await new Promise((r) => setTimeout(r, 50));

    expect(mockEmbedFile).toHaveBeenCalledOnce();
    expect(mockEmbedFile).toHaveBeenCalledWith(result.body.fileId, expect.anything());
  });

  it('calls embedFile after image upload (PNG, JPEG, WebP)', async () => {
    for (const [fileName, mimeType] of [
      ['photo.png', 'image/png'],
      ['photo.jpg', 'image/jpeg'],
      ['photo.webp', 'image/webp'],
    ] as const) {
      mockEmbedFile.mockClear();

      const result = await postUpload(
        port,
        { workspaceId: 'ws-1' },
        {
          fieldName: 'file',
          fileName,
          mimeType,
          content: Buffer.from('fake image content'),
        },
      );

      expect(result.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockEmbedFile).toHaveBeenCalledOnce();
      expect(mockEmbedFile).toHaveBeenCalledWith(result.body.fileId, expect.anything());
    }
  });

  it('still returns success even if embedding fails', async () => {
    mockEmbedFile.mockRejectedValue(new Error('embedding service down'));

    // Suppress expected console.error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await postUpload(
      port,
      { workspaceId: 'ws-1' },
      {
        fieldName: 'file',
        fileName: 'doc.csv',
        mimeType: 'text/csv',
        content: Buffer.from('a,b,c\n1,2,3'),
      },
    );

    expect(result.status).toBe(200);
    expect(result.body.fileId).toBeTruthy();

    await new Promise((r) => setTimeout(r, 50));
    expect(mockEmbedFile).toHaveBeenCalledOnce();

    spy.mockRestore();
  });
});

describe('file delete → chunk cleanup', () => {
  const fileId = 'file-del-001';

  function seedFileAndChunks(db: any) {
    db.insert(files)
      .values({
        id: fileId,
        userId: 'dev-user-001',
        workspaceId: 'ws-1',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        extension: '.pdf',
        storagePath: 'dev-user-001/test.pdf',
      })
      .run();

    db.insert(documentChunks)
      .values([
        {
          id: 'chunk-1',
          fileId,
          workspaceId: 'ws-1',
          userId: 'dev-user-001',
          chunkIndex: 0,
          content: 'chunk text 1',
          embedding: Buffer.from([1, 2, 3]),
          tokenCount: 10,
          createdAt: new Date(),
        },
        {
          id: 'chunk-2',
          fileId,
          workspaceId: 'ws-1',
          userId: 'dev-user-001',
          chunkIndex: 1,
          content: 'chunk text 2',
          embedding: Buffer.from([4, 5, 6]),
          tokenCount: 12,
          createdAt: new Date(),
        },
      ])
      .run();
  }

  it('deletes document chunks when file is deleted', async () => {
    const db = dbRef.current;
    seedFileAndChunks(db);

    const result = await httpDelete(port, `/api/files/${fileId}`);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);

    const remainingChunks = db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId))
      .all();
    expect(remainingChunks).toHaveLength(0);
  });

  it('handles delete when no chunks exist', async () => {
    const db = dbRef.current;
    // Insert file without chunks
    db.insert(files)
      .values({
        id: fileId,
        userId: 'dev-user-001',
        workspaceId: 'ws-1',
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        extension: '.pdf',
        storagePath: 'dev-user-001/test.pdf',
      })
      .run();

    const result = await httpDelete(port, `/api/files/${fileId}`);
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it('does not leave orphaned chunks', async () => {
    const db = dbRef.current;
    seedFileAndChunks(db);

    // Also add chunks for a different file that should NOT be deleted
    db.insert(files)
      .values({
        id: 'file-other',
        userId: 'dev-user-001',
        workspaceId: 'ws-1',
        fileName: 'other.pdf',
        fileSize: 512,
        mimeType: 'application/pdf',
        extension: '.pdf',
        storagePath: 'dev-user-001/other.pdf',
      })
      .run();
    db.insert(documentChunks)
      .values({
        id: 'chunk-other',
        fileId: 'file-other',
        workspaceId: 'ws-1',
        userId: 'dev-user-001',
        chunkIndex: 0,
        content: 'other chunk',
        embedding: Buffer.from([7, 8, 9]),
        tokenCount: 5,
        createdAt: new Date(),
      })
      .run();

    await httpDelete(port, `/api/files/${fileId}`);

    // Deleted file's chunks gone
    const deletedChunks = db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.fileId, fileId))
      .all();
    expect(deletedChunks).toHaveLength(0);

    // Other file's chunks untouched
    const otherChunks = db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.fileId, 'file-other'))
      .all();
    expect(otherChunks).toHaveLength(1);
  });
});
