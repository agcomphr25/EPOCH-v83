-- Allow payroll-admin-created punches to be stored as a distinct ledger source.
-- These punches are entered from /time-clock-admin and displayed as "HR Created".

ALTER TABLE punch_ledger
  DROP CONSTRAINT IF EXISTS punch_ledger_source_check;

ALTER TABLE punch_ledger
  ADD CONSTRAINT punch_ledger_source_check
    CHECK (source IN ('KIOSK', 'PORTAL', 'TRAVELER', 'TIMETRAKGO_IMPORT', 'ADMIN'));
