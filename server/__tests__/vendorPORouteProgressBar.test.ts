/**
 * Route-level test for GET /api/vendor-pos/:id.
 *
 * Verifies that the HTTP response always includes `totalLines` and
 * `receivedLines` as numbers.  This catches the case where someone refactors
 * the route handler to filter or reshape the storage response, stripping those
 * fields before they reach the client — breaking the progress bar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ────────────────────────────────────────────────────────────────────
// Paths are resolved relative to this test file (server/__tests__/).

vi.mock('../storage', () => ({
  storage: {
    getVendorPO: vi.fn(),
  },
}));

// The route file also imports db (used only on the list GET /, not GET /:id).
vi.mock('../db', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
  pool: {},
}));

vi.mock('../utils/magicLink', () => ({ generateMagicLink: vi.fn() }));
vi.mock('../communication/send', () => ({ sendCommunication: vi.fn() }));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { storage } from '../storage';
import vendorPOsRouter from '../src/routes/vendorPOs';

// ── App fixture ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', vendorPOsRouter);
  return app;
}

// ── Fixture helpers ──────────────────────────────────────────────────────────

const PO_ID = 42;

function makePOPayload(
  totalLines: number,
  receivedLines: number,
): Record<string, unknown> {
  return {
    id: PO_ID,
    poNumber: 'VPO-26001',
    vendorId: 5,
    status: 'Sent',
    totalLines,
    receivedLines,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GET /api/vendor-pos/:id — progress bar fields', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  it('returns HTTP 200 with totalLines and receivedLines as numbers', async () => {
    vi.mocked(storage.getVendorPO).mockResolvedValue(makePOPayload(4, 2));

    const res = await request(app).get(`/${PO_ID}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.totalLines).toBe('number');
    expect(typeof res.body.receivedLines).toBe('number');
    expect(res.body.totalLines).toBe(4);
    expect(res.body.receivedLines).toBe(2);
  });

  it('returns totalLines=0 and receivedLines=0 when storage reports no line items', async () => {
    vi.mocked(storage.getVendorPO).mockResolvedValue(makePOPayload(0, 0));

    const res = await request(app).get(`/${PO_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.totalLines).toBe(0);
    expect(res.body.receivedLines).toBe(0);
  });

  it('returns HTTP 404 when storage returns undefined (PO not found)', async () => {
    vi.mocked(storage.getVendorPO).mockResolvedValue(undefined);

    const res = await request(app).get('/9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('does not strip totalLines or receivedLines from the storage response', async () => {
    vi.mocked(storage.getVendorPO).mockResolvedValue(makePOPayload(7, 3));

    const res = await request(app).get(`/${PO_ID}`);

    expect(res.body).toMatchObject({ totalLines: 7, receivedLines: 3 });
  });
});
