-- Retire the empty duplicate traveler created by concurrent generation requests
-- for ROC2600719. Preserve the record and append explicit audit provenance.

DO $$
DECLARE
  duplicate_id text := '44b2697b-97b2-4dbf-ad34-94327f7a8e62';
  canonical_id text := 'e6770d54-0434-4c24-bd8e-af08cedb8720';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM travelers duplicate
    JOIN travelers canonical ON canonical.id = canonical_id
    WHERE duplicate.id = duplicate_id
      AND duplicate.traveler_number = 'TRV-2026-000581'
      AND canonical.traveler_number = 'TRV-2026-000582'
      AND lower(trim(duplicate.serial_number)) = 'roc2600719'
      AND lower(trim(canonical.serial_number)) = 'roc2600719'
      AND duplicate.production_work_order_id = canonical.production_work_order_id
      AND duplicate.status = 'IN_PROGRESS'
      AND NOT EXISTS (
        SELECT 1 FROM traveler_signatures signature
        JOIN traveler_steps step ON step.id = signature.traveler_step_id
        WHERE step.traveler_id = duplicate.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM traveler_events event
        WHERE event.traveler_id = duplicate.id
          AND event.action <> 'CREATED'
      )
  ) THEN
    UPDATE travelers
    SET status = 'CANCELLED', updated_at = NOW()
    WHERE id = duplicate_id;

    UPDATE traveler_steps
    SET status = 'CANCELLED',
        completed_at = COALESCE(completed_at, NOW()),
        completed_by = COALESCE(completed_by, 'migration 0247')
    WHERE traveler_id = duplicate_id
      AND status <> 'COMPLETED';

    INSERT INTO traveler_events (traveler_id, actor, actor_name, action, details, created_at)
    SELECT
      duplicate_id,
      'migration 0247',
      'System Repair',
      'CANCELLED_DUPLICATE',
      jsonb_build_object(
        'reason', 'Concurrent traveler generation created an empty duplicate.',
        'canonicalTravelerId', canonical_id,
        'canonicalTravelerNumber', 'TRV-2026-000582',
        'serialNumber', 'ROC2600719',
        'repairMigration', '0247_retire_duplicate_traveler_roc2600719'
      ),
      NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM traveler_events prior
      WHERE prior.traveler_id = duplicate_id
        AND prior.action = 'CANCELLED_DUPLICATE'
    );
  END IF;
END $$;
