import fs from 'node:fs/promises';
import path from 'node:path';
import { USE_R2, env } from '../env';

export interface StorageBackend {
  put(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local disk backend (dev / fallback)
// ---------------------------------------------------------------------------

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads');

class LocalStorageBackend implements StorageBackend {
  private resolve(key: string): string {
    // Backward compat: old DB rows store absolute paths
    if (path.isAbsolute(key)) return key;
    return path.join(UPLOAD_ROOT, key);
  }

  async put(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch {
      // File may already be deleted
    }
  }
}

// ---------------------------------------------------------------------------
// Cloudflare R2 backend (production)
// ---------------------------------------------------------------------------

class R2StorageBackend implements StorageBackend {
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null = null;

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-s3').then(
        ({ S3Client }) =>
          new S3Client({
            region: 'auto',
            endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: env.R2_ACCESS_KEY_ID!,
              secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
            },
          }),
      );
    }
    return this.clientPromise;
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
        Key: key,
      }),
    );
    const stream = res.Body;
    if (!stream) throw new Error(`Empty response for key: ${key}`);
    return Buffer.from(await stream.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
        Key: key,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const storage: StorageBackend = USE_R2 ? new R2StorageBackend() : new LocalStorageBackend();
