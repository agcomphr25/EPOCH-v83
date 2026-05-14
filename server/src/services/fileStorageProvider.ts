import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { Readable } from 'stream';
import { Response } from 'express';
import { ObjectStorageService } from '../../replit_integrations/object_storage';

export type FileStorageProviderName = 'replit' | 'supabase';

export interface CreateUploadTargetInput {
  fileName: string;
  contentType?: string | null;
  scope?: string;
  entityId?: string;
}

export interface UploadTarget {
  uploadURL: string;
  objectPath: string;
  provider: FileStorageProviderName;
}

export interface FileStorageProvider {
  readonly name: FileStorageProviderName;
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
  uploadBuffer(input: CreateUploadTargetInput & { buffer: Buffer }): Promise<string>;
  setPublicReadPolicy(objectPath: string, owner?: string): Promise<void>;
  deleteObject(objectPath: string): Promise<void>;
  downloadObject(objectPath: string, res: Response): Promise<void>;
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';
}

function getSigningSecret() {
  const secret =
    process.env.FILE_STORAGE_SIGNING_SECRET ||
    process.env.PORTAL_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET;

  if (!secret) {
    throw storageConfigError(
      'missing_upload_signing_secret',
      'Set FILE_STORAGE_SIGNING_SECRET, PORTAL_TOKEN_SECRET, JWT_SECRET, or SESSION_SECRET.'
    );
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: Record<string, unknown>) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', getSigningSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token: string) {
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    throw storageAuthError('invalid_upload_token', 'Upload token is malformed.');
  }

  const expected = createHmac('sha256', getSigningSecret()).update(body).digest('base64url');
  const providedBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw storageAuthError('invalid_upload_token', 'Upload token signature is invalid.');
  }

  const payload = JSON.parse(base64UrlDecode(body)) as {
    provider: FileStorageProviderName;
    bucket: string;
    path: string;
    exp: number;
  };

  if (!payload.exp || Date.now() > payload.exp) {
    throw storageAuthError('expired_upload_token', 'Upload token has expired.');
  }

  return payload;
}

function storageConfigError(reason: string, message: string) {
  const err = new Error(message);
  (err as any).reason = reason;
  (err as any).status = 503;
  return err;
}

function storageAuthError(reason: string, message: string) {
  const err = new Error(message);
  (err as any).reason = reason;
  (err as any).status = 403;
  return err;
}

function storageProviderError(reason: string, message: string, status = 502) {
  const err = new Error(message);
  (err as any).reason = reason;
  (err as any).status = status;
  return err;
}

class ReplitFileStorageProvider implements FileStorageProvider {
  readonly name = 'replit' as const;
  private readonly objectStorage = new ObjectStorageService();

  async createUploadTarget(): Promise<UploadTarget> {
    const uploadURL = await this.objectStorage.getObjectEntityUploadURL();
    const objectPath = this.objectStorage.normalizeObjectEntityPath(uploadURL);
    return { uploadURL, objectPath, provider: this.name };
  }

  async uploadBuffer(input: CreateUploadTargetInput & { buffer: Buffer }): Promise<string> {
    const objectPath = await this.objectStorage.uploadBuffer(
      input.buffer,
      input.fileName,
      input.contentType || 'application/octet-stream',
      input.scope || 'uploads'
    );
    return objectPath;
  }

  async setPublicReadPolicy(objectPath: string, owner = 'system') {
    await this.objectStorage.trySetObjectEntityAclPolicy(objectPath, {
      owner,
      visibility: 'public',
    });
  }

  async deleteObject(objectPath: string) {
    const objectFile = await this.objectStorage.getObjectEntityFile(normalizeLegacyObjectPath(objectPath));
    await objectFile.delete();
  }

  async downloadObject(objectPath: string, res: Response) {
    const objectFile = await this.objectStorage.getObjectEntityFile(normalizeLegacyObjectPath(objectPath));
    await this.objectStorage.downloadObject(objectFile, res);
  }
}

class SupabaseFileStorageProvider implements FileStorageProvider {
  readonly name = 'supabase' as const;

  private get url() {
    const value = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    if (!value) {
      throw storageConfigError('missing_supabase_url', 'Set SUPABASE_URL to use Supabase Storage.');
    }
    return value;
  }

