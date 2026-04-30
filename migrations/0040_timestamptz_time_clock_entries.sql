-- Migration: Change clock_in and clock_out in time_clock_entries from timestamp to timestamptz
-- Rationale: Storing timestamps without timezone causes ambiguous time math when the
-- database server clock differs from UTC. Converting with USING ... AT TIME ZONE 'UTC'
-- interprets any existing naive timestamp values as UTC, which is how they were always
-- written by the application, so no data is lost or shifted.

ALTER TABLE time_clock_entries
  ALTER COLUMN clock_in  TYPE timestamptz USING clock_in  AT TIME ZONE 'UTC',
  ALTER COLUMN clock_out TYPE timestamptz USING clock_out AT TIME ZONE 'UTC';
