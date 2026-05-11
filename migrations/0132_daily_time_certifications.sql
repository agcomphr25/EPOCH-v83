-- Migration 0132: Daily employee time certification controls
--
-- DCAA readiness requires employees to affirm time accuracy at the daily
-- work-record level, not only at the end of a weekly or pay-period summary.

ALTER TABLE timekeeping.policy_settings
  ADD COLUMN IF NOT EXISTS daily_certification_required boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS timekeeping.daily_time_certifications (
  id                          serial PRIMARY KEY,
  timesheet_id                integer NOT NULL REFERENCES timekeeping.timesheets(id) ON DELETE CASCADE,
  employee_id                 integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date                   text NOT NULL,
  work_hours                  double precision NOT NULL DEFAULT 0,
  certified_at                timestamptz NOT NULL DEFAULT now(),
  certified_by_user_id        integer REFERENCES public.users(id),
  certification_statement     text NOT NULL,
  certification_version       integer NOT NULL DEFAULT 1,
  source                      text NOT NULL DEFAULT 'employee_self',
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_time_certifications_timesheet_date_unique UNIQUE (timesheet_id, work_date),
  CONSTRAINT daily_time_certifications_date_format CHECK (work_date ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT daily_time_certifications_hours_nonnegative CHECK (work_hours >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_time_certifications_timesheet
  ON timekeeping.daily_time_certifications(timesheet_id);

CREATE INDEX IF NOT EXISTS idx_daily_time_certifications_employee_date
  ON timekeeping.daily_time_certifications(employee_id, work_date);
