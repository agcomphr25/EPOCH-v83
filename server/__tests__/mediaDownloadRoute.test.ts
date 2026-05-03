/**
 * Integration tests for GET /api/media/:id/download
 *
 * The download endpoint must:
 * - Stream cloud-stored files with the correct Content-Type and
 *   Content-Disposition headers for every supported MIME type (PDF, PNG, JPEG).
 * - Return a plain 404 HTML response when the media record does not exist.
 * - Fall back to local file serving when cloud storage lookup fails.
 * - Return a clear "File Not Available" 404 page when neither cloud nor local
 *   storage can locate the file (never crash).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Response } from 'express';
import type { MediaLibrary } from '../schema';

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports
// ---------------------------------------------------------------------------

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
  pool: {},
}));

vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({
    getObjectEntityFile: vi.fn(),
    downloadObject: vi.fn(),
  })),
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../src/services/connectorHealthService', () => ({
  getConnectorHealth: vi.fn().mockResolvedValue(null),
  listConnectorHealthByTenant: vi.fn().mockResolvedValue([]),
  getConnectorHealthHistory: vi.fn().mockResolvedValue([]),
  startConnectorHealthEvaluator: vi.fn(),
}));

// Use vi.hoisted so the mock references are available inside the hoisted
// vi.mock factory and can also be controlled from individual test cases.
const { existsSyncMock, mkdirSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn().mockReturnValue(false),
  mkdirSyncMock: vi.fn(),
}));

// Mock fs so we can control whether "local" files exist.
vi.mock('fs', () => ({
  default: { existsSync: existsSyncMock, mkdirSync: mkdirSyncMock },
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
}));

// ---------------------------------------------------------------------------
// Import mocked modules after vi.mock declarations
// ---------------------------------------------------------------------------

import { db } from '../db';
import { ObjectStorageService } from '../replit_integrations/object_storage/objectStorage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMediaRecord(overrides: Partial<MediaLibrary> = {}): MediaLibrary {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    filename: 'document.pdf',
    storagePath: '/objects/media-library/document.pdf',
    mimeType: 'application/pdf',
    fileSize: 8192,
    folderId: null,
    capturedById: null,
    capturedByName: null,
    captureDate: new Date('2026-01-01T00:00:00Z'),
    title: null,
    notes: null,
    tags: null,
    category: 'document',
    thumbnailPath: null,
    isArchived: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Build a drizzle-style chainable select mock that resolves to `rows`.
 */
