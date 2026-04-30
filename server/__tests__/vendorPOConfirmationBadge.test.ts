/**
 * Route-level tests for the confirmationBadge field on GET /api/vendor-pos.
 *
 * Verifies that:
 *   1. The confirmationBadge field is present on every issued PO
 *      (status: Sent | Partially Received | Fully Received).
 *   2. The badge reflects the correct state derived from magic_link_tokens
 *      (confirmed / awaiting / expired / no_link).
 *   3. When the magic_link_tokens augmentation query fails the endpoint still
 *      returns HTTP 200, defaults issued POs to 'no_link', and logs the error
 *      via console.error.
 *   4. Non-issued POs receive confirmationBadge: null (no badge shown).
 *
 * No real database connection is required — both the storage layer and the
 * Drizzle db.execute calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

vi.mock('../storage', () => ({
  storage: {
    getAllVendorPOs: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  db: { execute: vi.fn() },
  pool: {},
}));

vi.mock('../utils/magicLink', () => ({ generateMagicLink: vi.fn() }));
vi.mock('../communication/send', () => ({ sendCommunication: vi.fn() }));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { storage } from '../storage';
import { db } from '../db';
import vendorPOsRouter from '../src/routes/vendorPOs';

// ── App fixture ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', vendorPOsRouter);
  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap POs in the paginated shape that getAllVendorPOs returns */
function paginatedResult(pos: Record<string, unknown>[]) {
  return { data: pos, total: pos.length };
}

/** Empty receipt-count result (no in-progress receipts) */
const NO_RECEIPTS = { rows: [] };

/** Future expiry so tokens are not expired */
const FUTURE_EXPIRY = new Date(Date.now() + 86_400_000).toISOString();

/** Past expiry so tokens are considered expired */
const PAST_EXPIRY = new Date(Date.now() - 86_400_000).toISOString();

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('GET /api/vendor-pos — confirmationBadge augmentation', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── 1. Issued POs get a badge ─────────────────────────────────────────────

  it('returns confirmationBadge: "no_link" on issued POs when no token exists', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([
        { id: 1, status: 'Sent' },
        { id: 2, status: 'Partially Received' },
        { id: 3, status: 'Fully Received' },
      ]),
    );
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)  // receipt-count query
      .mockResolvedValueOnce(NO_RECEIPTS); // magic_link_tokens query

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const pos = res.body.data as Array<Record<string, unknown>>;
    expect(pos).toHaveLength(3);
    for (const po of pos) {
      expect(po.confirmationBadge).toBe('no_link');
    }
  });

  // ── 2. Badge values derived from token state ──────────────────────────────

  it('returns confirmationBadge: "confirmed" when the token has been used', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([{ id: 10, status: 'Sent' }]),
    );
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)
      .mockResolvedValueOnce({
        rows: [{ vendor_po_id: 10, usedAt: '2025-06-01T00:00:00Z', expiresAt: FUTURE_EXPIRY }],
      });

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data[0].confirmationBadge).toBe('confirmed');
  });

  it('returns confirmationBadge: "awaiting" when the token has not been used and has not expired', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([{ id: 11, status: 'Sent' }]),
    );
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)
      .mockResolvedValueOnce({
        rows: [{ vendor_po_id: 11, usedAt: null, expiresAt: FUTURE_EXPIRY }],
      });

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data[0].confirmationBadge).toBe('awaiting');
  });

  it('returns confirmationBadge: "expired" when the token has not been used and has expired', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([{ id: 12, status: 'Partially Received' }]),
    );
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)
      .mockResolvedValueOnce({
        rows: [{ vendor_po_id: 12, usedAt: null, expiresAt: PAST_EXPIRY }],
      });

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data[0].confirmationBadge).toBe('expired');
  });

  // ── 3. Augmentation failure resilience ────────────────────────────────────

  it('still returns HTTP 200 with confirmationBadge: "no_link" when the magic_link_tokens query throws', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([{ id: 20, status: 'Sent' }]),
    );
    const augError = new Error('magic_link_tokens table not found');
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)  // receipt-count succeeds
      .mockRejectedValueOnce(augError);    // magic_link_tokens throws

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.data[0].confirmationBadge).toBe('no_link');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('magic_link_tokens'),
      augError,
    );

    errorSpy.mockRestore();
  });

  it('logs the error via console.error when the magic_link_tokens query throws', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([{ id: 21, status: 'Fully Received' }]),
    );
    const augError = new Error('connection refused');
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)
      .mockRejectedValueOnce(augError);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).get('/');

    expect(errorSpy).toHaveBeenCalled();
    const [firstArg] = errorSpy.mock.calls[0];
    expect(String(firstArg)).toMatch(/magic_link_tokens/i);

    errorSpy.mockRestore();
  });

  // ── 4. Non-issued POs have no badge ──────────────────────────────────────

  it('returns confirmationBadge: null for non-issued POs (Draft, Cancelled)', async () => {
    vi.mocked(storage.getAllVendorPOs).mockResolvedValue(
      paginatedResult([
        { id: 30, status: 'Draft' },
        { id: 31, status: 'Cancelled' },
        { id: 32, status: 'RFQ Sent' },
      ]),
    );
    vi.mocked(db.execute)
      .mockResolvedValueOnce(NO_RECEIPTS)
      .mockResolvedValueOnce(NO_RECEIPTS);

    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    const pos = res.body.data as Array<Record<string, unknown>>;
    for (const po of pos) {
      expect(po.confirmationBadge).toBeNull();
    }
  });
});
