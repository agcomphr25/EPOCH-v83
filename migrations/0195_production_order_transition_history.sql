CREATE TABLE IF NOT EXISTS production_order_transition_history (
  history_id bigserial PRIMARY KEY,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  production_order_id integer NOT NULL,
  order_id text NOT NULL,
  po_number text,
  transition_action text NOT NULL CHECK (transition_action IN ('INSERT', 'UPDATE', 'BACKFILL')),
  old_department text,
  new_department text,
  old_status text,
  new_status text,
  old_is_fulfilled boolean,
  new_is_fulfilled boolean,
  previous_row jsonb,
  recorded_row jsonb NOT NULL,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  database_actor text NOT NULL DEFAULT session_user,
  client_application text DEFAULT current_setting('application_name', true),
  recorded_at timestamp NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS production_order_transition_history_event_idx
  ON production_order_transition_history (event_id);
CREATE INDEX IF NOT EXISTS production_order_transition_history_order_idx
  ON production_order_transition_history (order_id, recorded_at);
CREATE INDEX IF NOT EXISTS production_order_transition_history_po_idx
  ON production_order_transition_history (po_number, recorded_at);

CREATE OR REPLACE FUNCTION capture_production_order_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.current_department IS NOT DISTINCT FROM NEW.current_department
     AND OLD.production_status IS NOT DISTINCT FROM NEW.production_status
     AND OLD.is_fulfilled IS NOT DISTINCT FROM NEW.is_fulfilled THEN
    RETURN NEW;
  END IF;

  INSERT INTO production_order_transition_history (
    production_order_id,
    order_id,
    po_number,
    transition_action,
    old_department,
    new_department,
    old_status,
    new_status,
    old_is_fulfilled,
    new_is_fulfilled,
    previous_row,
    recorded_row,
    transaction_id,
    database_actor,
    client_application
  )
  VALUES (
    NEW.id,
    NEW.order_id,
    NEW.po_number,
    TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.current_department END,
    NEW.current_department,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.production_status END,
    NEW.production_status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_fulfilled END,
    NEW.is_fulfilled,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END,
    to_jsonb(NEW),
    txid_current(),
    session_user,
    current_setting('application_name', true)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS production_order_transition_capture ON production_orders;
CREATE TRIGGER production_order_transition_capture
AFTER INSERT OR UPDATE OF current_department, production_status, is_fulfilled
ON production_orders
FOR EACH ROW
EXECUTE FUNCTION capture_production_order_transition();

CREATE OR REPLACE FUNCTION reject_production_order_transition_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'production_order_transition_history is append-only; % is not permitted', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS production_order_transition_history_no_mutation
  ON production_order_transition_history;
CREATE TRIGGER production_order_transition_history_no_mutation
BEFORE UPDATE OR DELETE ON production_order_transition_history
FOR EACH ROW
EXECUTE FUNCTION reject_production_order_transition_history_mutation();

DROP TRIGGER IF EXISTS production_order_transition_history_no_truncate
  ON production_order_transition_history;
CREATE TRIGGER production_order_transition_history_no_truncate
BEFORE TRUNCATE ON production_order_transition_history
FOR EACH STATEMENT
EXECUTE FUNCTION reject_production_order_transition_history_mutation();

INSERT INTO production_order_transition_history (
  production_order_id,
  order_id,
  po_number,
  transition_action,
  new_department,
  new_status,
  new_is_fulfilled,
  recorded_row,
  transaction_id,
  database_actor,
  client_application,
  recorded_at
)
SELECT
  po.id,
  po.order_id,
  po.po_number,
  'BACKFILL',
  po.current_department,
  po.production_status,
  po.is_fulfilled,
  to_jsonb(po),
  txid_current(),
  session_user,
  current_setting('application_name', true),
  COALESCE(po.updated_at, po.created_at, now())
FROM production_orders po
WHERE NOT EXISTS (
  SELECT 1
  FROM production_order_transition_history history
  WHERE history.production_order_id = po.id
);
