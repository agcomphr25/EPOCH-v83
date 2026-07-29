import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { getAuditReadinessValidationStatus } from './epochSoftwareValidation';

const router = Router();
router.use(authenticateToken);

const id = z.string().uuid();
const actor = (req: Request) => {
  const user = req.user as any;
  return {
    id: Number(user.id),
    employeeId: user.employeeId ? Number(user.employeeId) : null,
    name: String(user.displayName || user.name || user.username),
    role: String(user.role),
  };
};
const rows = async (text: string, params: unknown[] = []) => pool.query(text, params);
type QueryRows = (text: string, params?: unknown[]) => Promise<any[]>;
async function transaction<T>(work: (query: QueryRows) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const query: QueryRows = async (text, params = []) => (await client.query(text, params as any[])).rows;
  try {
    await client.query('BEGIN');
    const value = await work(query);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function event(req: Request, assessment: any, action: string, options: {
  itemId?: string; previous?: unknown; next?: unknown; reason?: string;
} = {}, query: QueryRows = rows) {
  const a = actor(req);
  await query(
    `INSERT INTO qms_audit_readiness_events
      (assessment_id,item_id,action,actor_user_id,actor_display_name,actor_role,
       previous_value,new_value,reason,assessment_version,template_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,
    [assessment.id, options.itemId || null, action, a.id, a.name, a.role,
     options.previous ? JSON.stringify(options.previous) : null,
     options.next ? JSON.stringify(options.next) : null,
     options.reason || null, assessment.assessment_version, assessment.template_version]
  );
}

async function getAssessment(assessmentId: string) {
  const result = await rows(`SELECT * FROM qms_audit_readiness_assessments WHERE id=$1`, [assessmentId]);
  return result[0];
}
const locked = (assessment: any) => assessment.status === 'LOCKED';

async function readiness(assessmentId: string) {
  const result = await rows(
    `SELECT count(*)::int AS total_items,
       count(*) FILTER (WHERE status <> 'NOT_APPLICABLE_APPROVED')::int AS applicable_items,
       count(*) FILTER (WHERE status IN ('COMPLETE','VERIFIED'))::int AS complete_items,
       count(*) FILTER (WHERE status IN ('IN_PROGRESS','READY_FOR_REVIEW','RETURNED_FOR_CORRECTION'))::int AS in_progress_items,
       count(*) FILTER (WHERE evidence_required AND status <> 'NOT_APPLICABLE_APPROVED'
         AND NOT EXISTS (SELECT 1 FROM qms_audit_readiness_evidence e WHERE e.item_id=i.id AND NOT e.is_removed))::int AS missing_evidence_items,
       count(*) FILTER (WHERE status='BLOCKED')::int AS blocked_items,
       count(*) FILTER (WHERE due_date < current_date AND status NOT IN ('COMPLETE','VERIFIED','NOT_APPLICABLE_APPROVED'))::int AS overdue_items,
       count(*) FILTER (WHERE status='NOT_APPLICABLE_PENDING_APPROVAL')::int AS pending_na_approvals,
       count(*) FILTER (WHERE criticality='CRITICAL' AND status NOT IN ('COMPLETE','VERIFIED','NOT_APPLICABLE_APPROVED'))::int AS critical_open_items,
       count(*) FILTER (WHERE status='NOT_APPLICABLE_APPROVED')::int AS approved_na_items,
       count(DISTINCT section_key) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM qms_audit_readiness_items x WHERE x.assessment_id=i.assessment_id
           AND x.section_key=i.section_key AND x.status NOT IN ('COMPLETE','VERIFIED','NOT_APPLICABLE_APPROVED')))::int AS sections_complete
     FROM qms_audit_readiness_items i WHERE assessment_id=$1`,
    [assessmentId]
  );
  const r = result[0] || {};
  const denominator = Number(r.applicable_items || 0);
  return {
    ...r,
    readiness_percentage: denominator ? Math.round((Number(r.complete_items) / denominator) * 100) : 0,
  };
}

const createSchema = z.object({
  title: z.string().min(3).max(240),
  auditType: z.enum(['INITIAL_CERTIFICATION','SURVEILLANCE','RECERTIFICATION','INTERNAL_READINESS_REVIEW','CUSTOMER_AUDIT','SPECIAL_PROCESS_AUDIT']),
  standard: z.string().min(1).default('AS9100D'),
  certificationBody: z.string().max(240).optional(),
  auditor: z.string().max(240).optional(),
  plannedStartDate: z.string().date(),
  plannedEndDate: z.string().date(),
  ownerEmployeeId: z.number().int().positive().nullable().optional(),
  ownerDisplayName: z.string().min(1),
  epochVersion: z.string().min(1),
  qmsScope: z.string().min(3),
  productDesignInScope: z.boolean(),
  deliverableSoftwareInScope: z.boolean(),
  facility: z.string().min(1),
  notes: z.string().max(10000).optional(),
});

router.get('/', requirePermission('qms.audit_readiness.view'), async (_req, res) => {
  const result = await rows(
    `SELECT a.*, (SELECT count(*) FROM qms_audit_readiness_items i WHERE i.assessment_id=a.id) AS item_count
       FROM qms_audit_readiness_assessments a ORDER BY planned_start_date DESC, created_at DESC`
  );
  res.json(result);
});

router.post('/', requirePermission('qms.audit_readiness.create'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'VALIDATION_ERROR', details: parsed.error.flatten() });
  const p = parsed.data;
  const a = actor(req);
  const outcome = await transaction(async query => {
    const template = (await query(
      `SELECT * FROM qms_audit_readiness_templates
       WHERE template_key='EPOCH_AS9100_AUDIT_READINESS' AND lifecycle_status='RELEASED'
       ORDER BY version DESC LIMIT 1 FOR SHARE`
    ))[0];
    if (!template) {
      return { blocked: true as const };
    }
    const sequence = (await query(`SELECT nextval('qms_audit_readiness_number_seq') AS value`))[0].value;
    const number = `ARA-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, '0')}`;
    const created = (await query(
      `INSERT INTO qms_audit_readiness_assessments
       (assessment_number,title,audit_type,standard,certification_body,auditor,planned_start_date,
        planned_end_date,owner_employee_id,owner_display_name,epoch_version,qms_scope,
        product_design_in_scope,deliverable_software_in_scope,facility,notes,template_id,
        template_version,created_by_user_id,created_by_display_name,updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$19)
       RETURNING *`,
      [number,p.title,p.auditType,p.standard,p.certificationBody||null,p.auditor||null,p.plannedStartDate,
       p.plannedEndDate,p.ownerEmployeeId||null,p.ownerDisplayName,p.epochVersion,p.qmsScope,
       p.productDesignInScope,p.deliverableSoftwareInScope,p.facility,p.notes||null,template.id,template.version,a.id,a.name]
    ))[0];
    await query(
      `INSERT INTO qms_audit_readiness_items
       (assessment_id,template_item_id,item_key,section_key,section_title,sequence,action_statement,
        purpose,clause_reference,required,evidence_required,criticality,status,design_scope_item,last_updated_by_user_id)
       SELECT $1,id,item_key,section_key,section_title,sequence,action_statement,purpose,clause_reference,
        required,evidence_required,criticality,
        CASE WHEN design_scope_item AND NOT $2 THEN 'NOT_APPLICABLE_PENDING_APPROVAL' ELSE 'NOT_STARTED' END,
        design_scope_item,$3
       FROM qms_audit_readiness_template_items WHERE template_id=$4`,
      [created.id,p.productDesignInScope,a.id,template.id]
    );
    await event(req, created, 'ASSESSMENT_CREATED', { next: { assessmentNumber: number, templateVersion: template.version } }, query);
    return { blocked: false as const, created };
  });
  if (outcome.blocked) {
    return res.status(409).json({
        error: 'AUDIT_READINESS_TEMPLATE_NOT_RELEASED',
        message: 'The controlled AS9100 readiness template is in Draft. An authorized administrator must review and release it before assessments can be created.',
      });
  }
  res.status(201).json(outcome.created);
});

router.get('/templates', requirePermission('qms.audit_readiness.admin'), async (_req, res) => {
  res.json(await rows(
    `SELECT t.*, count(i.id)::int AS item_count
     FROM qms_audit_readiness_templates t
     LEFT JOIN qms_audit_readiness_template_items i ON i.template_id=t.id
     GROUP BY t.id ORDER BY t.version DESC`
  ));
});

router.get('/:id', requirePermission('qms.audit_readiness.view'), async (req, res) => {
  const assessmentId = id.parse(req.params.id);
  const assessment = await getAssessment(assessmentId);
  if (!assessment) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND' });
  const items = await rows(
    `SELECT i.*, count(e.id) FILTER (WHERE NOT e.is_removed)::int AS evidence_count
     FROM qms_audit_readiness_items i LEFT JOIN qms_audit_readiness_evidence e ON e.item_id=i.id
     WHERE i.assessment_id=$1 GROUP BY i.id ORDER BY i.sequence`, [assessmentId]);
  res.json({
    assessment,
    items,
    readiness: await readiness(assessmentId),
    epochSoftwareValidation: await getAuditReadinessValidationStatus(assessmentId),
  });
});

router.get('/:id/epoch-software-validation', requirePermission('qms.audit_readiness.view'), async (req, res) => {
  const status = await getAuditReadinessValidationStatus(id.parse(req.params.id));
  if (!status) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND' });
  res.json(status);
});

router.get('/:id/readiness', requirePermission('qms.audit_readiness.view'), async (req, res) => {
  res.json(await readiness(id.parse(req.params.id)));
});

const itemUpdateSchema = z.object({
  rowVersion: z.number().int().positive(),
  assignedEmployeeId: z.number().int().positive().nullable().optional(),
  assignedEmployeeName: z.string().max(240).nullable().optional(),
  assignedDepartment: z.string().max(120).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  status: z.enum(['NOT_STARTED','IN_PROGRESS','EVIDENCE_REQUIRED','READY_FOR_REVIEW','RETURNED_FOR_CORRECTION','BLOCKED']).optional(),
  completionPercentage: z.number().int().min(0).max(100).optional(),
  comments: z.string().max(10000).nullable().optional(),
});
router.patch('/:assessmentId/items/:itemId', requirePermission('qms.audit_readiness.edit'), async (req, res) => {
  const assessmentId = id.parse(req.params.assessmentId);
  const itemId = id.parse(req.params.itemId);
  const p = itemUpdateSchema.parse(req.body);
  const assessment = await getAssessment(assessmentId);
  if (!assessment) return res.status(404).json({ error: 'ASSESSMENT_NOT_FOUND' });
  if (locked(assessment)) return res.status(409).json({ error: 'ASSESSMENT_LOCKED', message: 'Locked assessments are immutable.' });
  const before = (await rows(`SELECT * FROM qms_audit_readiness_items WHERE id=$1 AND assessment_id=$2`,[itemId,assessmentId]))[0];
  if (!before) return res.status(404).json({ error: 'ITEM_NOT_FOUND' });
  const a = actor(req);
  const updated = (await rows(
    `UPDATE qms_audit_readiness_items SET
      assigned_employee_id=COALESCE($1,assigned_employee_id),
      assigned_employee_name=COALESCE($2,assigned_employee_name),
      assigned_department=COALESCE($3,assigned_department),
      due_date=COALESCE($4,due_date), status=COALESCE($5,status),
      completion_percentage=COALESCE($6,completion_percentage), comments=COALESCE($7,comments),
      row_version=row_version+1,last_updated_by_user_id=$8,updated_at=now()
     WHERE id=$9 AND assessment_id=$10 AND row_version=$11 RETURNING *`,
    [p.assignedEmployeeId,p.assignedEmployeeName,p.assignedDepartment,p.dueDate,p.status,
     p.completionPercentage,p.comments,a.id,itemId,assessmentId,p.rowVersion]
  ))[0];
  if (!updated) return res.status(409).json({ error: 'STALE_RECORD', message: 'This item was updated by another user. Refresh and try again.' });
  await rows(`UPDATE qms_audit_readiness_approvals SET status='INVALIDATED',invalidated_at=now(),
    invalidation_reason='Checklist item changed' WHERE assessment_id=$1 AND status='VALID'`,[assessmentId]);
  await event(req, assessment, 'CHECKLIST_ITEM_UPDATED', { itemId, previous: before, next: updated });
  res.json(updated);
});

const evidenceSchema = z.object({
  evidenceType: z.string().min(1).max(100), sourceModule: z.string().min(1).max(100),
  sourceReferenceType: z.string().max(100).optional(), sourceRecordId: z.string().max(240).optional(),
  recordNumber: z.string().min(1).max(240), title: z.string().min(1).max(500),
  revision: z.string().max(100).optional(), recordStatus: z.string().max(100).optional(),
  openRoute: z.string().max(1000).optional(), attachmentId: z.string().uuid().optional(),
  evidenceNote: z.string().max(5000).optional(), snapshotChecksum: z.string().max(128).optional(),
});
router.post('/:assessmentId/items/:itemId/evidence', requirePermission('qms.audit_readiness.edit'), async (req, res) => {
  const assessmentId=id.parse(req.params.assessmentId), itemId=id.parse(req.params.itemId);
  const p=evidenceSchema.parse(req.body), assessment=await getAssessment(assessmentId), a=actor(req);
  if (!assessment) return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  if (locked(assessment)) return res.status(409).json({error:'ASSESSMENT_LOCKED'});
  const evidence=(await rows(`INSERT INTO qms_audit_readiness_evidence
   (assessment_id,item_id,evidence_type,source_module,source_reference_type,source_record_id,
    record_number,title,revision,record_status,open_route,attachment_id,evidence_note,snapshot_checksum,
    added_by_user_id,added_by_display_name)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
   [assessmentId,itemId,p.evidenceType,p.sourceModule,p.sourceReferenceType||null,p.sourceRecordId||null,
    p.recordNumber,p.title,p.revision||null,p.recordStatus||null,p.openRoute||null,p.attachmentId||null,
    p.evidenceNote||null,p.snapshotChecksum||null,a.id,a.name]))[0];
  await event(req,assessment,'EVIDENCE_ADDED',{itemId,next:evidence}); res.status(201).json(evidence);
});

