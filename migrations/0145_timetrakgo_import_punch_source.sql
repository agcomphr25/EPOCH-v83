-- Allow historical TimeTrakGO PDF imports to land in the canonical punch ledger.
-- This remains inside the authorized labor source of truth; it does not create
-- a parallel punch table.

ALTER TABLE punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_source_check;

ALTER TABLE punch_ledger
  ADD CONSTRAINT punch_ledger_source_check
    CHECK (source IN ('KIOSK', 'PORTAL', 'TRAVELER', 'TIMETRAKGO_IMPORT'));
