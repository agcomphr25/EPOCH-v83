-- Migration 0086: Add barcode_printed_at to p2_serialized_items
-- Tracks when a barcode label was first printed for each serialized item.
-- Null = never printed. Populated server-side on first print; not cleared on reprint.

ALTER TABLE p2_serialized_items
  ADD COLUMN IF NOT EXISTS barcode_printed_at TIMESTAMP;
