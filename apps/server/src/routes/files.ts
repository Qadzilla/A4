import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import { db } from '../db';
import { documentChunks, files, pageEmbeddings } from '../db/schema';
import { DEV_AUTH_BYPASS, USE_R2 } from '../env';
import { storage } from '../services/storage';
// Lazy import to avoid loading OpenAI SDK at server startup
const lazyEmbedFile = () => import('../services/embedding-pipeline').then((m) => m.embedFile);

const EMBEDDABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Use memory storage when R2 is active (buffer goes straight to R2).
// Use disk storage for local dev (avoids holding large files in memory).
const multerStorage = USE_R2
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => {
        const uploadDir = path.join(process.cwd(), 'data', 'uploads', '_tmp');
        mkdir(uploadDir, { recursive: true })
          .then(() => cb(null, uploadDir))
          .catch(cb as any);
      },
      filename: (_req, _file, cb) => {
        cb(null, `${randomUUID()}.tmp`);
      },
    });

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

export const filesRouter: RouterType = Router();

function getUserId(req: any): string | null {
  if (DEV_AUTH_BYPASS) return 'dev-user-001';
  return req.auth?.userId ?? null;
}

// POST /api/files/upload
filesRouter.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large (max 10MB)' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const workspaceId = req.body.workspaceId;
      if (!workspaceId) {
        res.status(400).json({ error: 'workspaceId is required' });
        return;
      }

      const fileId = randomUUID();
      const ext = path.extname(file.originalname) || '';
      // Store a relative key: {userId}/{fileId}{ext}
      const storageKey = `${userId}/${fileId}${ext}`;

      // Get the buffer — either from memory (R2 mode) or read from disk tmp
      let buffer: Buffer;
      if (file.buffer) {
        buffer = file.buffer;
      } else {
        const { readFile, unlink } = await import('node:fs/promises');
        buffer = await readFile(file.path);
        // Clean up tmp file after reading
        await unlink(file.path).catch(() => {});
      }

      await storage.put(storageKey, buffer, file.mimetype);

      await db.insert(files).values({
        id: fileId,
        userId,
        workspaceId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        extension: ext,
        storagePath: storageKey,
      });

      res.json({
        fileId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      // Optional holdings import — the client opts in per upload
      if (req.body.importHoldings === '1') {
        const { enqueueJob, JOB_TYPES } = await import('../services/job-queue');
        await enqueueJob(JOB_TYPES.importStatement, { fileId }, { db, maxAttempts: 2 }).catch(
          (err) => console.error(`[import] Failed to enqueue for ${fileId}:`, err),
        );
      }

      // Fire-and-forget background embedding for text-extractable files
      if (EMBEDDABLE_MIME_TYPES.has(file.mimetype)) {
        lazyEmbedFile()
          .then((embedFile) => embedFile(fileId, db))
          .catch((err) => {
            console.error(`[RAG] Background embedding failed for file ${fileId}:`, err);
          });
      }
    } catch (error) {
      next(error);
    }
  });
});

// GET /api/files/:fileId
filesRouter.get('/:fileId', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const fileRecord = await db.select().from(files).where(eq(files.id, req.params.fileId)).get();
  if (!fileRecord || fileRecord.userId !== userId) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  try {
    const buffer = await storage.get(fileRecord.storagePath);
    res.setHeader('Content-Type', fileRecord.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileRecord.fileName}"`);
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'File not found in storage' });
  }
});

// DELETE /api/files/:fileId
filesRouter.delete('/:fileId', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const fileRecord = await db.select().from(files).where(eq(files.id, req.params.fileId)).get();
  if (!fileRecord || fileRecord.userId !== userId) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  await storage.delete(fileRecord.storagePath);

  // Capture chunk ids before deleting so entity mentions can cascade
  const chunkRows = await db
    .select({ id: documentChunks.id })
    .from(documentChunks)
    .where(eq(documentChunks.fileId, req.params.fileId));

  await db.delete(documentChunks).where(eq(documentChunks.fileId, req.params.fileId));
  await db.delete(pageEmbeddings).where(eq(pageEmbeddings.fileId, req.params.fileId));
  await db.delete(files).where(eq(files.id, req.params.fileId));

  if (chunkRows.length > 0) {
    const { cleanupMentionsForChunks } = await import('../services/entity-extraction');
    await cleanupMentionsForChunks(
      chunkRows.map((c) => c.id),
      fileRecord.workspaceId,
      db,
    ).catch((err) => {
      console.error(`[entities] Mention cleanup failed for file ${req.params.fileId}:`, err);
    });
  }

  res.json({ success: true });
});
