-- Remove legacy customer-return/RMA rows from the Quality Action register.
--
-- `nonconformance_records` is the historical customer RMA/repair workflow. It
-- is not the authoritative P1 (`non_conforming_items`) or P2
-- (`p2_nonconforming_dispositions`) production nonconformance workflow. The
-- Quality Action migration accidentally projected every historical RMA into
-- `change_control_records` as an NCR.
--
-- Preserve the source RMA records and fail closed if a projected row has
-- acquired controlled Change Control evidence. Only the derived register rows
-- are removed.

DROP TRIGGER IF EXISTS sync_ncr_quality_action_register_trigger
  ON nonconformance_records;
DROP FUNCTION IF EXISTS sync_ncr_quality_action_register();

DO $$
DECLARE
  protected_projection_count integer;
  remaining_projection_count integer;
BEGIN
  SELECT count(*)::integer
    INTO protected_projection_count
    FROM change_control_records r
   WHERE r.authoritative_record_type = 'NCR'
     AND EXISTS (
       SELECT 1
         FROM nonconformance_records n
        WHERE n.id::text = r.authoritative_record_id
     )
     AND (
       EXISTS (SELECT 1 FROM change_control_record_links l WHERE l.change_control_record_id = r.id)
       OR EXISTS (SELECT 1 FROM change_control_evidence e WHERE e.change_control_record_id = r.id)
       OR EXISTS (SELECT 1 FROM change_control_historical_approvals a WHERE a.change_control_record_id = r.id)
       OR EXISTS (SELECT 1 FROM change_control_audit_events a WHERE a.change_control_record_id = r.id)
       OR EXISTS (SELECT 1 FROM change_control_assessments a WHERE a.change_control_record_id = r.id)
     );

  IF protected_projection_count <> 0 THEN
    RAISE EXCEPTION
      '0283 refused to remove % legacy RMA Change Control projection(s) with controlled evidence',
      protected_projection_count;
  END IF;

  DELETE FROM change_control_records r
   WHERE r.authoritative_record_type = 'NCR'
     AND EXISTS (
       SELECT 1
         FROM nonconformance_records n
        WHERE n.id::text = r.authoritative_record_id
     );

  SELECT count(*)::integer
    INTO remaining_projection_count
    FROM change_control_records r
   WHERE r.authoritative_record_type = 'NCR'
     AND EXISTS (
       SELECT 1
         FROM nonconformance_records n
        WHERE n.id::text = r.authoritative_record_id
     );

  IF remaining_projection_count <> 0 THEN
    RAISE EXCEPTION
      '0283 expected no legacy RMA Change Control projections after cleanup; found %',
      remaining_projection_count;
  END IF;
END $$;
