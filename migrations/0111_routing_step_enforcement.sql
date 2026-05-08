-- Task #144 — Routing-step enforcement on material issues (Phase 2)
--
-- Tags material reservations and built packets with the routing step they
-- are intended to be consumed at. The new column is nullable so that legacy
-- rows do not break, but new allocations / packets MUST set it (enforced
-- in the application layer by MaterialIssueService).
--
-- The FK uses ON DELETE SET NULL because deleting a routing step (rare —
-- normally only happens during traveler revision) should not cascade-delete
-- the historical reservation / packet rows.

ALTER TABLE material_lot_reservations
  ADD COLUMN IF NOT EXISTS intended_routing_step_id varchar(255)
    REFERENCES traveler_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS material_lot_reservations_intended_step_idx
  ON material_lot_reservations(intended_routing_step_id);

ALTER TABLE cutting_built_packets
  ADD COLUMN IF NOT EXISTS intended_routing_step_id varchar(255)
    REFERENCES traveler_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cutting_built_packets_intended_step_idx
  ON cutting_built_packets(intended_routing_step_id);
