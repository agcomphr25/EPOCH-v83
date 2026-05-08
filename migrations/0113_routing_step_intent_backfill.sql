-- Task #144 — Routing-step enforcement (Phase 2): backfill intent on
-- legacy rows so the gate added in 0111 is fully deterministic instead
-- of "best effort for new writes only".
--
-- Strategy:
--   * material_lot_reservations carries `traveler_id` directly, so we
--     can infer the intent column from the traveler's current
--     in-progress step (the canonical "active" step). Rows whose
--     traveler has no in-progress step are intentionally left NULL —
--     the application-layer gate will then fall through to the
--     active-step check at draw time, which is the safer fallback than
--     guessing.
--   * cutting_built_packets has no FK to traveler_steps in the schema
--     (allocation is keyed off `allocated_to_order`, a free-form text
--     barcode pointing into p2_serialized_items). A pure-SQL backfill
--     would have to walk that text-key bridge and would be brittle, so
--     packet backfill is performed by the application path
--     (`travelers.ts` packet-allocation hook) on next allocation. Any
--     packet that is already allocated AND whose intent is NULL stays
--     unpinned; the service-layer gate falls back to the active-step
--     check just like for legacy reservations.
--
-- Both updates are idempotent (only touch rows where
-- intended_routing_step_id IS NULL).

UPDATE material_lot_reservations r
   SET intended_routing_step_id = s.id
  FROM traveler_steps s
 WHERE r.intended_routing_step_id IS NULL
   AND r.traveler_id IS NOT NULL
   -- material_lot_reservations.traveler_id is uuid; traveler_steps.traveler_id
   -- is varchar(255). Cast both sides to text for a portable comparison.
   AND s.traveler_id = r.traveler_id::text
   AND UPPER(s.status) IN ('IN_PROGRESS', 'STARTED');
