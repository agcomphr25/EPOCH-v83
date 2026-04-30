-- Migration 0094: labor_entry_drafts
-- Introduces the intermediary draft table for salaried and indirect labor entry.
-- Every entry lands here first before any synthetic punch_ledger or labor_allocations
-- rows are created. The existing hourly kiosk / punch_ledger / labor_allocations
-- behavior is completely untouched.

CREATE TABLE IF NOT EXISTS timekeeping.labor_entry_drafts (
  id                      SERIAL PRIMARY KEY,

  -- Employee (FK to timekeeping.employees — the salaried employee record)
  employee_id             INTEGER NOT NULL REFERENCES timekeeping.employees(id) ON DELETE CASCADE,

  -- Date the labor entry covers (YYYY-MM-DD)
  entry_date              DATE NOT NULL,

  -- Raw narrative text, only populated for CONVERSATIONAL or AI entries
  raw_input_text          TEXT,

  -- Array of time-segment objects: date, start, end, duration, labor_category,
  -- charge_code_id, confidence, needs_review, explanation
  parsed_segments_json    JSONB NOT NULL DEFAULT '[]',

  -- Lifecycle status
  status                  TEXT NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT', 'NEEDS_REVIEW', 'CONFIRMED', 'POSTED', 'VOIDED')),

  -- Entry origin
  source                  TEXT NOT NULL
                            CHECK (source IN ('MANUAL', 'CONVERSATIONAL', 'AI')),

  -- Aggregate hours (nullable — computed from segments when present)
  total_hours             NUMERIC(8, 4),

  -- Overall AI/conversational confidence score (0..1)
  confidence_score        NUMERIC(5, 4),

  -- Structured validation errors (nullable — populated during review)
  validation_errors_json  JSONB,

  -- Who created the draft (FK to public.users)
  created_by              INTEGER NOT NULL REFERENCES users(id),

  -- Who reviewed/approved the draft (nullable)
  reviewed_by             INTEGER REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,

  -- When the draft was posted to labor_allocations / salaried_timesheet_lines
  posted_at               TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for the most common query: all drafts for an employee on a date
CREATE INDEX IF NOT EXISTS idx_labor_entry_drafts_employee_date
  ON timekeeping.labor_entry_drafts (employee_id, entry_date);

-- Index for status-based queue queries
CREATE INDEX IF NOT EXISTS idx_labor_entry_drafts_status
  ON timekeeping.labor_entry_drafts (status);