  private get serviceKey() {
    const value = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!value) {
      throw storageConfigError(
        'missing_supabase_service_key',
        'Set SUPABASE_SERVICE_ROLE_KEY on the server to use Supabase Storage.'
      );
    }
    return value;
  }

  private get bucket() {
    const value = process.env.SUPABASE_STORAGE_BUCKET || process.env.FILE_STORAGE_BUCKET;
    if (!value) {
      throw storageConfigError(
        'missing_supabase_storage_bucket',
        'Set SUPABASE_STORAGE_BUCKET to the private Supabase Storage bucket name.'
      );
    }
    return value;
  }

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    const scope = sanitizePathSegment(input.scope || 'uploads');
    const entityId = input.entityId ? sanitizePathSegment(input.entityId) : 'general';
    const originalName = sanitizePathSegment(input.fileName);
    const objectName = `${scope}/${entityId}/${randomUUID()}-${originalName}`;
    const token = signPayload({
      provider: this.name,
      bucket: this.bucket,
      path: objectName,
      exp: Date.now() + 15 * 60 * 1000,
    });

    return {
      uploadURL: `/api/storage/upload?token=${encodeURIComponent(token)}`,
      objectPath: toSupabaseObjectPath(this.bucket, objectName),
      provider: this.name,
    };
  }

  async uploadBuffer(input: CreateUploadTargetInput & { buffer: Buffer }): Promise<string> {
    const target = await this.createUploadTarget(input);
    const ref = parseSupabaseObjectPath(target.objectPath);
    return this.uploadObject(ref.bucket, ref.path, input.buffer, input.contentType || 'application/octet-stream');
  }

  async setPublicReadPolicy() {
    // Supabase access is enforced through server-side download routes and bucket policy.
  }

  async deleteObject(objectPath: string) {
    const ref = parseSupabaseObjectPath(objectPath);
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${ref.path}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      throw storageProviderError(
        'supabase_delete_failed',
        `Supabase delete failed with status ${response.status}`,
        response.status
      );
    }
  }

  async downloadObject(objectPath: string, res: Response) {
    const ref = parseSupabaseObjectPath(objectPath);
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${ref.path}`, {
      headers: this.authHeaders(),
    });

    if (!response.ok || !response.body) {
      const status = response.status === 404 ? 404 : 502;
      throw storageProviderError(
        response.status === 404 ? 'supabase_object_not_found' : 'supabase_download_failed',
        `Supabase download failed with status ${response.status}`,
        status
      );
    }

    response.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'cache-control'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    Readable.fromWeb(response.body as any).pipe(res);
  }

  async uploadWithToken(token: string, body: Buffer, contentType?: string) {
    const payload = verifyPayload(token);
    if (payload.provider !== this.name) {
      throw storageAuthError('wrong_storage_provider', 'Upload token is not for Supabase Storage.');
    }
    if (payload.bucket !== this.bucket) {
      throw storageAuthError('wrong_storage_bucket', 'Upload token bucket does not match server config.');
    }

    return this.uploadObject(payload.bucket, payload.path, body, contentType || 'application/octet-stream');
  }

  private async uploadObject(bucket: string, path: string, body: Buffer, contentType: string) {
    const response = await fetch(`${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
      body,
    });

    if (!response.ok) {
      let details = '';
      try {
        details = await response.text();
      } catch {
        // ignore
      }
      throw storageProviderError(
        'supabase_upload_failed',
        `Supabase upload failed with status ${response.status}${details ? `: ${details.slice(0, 200)}` : ''}`,
        response.status
      );
    }

    return toSupabaseObjectPath(bucket, path);
  }

  private authHeaders() {
    return {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
    };
  }
}

function normalizeLegacyObjectPath(objectPath: string) {
  return objectPath.startsWith('objects/') ? `/${objectPath}` : objectPath;
}

function toSupabaseObjectPath(bucket: string, path: string) {
  return `/objects/supabase/${bucket}/${path}`;
}

function parseSupabaseObjectPath(objectPath: string) {
  const normalized = normalizeLegacyObjectPath(objectPath);
  const prefix = '/objects/supabase/';
  if (!normalized.startsWith(prefix)) {
    throw storageProviderError('invalid_supabase_object_path', `Invalid Supabase object path: ${objectPath}`, 400);
  }
  const rest = normalized.slice(prefix.length);
  const [bucket, ...pathParts] = rest.split('/');
  const path = pathParts.join('/');
  if (!bucket || !path) {
    throw storageProviderError('invalid_supabase_object_path', `Invalid Supabase object path: ${objectPath}`, 400);
  }
  return { bucket, path };
}

export function getFileStorageProvider(): FileStorageProvider {
  const provider = (process.env.FILE_STORAGE_PROVIDER || 'replit').toLowerCase();
  if (provider === 'supabase') return new SupabaseFileStorageProvider();
  return new ReplitFileStorageProvider();
}

export function getFileStorageProviderForObjectPath(objectPath: string): FileStorageProvider {
  if (isSupabaseObjectPath(objectPath)) return new SupabaseFileStorageProvider();
  return new ReplitFileStorageProvider();
}

export function isSupabaseObjectPath(objectPath: string | null | undefined) {
  return !!objectPath && normalizeLegacyObjectPath(objectPath).startsWith('/objects/supabase/');
}

export function isReplitObjectPath(objectPath: string | null | undefined) {
  return !!objectPath && normalizeLegacyObjectPath(objectPath).startsWith('/objects/') && !isSupabaseObjectPath(objectPath);
}

export async function uploadSupabaseObjectFromSignedToken(token: string, body: Buffer, contentType?: string) {
  const provider = new SupabaseFileStorageProvider();
  return provider.uploadWithToken(token, body, contentType);
}

export function getStorageErrorResponse(error: unknown) {
  const err = error as { status?: number; reason?: string; message?: string };
  const reason = err?.reason || 'storage_error';
  const message = err?.message || 'Storage operation failed';
  const status = err?.status && err.status >= 400 ? err.status : 500;
  return { status, reason, message };
}