router.delete('/:assessmentId/evidence/:evidenceId', requirePermission('qms.audit_readiness.edit'), async(req,res)=>{
  const assessmentId=id.parse(req.params.assessmentId), evidenceId=id.parse(req.params.evidenceId);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  if(locked(assessment))return res.status(409).json({error:'ASSESSMENT_LOCKED'});
  const removed=(await rows(`UPDATE qms_audit_readiness_evidence SET is_removed=true,removed_by_user_id=$1,removed_at=now()
    WHERE id=$2 AND assessment_id=$3 AND NOT is_removed RETURNING *`,[a.id,evidenceId,assessmentId]))[0];
  if(!removed)return res.status(404).json({error:'EVIDENCE_NOT_FOUND'});
  await event(req,assessment,'EVIDENCE_REMOVED',{itemId:removed.item_id,previous:removed}); res.status(204).end();
});

router.post('/:assessmentId/items/:itemId/submit', requirePermission('qms.audit_readiness.edit'), async(req,res)=>{
  const assessmentId=id.parse(req.params.assessmentId), itemId=id.parse(req.params.itemId);
  const assessment=await getAssessment(assessmentId);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  if(locked(assessment))return res.status(409).json({error:'ASSESSMENT_LOCKED'});
  const item=(await rows(`SELECT i.*,EXISTS(SELECT 1 FROM qms_audit_readiness_evidence e WHERE e.item_id=i.id AND NOT e.is_removed) has_evidence
    FROM qms_audit_readiness_items i WHERE id=$1 AND assessment_id=$2`,[itemId,assessmentId]))[0];
  if(!item)return res.status(404).json({error:'ITEM_NOT_FOUND'});
  if(item.evidence_required&&!item.has_evidence)return res.status(409).json({error:'REQUIRED_EVIDENCE_MISSING',message:'Objective evidence is required before review.'});
  const a=actor(req); const updated=(await rows(`UPDATE qms_audit_readiness_items SET status='READY_FOR_REVIEW',
    completion_percentage=100,row_version=row_version+1,last_updated_by_user_id=$1,updated_at=now() WHERE id=$2 RETURNING *`,[a.id,itemId]))[0];
  await event(req,assessment,'ITEM_SUBMITTED_FOR_REVIEW',{itemId,previous:item,next:updated}); res.json(updated);
});

