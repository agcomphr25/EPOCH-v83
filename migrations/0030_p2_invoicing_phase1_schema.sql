-- Migration: P2 Invoicing — Phase 1: Schema & Constraints
-- Adds lifecycle fields to ar_invoices, unique constraint on packing_slip_id,
-- arInvoiceId FK to credit_memos, and seeds required chart_of_accounts rows.

-- ─── Step 1: Add lifecycle columns to ar_invoices ───────────────────────────
-- Timestamp columns use "timestamp without time zone" to match Drizzle's
-- timestamp() type (no withTimezone option), keeping parity with createdAt/updatedAt.
-- Valid status values: DRAFT, REVIEW, POSTED, SENT, DISPUTED, VOID, PAID
ALTER TABLE ar_invoices
  ADD COLUMN IF NOT EXISTS posted_at          timestamp,
  ADD COLUMN IF NOT EXISTS posted_by          text,
  ADD COLUMN IF NOT EXISTS sent_at            timestamp,
  ADD COLUMN IF NOT EXISTS sent_by            text,
  ADD COLUMN IF NOT EXISTS voided_at          timestamp,
  ADD COLUMN IF NOT EXISTS voided_by          text,
  ADD COLUMN IF NOT EXISTS void_reason        text,
  ADD COLUMN IF NOT EXISTS is_disputed        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_note       text,
  ADD COLUMN IF NOT EXISTS credit_memo_id     integer REFERENCES credit_memos(id),
  ADD COLUMN IF NOT EXISTS auto_created       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_mismatch   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_ambiguous  boolean NOT NULL DEFAULT false;

-- Update status column default from OPEN → DRAFT.
-- Existing rows with status='OPEN' are left as-is (legacy data, handled by app layer).
ALTER TABLE ar_invoices ALTER COLUMN status SET DEFAULT 'DRAFT';

-- ─── Step 2: Conditional unique constraint on packing_slip_id ───────────────
-- Audits for duplicate packing_slip_id values. If duplicates exist the index
-- is SKIPPED and an actionable NOTICE is emitted; all other schema changes above
-- have already been committed. Operators must resolve duplicates and re-run:
--   CREATE UNIQUE INDEX ar_invoices_packing_slip_id_uniq
--     ON ar_invoices (packing_slip_id) WHERE packing_slip_id IS NOT NULL;
DO $$
DECLARE
  dup_count integer;
  dup_rec   record;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT packing_slip_id
    FROM ar_invoices
    WHERE packing_slip_id IS NOT NULL
    GROUP BY packing_slip_id
    HAVING COUNT(*) > 1
  ) dupes;

  IF dup_count > 0 THEN
    RAISE NOTICE '=== UNIQUE INDEX SKIPPED ===';
    RAISE NOTICE 'Duplicate packing_slip_id values found in ar_invoices (% group(s)). Resolve before adding the unique constraint:', dup_count;
    FOR dup_rec IN
      SELECT packing_slip_id, COUNT(*) AS cnt
      FROM ar_invoices
      WHERE packing_slip_id IS NOT NULL
      GROUP BY packing_slip_id
      HAVING COUNT(*) > 1
    LOOP
      RAISE NOTICE '  packing_slip_id=% appears % times', dup_rec.packing_slip_id, dup_rec.cnt;
    END LOOP;
    RAISE NOTICE 'Action required: deduplicate ar_invoices rows above, then run:';
    RAISE NOTICE '  CREATE UNIQUE INDEX ar_invoices_packing_slip_id_uniq ON ar_invoices (packing_slip_id) WHERE packing_slip_id IS NOT NULL;';
  ELSE
    RAISE NOTICE 'No duplicate packing_slip_id values found — applying unique index.';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ar_invoices_packing_slip_id_uniq
               ON ar_invoices (packing_slip_id)
               WHERE packing_slip_id IS NOT NULL';
  END IF;
END $$;

-- ─── Step 3: Add arInvoiceId to credit_memos ────────────────────────────────
ALTER TABLE credit_memos
  ADD COLUMN IF NOT EXISTS ar_invoice_id uuid REFERENCES ar_invoices(id);

-- ─── Step 4: Seed required chart_of_accounts rows ───────────────────────────
-- Idempotent — skips existing rows via ON CONFLICT (account_name) DO NOTHING.
INSERT INTO chart_of_accounts (account_name, account_type)
VALUES
  ('Accounts Receivable',   'ASSET'),
  ('Revenue — P2 Products', 'REVENUE'),
  ('Sales Tax Payable',     'LIABILITY')
ON CONFLICT (account_name) DO NOTHING;
