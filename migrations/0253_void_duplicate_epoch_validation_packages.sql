-- Controlled disposition of empty duplicate EPOCH validation packages created
-- while the create-success UI incorrectly reported a failure. Preserve
-- ESV-2026-0001 and all audit history; do not delete validation records.
--
-- State classification:
--   NOTHING_TO_DO     - none of the historical target numbers exist.
--   ALREADY_COMPLETED - all targets are already void with audit evidence.
--   EXACT_SAFE_CLEANUP- all thirteen untouched drafts match the sole retained
--                       authoritative package and contain no authored content.
--   AMBIGUOUS_STOP    - every other state fails before mutation.
--
-- The anonymous block is one transaction. The advisory lock serializes this
-- one-time decision even when no target rows exist; row locks are then taken in
-- package-number order before the state is classified.

DO $migration$
DECLARE
  target_numbers constant text[] := ARRAY[
    'ESV-2026-0002', 'ESV-2026-0003', 'ESV-2026-0004',
    'ESV-2026-0005', 'ESV-2026-0006', 'ESV-2026-0007',
    'ESV-2026-0008', 'ESV-2026-0009', 'ESV-2026-0010',
    'ESV-2026-0011', 'ESV-2026-0012', 'ESV-2026-0013',
    'ESV-2026-0014'
  ];
  candidate_count integer;
  draft_count integer;
  void_count integer;
  authored_count integer;
  completed_event_count integer;
  matching_authority_count integer;
  changed_count integer;
  authoritative qms_epoch_validation_packages%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('0253_void_duplicate_epoch_validation_packages', 0)
  );

  PERFORM id
  FROM qms_epoch_validation_packages
  WHERE package_number = 'ESV-2026-0001'
     OR package_number = ANY(target_numbers)
  ORDER BY package_number
  FOR UPDATE;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'DRAFT'),
    count(*) FILTER (WHERE status = 'VOID_DUPLICATE')
  INTO candidate_count, draft_count, void_count
  FROM qms_epoch_validation_packages
  WHERE package_number = ANY(target_numbers);

  IF candidate_count = 0 THEN
    RAISE NOTICE '0253 state NOTHING_TO_DO: no historical duplicate candidates found';
    RETURN;
  END IF;

  IF candidate_count <> cardinality(target_numbers) THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: expected either zero or all 13 target packages ESV-2026-0002 through ESV-2026-0014; found %',
      candidate_count;
  END IF;

  IF void_count = 13 THEN
    SELECT count(*) INTO completed_event_count
    FROM qms_epoch_validation_packages p
    WHERE p.package_number = ANY(target_numbers)
      AND EXISTS (
        SELECT 1
        FROM qms_epoch_validation_events e
        WHERE e.package_id = p.id
          AND e.action = 'PACKAGE_VOIDED_DUPLICATE'
          AND e.actor_display_name = 'migration 0253 (user-authorized duplicate cleanup)'
          AND e.actor_role = 'SYSTEM_MAINTENANCE'
      );

    IF completed_event_count <> cardinality(target_numbers) OR EXISTS (
      SELECT 1
      FROM qms_epoch_validation_packages p
      WHERE p.package_number = ANY(target_numbers)
        AND (
          p.locked_at IS NULL
          OR p.updated_by_display_name <> 'migration 0253 (user-authorized duplicate cleanup)'
          OR p.revision < 2
          OR p.row_version < 2
          OR 1 <> (
            SELECT count(*)
            FROM qms_epoch_validation_events e
            WHERE e.package_id = p.id
              AND e.action = 'PACKAGE_VOIDED_DUPLICATE'
              AND e.actor_display_name = 'migration 0253 (user-authorized duplicate cleanup)'
              AND e.actor_role = 'SYSTEM_MAINTENANCE'
          )
        )
    ) THEN
      RAISE EXCEPTION
        '0253 state AMBIGUOUS_STOP: all targets are VOID_DUPLICATE but only % retain exact duplicate-void migration evidence',
        completed_event_count;
    END IF;

    RAISE NOTICE '0253 state ALREADY_COMPLETED: all duplicate dispositions and audit evidence already exist';
    RETURN;
  END IF;

  IF draft_count <> 13 OR void_count <> 0 THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: target lifecycle is mixed or unsafe (DRAFT %, VOID_DUPLICATE %, total %)',
      draft_count,
      void_count,
      candidate_count;
  END IF;

  SELECT * INTO authoritative
  FROM qms_epoch_validation_packages
  WHERE package_number = 'ESV-2026-0001'
  FOR UPDATE;

  IF NOT FOUND OR authoritative.status = 'VOID_DUPLICATE' THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: retained authoritative package ESV-2026-0001 is missing or void';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qms_epoch_validation_packages p
    WHERE p.package_number = ANY(target_numbers)
      AND (
        p.revision <> 1
        OR p.row_version <> 1
        OR p.locked_at IS NOT NULL
        OR p.actual_completion_date IS NOT NULL
        OR p.superseded_package_id IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: at least one target draft has lifecycle or edit evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qms_epoch_validation_packages p
    WHERE p.package_number = ANY(target_numbers)
      AND ROW(
        p.title,
        p.system_name,
        p.validation_type,
        p.production_version,
        p.commit_or_release_identifier,
        p.production_deployment_date,
        p.validation_environment,
        p.production_environment_reference,
        p.database_provider,
        p.hosting_provider,
        p.software_owner_employee_id,
        p.quality_owner_employee_id,
        p.validation_lead_employee_id,
        p.planned_start_date,
        p.planned_completion_date,
        p.reason_for_validation,
        p.previous_approved_package_id,
        p.audit_readiness_assessment_id,
        p.notes,
        p.created_by_user_id
      ) IS DISTINCT FROM ROW(
        authoritative.title,
        authoritative.system_name,
        authoritative.validation_type,
        authoritative.production_version,
        authoritative.commit_or_release_identifier,
        authoritative.production_deployment_date,
        authoritative.validation_environment,
        authoritative.production_environment_reference,
        authoritative.database_provider,
        authoritative.hosting_provider,
        authoritative.software_owner_employee_id,
        authoritative.quality_owner_employee_id,
        authoritative.validation_lead_employee_id,
        authoritative.planned_start_date,
        authoritative.planned_completion_date,
        authoritative.reason_for_validation,
        authoritative.previous_approved_package_id,
        authoritative.audit_readiness_assessment_id,
        authoritative.notes,
        authoritative.created_by_user_id
      )
  ) THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: target package payloads do not exactly match ESV-2026-0001';
  END IF;

  SELECT count(*) INTO matching_authority_count
  FROM qms_epoch_validation_packages p
  WHERE NOT (p.package_number = ANY(target_numbers))
    AND p.status <> 'VOID_DUPLICATE'
    AND ROW(
      p.title,
      p.system_name,
      p.validation_type,
      p.production_version,
      p.commit_or_release_identifier,
      p.production_deployment_date,
      p.validation_environment,
      p.production_environment_reference,
      p.database_provider,
      p.hosting_provider,
      p.software_owner_employee_id,
      p.quality_owner_employee_id,
      p.validation_lead_employee_id,
      p.planned_start_date,
      p.planned_completion_date,
      p.reason_for_validation,
      p.previous_approved_package_id,
      p.audit_readiness_assessment_id,
      p.notes,
      p.created_by_user_id
    ) IS NOT DISTINCT FROM ROW(
      authoritative.title,
      authoritative.system_name,
      authoritative.validation_type,
      authoritative.production_version,
      authoritative.commit_or_release_identifier,
      authoritative.production_deployment_date,
      authoritative.validation_environment,
      authoritative.production_environment_reference,
      authoritative.database_provider,
      authoritative.hosting_provider,
      authoritative.software_owner_employee_id,
      authoritative.quality_owner_employee_id,
      authoritative.validation_lead_employee_id,
      authoritative.planned_start_date,
      authoritative.planned_completion_date,
      authoritative.reason_for_validation,
      authoritative.previous_approved_package_id,
      authoritative.audit_readiness_assessment_id,
      authoritative.notes,
      authoritative.created_by_user_id
    );

  IF matching_authority_count <> 1 THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: expected exactly one authoritative payload match outside the target set; found %',
      matching_authority_count;
  END IF;

  SELECT sum(row_count) INTO authored_count
  FROM (
    SELECT count(*) row_count FROM qms_epoch_validation_intended_use_revisions r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_intended_use_functions r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_responsibilities r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_requirements r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_risks r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_plans r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_protocols r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_executions r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_evidence r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_defects r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_approvals r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_snapshots r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_periodic_reviews r JOIN qms_epoch_validation_packages p ON p.id = r.package_id WHERE p.package_number = ANY(target_numbers)
    UNION ALL SELECT count(*) FROM qms_epoch_validation_events e JOIN qms_epoch_validation_packages p ON p.id = e.package_id WHERE p.package_number = ANY(target_numbers) AND e.action <> 'PACKAGE_CREATED'
  ) authored;

  IF authored_count <> 0 THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: target packages contain % authored validation or lifecycle records',
      authored_count;
  END IF;

  WITH changed AS (
    UPDATE qms_epoch_validation_packages
    SET status = 'VOID_DUPLICATE',
        locked_at = now(),
        row_version = row_version + 1,
        revision = revision + 1,
        updated_at = now(),
        updated_by_display_name = 'migration 0253 (user-authorized duplicate cleanup)'
    WHERE package_number = ANY(target_numbers)
      AND status = 'DRAFT'
    RETURNING *
  ), inserted_events AS (
    INSERT INTO qms_epoch_validation_events (
      package_id, entity_type, action, actor_user_id, actor_display_name,
      actor_role, previous_value, new_value, reason, package_revision
    )
    SELECT
      id,
      'PACKAGE',
      'PACKAGE_VOIDED_DUPLICATE',
      updated_by_user_id,
      'migration 0253 (user-authorized duplicate cleanup)',
      'SYSTEM_MAINTENANCE',
      to_jsonb('DRAFT'::text),
      to_jsonb('VOID_DUPLICATE'::text),
      'Empty duplicate created while the client incorrectly reported a successful package creation as a failure; retain ESV-2026-0001.',
      revision
    FROM changed
    RETURNING package_id
  )
  SELECT count(*) INTO changed_count FROM inserted_events;

  IF changed_count <> 13 THEN
    RAISE EXCEPTION
      '0253 state AMBIGUOUS_STOP: transactional cleanup changed % packages instead of 13',
      changed_count;
  END IF;

  RAISE NOTICE '0253 state EXACT_SAFE_CLEANUP: voided 13 empty duplicates and appended 13 audit events';
END
$migration$;
