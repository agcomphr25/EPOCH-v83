/**
 * Unit tests for migrateVendorDocumentUrls (server/src/routes/vendors.ts).
 *
 * The migration handles four URL-format cases for each of two fields
 * (mainDocumentUrl and approvalPdfUrl):
 *   1. Already-migrated /objects/ path        → left unchanged (no DB write)
 *   2. Full GCS URL (https://storage.googleapis.com/...)  → normalized to /objects/
 *   3. Legacy local path, local file present  → uploaded to object storage, DB updated
 *   4. Legacy local path, local file missing  → DB field set to null
 *
 * All external I/O (storage, fs, object-storage SDK, ACL helper, crypto) is
 * mocked so the tests run offline without any real files or network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock functions (available before vi.mock factories execute)
// ---------------------------------------------------------------------------

const {
  mockGetAllVendors,
  mockUpdateVendor,
  mockExistsSync,
  mockReadFileSync,
  mockMkdirSync,
  mockFileSave,
  mockGcsFile,
  mockBucket,
  mockSetObjectAclPolicy,
  FIXED_UUID,
} = vi.hoisted(() => {
  const FIXED_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const mockFileSave = vi.fn().mockResolvedValue(undefined);
  const mockGcsFile = vi.fn().mockReturnValue({ save: mockFileSave });
  const mockBucket = vi.fn().mockReturnValue({ file: mockGcsFile });
  return {
    mockGetAllVendors: vi.fn(),
    mockUpdateVendor: vi.fn().mockResolvedValue(undefined),
    mockExistsSync: vi.fn().mockReturnValue(false),
    mockReadFileSync: vi.fn().mockReturnValue(Buffer.from('pdf-bytes')),
    mockMkdirSync: vi.fn(),
    mockFileSave,
    mockGcsFile,
    mockBucket,
    mockSetObjectAclPolicy: vi.fn().mockResolvedValue(undefined),
    FIXED_UUID,
  };
});

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest before imports)
// ---------------------------------------------------------------------------

vi.mock('../storage', () => ({
  storage: {
    getAllVendors: mockGetAllVendors,
    updateVendor: mockUpdateVendor,
  },
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
    query: {},
  },
  pool: { query: vi.fn(), end: vi.fn(), connect: vi.fn() },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireRole: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../middleware/routeAuthorization', () => ({
  authorizeApiRoute: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../replit_integrations/object_storage/objectStorage', () => ({
  objectStorageClient: { bucket: mockBucket },
}));

vi.mock('../replit_integrations/object_storage/objectAcl', () => ({
  setObjectAclPolicy: mockSetObjectAclPolicy,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    mkdirSync: mockMkdirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue(FIXED_UUID),
}));

// ---------------------------------------------------------------------------
// Import the function under test (after mocks are set up)
// ---------------------------------------------------------------------------

import { migrateVendorDocumentUrls } from '../src/routes/vendors';

// ---------------------------------------------------------------------------
// Constants and helpers
// ---------------------------------------------------------------------------

const PRIVATE_OBJECT_DIR = '/test-bucket/vendor-store';

function makeVendor(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'ACME Corp',
    mainDocumentUrl: null as string | null,
    approvalPdfUrl: null as string | null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateVendorDocumentUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIVATE_OBJECT_DIR = PRIVATE_OBJECT_DIR;
    // Re-apply defaults cleared by clearAllMocks
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue(Buffer.from('pdf-bytes'));
    mockFileSave.mockResolvedValue(undefined);
    mockSetObjectAclPolicy.mockResolvedValue(undefined);
    mockUpdateVendor.mockResolvedValue(undefined);
    mockGcsFile.mockReturnValue({ save: mockFileSave });
    mockBucket.mockReturnValue({ file: mockGcsFile });
  });

  afterEach(() => {
    delete process.env.PRIVATE_OBJECT_DIR;
  });

  // ── Guard: skip when env var is absent ────────────────────────────────────

  it('does nothing when PRIVATE_OBJECT_DIR is not set', async () => {
    delete process.env.PRIVATE_OBJECT_DIR;
    await migrateVendorDocumentUrls();
    expect(mockGetAllVendors).not.toHaveBeenCalled();
    expect(mockUpdateVendor).not.toHaveBeenCalled();
  });

  // =========================================================================
  // mainDocumentUrl — four cases
  // =========================================================================

  describe('mainDocumentUrl', () => {
    it('case 1: already-migrated /objects/ URL — leaves DB unchanged', async () => {
      const vendor = makeVendor({ mainDocumentUrl: '/objects/vendor-documents/already-migrated.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });

    it('case 2: full GCS URL — normalises to /objects/ path', async () => {
      const gcsUrl = `https://storage.googleapis.com${PRIVATE_OBJECT_DIR}/vendor-documents/report.pdf`;
      const vendor = makeVendor({ mainDocumentUrl: gcsUrl });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, {
        mainDocumentUrl: '/objects/vendor-documents/report.pdf',
      });
    });

    it('case 3: legacy local path, file present — uploads and sets /objects/ URL', async () => {
      const vendor = makeVendor({ mainDocumentUrl: '/uploads/vendor-documents/spec.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(true);

      await migrateVendorDocumentUrls();

      expect(mockReadFileSync).toHaveBeenCalled();
      expect(mockFileSave).toHaveBeenCalled();
      expect(mockSetObjectAclPolicy).toHaveBeenCalled();
      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      const [id, patch] = mockUpdateVendor.mock.calls[0] as [number, { mainDocumentUrl: string }];
      expect(id).toBe(1);
      expect(patch.mainDocumentUrl).toMatch(/^\/objects\/vendor-documents\//);
      expect(patch.mainDocumentUrl).toContain(FIXED_UUID);
      expect(patch.mainDocumentUrl).toContain('spec.pdf');
    });

    it('case 4: legacy local path, file missing — clears URL to null', async () => {
      const vendor = makeVendor({ mainDocumentUrl: '/uploads/vendor-documents/ghost.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(false);

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, { mainDocumentUrl: null });
    });

    it('GCS URL from a different bucket/path — does not update DB', async () => {
      const gcsUrl = 'https://storage.googleapis.com/other-bucket/some/path/file.pdf';
      const vendor = makeVendor({ mainDocumentUrl: gcsUrl });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });

    it('unknown URL format — does not update DB', async () => {
      const vendor = makeVendor({ mainDocumentUrl: 'ftp://example.com/file.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // approvalPdfUrl — four cases
  // =========================================================================

  describe('approvalPdfUrl', () => {
    it('case 1: already-migrated /objects/ URL — leaves DB unchanged', async () => {
      const vendor = makeVendor({ approvalPdfUrl: '/objects/vendor-approvals/already.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });

    it('case 2: full GCS URL — normalises to /objects/ path', async () => {
      const gcsUrl = `https://storage.googleapis.com${PRIVATE_OBJECT_DIR}/vendor-approvals/approval.pdf`;
      const vendor = makeVendor({ approvalPdfUrl: gcsUrl });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, {
        approvalPdfUrl: '/objects/vendor-approvals/approval.pdf',
      });
    });

    it('case 3: legacy local path, file present — uploads and sets /objects/ URL', async () => {
      const vendor = makeVendor({ approvalPdfUrl: '/uploads/vendor-approvals/cert.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(true);

      await migrateVendorDocumentUrls();

      expect(mockReadFileSync).toHaveBeenCalled();
      expect(mockFileSave).toHaveBeenCalled();
      expect(mockSetObjectAclPolicy).toHaveBeenCalled();
      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      const [id, patch] = mockUpdateVendor.mock.calls[0] as [number, { approvalPdfUrl: string }];
      expect(id).toBe(1);
      expect(patch.approvalPdfUrl).toMatch(/^\/objects\/vendor-approvals\//);
      expect(patch.approvalPdfUrl).toContain(FIXED_UUID);
      expect(patch.approvalPdfUrl).toContain('cert.pdf');
    });

    it('case 4: legacy local path, file missing — clears URL to null', async () => {
      const vendor = makeVendor({ approvalPdfUrl: '/uploads/vendor-approvals/missing.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(false);

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, { approvalPdfUrl: null });
    });

    it('GCS URL from a different bucket/path — does not update DB', async () => {
      const gcsUrl = 'https://storage.googleapis.com/other-bucket/unrelated/file.pdf';
      const vendor = makeVendor({ approvalPdfUrl: gcsUrl });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });

    it('unknown URL format — does not update DB', async () => {
      const vendor = makeVendor({ approvalPdfUrl: 'ftp://example.com/cert.pdf' });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Multi-field: both URLs present on the same vendor
  // =========================================================================

  describe('vendor with both fields set', () => {
    it('processes mainDocumentUrl and approvalPdfUrl independently', async () => {
      const vendor = makeVendor({
        mainDocumentUrl: '/uploads/vendor-documents/doc.pdf',
        approvalPdfUrl: '/objects/vendor-approvals/already.pdf',
      });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(true);

      await migrateVendorDocumentUrls();

      // mainDocumentUrl: legacy path with existing file → upload + update
      // approvalPdfUrl: already /objects/ → no update for that field
      expect(mockUpdateVendor).toHaveBeenCalledOnce();
      const [id, patch] = mockUpdateVendor.mock.calls[0] as [number, Record<string, unknown>];
      expect(id).toBe(1);
      expect(patch).toHaveProperty('mainDocumentUrl');
      expect(patch).not.toHaveProperty('approvalPdfUrl');
    });

    it('both fields missing local files — both cleared to null independently', async () => {
      const vendor = makeVendor({
        mainDocumentUrl: '/uploads/vendor-documents/gone.pdf',
        approvalPdfUrl: '/uploads/vendor-approvals/gone.pdf',
      });
      mockGetAllVendors.mockResolvedValue({ data: [vendor] });
      mockExistsSync.mockReturnValue(false);

      await migrateVendorDocumentUrls();

      expect(mockUpdateVendor).toHaveBeenCalledTimes(2);
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, { mainDocumentUrl: null });
      expect(mockUpdateVendor).toHaveBeenCalledWith(1, { approvalPdfUrl: null });
    });
  });

  // =========================================================================
  // Vendors with no document URLs are ignored
  // =========================================================================

  it('skips vendors that have no document URLs', async () => {
    const vendor = makeVendor({ mainDocumentUrl: null, approvalPdfUrl: null });
    mockGetAllVendors.mockResolvedValue({ data: [vendor] });

    await migrateVendorDocumentUrls();

    expect(mockUpdateVendor).not.toHaveBeenCalled();
  });
});
