-- Backfill Oven/Cure timer history into the traveler cure log.
-- Idempotency is anchored on production_program_runs.linked_log_id and the
-- timerRunId stored in cure-log metadata.
WITH eligible_runs AS (
  SELECT DISTINCT ON (r.id)
    r.id AS run_id,
    s.id AS serialized_item_id,
    s.barcode,
    s.part_number,
    COALESCE(r.department_name, ts.department_name) AS department_name,
    r.oven_number,
    r.oven_slot,
    r.started_at,
    r.completed_at,
    r.total_elapsed_seconds,
    r.status,
    r.traveler_id,
    r.traveler_step_id,
    r.traveler_task_id,
    r.program_id,
    p.name AS program_name
  FROM production_program_runs r
  JOIN production_programs p ON p.id = r.program_id
  LEFT JOIN travelers t ON t.id = r.traveler_id
  LEFT JOIN traveler_steps ts ON ts.id = r.traveler_step_id
  JOIN p2_serialized_items s ON (
    lower(s.serial_number) = lower(COALESCE(t.serial_number, t.lot_number, r.serial_number))
    OR lower(s.barcode) = lower(COALESCE(t.serial_number, t.lot_number, r.serial_number))
    OR lower(s.traveler_barcode) = lower(COALESCE(t.serial_number, t.lot_number, r.serial_number))
  )
  WHERE (r.traveler_id IS NOT NULL OR r.traveler_step_id IS NOT NULL)
    AND lower(regexp_replace(COALESCE(r.department_name, ts.department_name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
        ~ '(^| )(oven|cure|curing)( |$)'
    AND r.linked_log_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM p2_oven_cure_logs existing
      WHERE existing.metadata->>'timerRunId' = r.id::text
    )
  ORDER BY r.id, s.created_at DESC
), inserted_logs AS (
  INSERT INTO p2_oven_cure_logs (
    serialized_item_id, barcode, part_number, department, oven_id,
    start_time, end_time, actual_duration, result, notes, metadata
  )
  SELECT
    serialized_item_id,
    barcode,
    part_number,
    COALESCE(department_name, 'Oven Cure'),
    CASE WHEN oven_number IS NOT NULL THEN 'Oven ' || oven_number::text END,
    started_at,
    completed_at,
    CASE
      WHEN completed_at IS NOT NULL THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::integer)
      WHEN total_elapsed_seconds > 0 THEN CEIL(total_elapsed_seconds / 60.0)::integer
      ELSE NULL
    END,
    CASE status::text
      WHEN 'completed' THEN 'PASS'
      WHEN 'stopped' THEN 'STOPPED'
      ELSE 'PENDING'
    END,
    'Backfilled from routed timer run ' || run_id::text || ' - program: ' || program_name,
    jsonb_build_object(
      'source', 'timer_station_backfill',
      'timerRunId', run_id,
      'timerProgramId', program_id,
      'timerProgramName', program_name,
      'travelerId', traveler_id,
      'travelerStepId', traveler_step_id,
      'travelerTaskId', traveler_task_id,
      'ovenNumber', oven_number,
      'ovenSlot', oven_slot
    )
  FROM eligible_runs
  RETURNING id, metadata
)
UPDATE production_program_runs r
SET linked_log_id = inserted_logs.id,
    linked_log_type = 'oven_cure',
    updated_at = now()
FROM inserted_logs
WHERE r.id::text = inserted_logs.metadata->>'timerRunId';
