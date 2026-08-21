-- Narrow, universal pre-issue confirmation for DPAS and FAR/DFARS/customer flowdowns.
-- Nullable booleans intentionally distinguish "not yet considered" from "No".

ALTER TABLE vendor_pos
  ADD COLUMN IF NOT EXISTS issue_dpas_rated boolean,
  ADD COLUMN IF NOT EXISTS issue_dpas_rating text,
  ADD COLUMN IF NOT EXISTS issue_flowdowns_required boolean,
  ADD COLUMN IF NOT EXISTS issue_compliance_confirmed_by_user_id integer,
  ADD COLUMN IF NOT EXISTS issue_compliance_confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS issue_compliance_confirmed_at timestamp;

COMMENT ON COLUMN vendor_pos.issue_dpas_rated IS
  'Required Yes/No DPAS applicability decision captured immediately before PO issuance.';
COMMENT ON COLUMN vendor_pos.issue_dpas_rating IS
  'DPAS rating entered when issue_dpas_rated is true.';
COMMENT ON COLUMN vendor_pos.issue_flowdowns_required IS
  'Required Yes/No decision for FAR, DFARS, or customer flowdowns captured immediately before PO issuance.';