router.post('/:assessmentId/items/:itemId/verify', requirePermission('qms.audit_readiness.review'), async(req,res)=>{
  const assessmentId=id.parse(req.params.assessmentId),itemId=id.parse(req.params.itemId);
  const body=z.object({result:z.string().min(1),comments:z.string().max(5000).optional()}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  if(locked(assessment))return res.status(409).json({error:'ASSESSMENT_LOCKED'});
  const currentItem=(await rows(`SELECT * FROM qms_audit_readiness_items WHERE id=$1 AND assessment_id=$2`,[itemId,assessmentId]))[0];
  if(currentItem?.section_key==='02'){
    const validation=await getAuditReadinessValidationStatus(assessmentId);
    if(!validation?.complete)return res.status(409).json({
      error:'EPOCH_VALIDATION_INCOMPLETE',
      message:'Section 2 is server-derived and cannot be manually completed until the linked EPOCH Software Validation Package is current.',
      blockers:validation?.blockers||['No linked validation package'],
    });
  }
  const updated=(await rows(`UPDATE qms_audit_readiness_items SET status='VERIFIED',verification_result=$1,
   reviewer_comments=$2,verified_by_user_id=$3,verified_by_display_name=$4,verified_at=now(),completed_at=now(),
   completion_percentage=100,row_version=row_version+1,last_updated_by_user_id=$3,updated_at=now()
   WHERE id=$5 AND assessment_id=$6 AND status='READY_FOR_REVIEW' RETURNING *`,
   [body.result,body.comments||null,a.id,a.name,itemId,assessmentId]))[0];
  if(!updated)return res.status(409).json({error:'INVALID_STATUS_TRANSITION',message:'Only an item ready for review can be verified.'});
  await event(req,assessment,'ITEM_VERIFIED',{itemId,next:updated});res.json(updated);
});

router.post('/:assessmentId/items/:itemId/na-request', requirePermission('qms.audit_readiness.edit'), async(req,res)=>{
  const assessmentId=id.parse(req.params.assessmentId),itemId=id.parse(req.params.itemId);
  const body=z.object({justification:z.string().min(10).max(5000)}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  const item=(await rows(`SELECT * FROM qms_audit_readiness_items WHERE id=$1 AND assessment_id=$2`,[itemId,assessmentId]))[0];
  if(!item)return res.status(404).json({error:'ITEM_NOT_FOUND'});
  if(assessment.product_design_in_scope&&item.design_scope_item)
    return res.status(409).json({error:'DESIGN_SCOPE_REQUIRES_APPLICABILITY',message:'Design Control items cannot be marked not applicable while product design is in scope.'});
  const updated=(await rows(`UPDATE qms_audit_readiness_items SET status='NOT_APPLICABLE_PENDING_APPROVAL',
    na_justification=$1,row_version=row_version+1,last_updated_by_user_id=$2,updated_at=now() WHERE id=$3 RETURNING *`,
    [body.justification,a.id,itemId]))[0];
  await event(req,assessment,'NA_REQUESTED',{itemId,next:updated,reason:body.justification});res.json(updated);
});

router.post('/:assessmentId/items/:itemId/na-decision', requirePermission('qms.audit_readiness.approve'), async(req,res)=>{
  const assessmentId=id.parse(req.params.assessmentId),itemId=id.parse(req.params.itemId);
  const body=z.object({decision:z.enum(['APPROVE','REJECT']),comments:z.string().min(3).max(5000)}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  const next=body.decision==='APPROVE'?'NOT_APPLICABLE_APPROVED':'RETURNED_FOR_CORRECTION';
  const updated=(await rows(`UPDATE qms_audit_readiness_items SET status=$1,approval_status=$2,
    na_approved_by_user_id=CASE WHEN $2='APPROVED' THEN $3 ELSE NULL END,
    na_approver_display_name=CASE WHEN $2='APPROVED' THEN $4 ELSE NULL END,
    na_approver_role=CASE WHEN $2='APPROVED' THEN $5 ELSE NULL END,
    na_approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE NULL END,
    reviewer_comments=$6,row_version=row_version+1,last_updated_by_user_id=$3,updated_at=now()
    WHERE id=$7 AND assessment_id=$8 AND status='NOT_APPLICABLE_PENDING_APPROVAL' RETURNING *`,
    [next,body.decision==='APPROVE'?'APPROVED':'REJECTED',a.id,a.name,a.role,body.comments,itemId,assessmentId]))[0];
  if(!updated)return res.status(409).json({error:'INVALID_STATUS_TRANSITION'});
  await event(req,assessment,body.decision==='APPROVE'?'NA_APPROVED':'NA_REJECTED',{itemId,next:updated,reason:body.comments});res.json(updated);
});

router.post('/:id/status', requirePermission('qms.audit_readiness.edit'), async(req,res)=>{
  const assessmentId=id.parse(req.params.id);
  const body=z.object({status:z.enum(['ACTIVE','UNDER_REVIEW','CORRECTIONS_REQUIRED','READY_FOR_APPROVAL','CANCELLED']),reason:z.string().min(3)}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  const allowed:Record<string,string[]>={
    DRAFT:['ACTIVE','CANCELLED'],ACTIVE:['UNDER_REVIEW','CANCELLED'],UNDER_REVIEW:['CORRECTIONS_REQUIRED','READY_FOR_APPROVAL'],
    CORRECTIONS_REQUIRED:['ACTIVE','UNDER_REVIEW'],READY_FOR_APPROVAL:['CORRECTIONS_REQUIRED']
  };
  if(!allowed[assessment.status]?.includes(body.status))return res.status(409).json({error:'INVALID_STATUS_TRANSITION',from:assessment.status,to:body.status});
  if(body.status==='READY_FOR_APPROVAL'){
    const r=await readiness(assessmentId);
    if(r.critical_open_items||r.missing_evidence_items||r.pending_na_approvals)
      return res.status(409).json({error:'READINESS_BLOCKED',message:'Critical, missing-evidence, or pending N/A items remain.',readiness:r});
  }
  const updated=(await rows(`UPDATE qms_audit_readiness_assessments SET status=$1,row_version=row_version+1,
    updated_by_user_id=$2,updated_at=now() WHERE id=$3 RETURNING *`,[body.status,a.id,assessmentId]))[0];
  await event(req,updated,'ASSESSMENT_STATUS_CHANGED',{previous:{status:assessment.status},next:{status:body.status},reason:body.reason});res.json(updated);
});

const approvalRoles=['QUALITY','EPOCH_IT_OWNER','OPERATIONS_MANAGER','TOP_MANAGEMENT'] as const;
router.post('/:id/approvals', requirePermission('qms.audit_readiness.approve'), async(req,res)=>{
  const assessmentId=id.parse(req.params.id);
  const body=z.object({approvalRole:z.enum(approvalRoles),decision:z.enum(['APPROVED','REJECTED','RETURNED']),
    comments:z.string().max(5000).optional()}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req),r=await readiness(assessmentId);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  if(assessment.status!=='READY_FOR_APPROVAL'&&body.decision==='APPROVED')return res.status(409).json({error:'INVALID_STATUS_TRANSITION'});
  const checksum=crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex');
  const approval=(await rows(`INSERT INTO qms_audit_readiness_approvals
   (assessment_id,approval_role,decision,meaning,actor_user_id,actor_employee_id,actor_display_name,
    actor_role,capability_used,assessment_version,template_version,readiness_snapshot,evidence_checksum,comments)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'qms.audit_readiness.approve',$9,$10,$11::jsonb,$12,$13) RETURNING *`,
   [assessmentId,body.approvalRole,body.decision,'I attest that the assessment evidence was reviewed for the stated approval role.',
    a.id,a.employeeId,a.name,a.role,assessment.assessment_version,assessment.template_version,JSON.stringify(r),checksum,body.comments||null]))[0];
  await event(req,assessment,'ASSESSMENT_APPROVAL_RECORDED',{next:approval,reason:body.comments});res.status(201).json(approval);
});

router.post('/:id/lock', requirePermission('qms.audit_readiness.admin'), async(req,res)=>{
  const assessmentId=id.parse(req.params.id), assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  const r=await readiness(assessmentId);
  const approvals=await rows(`SELECT approval_role FROM qms_audit_readiness_approvals WHERE assessment_id=$1 AND status='VALID' AND decision='APPROVED'`,[assessmentId]);
  const present=new Set(approvals.map((x:any)=>x.approval_role));
  const required=['QUALITY','TOP_MANAGEMENT','EPOCH_IT_OWNER','OPERATIONS_MANAGER'];
  const missing=required.filter(x=>!present.has(x));
  if(r.critical_open_items||r.missing_evidence_items||r.pending_na_approvals||Number(r.complete_items)!==Number(r.applicable_items)||missing.length)
    return res.status(409).json({error:'LOCK_BLOCKED',readiness:r,missingApprovals:missing});
  const full={assessment,items:await rows(`SELECT * FROM qms_audit_readiness_items WHERE assessment_id=$1 ORDER BY sequence`,[assessmentId]),
    evidence:await rows(`SELECT * FROM qms_audit_readiness_evidence WHERE assessment_id=$1 AND NOT is_removed`,[assessmentId]),
    approvals:await rows(`SELECT * FROM qms_audit_readiness_approvals WHERE assessment_id=$1 AND status='VALID'`,[assessmentId]),readiness:r};
  const checksum=crypto.createHash('sha256').update(JSON.stringify(full)).digest('hex');
  const updated = await transaction(async query => {
    await query(`INSERT INTO qms_audit_readiness_snapshots(assessment_id,assessment_version,template_version,snapshot,checksum,locked_by_user_id,locked_by_display_name)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`,[assessmentId,assessment.assessment_version,assessment.template_version,JSON.stringify(full),checksum,a.id,a.name]);
    const value=(await query(`UPDATE qms_audit_readiness_assessments SET status='LOCKED',locked_at=now(),updated_by_user_id=$1,updated_at=now() WHERE id=$2 RETURNING *`,[a.id,assessmentId]))[0];
    await event(req,value,'ASSESSMENT_LOCKED',{next:{checksum,readiness:r}},query);
    return value;
  });
  res.json(updated);
});

router.post('/:id/reopen', requirePermission('qms.audit_readiness.admin'), async(req,res)=>{
  const assessmentId=id.parse(req.params.id),body=z.object({reason:z.string().min(10)}).parse(req.body);
  const assessment=await getAssessment(assessmentId),a=actor(req);
  if(!assessment||assessment.status!=='LOCKED')return res.status(409).json({error:'ONLY_LOCKED_ASSESSMENTS_CAN_BE_REOPENED'});
  const updated = await transaction(async query => {
    await query(`UPDATE qms_audit_readiness_approvals SET status='INVALIDATED',invalidated_at=now(),invalidation_reason=$1 WHERE assessment_id=$2 AND status='VALID'`,[body.reason,assessmentId]);
    const value=(await query(`UPDATE qms_audit_readiness_assessments SET status='CORRECTIONS_REQUIRED',assessment_version=assessment_version+1,
      row_version=row_version+1,locked_at=NULL,updated_by_user_id=$1,updated_at=now() WHERE id=$2 RETURNING *`,[a.id,assessmentId]))[0];
    await event(req,value,'ASSESSMENT_REOPENED',{previous:{lockedVersion:assessment.assessment_version},next:{version:value.assessment_version},reason:body.reason},query);
    return value;
  });
  res.json(updated);
});

router.get('/:id/history', requirePermission('qms.audit_readiness.view'), async(req,res)=>{
  res.json(await rows(`SELECT * FROM qms_audit_readiness_events WHERE assessment_id=$1 ORDER BY created_at,id`,[id.parse(req.params.id)]));
});

router.get('/:id/export', requirePermission('qms.audit_readiness.export'), async(req:Request,res:Response)=>{
  const assessmentId=id.parse(req.params.id),assessment=await getAssessment(assessmentId);
  if(!assessment)return res.status(404).json({error:'ASSESSMENT_NOT_FOUND'});
  const view=z.enum(['checklist','auditor-package','open-actions','evidence-index']).catch('auditor-package').parse(req.query.view);
  const r=await readiness(assessmentId);
  await event(req,assessment,'ASSESSMENT_EXPORTED',{next:{format:'print-html',view}});
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Content-Disposition',`inline; filename="${assessment.assessment_number}-${view}.html"`);
  const mark=assessment.status==='LOCKED'?'CONTROLLED AUDIT READINESS RECORD':'DRAFT - NOT FINAL AUDIT EVIDENCE';
  const items=await rows(`SELECT i.*,string_agg(e.record_number||' - '||e.title,'; ' ORDER BY e.added_at) FILTER(WHERE NOT e.is_removed) evidence
    FROM qms_audit_readiness_items i LEFT JOIN qms_audit_readiness_evidence e ON e.item_id=i.id WHERE i.assessment_id=$1 GROUP BY i.id ORDER BY i.sequence`,[assessmentId]);
  const visibleItems=view==='open-actions'
    ? items.filter((item:any)=>!['COMPLETE','VERIFIED','NOT_APPLICABLE_APPROVED'].includes(item.status))
    : items;
  const approvals=await rows(`SELECT approval_role,decision,actor_display_name,actor_role,decided_at,comments
    FROM qms_audit_readiness_approvals WHERE assessment_id=$1 AND status='VALID' ORDER BY decided_at`,[assessmentId]);
  const history=await rows(`SELECT action,actor_display_name,created_at,reason FROM qms_audit_readiness_events
    WHERE assessment_id=$1 ORDER BY created_at DESC LIMIT 100`,[assessmentId]);
  const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  res.send(`<!doctype html><html><head><title>${escape(assessment.assessment_number)}</title><style>
  body{font:12px Arial;color:#172033;margin:32px}h1{color:#173f6b}.mark{border:2px solid #8b1e1e;padding:8px;text-align:center;font-weight:bold}
  table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #9aa4b2;padding:6px;vertical-align:top}th{background:#eaf0f6}
  @media print{button{display:none}}</style></head><body><button onclick="print()">Print / Save PDF</button><div class="mark">${mark}</div>
  <h1>EPOCH AS9100 Audit Readiness Checklist</h1><p><b>${escape(assessment.assessment_number)} - ${escape(assessment.title)}</b></p>
  <p>Audit: ${escape(assessment.planned_start_date)} to ${escape(assessment.planned_end_date)} | Facility: ${escape(assessment.facility)} | EPOCH: ${escape(assessment.epoch_version)}</p>
  <p>Scope: ${escape(assessment.qms_scope)}</p><h2>Executive readiness summary</h2><p>${r.readiness_percentage}% ready; ${r.complete_items}/${r.applicable_items} applicable items verified; ${r.critical_open_items} critical open; ${r.overdue_items} overdue.</p>
  <table><thead><tr><th>#</th><th>Action / clause</th><th>Status</th><th>Owner / due</th><th>Objective evidence</th></tr></thead><tbody>
  ${visibleItems.map((x:any)=>`<tr><td>${escape(x.item_key)}</td><td><b>${escape(x.section_title)}</b><br>${escape(x.action_statement)}<br>${escape(x.clause_reference)}</td><td>${escape(x.status)}</td><td>${escape(x.assigned_employee_name)}<br>${escape(x.due_date)}</td><td>${escape(x.evidence)}</td></tr>`).join('')}
  </tbody></table><h2>Final approval signatures</h2><table><tr><th>Approval role</th><th>Decision</th><th>Approver</th><th>Date/time</th></tr>
  ${approvals.map((x:any)=>`<tr><td>${escape(x.approval_role)}</td><td>${escape(x.decision)}</td><td>${escape(x.actor_display_name)} (${escape(x.actor_role)})</td><td>${escape(x.decided_at)}</td></tr>`).join('')}</table>
  <h2>Audit history summary</h2><table><tr><th>Action</th><th>Actor</th><th>Date/time</th><th>Reason</th></tr>
  ${history.map((x:any)=>`<tr><td>${escape(x.action)}</td><td>${escape(x.actor_display_name)}</td><td>${escape(x.created_at)}</td><td>${escape(x.reason)}</td></tr>`).join('')}</table>
  <h2>Final readiness statement</h2><p>This readiness checklist supports preparation and objective-evidence organization. Completion does not by itself certify conformity or guarantee AS9100 certification. The applicable standard, customer requirements, contractual requirements, and controlled QMS procedures remain authoritative.</p>
  <p>Generated ${escape(new Date().toISOString())} | Assessment version ${assessment.assessment_version} | Template version ${assessment.template_version}</p></body></html>`);
});

router.post('/templates/:templateId/release', requirePermission('qms.audit_readiness.admin'), async(req,res)=>{
  const templateId=id.parse(req.params.templateId);
  const body=z.object({reason:z.string().min(10)}).parse(req.body),a=actor(req);
  const updated=(await rows(`UPDATE qms_audit_readiness_templates SET lifecycle_status='RELEASED',created_by_user_id=COALESCE(created_by_user_id,$1)
    WHERE id=$2 AND lifecycle_status IN('DRAFT','IN_REVIEW') RETURNING *`,[a.id,templateId]))[0];
  if(!updated)return res.status(409).json({error:'TEMPLATE_RELEASE_NOT_ALLOWED'});
  res.json({...updated,releaseReason:body.reason});
});

export default router;
