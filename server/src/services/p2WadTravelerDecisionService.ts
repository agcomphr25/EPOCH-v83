import { createHash } from 'crypto';

import { pool } from '../../db';
import { evaluateWadTravelerCoverage } from './p2WadTravelerCoverage';

export type WadTravelerActor = {
  userId: number;
  employeeId?: number | null;
  displayName: string;
  role: string;
};
export class WadTravelerDecisionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = (value: unknown) => String(value ?? '').trim();

export async function listWadTravelerDecisions(
  projectId: string,
  authorizationId: string
) {
  const result = await pool.query(
    `SELECT d.* FROM p2_wad_traveler_decisions d
    JOIN project_wad_authorizations w ON w.id=d.wad_authorization_id
    WHERE w.project_id=$1 AND w.id=$2 ORDER BY d.assembly_path_identity,d.inventory_item_id`,
    [projectId, authorizationId]
  );
  return result.rows;
}

export async function saveWadTravelerDecision(
  input: {
    projectId: string;
    authorizationId: string;
    inventoryItemId: number;
    assemblyPathIdentity: string;
    requiredQuantity: number;
    batchApprovedQuantity?: number | null;
    batchCoverageScope?: string | null;
    travelerRequirement: 'REQUIRED' | 'NOT_REQUIRED_APPROVED';
    travelerType?: 'INDIVIDUAL' | 'BATCH' | null;
    inspectionRequirements: Record<string, unknown>;
    exceptionReason?: string | null;
    exceptionEffectivity?: Record<string, unknown> | null;
    expectedVersion?: number;
  },
  actor: WadTravelerActor
) {
  if (!actor.employeeId)
    throw new WadTravelerDecisionError(
      'ACTOR_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required for controlled WAD decisions.',
      403
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query(
      `SELECT w.id,w.status,c.id configuration_id,c.inventory_item_id root_item_id,
      p.id policy_id,p.revision_number policy_revision,p.policy_type,p.output_serialization_required,
      p.lot_scan_required,p.batch_scan_required,p.quantity_entry_required,p.content_checksum policy_checksum
      FROM project_wad_authorizations w
      JOIN p2_project_controlled_configurations c ON c.project_id=w.project_id AND c.status='RELEASED'
      JOIN inventory_item_traceability_policies p ON p.inventory_item_id=$3 AND p.status='RELEASED'
      WHERE w.project_id=$1 AND w.id=$2 FOR UPDATE OF w`,
      [input.projectId, input.authorizationId, input.inventoryItemId]
    );
    const row = source.rows[0];
    if (source.rows.length !== 1 || !row || row.status !== 'DRAFT')
      throw new WadTravelerDecisionError(
        'DRAFT_AUTHORIZATION_REQUIRED',
        'Exactly one current DRAFT WAD authorization, released project configuration, and released item policy are required.',
        409
      );
    const membership = await client.query(
      `SELECT 1 FROM bom_revisions br LEFT JOIN bom_lines bl ON bl.bom_revision_id=br.id
      WHERE br.id=(SELECT bom_revision_id FROM p2_project_controlled_configurations WHERE id=$1)
      AND ($2=(SELECT inventory_item_id FROM p2_project_controlled_configurations WHERE id=$1)
        OR (bl.child_inventory_item_id=$2 AND bl.make_buy_disposition='MAKE')) LIMIT 1`,
      [row.configuration_id, input.inventoryItemId]
    );
    if (!membership.rows[0])
      throw new WadTravelerDecisionError(
        'MANUFACTURED_SCOPE_REQUIRED',
        'Decision item must be the released configured assembly or a manufactured child in its released BOM.',
        409
      );
    if (!clean(input.assemblyPathIdentity) || !(input.requiredQuantity > 0))
      throw new WadTravelerDecisionError(
        'DECISION_INPUT_INVALID',
        'Assembly path identity and a positive required quantity are required.'
      );
    const requiredType =
      row.policy_type === 'SERIAL'
        ? 'INDIVIDUAL'
        : ['LOT', 'BATCH'].includes(row.policy_type)
          ? 'BATCH'
          : null;
    const weak =
      input.travelerRequirement !== 'REQUIRED' ||
      (requiredType && input.travelerType !== requiredType);
    if (input.travelerRequirement === 'REQUIRED' && !input.travelerType)
      throw new WadTravelerDecisionError(
        'TRAVELER_TYPE_REQUIRED',
        'Required travelers need an INDIVIDUAL or BATCH type.'
      );
    if (
      input.travelerType === 'BATCH' &&
      (!(Number(input.batchApprovedQuantity) >= input.requiredQuantity) ||
        !clean(input.batchCoverageScope))
    )
      throw new WadTravelerDecisionError(
        'BATCH_COVERAGE_REQUIRED',
        'A batch decision must explicitly cover the complete released demand quantity and scope.'
      );
    if (weak && !clean(input.exceptionReason))
      throw new WadTravelerDecisionError(
        'EXCEPTION_REASON_REQUIRED',
        'A controlled exception reason is required when the decision weakens the released item policy.'
      );
    const content = {
      configurationId: row.configuration_id,
      inventoryItemId: input.inventoryItemId,
      assemblyPathIdentity: clean(input.assemblyPathIdentity),
      requiredQuantity: input.requiredQuantity,
      batchApprovedQuantity: input.batchApprovedQuantity ?? null,
      batchCoverageScope: clean(input.batchCoverageScope) || null,
      travelerRequirement: input.travelerRequirement,
      travelerType: input.travelerType ?? null,
      policyId: row.policy_id,
      policyRevision: row.policy_revision,
      policyType: row.policy_type,
      policyChecksum: row.policy_checksum,
      inspectionRequirements: input.inspectionRequirements,
      exceptionReason: clean(input.exceptionReason) || null,
      exceptionEffectivity: input.exceptionEffectivity ?? null,
    };
    const existing = await client.query(
      `SELECT * FROM p2_wad_traveler_decisions WHERE wad_authorization_id=$1 AND inventory_item_id=$2 AND assembly_path_identity=$3 FOR UPDATE`,
      [
        input.authorizationId,
        input.inventoryItemId,
        clean(input.assemblyPathIdentity),
      ]
    );
    let saved;
    if (existing.rows[0]) {
      if (input.expectedVersion == null) {
        if (existing.rows[0].content_checksum === checksum(content)) {
          await client.query('COMMIT');
          return existing.rows[0];
        }
        throw new WadTravelerDecisionError(
          'DECISION_CREATE_CONFLICT',
          'A traveler decision already exists for this identity with different controlled content.',
          409
        );
      }
      if (existing.rows[0].concurrency_version !== input.expectedVersion)
        throw new WadTravelerDecisionError(
          'STALE_DECISION',
          'Traveler decision was changed by another user.',
          409
        );
      saved = await client.query(
        `UPDATE p2_wad_traveler_decisions SET required_quantity=$2,batch_approved_quantity=$3,batch_coverage_scope=$4,
        traveler_requirement=$5,traveler_type=$6,inspection_requirements_snapshot=$7::jsonb,exception_required=$8,
        exception_reason=$9,exception_effectivity=$10::jsonb,status=$11,content_checksum=$12,
        concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [
          existing.rows[0].id,
          input.requiredQuantity,
          input.batchApprovedQuantity ?? null,
          clean(input.batchCoverageScope) || null,
          input.travelerRequirement,
          input.travelerType ?? null,
          JSON.stringify(input.inspectionRequirements),
          weak,
          clean(input.exceptionReason) || null,
          JSON.stringify(input.exceptionEffectivity ?? null),
          weak ? 'EXCEPTION_PENDING' : 'VALIDATED',
          checksum(content),
        ]
      );
    } else {
      saved = await client.query(
        `INSERT INTO p2_wad_traveler_decisions (wad_authorization_id,project_configuration_id,inventory_item_id,
        assembly_path_identity,required_quantity,batch_approved_quantity,batch_coverage_scope,traveler_requirement,traveler_type,traceability_policy_id,traceability_policy_revision,
        traceability_policy_type_snapshot,traceability_requirements_snapshot,inspection_requirements_snapshot,exception_required,
        exception_reason,exception_effectivity,status,content_checksum,created_by,created_by_employee_id,created_by_display_name,created_by_role,
        validated_at,validated_by,validated_by_employee_id,validated_by_display_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23,
        CASE WHEN $18='VALIDATED' THEN now() END,CASE WHEN $18='VALIDATED' THEN $20 END,CASE WHEN $18='VALIDATED' THEN $21 END,CASE WHEN $18='VALIDATED' THEN $22 END) RETURNING *`,
        [
          input.authorizationId,
          row.configuration_id,
          input.inventoryItemId,
          clean(input.assemblyPathIdentity),
          input.requiredQuantity,
          input.batchApprovedQuantity ?? null,
          clean(input.batchCoverageScope) || null,
          input.travelerRequirement,
          input.travelerType ?? null,
          row.policy_id,
          row.policy_revision,
          row.policy_type,
          JSON.stringify({
            policyChecksum: row.policy_checksum,
            outputSerializationRequired: row.output_serialization_required,
            lotScanRequired: row.lot_scan_required,
            batchScanRequired: row.batch_scan_required,
            quantityEntryRequired: row.quantity_entry_required,
          }),
          JSON.stringify(input.inspectionRequirements),
          weak,
          clean(input.exceptionReason) || null,
          JSON.stringify(input.exceptionEffectivity ?? null),
          weak ? 'EXCEPTION_PENDING' : 'VALIDATED',
          checksum(content),
          actor.userId,
          actor.employeeId,
          actor.displayName,
          actor.role,
        ]
      );
    }
    await client.query(
      `INSERT INTO p2_wad_traveler_decision_events(decision_id,event_type,actor_user_id,actor_employee_id,actor_display_name,actor_role,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        saved.rows[0].id,
        weak ? 'EXCEPTION_REQUESTED' : 'VALIDATED',
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify({
          contentChecksum: saved.rows[0].content_checksum,
          policyId: row.policy_id,
          policyRevision: row.policy_revision,
        }),
      ]
    );
    await client.query('COMMIT');
    return saved.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function approveWadTravelerException(
  projectId: string,
  authorizationId: string,
  decisionId: string,
  expectedVersion: number,
  signatureMeaning: string,
  actor: WadTravelerActor
) {
  if (!actor.employeeId)
    throw new WadTravelerDecisionError(
      'ACTOR_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required for controlled WAD exception approval.',
      403
    );
  if (!clean(signatureMeaning))
    throw new WadTravelerDecisionError(
      'SIGNATURE_REQUIRED',
      'Signature meaning is required.'
    );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE p2_wad_traveler_decisions d SET status='VALIDATED',exception_approved_by=$5,
      exception_approver_display_name=$6,exception_signature_meaning=$7,exception_approved_at=now(),validated_at=now(),validated_by=$5,
      validated_by_employee_id=$8,validated_by_display_name=$6,concurrency_version=concurrency_version+1,updated_at=now()
      FROM project_wad_authorizations w WHERE d.id=$3 AND d.wad_authorization_id=w.id AND w.id=$2 AND w.project_id=$1
      AND w.status='DRAFT' AND d.status='EXCEPTION_PENDING' AND d.concurrency_version=$4 AND d.created_by<>$5 RETURNING d.*`,
      [
        projectId,
        authorizationId,
        decisionId,
        expectedVersion,
        actor.userId,
        actor.displayName,
        signatureMeaning,
        actor.employeeId,
      ]
    );
    if (!result.rows[0])
      throw new WadTravelerDecisionError(
        'STALE_OR_INDEPENDENCE_REQUIRED',
        'Exception is stale, not pending, or requires an independent approver.',
        409
      );
    await client.query(
      `INSERT INTO p2_wad_traveler_decision_events(decision_id,event_type,actor_user_id,actor_employee_id,actor_display_name,actor_role,signature_meaning,evidence) VALUES($1,'EXCEPTION_APPROVED',$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        decisionId,
        actor.userId,
        actor.employeeId,
        actor.displayName,
        actor.role,
        signatureMeaning,
        JSON.stringify({ contentChecksum: result.rows[0].content_checksum }),
      ]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function wadTravelerDecisionBlockers(
  projectId: string,
  authorizationId: string
) {
  const result = await pool.query(
    `SELECT w.inherited_requirements_snapshot,
    COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM p2_wad_traveler_decisions d WHERE d.wad_authorization_id=w.id),'[]'::jsonb) decisions
    FROM project_wad_authorizations w WHERE w.project_id=$1 AND w.id=$2`,
    [projectId, authorizationId]
  );
  const row = result.rows[0];
  if (!row) return ['WAD traveler decision authority is missing.'];
  return evaluateWadTravelerCoverage(
    row.inherited_requirements_snapshot?.manufacturedItems ?? [],
    row.decisions ?? []
  );
}
