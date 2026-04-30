import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CuttingDocument } from '../schema';

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  pool: {},
}));

vi.mock('../storage', () => ({
  storage: {
    listCuttingDocuments: vi.fn<() => Promise<CuttingDocument[]>>(),
    createCuttingDocument: vi.fn<(data: unknown) => Promise<CuttingDocument>>(),
    deleteCuttingDocument: vi.fn<(id: number) => Promise<CuttingDocument | undefined>>(),
  },
}));

vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({
    trySetObjectEntityAclPolicy: vi.fn().mockResolvedValue(undefined),
    deleteByStoragePath: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { storage } from '../storage';

function makeCuttingDocument(overrides: Partial<CuttingDocument> = {}): CuttingDocument {
  return {
    id: 1,
    displayName: 'Test Cut Sheet',
    fileUrl: 'objects/cutting-docs/test.pdf',
    originalFilename: 'test.pdf',
    mimeType: 'application/pdf',
    fileSize: 12345,
    uploadedAt: new Date('2026-04-01T10:00:00Z'),
    ...overrides,
  };
}

const VALID_PAYLOAD = {
  displayName: 'Test Cut Sheet',
  fileUrl: 'objects/cutting-docs/test.pdf',
  originalFilename: 'test.pdf',
  mimeType: 'application/pdf',
  fileSize: 12345,
};

describe('GET /api/cutting-documents', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/cuttingDocuments')).default;
    app.use('/api/cutting-documents', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 200 with an empty array when no documents exist', async () => {
    vi.mocked(storage.listCuttingDocuments).mockResolvedValue([]);

    const res = await request(app).get('/api/cutting-documents');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 200 with the list of uploaded documents', async () => {
    const docs = [
      makeCuttingDocument({ id: 1, displayName: 'Sheet A' }),
      makeCuttingDocument({ id: 2, displayName: 'Sheet B', fileUrl: 'objects/cutting-docs/b.pdf' }),
    ];
    vi.mocked(storage.listCuttingDocuments).mockResolvedValue(docs);

    const res = await request(app).get('/api/cutting-documents');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].displayName).toBe('Sheet A');
    expect(res.body[1].displayName).toBe('Sheet B');
  });

  it('returns 500 when storage throws', async () => {
    vi.mocked(storage.listCuttingDocuments).mockRejectedValue(new Error('DB unavailable'));

    const res = await request(app).get('/api/cutting-documents');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

describe('POST /api/cutting-documents', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/cuttingDocuments')).default;
    app.use('/api/cutting-documents', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns 201 with the saved record for valid input', async () => {
    const saved = makeCuttingDocument({ id: 42 });
    vi.mocked(storage.createCuttingDocument).mockResolvedValue(saved);

    const res = await request(app)
      .post('/api/cutting-documents')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(42);
    expect(res.body.displayName).toBe('Test Cut Sheet');
    expect(res.body.fileUrl).toBe('objects/cutting-docs/test.pdf');
  });

  it('persists the document through the storage layer', async () => {
    const saved = makeCuttingDocument({ id: 7 });
    vi.mocked(storage.createCuttingDocument).mockResolvedValue(saved);

    await request(app)
      .post('/api/cutting-documents')
      .send(VALID_PAYLOAD);

    expect(storage.createCuttingDocument).toHaveBeenCalledOnce();
    expect(storage.createCuttingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: VALID_PAYLOAD.displayName,
        fileUrl: VALID_PAYLOAD.fileUrl,
        originalFilename: VALID_PAYLOAD.originalFilename,
      }),
    );
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/cutting-documents')
      .send({ displayName: 'Missing fields' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
    expect(storage.createCuttingDocument).not.toHaveBeenCalled();
  });

  it('returns 400 for a completely empty body', async () => {
    const res = await request(app)
      .post('/api/cutting-documents')
      .send({});

    expect(res.status).toBe(400);
    expect(storage.createCuttingDocument).not.toHaveBeenCalled();
  });

  it('returns 500 when storage throws on create', async () => {
    vi.mocked(storage.createCuttingDocument).mockRejectedValue(new Error('DB write failed'));

    const res = await request(app)
      .post('/api/cutting-documents')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('saves the document even when the ACL policy call fails', async () => {
    const { ObjectStorageService } = await import('../replit_integrations/object_storage/objectStorage');
    vi.mocked(ObjectStorageService).mockImplementationOnce(() => ({
      trySetObjectEntityAclPolicy: vi.fn().mockRejectedValue(new Error('ACL service down')),
      deleteByStoragePath: vi.fn().mockResolvedValue(undefined),
    }));

    const saved = makeCuttingDocument({ id: 99 });
    vi.mocked(storage.createCuttingDocument).mockResolvedValue(saved);

    const res = await request(app)
      .post('/api/cutting-documents')
      .send(VALID_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(99);
    expect(storage.createCuttingDocument).toHaveBeenCalledOnce();
  });
});

describe('GET /api/cutting-documents — includes newly posted document', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    const router = (await import('../src/routes/cuttingDocuments')).default;
    app.use('/api/cutting-documents', router);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('lists the document that was just uploaded', async () => {
    const newDoc = makeCuttingDocument({ id: 5, displayName: 'Freshly Uploaded' });

    vi.mocked(storage.createCuttingDocument).mockResolvedValue(newDoc);
    vi.mocked(storage.listCuttingDocuments).mockResolvedValue([newDoc]);

    const postRes = await request(app)
      .post('/api/cutting-documents')
      .send({ ...VALID_PAYLOAD, displayName: 'Freshly Uploaded' });

    expect(postRes.status).toBe(201);

    const getRes = await request(app).get('/api/cutting-documents');

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveLength(1);
    expect(getRes.body[0].id).toBe(5);
    expect(getRes.body[0].displayName).toBe('Freshly Uploaded');
  });
});
