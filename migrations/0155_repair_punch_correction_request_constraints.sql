-- Repair production drift for kiosk/portal/admin punch correction requests.
-- Some environments created this table before kiosk-origin corrections were added.

ALTER TABLE timekeeping.punch_correction_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'employee_portal';

ALTER TABLE timekeeping.punch_correction_requests
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending_supervisor';

ALTER TABLE timekeeping.punch_correction_requests
  ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER;

ALTER TABLE timekeeping.punch_correction_requests
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE timekeeping.punch_correction_requests
  DROP CONSTRAINT IF EXISTS punch_correction_requests_source_check;

ALTER TABLE timekeeping.punch_correction_requests
  DROP CONSTRAINT IF EXISTS chk_punch_correction_source;

ALTER TABLE timekeeping.punch_correction_requests
  ADD CONSTRAINT chk_punch_correction_source
    CHECK (source IN ('employee_portal', 'kiosk', 'admin'));

ALTER TABLE timekeeping.punch_correction_requests
  DROP CONSTRAINT IF EXISTS chk_punch_correction_request_type;

ALTER TABLE timekeeping.punch_correction_requests
  ADD CONSTRAINT chk_punch_correction_request_type
    CHECK (request_type IN ('edit_session', 'add_session', 'delete_session'));

ALTER TABLE timekeeping.punch_correction_requests
  DROP CONSTRAINT IF EXISTS chk_punch_correction_status;

ALTER TABLE timekeeping.punch_correction_requests
  ADD CONSTRAINT chk_punch_correction_status
    CHECK (status IN ('pending_supervisor', 'pending_hr', 'approved', 'rejected', 'cancelled'));
