-- Three follow-ups from the 0109 vendor_pos hotfix code review:
--   (a) Create the purchase_requisitions / lines / approvals tables that
--       server/schema.ts has long declared but no migration has ever
--       added (boot-time DDL never created them either).  Without these
--       tables the FK in (b) cannot exist and Task #83 issuance flows
--       cannot persist requisitions.
--   (b) Add a real FK + index from vendor_pos.requisition_id to
--       purchase_requisitions(id) so the documented pipeline
--       purchase_requisitions -> vendor_pos has DB-level enforcement.
--   (c) Parity for vendor_pos columns currently kept alive only by
--       boot-time DDL in server/index.ts (external_po_number,
--       rfq_outcome_notes) and the revision-tracking columns that
--       server/schema.ts declares but no migration adds.  Idempotent so
--       it is safe on environments that already have them.
--
-- Idempotent: every statement uses IF NOT EXISTS / DO blocks.

-- (c) vendor_pos parity columns ----------------------------------------------
ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS external_po_number text,
  ADD COLUMN IF NOT EXISTS rfq_outcome_notes text,
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_po_id integer,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS is_current_revision boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revised_at timestamp,
  ADD COLUMN IF NOT EXISTS revised_by text,
  ADD COLUMN IF NOT EXISTS issued_without_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issued_without_email_reason text,
  ADD COLUMN IF NOT EXISTS issued_without_email_at timestamp,
  ADD COLUMN IF NOT EXISTS vendor_confirmed_at timestamp,
  ADD COLUMN IF NOT EXISTS vendor_confirmed_action text,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- (a) purchase_requisitions + child tables -----------------------------------
CREATE TABLE IF NOT EXISTS purchase_requisitions (
  id serial PRIMARY KEY,
  req_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT',
  project_id text,
  charge_code_id integer,
  category text NOT NULL DEFAULT 'default',
  vendor_id integer REFERENCES vendors(id),
  estimated_total numeric NOT NULL DEFAULT 0,
  need_by_date date,
  justification text NOT NULL,
  competition_method text NOT NULL DEFAULT 'competed',
  sole_source_justification text,
  requested_by_user_id integer,
  requested_by_display_name text,
  submitted_at timestamp,
  approved_at timestamp,
  rejected_at timestamp,
  rejection_reason text,
  converted_to_po_id integer,
  converted_at timestamp,
  cancelled_at timestamp,
  cancellation_reason text,
  notes text,
  created_at timestamp NOT NULL DEFAULT NOW(),
  updated_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_requisition_lines (
  id serial PRIMARY KEY,
  requisition_id integer NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  description text NOT NULL,
  part_number text,
  quantity real NOT NULL,
  unit text,
  unit_price real NOT NULL DEFAULT 0,
  line_total real NOT NULL DEFAULT 0,
  notes text
);

CREATE TABLE IF NOT EXISTS purchase_requisition_approvals (
  id serial PRIMARY KEY,
  requisition_id integer NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  stage integer NOT NULL,
  capability text NOT NULL,
  decision text,
  decided_by_user_id integer,
  decided_by_display_name text,
  decided_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_requisition_approval_chain (
  id serial PRIMARY KEY,
  category text NOT NULL DEFAULT 'default',
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric,
  stage integer NOT NULL,
  capability text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_req
  ON purchase_requisition_lines(requisition_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_approvals_req
  ON purchase_requisition_approvals(requisition_id);

-- (b) vendor_pos.requisition_id FK + index ----------------------------------
CREATE INDEX IF NOT EXISTS idx_vendor_pos_requisition_id
  ON vendor_pos(requisition_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'vendor_pos'
      AND constraint_name = 'vendor_pos_requisition_id_fkey'
  ) THEN
    ALTER TABLE vendor_pos
      ADD CONSTRAINT vendor_pos_requisition_id_fkey
      FOREIGN KEY (requisition_id)
      REFERENCES purchase_requisitions(id)
      ON DELETE SET NULL;
  END IF;
END $$;
