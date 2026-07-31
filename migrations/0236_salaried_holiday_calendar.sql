CREATE SCHEMA IF NOT EXISTS timekeeping;

CREATE TABLE IF NOT EXISTS timekeeping.salaried_holidays (
  id SERIAL PRIMARY KEY,
  holiday_date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL DEFAULT 8 CHECK (hours > 0 AND hours <= 24),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT salaried_holidays_date_format_check
    CHECK (holiday_date ~ '^\d{4}-\d{2}-\d{2}$')
);

CREATE INDEX IF NOT EXISTS salaried_holidays_active_date_idx
  ON timekeeping.salaried_holidays (is_active, holiday_date);

INSERT INTO timekeeping.salaried_holidays (holiday_date, name, hours)
VALUES
  ('2026-01-01', 'New Year''s Day', 8),
  ('2026-01-19', 'Martin Luther King Jr. Day', 8),
  ('2026-02-16', 'Presidents'' Day', 8),
  ('2026-05-25', 'Memorial Day', 8),
  ('2026-06-19', 'Juneteenth', 8),
  ('2026-07-04', 'Independence Day', 8),
  ('2026-09-07', 'Labor Day', 8),
  ('2026-11-26', 'Thanksgiving Day', 8),
  ('2026-12-25', 'Christmas Day', 8)
ON CONFLICT (holiday_date) DO NOTHING;
