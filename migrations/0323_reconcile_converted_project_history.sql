-- Reconcile preserved legacy completion history into already-converted P2 V2 workflows.
-- This is intentionally fail-closed: only projects with the conversion audit event,
-- all four completed legacy preproduction steps, one released/approved WAD, and a
-- linked released/in-production/completed P2 PO qualify. Original records are never
-- updated or deleted; V2 receives authoritative links to those records.

CREATE TEMP TABLE converted_project_history_evidence ON COMMIT DROP AS
WITH converted AS (
  SELECT p.id project_id, wi.id workflow_instance_id
  FROM projects p
  JOIN project_workflow_instances wi
    ON wi.project_id=p.id AND wi.workflow_version='p2_v2'
   AND wi.status NOT IN ('SUPERSEDED','CANCELLED')
  WHERE p.workflow_version='p2_v2'
    AND EXISTS (
      SELECT 1 FROM project_activity_log al
      WHERE al.project_id=p.id AND al.activity_type='workflow_version_converted'
    )
), legacy AS (
  SELECT ps.project_id,
    COUNT(*) FILTER (WHERE ps.step_type='rfq_risk_assessment' AND ps.status='completed') rfq_complete,
    COUNT(*) FILTER (WHERE ps.step_type='quote' AND ps.status='completed') quote_complete,
    COUNT(*) FILTER (WHERE ps.step_type='purchase_review_checklist' AND ps.status='completed'
      AND ps.linked_purchase_review_id IS NOT NULL) purchase_complete,
    COUNT(*) FILTER (WHERE ps.step_type='preproduction_checklist' AND ps.status='completed'
      AND ps.linked_preproduction_checklist_id IS NOT NULL) preproduction_complete,
    COUNT(*) FILTER (WHERE ps.step_type='p2_order' AND ps.linked_p2_order_id IS NOT NULL) po_linked
  FROM project_steps ps GROUP BY ps.project_id
), qualifying AS (
  SELECT c.project_id,c.workflow_instance_id
  FROM converted c
  JOIN legacy l ON l.project_id=c.project_id
  WHERE l.rfq_complete=1 AND l.quote_complete=1 AND l.purchase_complete=1
    AND l.preproduction_complete=1 AND l.po_linked=1
    AND 1=(SELECT COUNT(*) FROM production_work_orders pwo
           WHERE pwo.project_id=c.project_id AND pwo.status='RELEASED' AND pwo.wad_status='APPROVED')
    AND EXISTS (
      SELECT 1 FROM project_steps ps
      JOIN p2_purchase_orders po ON po.id=ps.linked_p2_order_id
      WHERE ps.project_id=c.project_id AND ps.step_type='p2_order'
        AND LOWER(po.status) IN ('released','in_production','completed')
    )
), evidence AS (
  SELECT q.project_id,q.workflow_instance_id,'rfq_risk_assessment'::text stage,
    'legacy_project_step'::text record_type,ps.id::text record_id,ps.completed_at evidence_at,
    COALESCE(ps.completed_by_display_name,'Controlled legacy-to-P2-V2 reconciliation') actor
  FROM qualifying q JOIN project_steps ps ON ps.project_id=q.project_id
  WHERE ps.step_type='rfq_risk_assessment' AND ps.status='completed'
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'estimate_quote','legacy_project_step',ps.id::text,
    ps.completed_at,COALESCE(ps.completed_by_display_name,'Controlled legacy-to-P2-V2 reconciliation')
  FROM qualifying q JOIN project_steps ps ON ps.project_id=q.project_id
  WHERE ps.step_type='quote' AND ps.status='completed'
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'contract_review','purchase_review_checklist',
    ps.linked_purchase_review_id::text,ps.completed_at,
    COALESCE(ps.completed_by_display_name,'Controlled legacy-to-P2-V2 reconciliation')
  FROM qualifying q JOIN project_steps ps ON ps.project_id=q.project_id
  WHERE ps.step_type='purchase_review_checklist' AND ps.status='completed'
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'technical_configuration_review','production_work_order',
    pwo.id::text,pwo.updated_at,'Controlled legacy-to-P2-V2 reconciliation'
  FROM qualifying q JOIN production_work_orders pwo ON pwo.project_id=q.project_id
  WHERE pwo.status='RELEASED' AND pwo.wad_status='APPROVED'
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'production_planning','p2_purchase_order',
    po.id::text,po.updated_at,'Controlled legacy-to-P2-V2 reconciliation'
  FROM qualifying q JOIN project_steps ps ON ps.project_id=q.project_id AND ps.step_type='p2_order'
  JOIN p2_purchase_orders po ON po.id=ps.linked_p2_order_id
  WHERE LOWER(po.status) IN ('released','in_production','completed')
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'wad_authorization','production_work_order',
    pwo.id::text,pwo.updated_at,'Controlled legacy-to-P2-V2 reconciliation'
  FROM qualifying q JOIN production_work_orders pwo ON pwo.project_id=q.project_id
  WHERE pwo.status='RELEASED' AND pwo.wad_status='APPROVED'
  UNION ALL
  SELECT q.project_id,q.workflow_instance_id,'preproduction_release','preproduction_checklist',
    ps.linked_preproduction_checklist_id::text,ps.completed_at,
    COALESCE(ps.completed_by_display_name,'Controlled legacy-to-P2-V2 reconciliation')
  FROM qualifying q JOIN project_steps ps ON ps.project_id=q.project_id
  WHERE ps.step_type='preproduction_checklist' AND ps.status='completed'
)
SELECT * FROM evidence;