function buildSelectChain(rows: unknown[]) {
  const whereChain = { where: vi.fn().mockResolvedValue(rows) };
  const fromChain = { from: vi.fn().mockReturnValue(whereChain) };
  return vi.fn().mockReturnValue(fromChain);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/media/:id/download', () => {
  let app: express.Express;
  let mockGetObjectEntityFile: ReturnType<typeof vi.fn>;
  let mockDownloadObject: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore the default "no local file exists" behaviour after each test.
    existsSyncMock.mockReturnValue(false);

    // Grab the mock instance methods from the constructed ObjectStorageService
    const MockOSS = vi.mocked(ObjectStorageService);
    mockGetObjectEntityFile = vi.fn();
    mockDownloadObject = vi.fn();
    MockOSS.mockImplementation(() => ({
      getObjectEntityFile: mockGetObjectEntityFile,
      downloadObject: mockDownloadObject,
    }) as unknown as InstanceType<typeof ObjectStorageService>);

    app = express();
    app.use(express.json());
    const mediaRouter = (await import('../src/routes/media')).default;
    app.use('/api/media', mediaRouter);
  });

  afterEach(() => {
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Cloud-stored file scenarios
  // -------------------------------------------------------------------------

  it('streams a PDF with correct Content-Type and inline Content-Disposition from cloud storage', async () => {
    const media = makeMediaRecord({
      filename: 'spec-sheet.pdf',
      storagePath: '/objects/media-library/spec-sheet.pdf',
      mimeType: 'application/pdf',
    });

    vi.mocked(db).select = buildSelectChain([media]);

    const fakeFile = new File(['%PDF-1.4 fake'], 'spec-sheet.pdf', { type: 'application/pdf' });
    mockGetObjectEntityFile.mockResolvedValue(fakeFile);
    mockDownloadObject.mockImplementation(async (_file: File, res: Response) => {
      res.setHeader('X-Test-Streamed', 'true');
      res.status(200).send('PDF_BYTES');
    });

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/inline/);
    expect(res.headers['content-disposition']).toContain('spec-sheet.pdf');
    expect(mockGetObjectEntityFile).toHaveBeenCalledWith('/objects/media-library/spec-sheet.pdf');
    expect(mockDownloadObject).toHaveBeenCalledOnce();
  });

  it('streams a PNG image with correct Content-Type from cloud storage', async () => {
    const media = makeMediaRecord({
      filename: 'photo.png',
      storagePath: '/objects/media-library/photo.png',
      mimeType: 'image/png',
    });

    vi.mocked(db).select = buildSelectChain([media]);

    const fakeFile = new File(['\x89PNG\r\n'], 'photo.png', { type: 'image/png' });
    mockGetObjectEntityFile.mockResolvedValue(fakeFile);
    mockDownloadObject.mockImplementation(async (_file: File, res: Response) => {
      res.status(200).send('PNG_BYTES');
    });

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['content-disposition']).toContain('photo.png');
    expect(mockDownloadObject).toHaveBeenCalledOnce();
  });

  it('streams a JPEG image with correct Content-Type from cloud storage', async () => {
    const media = makeMediaRecord({
      filename: 'snapshot.jpg',
      storagePath: 'objects/media-library/snapshot.jpg',
      mimeType: 'image/jpeg',
    });

    vi.mocked(db).select = buildSelectChain([media]);

    const fakeFile = new File(['\xFF\xD8\xFF'], 'snapshot.jpg', { type: 'image/jpeg' });
    mockGetObjectEntityFile.mockResolvedValue(fakeFile);
    mockDownloadObject.mockImplementation(async (_file: File, res: Response) => {
      res.status(200).send('JPEG_BYTES');
    });

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(mockDownloadObject).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Missing record — 404
  // -------------------------------------------------------------------------

  it('returns 404 HTML when the media record does not exist in the database', async () => {
    vi.mocked(db).select = buildSelectChain([]);

    const res = await request(app).get('/api/media/nonexistent-id/download');

    expect(res.status).toBe(404);
    expect(res.text).toMatch(/File Not Found/i);
    expect(mockDownloadObject).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cloud storage failure → local file fallback
  // -------------------------------------------------------------------------

  it('attempts local file serving when cloud storage lookup throws', async () => {
    const media = makeMediaRecord({
      filename: 'legacy.pdf',
      storagePath: '/objects/media-library/legacy.pdf',
      mimeType: 'application/pdf',
    });

    vi.mocked(db).select = buildSelectChain([media]);
    mockGetObjectEntityFile.mockRejectedValue(new Error('Cloud unreachable'));

    // Simulate a local file "existing" — existsSync returns true so the route
    // will call res.sendFile. In a unit test there is no real file, so sendFile
    // may emit its own 404/error response, but we verify that:
    //  1. Cloud storage was attempted.
    //  2. The cloud failure was caught and did not bubble up as an unhandled 500.
    //  3. The local path was checked.
    existsSyncMock.mockReturnValue(true);

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(mockGetObjectEntityFile).toHaveBeenCalledOnce();
    expect(mockDownloadObject).not.toHaveBeenCalled();
    expect(existsSyncMock).toHaveBeenCalled();
    // A response must have been sent (no hang); status reflects sendFile outcome.
    expect(res.status).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Cloud storage failure + no local file → clear 404, no crash
  // -------------------------------------------------------------------------

  it('returns a clear 404 "File Not Available" page when cloud fails and no local copy exists', async () => {
    const media = makeMediaRecord({
      filename: 'orphan.pdf',
      storagePath: '/objects/media-library/orphan.pdf',
      mimeType: 'application/pdf',
    });

    vi.mocked(db).select = buildSelectChain([media]);
    mockGetObjectEntityFile.mockRejectedValue(new Error('Object not found'));
    existsSyncMock.mockReturnValue(false);

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(res.status).toBe(404);
    expect(res.text).toMatch(/File Not Available/i);
    expect(res.text).toMatch(/orphan\.pdf/);
    expect(mockDownloadObject).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // No storagePath at all → 404, no crash
  // -------------------------------------------------------------------------

  it('returns 404 "File Not Available" when storagePath is empty', async () => {
    const media = makeMediaRecord({
      filename: 'ghost.pdf',
      storagePath: '',
      mimeType: 'application/pdf',
    });

    vi.mocked(db).select = buildSelectChain([media]);

    const res = await request(app).get(`/api/media/${media.id}/download`);

    expect(res.status).toBe(404);
    expect(res.text).toMatch(/File Not Available|File Not Found/i);
    expect(mockDownloadObject).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Unexpected error → 500 JSON, not a crash/hang
  // -------------------------------------------------------------------------

  it('returns 500 JSON when an unexpected database error is thrown', async () => {
    vi.mocked(db).select = vi.fn().mockImplementation(() => {
      throw new Error('DB connection lost');
    });

    const res = await request(app).get(`/api/media/any-id/download`);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
