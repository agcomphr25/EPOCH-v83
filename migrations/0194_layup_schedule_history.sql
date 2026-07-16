CREATE TABLE IF NOT EXISTS layup_schedule_history (
  history_id bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_schedule_id integer NOT NULL,
  order_id text NOT NULL,
  scheduled_date timestamp,
  mold_id text,
  employee_assignments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_override boolean DEFAULT false,
  overridden_at timestamp,
  overridden_by text,
  created_at timestamp,
  updated_at timestamp,
  layup_day date,
  week_locked boolean DEFAULT false,
  customer_name text,
  stock_model text,
  material_type text,
  action_length text,
  lop_value text,
  fb_order_number text,
  schedule_snapshot jsonb,
  history_action text NOT NULL CHECK (history_action IN ('INSERT', 'UPDATE', 'DELETE', 'BACKFILL')),
  previous_row jsonb,
  recorded_row jsonb NOT NULL,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  database_actor text NOT NULL DEFAULT session_user,
  client_application text DEFAULT current_setting('application_name', true),
  recorded_at timestamp NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT layup_schedule_history_event_id_key UNIQUE (event_id)
);

-- A safe-boot migration can run more than once. Temporarily remove the
-- append-only guards while the migration normalizes an older table shape.
DROP TRIGGER IF EXISTS layup_schedule_history_no_mutation ON layup_schedule_history;
DROP TRIGGER IF EXISTS layup_schedule_history_no_truncate ON layup_schedule_history;

ALTER TABLE layup_schedule_history
  ADD COLUMN IF NOT EXISTS event_id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS previous_row jsonb,
  ADD COLUMN IF NOT EXISTS recorded_row jsonb,
  ADD COLUMN IF NOT EXISTS transaction_id bigint DEFAULT txid_current(),
  ADD COLUMN IF NOT EXISTS database_actor text DEFAULT session_user,
  ADD COLUMN IF NOT EXISTS client_application text DEFAULT current_setting('application_name', true);

UPDATE layup_schedule_history
SET
  event_id = COALESCE(event_id, gen_random_uuid()),
  recorded_row = COALESCE(recorded_row, to_jsonb(layup_schedule_history) - 'previous_row' - 'recorded_row'),
  transaction_id = COALESCE(transaction_id, txid_current()),
  database_actor = COALESCE(database_actor, session_user)
WHERE event_id IS NULL
   OR recorded_row IS NULL
   OR transaction_id IS NULL
   OR database_actor IS NULL;

ALTER TABLE layup_schedule_history
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN recorded_row SET NOT NULL,
  ALTER COLUMN transaction_id SET NOT NULL,
  ALTER COLUMN database_actor SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS layup_schedule_history_event_id_idx
  ON layup_schedule_history (event_id);

CREATE INDEX IF NOT EXISTS layup_schedule_history_layup_day_idx
  ON layup_schedule_history (layup_day);

CREATE INDEX IF NOT EXISTS layup_schedule_history_order_id_idx
  ON layup_schedule_history (order_id);

CREATE INDEX IF NOT EXISTS layup_schedule_history_source_schedule_id_idx
  ON layup_schedule_history (source_schedule_id);

CREATE OR REPLACE FUNCTION capture_layup_schedule_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  schedule_row layup_schedule%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    schedule_row := OLD;
  ELSE
    schedule_row := NEW;
  END IF;

  INSERT INTO layup_schedule_history (
    source_schedule_id,
    order_id,
    scheduled_date,
    mold_id,
    employee_assignments,
    is_override,
    overridden_at,
    overridden_by,
    created_at,
    updated_at,
    layup_day,
    week_locked,
    customer_name,
    stock_model,
    material_type,
    action_length,
    lop_value,
    fb_order_number,
    schedule_snapshot,
    history_action,
    previous_row,
    recorded_row,
    transaction_id,
    database_actor,
    client_application
  )
  VALUES (
    schedule_row.id,
    schedule_row.order_id,
    schedule_row.scheduled_date,
    schedule_row.mold_id,
    schedule_row.employee_assignments,
    schedule_row.is_override,
    schedule_row.overridden_at,
    schedule_row.overridden_by,
    schedule_row.created_at,
    schedule_row.updated_at,
    schedule_row.layup_day,
    schedule_row.week_locked,
    schedule_row.customer_name,
    schedule_row.stock_model,
    schedule_row.material_type,
    schedule_row.action_length,
    schedule_row.lop_value,
    schedule_row.fb_order_number,
    schedule_row.schedule_snapshot,
    TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(schedule_row),
    txid_current(),
    session_user,
    current_setting('application_name', true)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS layup_schedule_history_trigger ON layup_schedule;

CREATE TRIGGER layup_schedule_history_trigger
AFTER INSERT OR UPDATE OR DELETE ON layup_schedule
FOR EACH ROW
EXECUTE FUNCTION capture_layup_schedule_history();

CREATE OR REPLACE FUNCTION reject_layup_schedule_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'layup_schedule_history is append-only; % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS layup_schedule_history_no_mutation ON layup_schedule_history;
CREATE TRIGGER layup_schedule_history_no_mutation
BEFORE UPDATE OR DELETE ON layup_schedule_history
FOR EACH ROW
EXECUTE FUNCTION reject_layup_schedule_history_mutation();

DROP TRIGGER IF EXISTS layup_schedule_history_no_truncate ON layup_schedule_history;
CREATE TRIGGER layup_schedule_history_no_truncate
BEFORE TRUNCATE ON layup_schedule_history
FOR EACH STATEMENT
EXECUTE FUNCTION reject_layup_schedule_history_mutation();

INSERT INTO layup_schedule_history (
  source_schedule_id,
  order_id,
  scheduled_date,
  mold_id,
  employee_assignments,
  is_override,
  overridden_at,
  overridden_by,
  created_at,
  updated_at,
  layup_day,
  week_locked,
  customer_name,
  stock_model,
  material_type,
  action_length,
  lop_value,
  fb_order_number,
  schedule_snapshot,
  history_action,
  previous_row,
  recorded_row,
  transaction_id,
  database_actor,
  client_application,
  recorded_at
)
SELECT
  ls.id,
  ls.order_id,
  ls.scheduled_date,
  ls.mold_id,
  ls.employee_assignments,
  ls.is_override,
  ls.overridden_at,
  ls.overridden_by,
  ls.created_at,
  ls.updated_at,
  ls.layup_day,
  ls.week_locked,
  ls.customer_name,
  ls.stock_model,
  ls.material_type,
  ls.action_length,
  ls.lop_value,
  ls.fb_order_number,
  ls.schedule_snapshot,
  'BACKFILL',
  NULL,
  to_jsonb(ls),
  txid_current(),
  session_user,
  current_setting('application_name', true),
  COALESCE(ls.updated_at, ls.created_at, now())
FROM layup_schedule ls
WHERE NOT EXISTS (
  SELECT 1
  FROM layup_schedule_history history
  WHERE history.source_schedule_id = ls.id
);
