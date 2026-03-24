-- =============================================================================
-- Migration 0006: Nonconforming dispositions, RMAs, scrap-rate columns,
--                 P2 PO item reference on production_orders, quick notes
-- =============================================================================
-- All statements use IF NOT EXISTS / DO-block guards so this migration is fully
-- idempotent regardless of whether the boot migrations in server/index.ts have
-- already created these objects.
-- =============================================================================

-- ── p2_nonconforming_dispositions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2_nonconforming_dispositions (
  id                SERIAL PRIMARY KEY,
  serialized_item_id UUID NOT NULL REFERENCES p2_serialized_items(id) ON DELETE CASCADE,
  disposition_type  TEXT NOT NULL,
  po_id             INTEGER REFERENCES p2_purchase_orders(id),
  po_number         TEXT,
  auth_person       TEXT NOT NULL,
  part_number       TEXT NOT NULL,
  serial_number     TEXT NOT NULL,
  disposition_date  DATE NOT NULL,
  reason_type       TEXT NOT NULL,
  reason_other      TEXT,
  notes             TEXT,
  resolved          BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at       TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- ── p2_rmas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS p2_rmas (
  id                  SERIAL PRIMARY KEY,
  disposition_id      INTEGER NOT NULL REFERENCES p2_nonconforming_dispositions(id) ON DELETE CASCADE,
  serialized_item_id  UUID NOT NULL REFERENCES p2_serialized_items(id) ON DELETE CASCADE,
  rma_number          TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'open',
  traceable_materials JSONB NOT NULL DEFAULT '[]',
  shipped_at          TIMESTAMP,
  completed_at        TIMESTAMP,
  notes               TEXT,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- ── p2_purchase_orders: scrap-rate tracking columns ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'p2_purchase_orders' AND column_name = 'scrapped_item_count'
  ) THEN
    ALTER TABLE p2_purchase_orders ADD COLUMN scrapped_item_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'p2_purchase_orders' AND column_name = 'scrap_rate_percent'
  ) THEN
    ALTER TABLE p2_purchase_orders ADD COLUMN scrap_rate_percent REAL NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── production_orders: P2 PO item reference ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_orders' AND column_name = 'p2_po_item_id'
  ) THEN
    ALTER TABLE production_orders ADD COLUMN p2_po_item_id INTEGER;
  END IF;
END $$;

-- ── quick_notes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_notes (
  id                      SERIAL PRIMARY KEY,
  title                   TEXT NOT NULL,
  content                 TEXT NOT NULL DEFAULT '',
  format                  TEXT NOT NULL DEFAULT 'text',
  tags                    TEXT[],
  created_by_user_id      INTEGER NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- ── quick_note_shares ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_note_shares (
  id                       SERIAL PRIMARY KEY,
  note_id                  INTEGER NOT NULL REFERENCES quick_notes(id) ON DELETE CASCADE,
  shared_with_user_id      INTEGER NOT NULL,
  shared_with_display_name TEXT NOT NULL,
  created_at               TIMESTAMP DEFAULT NOW()
);
