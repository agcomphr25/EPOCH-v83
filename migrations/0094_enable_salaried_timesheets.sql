ALTER TABLE timekeeping.settings
  ALTER COLUMN salaried_timesheet_enabled SET DEFAULT TRUE;

UPDATE timekeeping.settings
SET salaried_timesheet_enabled = TRUE
WHERE salaried_timesheet_enabled = FALSE;
