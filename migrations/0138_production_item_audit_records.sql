CREATE TABLE IF NOT EXISTS public.production_item_audit_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_identifier text NOT NULL,
  serial_number text,
  traveler_id varchar(255),
  traveler_number varchar(255),
  run_id uuid REFERENCES public.production_program_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_at timestamp NOT NULL DEFAULT now(),
  actor_user_id integer REFERENCES public.users(id),
  card_snapshot jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_item_audit_item_identifier_idx
  ON public.production_item_audit_records(item_identifier);

CREATE INDEX IF NOT EXISTS production_item_audit_serial_number_idx
  ON public.production_item_audit_records(serial_number);

CREATE INDEX IF NOT EXISTS production_item_audit_traveler_id_idx
  ON public.production_item_audit_records(traveler_id);

CREATE INDEX IF NOT EXISTS production_item_audit_run_id_idx
  ON public.production_item_audit_records(run_id);

CREATE INDEX IF NOT EXISTS production_item_audit_event_at_idx
  ON public.production_item_audit_records(event_at);
