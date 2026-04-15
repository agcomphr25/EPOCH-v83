-- Migration: Unified Shipment View (v_all_shipments)
-- Creates a single queryable surface across all shipment sources.
-- Columns: order_id (TEXT), shipped_at (TIMESTAMP), source_type (TEXT)
--
-- Sources:
--   P1  → shipment_records JOIN shipment_items
--   P2  → p2_packing_slips
--   RTS → rts_sales (shipped rows only)

CREATE OR REPLACE VIEW v_all_shipments AS
  -- P1: shipment_records joined to shipment_items for per-order resolution
  SELECT
    si.order_id::TEXT       AS order_id,
    sr.shipped_at           AS shipped_at,
    'P1'::TEXT              AS source_type
  FROM shipment_items  si
  JOIN shipment_records sr ON sr.id = si.shipment_id

  UNION ALL

  -- P2: packing slips (po_number carries the customer order reference)
  SELECT
    ps.po_number::TEXT      AS order_id,
    ps.ship_date            AS shipped_at,
    'P2'::TEXT              AS source_type
  FROM p2_packing_slips ps

  UNION ALL

  -- RTS: return-to-stock sales that have already shipped
  SELECT
    rs.order_id::TEXT       AS order_id,
    rs.shipped_date         AS shipped_at,
    'RTS'::TEXT             AS source_type
  FROM rts_sales rs
  WHERE rs.shipped_date IS NOT NULL;
