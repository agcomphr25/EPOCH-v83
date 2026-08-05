-- Controlled disposition of empty duplicate EPOCH validation packages created
-- while the create-success UI incorrectly reported a failure. Preserve
-- ESV-2026-0001 and all audit history; do not delete validation records.

DO $$
DECLARE
  target_count integer;
  authored_count integer;
BEGIN
  SELECT count(*) INTO target_count
  FROM qms_epoch_validation_packages
  WHERE package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014';

  -- If 0 packages are found this database never had the duplicates (dev, test,
  -- baseline replay) or they were already disposed of in a prior run.  Return
  -- immediately so the subsequent ESV-2026-0001 guard and the UPDATE / INSERT
  -- below become natural no-ops rather than crashing the server.
  IF target_count = 0 THEN
    RAISE NOTICE '0253 no-op: packages ESV-2026-0002..ESV-2026-0014 not present on this database instance';
    RETURN;
  ELSIF target_count <> 13 THEN
    RAISE EXCEPTION
      '0253 expected exactly 13 duplicate packages ESV-2026-0002 through ESV-2026-0014; found %',
      target_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM qms_epoch_validation_packages
    WHERE package_number = 'ESV-2026-0001'
  ) THEN
    RAISE EXCEPTION '0253 refused to run because retained package ESV-2026-0001 is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM qms_epoch_validation_packages
    WHERE package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
      AND status NOT IN ('DRAFT', 'VOID_DUPLICATE')
  ) THEN
    RAISE EXCEPTION '0253 refused to void a duplicate package that is no longer DRAFT';
  END IF;

  SELECT sum(row_count) INTO authored_count
  FROM (
    SELECT count(*) row_count FROM qms_epoch_validation_intended_use_revisions r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_intended_use_functions r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_responsibilities r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_requirements r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_risks r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_plans r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_protocols r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_executions r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_evidence r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_defects r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_approvals r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_snapshots r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    UNION ALL SELECT count(*) FROM qms_epoch_validation_periodic_reviews r JOIN qms_epoch_validation_packages p ON p.id=r.package_id WHERE p.package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
  ) authored;

  IF authored_count <> 0 THEN
    RAISE EXCEPTION
      '0253 refused to void duplicate packages because % authored validation records were found',
      authored_count;
  END IF;
END $$;

WITH changed AS (
  UPDATE qms_epoch_validation_packages
  SET status = 'VOID_DUPLICATE',
      locked_at = now(),
      row_version = row_version + 1,
      revision = revision + 1,
      updated_at = now(),
      updated_by_display_name = 'migration 0253 (user-authorized duplicate cleanup)'
  WHERE package_number BETWEEN 'ESV-2026-0002' AND 'ESV-2026-0014'
    AND status = 'DRAFT'
  RETURNING *
)
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
FROM changed;
