-- Task #144 — Material-issue override approval artifact
--
-- Phase-2 strengthens override authorization: every override must reference
-- a server-issued, single-use approval row that an authorized approver
-- created BEFORE the operator attempted the draw. The MaterialIssueService
-- loads the row, verifies it matches the gate being bypassed and the
-- lot/traveler context, then atomically marks it CONSUMED inside the same
-- transaction that writes the inventory ledger entry. A consumed row
-- cannot be reused.

CREATE TABLE IF NOT EXISTS material_issue_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,                        -- ROUTING_STEP_BYPASS | WAD_LATE_RELEASE | LOT_QUARANTINE_DEVIATION | EMERGENCY_PRODUCTION
  bypasses_blocker text NOT NULL,              -- specific MaterialIssueBlockerCode
  material_lot_id uuid REFERENCES material_lots(id) ON DELETE SET NULL,
  traveler_id uuid,                            -- nullable — context constraint
  intended_routing_step_id varchar(255) REFERENCES traveler_steps(id) ON DELETE SET NULL,
  approver_user_id integer NOT NULL REFERENCES users(id),
  approver_role_at_approval text NOT NULL,    -- snapshot of users.role at approval time
  written_reason text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED',    -- APPROVED | CONSUMED | REVOKED | EXPIRED
  approved_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  consumed_by_ledger_entry_id uuid,
  revoked_at timestamp,
  revoked_by_user_id integer REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_issue_approvals_status_idx
  ON material_issue_approvals(status);
CREATE INDEX IF NOT EXISTS material_issue_approvals_lot_idx
  ON material_issue_approvals(material_lot_id);
CREATE INDEX IF NOT EXISTS material_issue_approvals_traveler_idx
  ON material_issue_approvals(traveler_id);