INSERT INTO project_workflow_step_links
  (workflow_step_instance_id,project_id,record_type,record_id,relationship_type,
   is_authoritative,linked_by_display_name)
SELECT s.id,e.project_id,e.record_type,e.record_id,'SATISFIES_REQUIREMENT',true,e.actor
FROM converted_project_history_evidence e
JOIN project_workflow_step_instances s
  ON s.workflow_instance_id=e.workflow_instance_id AND s.step_type=e.stage
WHERE NOT EXISTS (
  SELECT 1 FROM project_workflow_step_links l
  WHERE l.workflow_step_instance_id=s.id AND l.record_type=e.record_type
    AND l.record_id=e.record_id AND l.relationship_type='SATISFIES_REQUIREMENT'
    AND l.unlinked_at IS NULL
);

UPDATE project_workflow_step_instances s
SET status='COMPLETE',started_at=COALESCE(s.started_at,e.evidence_at,now()),
    completed_at=COALESCE(s.completed_at,e.evidence_at,now()),
    completed_by_display_name=COALESCE(s.completed_by_display_name,e.actor),
    notes=COALESCE(NULLIF(s.notes,''),'Satisfied by preserved completed legacy evidence during controlled workflow conversion.'),
    updated_at=now()
FROM converted_project_history_evidence e
WHERE s.workflow_instance_id=e.workflow_instance_id AND s.step_type=e.stage
  AND s.status NOT IN ('COMPLETE','CANCELLED','SUPERSEDED');

UPDATE project_workflow_step_instances release_step
SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),updated_at=now()
WHERE release_step.step_type='p2_release' AND release_step.status='NOT_STARTED'
  AND EXISTS (
    SELECT 1 FROM converted_project_history_evidence e
    WHERE e.workflow_instance_id=release_step.workflow_instance_id
    GROUP BY e.workflow_instance_id HAVING COUNT(DISTINCT e.stage)=7
  );

INSERT INTO project_activity_log
  (project_id,activity_type,description,performed_by_display_name,metadata)
SELECT DISTINCT e.project_id,'legacy_workflow_evidence_reconciled',
  'Completed legacy preproduction evidence was linked to the converted P2 V2 workflow; original records were preserved.',
  'Controlled deployment reconciliation',
  jsonb_build_object('migration','0323_reconcile_converted_project_history.sql',
    'preservedLegacyRecords',true,'stagesSatisfied',7)
FROM converted_project_history_evidence e
WHERE NOT EXISTS (
  SELECT 1 FROM project_activity_log al
  WHERE al.project_id=e.project_id AND al.activity_type='legacy_workflow_evidence_reconciled'
);
