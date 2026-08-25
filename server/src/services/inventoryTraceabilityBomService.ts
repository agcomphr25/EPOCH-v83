import { createHash } from 'crypto';
import type { PoolClient } from 'pg';

import { pool } from '../../db';

export type TraceabilityPolicyType =
  | 'SERIAL'
  | 'LOT'
  | 'BATCH'
  | 'STANDARD_QUANTITY'
  | 'CUSTOMER_SUPPLIED'
  | 'NONE_APPROVED';

export type InventoryItemClassification =
  | 'RAW_MATERIAL'
  | 'PURCHASED_COMPONENT'
  | 'MANUFACTURED_COMPONENT'
  | 'SUBASSEMBLY'
  | 'ASSEMBLY'
  | 'CUSTOMER_SUPPLIED'
  | 'CONSUMABLE'
  | 'TOOLING'
  | 'NON_INVENTORY_SERVICE';

export type ControlledActor = {
  userId: number;
  displayName: string;
  role: string;
};

export class TraceabilityBomError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

const POLICY_TYPES = new Set<TraceabilityPolicyType>([
  'SERIAL', 'LOT', 'BATCH', 'STANDARD_QUANTITY', 'CUSTOMER_SUPPLIED', 'NONE_APPROVED',
]);
const CLASSIFICATIONS = new Set<InventoryItemClassification>([
  'RAW_MATERIAL', 'PURCHASED_COMPONENT', 'MANUFACTURED_COMPONENT', 'SUBASSEMBLY',
  'ASSEMBLY', 'CUSTOMER_SUPPLIED', 'CONSUMABLE', 'TOOLING', 'NON_INVENTORY_SERVICE',
]);
const clean = (value: unknown) => String(value ?? '').trim();
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const directRules: Record<TraceabilityPolicyType, Partial<Record<TraceabilityPolicyType, true>>> = {
  NONE_APPROVED: { STANDARD_QUANTITY: true, LOT: true, BATCH: true, SERIAL: true },
  STANDARD_QUANTITY: { LOT: true, BATCH: true, SERIAL: true },
  LOT: { SERIAL: true },
  BATCH: { SERIAL: true },
  SERIAL: {},
  CUSTOMER_SUPPLIED: { SERIAL: true },
};

export function isStricterTraceabilityOverride(
  base: TraceabilityPolicyType,
  override: TraceabilityPolicyType
): boolean {
  if (base === override) return false;
  return directRules[base]?.[override] === true;
}

export function validatePolicyInput(input: any) {
  if (!POLICY_TYPES.has(input.policyType))
    throw new TraceabilityBomError('POLICY_TYPE_INVALID', 'Select a valid traceability policy.');
  if (!CLASSIFICATIONS.has(input.itemClassification))
    throw new TraceabilityBomError('ITEM_CLASSIFICATION_INVALID', 'Select a valid Inventory Item classification.');
  if (!clean(input.partConfigurationRevision))
    throw new TraceabilityBomError('PART_REVISION_REQUIRED', 'Part/configuration revision is required.');
  if (!clean(input.unitOfMeasure))
    throw new TraceabilityBomError('UNIT_REQUIRED', 'Unit of measure is required.');
  if (!input.configurationEffectivity || typeof input.configurationEffectivity !== 'object' || Object.keys(input.configurationEffectivity).length === 0)
    throw new TraceabilityBomError('POLICY_EFFECTIVITY_REQUIRED', 'Policy configuration effectivity is required.');
  if (input.policyType === 'SERIAL' && !input.outputSerializationRequired)
    throw new TraceabilityBomError('SERIAL_REQUIREMENT_MISSING', 'Serial policy requires an individual controlled output identity.');
  if (input.policyType === 'LOT' && !input.lotScanRequired)
    throw new TraceabilityBomError('LOT_REQUIREMENT_MISSING', 'Lot policy requires lot scanning.');
  if (input.policyType === 'BATCH' && !input.batchScanRequired)
    throw new TraceabilityBomError('BATCH_REQUIREMENT_MISSING', 'Batch policy requires batch scanning.');
  if (input.policyType === 'STANDARD_QUANTITY' && !input.quantityEntryRequired)
    throw new TraceabilityBomError('QUANTITY_REQUIREMENT_MISSING', 'Standard quantity policy requires quantity entry.');
  if (input.policyType === 'CUSTOMER_SUPPLIED' && !input.customerCustodyRequired)
    throw new TraceabilityBomError('CUSTOMER_CUSTODY_REQUIRED', 'Customer-supplied policy requires custody tracking.');
  if (input.policyType === 'NONE_APPROVED' && !clean(input.noTraceabilityJustification))
    throw new TraceabilityBomError('NO_TRACEABILITY_REASON_REQUIRED', 'Approved no-traceability requires a justification.');
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recordPolicyEvent(client: PoolClient, row: any, eventType: string, actor: ControlledActor, fromStatus: string | null, toStatus: string, signatureMeaning?: string | null, reason?: string | null) {
  await client.query(
    `INSERT INTO inventory_item_traceability_policy_events
      (policy_id,inventory_item_id,event_type,from_status,to_status,actor_user_id,
       actor_display_name,actor_role,signature_meaning,reason,evidence)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [row.id, row.inventory_item_id, eventType, fromStatus, toStatus, actor.userId,
      actor.displayName, actor.role, signatureMeaning || null, reason || null,
      JSON.stringify({ revisionNumber: row.revision_number, contentChecksum: row.content_checksum })]
  );
}

export async function getTraceabilityPolicyHistory(inventoryItemId: number) {
  const result = await pool.query(
    `SELECT p.*,d.name default_department_name
       FROM inventory_item_traceability_policies p
       LEFT JOIN inventory_departments d ON d.id=p.default_department_id
      WHERE p.inventory_item_id=$1 ORDER BY p.revision_number DESC`,
    [inventoryItemId]
  );
  return result.rows;
}

export async function createTraceabilityPolicyDraft(input: any, actor: ControlledActor) {
  validatePolicyInput(input);
  return inTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1,$2)', [8415, input.inventoryItemId]);
    const itemResult = await client.query(
      `SELECT id,ag_part_number,name,item_type,manufactured_category,manufacturing_level,
              usage_unit,purchase_unit,default_department_id
         FROM inventory_items WHERE id=$1 FOR SHARE`,
      [input.inventoryItemId]
    );
    const item = itemResult.rows[0];
    if (!item) throw new TraceabilityBomError('INVENTORY_ITEM_NOT_FOUND', 'Inventory Item was not found.', 404);
    const revisionResult = await client.query(
      `SELECT COALESCE(max(revision_number),0)+1 revision
         FROM inventory_item_traceability_policies WHERE inventory_item_id=$1`,
      [input.inventoryItemId]
    );
    const revisionNumber = Number(revisionResult.rows[0].revision);
    const content = {
      inventoryItemId: item.id,
      revisionNumber,
      policyType: input.policyType,
      itemClassification: input.itemClassification,
      partConfigurationRevision: clean(input.partConfigurationRevision),
      unitOfMeasure: clean(input.unitOfMeasure),
      defaultDepartmentId: input.defaultDepartmentId || item.default_department_id || null,
      outputSerializationRequired: Boolean(input.outputSerializationRequired),
      individualInputScanRequired: Boolean(input.individualInputScanRequired),
      lotScanRequired: Boolean(input.lotScanRequired),
      batchScanRequired: Boolean(input.batchScanRequired),
      quantityEntryRequired: Boolean(input.quantityEntryRequired),
      divisibleInventoryPermitted: Boolean(input.divisibleInventoryPermitted),
      shelfLifeControlled: Boolean(input.shelfLifeControlled),
      heatLotRequired: Boolean(input.heatLotRequired),
      dateCodeRequired: Boolean(input.dateCodeRequired),
      cocRequired: Boolean(input.cocRequired),
      materialCertificationRequired: Boolean(input.materialCertificationRequired),
      testReportRequired: Boolean(input.testReportRequired),
      sdsRequired: Boolean(input.sdsRequired),
      tdsRequired: Boolean(input.tdsRequired),
      receivingInspectionRequired: Boolean(input.receivingInspectionRequired),
      customerCustodyRequired: Boolean(input.customerCustodyRequired),
      storageRequirements: input.storageRequirements || {},
      configurationEffectivity: input.configurationEffectivity || {},
      noTraceabilityJustification: clean(input.noTraceabilityJustification) || null,
      effectiveFrom: input.effectiveFrom || null,
      effectiveTo: input.effectiveTo || null,
    };
    const values = [
      item.id, revisionNumber, content.policyType, content.itemClassification,
      content.partConfigurationRevision, content.unitOfMeasure, content.defaultDepartmentId,
      content.outputSerializationRequired, content.individualInputScanRequired,
      content.lotScanRequired, content.batchScanRequired, content.quantityEntryRequired,
      content.divisibleInventoryPermitted, content.shelfLifeControlled, content.heatLotRequired,
      content.dateCodeRequired, content.cocRequired, content.materialCertificationRequired,
      content.testReportRequired, content.sdsRequired, content.tdsRequired,
      content.receivingInspectionRequired, content.customerCustodyRequired,
      JSON.stringify(content.storageRequirements), JSON.stringify(content.configurationEffectivity),
      content.noTraceabilityJustification, content.effectiveFrom, content.effectiveTo,
      checksum(content), actor.userId, actor.displayName, actor.role,
    ];
    const inserted = await client.query(
      `INSERT INTO inventory_item_traceability_policies
       (inventory_item_id,revision_number,policy_type,item_classification,
        part_configuration_revision,unit_of_measure,default_department_id,
        output_serialization_required,individual_input_scan_required,lot_scan_required,
        batch_scan_required,quantity_entry_required,divisible_inventory_permitted,
        shelf_life_controlled,heat_lot_required,date_code_required,coc_required,
        material_certification_required,test_report_required,sds_required,tds_required,
        receiving_inspection_required,customer_custody_required,storage_requirements,
        configuration_effectivity,no_traceability_justification,effective_from,effective_to,
        content_checksum,created_by,created_by_display_name,created_by_role)
       VALUES(${values.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
      values
    );
    await recordPolicyEvent(client, inserted.rows[0], 'POLICY_DRAFT_CREATED', actor, null, 'DRAFT');
    return inserted.rows[0];
  });
}

export async function submitTraceabilityPolicy(policyId: string, expectedVersion: number, actor: ControlledActor) {
  return inTransaction(async (client) => {
    const result = await client.query(
      `UPDATE inventory_item_traceability_policies
          SET status='PENDING_APPROVAL',submitted_by=$2,submitted_by_display_name=$3,
              submitted_at=clock_timestamp(),updated_at=now(),concurrency_version=concurrency_version+1
        WHERE id=$1 AND status IN ('DRAFT','RETURNED') AND concurrency_version=$4 RETURNING *`,
      [policyId, actor.userId, actor.displayName, expectedVersion]
    );
    const row = result.rows[0];
    if (!row) throw new TraceabilityBomError('POLICY_VERSION_CONFLICT', 'Policy changed or is not submit-ready.', 409);
    await recordPolicyEvent(client, row, 'POLICY_SUBMITTED', actor, 'DRAFT', 'PENDING_APPROVAL');
    return row;
  });
}

export async function decideTraceabilityPolicy(input: { policyId: string; expectedVersion: number; decision: 'APPROVE' | 'RETURN' | 'REJECT'; capacity: string; signatureMeaning: string; reason?: string }, actor: ControlledActor) {
  if (!clean(input.signatureMeaning)) throw new TraceabilityBomError('SIGNATURE_MEANING_REQUIRED', 'Signature meaning is required.');
  if (input.decision !== 'APPROVE' && !clean(input.reason)) throw new TraceabilityBomError('DECISION_REASON_REQUIRED', 'A return or rejection reason is required.');
  return inTransaction(async (client) => {
    const locked = await client.query(`SELECT * FROM inventory_item_traceability_policies WHERE id=$1 FOR UPDATE`, [input.policyId]);
    const row = locked.rows[0];
    if (!row) throw new TraceabilityBomError('POLICY_NOT_FOUND', 'Policy was not found.', 404);
    if (row.status !== 'PENDING_APPROVAL' || Number(row.concurrency_version) !== input.expectedVersion)
      throw new TraceabilityBomError('POLICY_VERSION_CONFLICT', 'Policy changed or is not awaiting approval.', 409);
    if (Number(row.created_by) === actor.userId || Number(row.submitted_by) === actor.userId)
      throw new TraceabilityBomError('INDEPENDENT_APPROVAL_REQUIRED', 'A different authorized person must approve this policy.', 403);
    const nextStatus = input.decision === 'APPROVE' ? 'RELEASED' : input.decision === 'RETURN' ? 'RETURNED' : 'REJECTED';
    let supersedesPolicyId: string | null = null;
    if (nextStatus === 'RELEASED') {
      await client.query('SELECT pg_advisory_xact_lock($1,$2)', [8415, row.inventory_item_id]);
      const superseded = await client.query(
        `UPDATE inventory_item_traceability_policies SET status='SUPERSEDED',updated_at=now(),
          concurrency_version=concurrency_version+1
          WHERE inventory_item_id=$1 AND status='RELEASED' AND effective_to IS NULL RETURNING id`,
        [row.inventory_item_id]
      );
      supersedesPolicyId = superseded.rows[0]?.id || null;
    }
    const decided = await client.query(
      `UPDATE inventory_item_traceability_policies SET status=$2,approved_by=$3,
        approved_by_display_name=$4,approved_by_role=$5,approval_capacity=$6,
        signature_meaning=$7,approved_at=clock_timestamp(),decision_reason=$8,
        supersedes_policy_id=$9,updated_at=now(),concurrency_version=concurrency_version+1 WHERE id=$1 RETURNING *`,
      [input.policyId, nextStatus, actor.userId, actor.displayName, actor.role,
        clean(input.capacity), clean(input.signatureMeaning), clean(input.reason) || null, supersedesPolicyId]
    );
    await recordPolicyEvent(client, decided.rows[0], `POLICY_${nextStatus}`, actor,
      'PENDING_APPROVAL', nextStatus, input.signatureMeaning, input.reason);
    return decided.rows[0];
  });
}

async function releasedPolicy(client: PoolClient, inventoryItemId: number) {
  const result = await client.query(
    `SELECT * FROM inventory_item_traceability_policies
      WHERE inventory_item_id=$1 AND status='RELEASED'
        AND (effective_from IS NULL OR effective_from<=now())
        AND (effective_to IS NULL OR effective_to>now())
      ORDER BY revision_number DESC LIMIT 2`,
    [inventoryItemId]
  );
  if (result.rows.length !== 1)
    throw new TraceabilityBomError(
      result.rows.length ? 'POLICY_AMBIGUOUS' : 'POLICY_MISSING',
      result.rows.length ? 'Inventory Item has ambiguous released traceability policies.' : 'Inventory Item needs one released traceability policy.'
    );
  return result.rows[0];
}

async function assertNoCycle(client: PoolClient, parentId: number, childIds: number[], maxDepth = 30) {
  const result = await client.query(
    `WITH RECURSIVE descendants(item_id,path,depth,cycle) AS (
       SELECT child_id,ARRAY[$1,child_id],1,false FROM unnest($2::int[]) child_id
       UNION ALL
       SELECT bl.child_inventory_item_id,d.path||bl.child_inventory_item_id,d.depth+1,
              bl.child_inventory_item_id=ANY(d.path)
         FROM descendants d
         JOIN boms b ON b.parent_inventory_item_id=d.item_id AND b.is_active=true
         JOIN bom_revisions br ON br.bom_id=b.id AND br.lifecycle_status='RELEASED'
         JOIN bom_lines bl ON bl.revision_id=br.id AND bl.child_inventory_item_id IS NOT NULL
        WHERE NOT d.cycle AND d.depth<$3
     )
     SELECT bool_or(item_id=$1 OR cycle) cycle,COALESCE(max(depth),0) max_depth,
            bool_or(depth=$3) depth_limit FROM descendants`,
    [parentId, childIds, maxDepth]
  );
  const state = result.rows[0];
  if (state?.cycle) throw new TraceabilityBomError('BOM_CYCLE', 'Controlled BOM contains a circular relationship.');
  if (state?.depth_limit) throw new TraceabilityBomError('BOM_MAX_DEPTH', `Controlled BOM exceeds the safe depth of ${maxDepth}.`);
}

export async function createControlledBomDraft(input: { parentInventoryItemId: number; revisionCode: string; effectivity: unknown; lines: any[] }, actor: ControlledActor) {
  if (!clean(input.revisionCode)) throw new TraceabilityBomError('BOM_REVISION_REQUIRED', 'BOM revision is required.');
  if (!input.effectivity || typeof input.effectivity !== 'object' || Object.keys(input.effectivity as object).length === 0) throw new TraceabilityBomError('BOM_EFFECTIVITY_REQUIRED', 'BOM effectivity is required.');
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new TraceabilityBomError('BOM_LINES_REQUIRED', 'At least one child Inventory Item is required.');
  return inTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1,$2)', [8416, input.parentInventoryItemId]);
    const parentResult = await client.query(
      `SELECT id,ag_part_number,name,item_type,manufactured_category,manufacturing_level
         FROM inventory_items WHERE id=$1 AND (is_active=true OR is_active IS NULL) FOR SHARE`,
      [input.parentInventoryItemId]
    );
    const parent = parentResult.rows[0];
    if (!parent) throw new TraceabilityBomError('BOM_PARENT_NOT_FOUND', 'Parent Inventory Item was not found.', 404);
    if (parent.item_type !== 'MANUFACTURED') throw new TraceabilityBomError('BOM_PARENT_NOT_MANUFACTURED', 'Only a manufactured Inventory Item can own a controlled BOM.');
    const childIds = input.lines.map((line) => Number(line.childInventoryItemId));
    if (childIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
      throw new TraceabilityBomError('BOM_CHILD_ID_REQUIRED', 'Every controlled BOM line requires a real child Inventory Item ID.');
    if (new Set(childIds).size !== childIds.length)
      throw new TraceabilityBomError('BOM_DUPLICATE_CHILD', 'Duplicate child Inventory Items create ambiguous demand.');
    await assertNoCycle(client, parent.id, childIds);
    const childrenResult = await client.query(
      `SELECT id,ag_part_number,name,item_type,manufactured_category,manufacturing_level,
              COALESCE(usage_unit,purchase_unit,'') unit_of_measure
         FROM inventory_items WHERE id=ANY($1::int[]) AND (is_active=true OR is_active IS NULL)`,
      [childIds]
    );
    if (childrenResult.rows.length !== childIds.length)
      throw new TraceabilityBomError('BOM_CHILD_MISSING', 'One or more child Inventory Items are missing or inactive.');
    const byId = new Map(childrenResult.rows.map((row) => [Number(row.id), row]));
    const normalized: any[] = [];
    for (let index = 0; index < input.lines.length; index++) {
      const source = input.lines[index];
      const child = byId.get(Number(source.childInventoryItemId));
      const quantity = Number(source.quantityPer);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new TraceabilityBomError('BOM_QUANTITY_INVALID', `Line ${index + 1} requires a positive quantity.`);
      const unit = clean(source.unitOfMeasure || child.unit_of_measure);
      if (!unit) throw new TraceabilityBomError('BOM_UNIT_REQUIRED', `Line ${index + 1} requires a unit of measure.`);
      const policy = await releasedPolicy(client, child.id);
      const override = clean(source.overridePolicyType) as TraceabilityPolicyType | '';
      if (override && (!POLICY_TYPES.has(override) || !isStricterTraceabilityOverride(policy.policy_type, override)))
        throw new TraceabilityBomError('BOM_TRACEABILITY_WEAKENING', `Line ${index + 1} override must be strictly stronger than ${policy.policy_type}.`);
      if (override && (!clean(source.overrideReason) || !clean(source.overrideSignatureMeaning)))
        throw new TraceabilityBomError('BOM_OVERRIDE_APPROVAL_REQUIRED', `Line ${index + 1} override requires reason and approval evidence.`);
      normalized.push({ source, child, quantity, unit, policy, override: override || null, path: `${parent.id}/${child.id}` });
    }
    const existing = await client.query(`SELECT * FROM boms WHERE parent_inventory_item_id=$1 AND is_active=true FOR UPDATE`, [parent.id]);
    let bom = existing.rows[0];
    if (!bom) {
      bom = (await client.query(
        `INSERT INTO boms(parent_part_ag_number,code,description,is_active,parent_inventory_item_id,
          parent_part_number_snapshot,parent_name_snapshot,parent_revision_snapshot)
         VALUES($1,$2,$3,true,$4,$1,$3,$5) RETURNING *`,
        [parent.ag_part_number, `BOM-${parent.ag_part_number}`, parent.name, parent.id, clean(input.revisionCode)]
      )).rows[0];
    }
    const revision = (await client.query(
      `INSERT INTO bom_revisions(bom_id,rev_code,notes,is_released,lifecycle_status,effectivity,
        content_checksum,created_at,updated_at,concurrency_version)
       VALUES($1,$2,'',false,'DRAFT',$3::jsonb,$4,now(),now(),1) RETURNING *`,
      [bom.id, clean(input.revisionCode), JSON.stringify(input.effectivity), checksum({ parentId: parent.id, revision: input.revisionCode, lines: normalized.map((row) => ({ childId: row.child.id, quantity: row.quantity, unit: row.unit, policyId: row.policy.id, override: row.override })) })]
    )).rows[0];
    for (const row of normalized) {
      await client.query(
        `INSERT INTO bom_lines(revision_id,child_part_ag_number,qty_per,scrap_pct,reference,
          operation_seq,notes,child_inventory_item_id,child_part_number_snapshot,child_name_snapshot,
          child_revision_snapshot,unit_of_measure,make_buy_disposition,assembly_path_identity,
          inherited_policy_id,inherited_policy_revision,inherited_policy_type,
          traceability_override_policy_type,traceability_override_reason,
          traceability_override_effectivity,traceability_override_approved_by,
          traceability_override_approver_name,traceability_override_signature_meaning,
          traceability_override_approved_at)
         VALUES($1,$2,$3,'0','',$4,'',$5,$2,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20)`,
        [revision.id, row.child.ag_part_number, String(row.quantity), row.source.operationSequence || 10,
          row.child.id, row.child.name, clean(row.source.childRevision), row.unit,
          row.child.item_type === 'MANUFACTURED' ? 'MAKE' : 'BUY', row.path,
          row.policy.id, row.policy.revision_number, row.policy.policy_type, row.override,
          clean(row.source.overrideReason) || null, JSON.stringify(row.source.overrideEffectivity || {}),
          row.override ? actor.userId : null, row.override ? actor.displayName : null,
          clean(row.source.overrideSignatureMeaning) || null,
          row.override ? (row.source.overrideApprovedAt || new Date()) : null]
      );
    }
    await client.query(
      `INSERT INTO controlled_bom_events(bom_id,bom_revision_id,event_type,to_status,
        actor_user_id,actor_display_name,actor_role,evidence)
       VALUES($1,$2,'BOM_DRAFT_CREATED','DRAFT',$3,$4,$5,$6::jsonb)`,
      [bom.id, revision.id, actor.userId, actor.displayName, actor.role,
        JSON.stringify({ contentChecksum: revision.content_checksum, lineCount: normalized.length })]
    );
    return { bom, revision, lines: normalized.length };
  });
}

export async function submitControlledBomRevision(revisionId: string, expectedVersion: number, actor: ControlledActor) {
  return inTransaction(async (client) => {
    const result = await client.query(
      `UPDATE bom_revisions SET lifecycle_status='PENDING_APPROVAL',submitted_by=$2,
        submitted_by_display_name=$3,submitted_at=clock_timestamp(),updated_at=now(),
        concurrency_version=concurrency_version+1
       WHERE id=$1 AND lifecycle_status IN ('DRAFT','RETURNED') AND concurrency_version=$4 RETURNING *`,
      [revisionId, actor.userId, actor.displayName, expectedVersion]
    );
    const row = result.rows[0];
    if (!row) throw new TraceabilityBomError('BOM_VERSION_CONFLICT', 'BOM changed or is not submit-ready.', 409);
    await client.query(
      `INSERT INTO controlled_bom_events(bom_id,bom_revision_id,event_type,from_status,to_status,
        actor_user_id,actor_display_name,actor_role,evidence)
       VALUES($1,$2,'BOM_SUBMITTED','DRAFT','PENDING_APPROVAL',$3,$4,$5,$6::jsonb)`,
      [row.bom_id, row.id, actor.userId, actor.displayName, actor.role, JSON.stringify({ contentChecksum: row.content_checksum })]
    );
    return row;
  });
}

export async function releaseControlledBomRevision(input: { revisionId: string; expectedVersion: number; capacity: string; signatureMeaning: string }, actor: ControlledActor) {
  if (!clean(input.signatureMeaning)) throw new TraceabilityBomError('SIGNATURE_MEANING_REQUIRED', 'Signature meaning is required.');
  return inTransaction(async (client) => {
    const locked = await client.query(`SELECT * FROM bom_revisions WHERE id=$1 FOR UPDATE`, [input.revisionId]);
    const row = locked.rows[0];
    if (!row) throw new TraceabilityBomError('BOM_REVISION_NOT_FOUND', 'BOM revision was not found.', 404);
    if (row.lifecycle_status !== 'PENDING_APPROVAL' || Number(row.concurrency_version) !== input.expectedVersion)
      throw new TraceabilityBomError('BOM_VERSION_CONFLICT', 'BOM changed or is not awaiting approval.', 409);
    if (Number(row.submitted_by) === actor.userId)
      throw new TraceabilityBomError('INDEPENDENT_APPROVAL_REQUIRED', 'A different authorized person must release this BOM.', 403);
    const invalid = await client.query(
      `SELECT bl.id,
              CASE
                WHEN bl.child_inventory_item_id IS NULL THEN 'CHILD_ID_MISSING'
                WHEN ii.id IS NULL THEN 'CHILD_NOT_FOUND'
                WHEN bl.child_part_number_snapshot IS DISTINCT FROM ii.ag_part_number THEN 'PART_SNAPSHOT_MISMATCH'
                WHEN bl.child_name_snapshot IS DISTINCT FROM ii.name THEN 'NAME_SNAPSHOT_MISMATCH'
                WHEN bl.qty_per<=0 OR COALESCE(btrim(bl.unit_of_measure),'')='' THEN 'QUANTITY_OR_UNIT_INVALID'
                WHEN p.id IS NULL OR p.status<>'RELEASED' THEN 'POLICY_UNRELEASED'
                ELSE NULL
              END blocker
         FROM bom_lines bl
         LEFT JOIN inventory_items ii ON ii.id=bl.child_inventory_item_id
         LEFT JOIN inventory_item_traceability_policies p ON p.id=bl.inherited_policy_id
        WHERE bl.revision_id=$1`,
      [row.id]
    );
    const blockers = invalid.rows.filter((line) => line.blocker);
    if (invalid.rows.length === 0) blockers.push({ blocker: 'BOM_LINES_REQUIRED' });
    if (!row.effectivity || typeof row.effectivity !== 'object' || Object.keys(row.effectivity).length === 0) blockers.push({ blocker: 'BOM_EFFECTIVITY_REQUIRED' });
    if (blockers.length) throw new TraceabilityBomError('BOM_RELEASE_BLOCKED', 'Controlled BOM evidence changed or is incomplete.', 409, blockers);
    const parent = await client.query(
      `SELECT b.parent_inventory_item_id,b.parent_part_number_snapshot,b.parent_name_snapshot,
              ii.ag_part_number,ii.name
         FROM boms b LEFT JOIN inventory_items ii ON ii.id=b.parent_inventory_item_id WHERE b.id=$1`,
      [row.bom_id]
    );
    const parentRow = parent.rows[0];
    if (!parentRow?.parent_inventory_item_id || parentRow.parent_part_number_snapshot !== parentRow.ag_part_number || parentRow.parent_name_snapshot !== parentRow.name)
      throw new TraceabilityBomError('BOM_PARENT_SNAPSHOT_MISMATCH', 'Parent Inventory Item identity no longer agrees with the controlled snapshot.', 409);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [row.bom_id]);
    const superseded = await client.query(
      `UPDATE bom_revisions SET lifecycle_status='SUPERSEDED',is_released=false,updated_at=now(),
        concurrency_version=concurrency_version+1
       WHERE bom_id=$1 AND lifecycle_status='RELEASED' RETURNING id`,
      [row.bom_id]
    );
    const released = await client.query(
      `UPDATE bom_revisions SET lifecycle_status='RELEASED',is_released=true,approved_by=$2,
        approved_by_display_name=$3,approved_by_role=$4,approval_capacity=$5,
        signature_meaning=$6,approved_at=clock_timestamp(),supersedes_revision_id=$7,updated_at=now(),
        concurrency_version=concurrency_version+1 WHERE id=$1 RETURNING *`,
      [row.id, actor.userId, actor.displayName, actor.role, clean(input.capacity), clean(input.signatureMeaning), superseded.rows[0]?.id || null]
    );
    await client.query(
      `INSERT INTO controlled_bom_events(bom_id,bom_revision_id,event_type,from_status,to_status,
        actor_user_id,actor_display_name,actor_role,signature_meaning,evidence)
       VALUES($1,$2,'BOM_RELEASED','PENDING_APPROVAL','RELEASED',$3,$4,$5,$6,$7::jsonb)`,
      [row.bom_id, row.id, actor.userId, actor.displayName, actor.role, clean(input.signatureMeaning),
        JSON.stringify({ contentChecksum: row.content_checksum, approvalCapacity: clean(input.capacity) })]
    );
    return released.rows[0];
  });
}

export async function decideControlledBomRevision(input: { revisionId: string; expectedVersion: number; decision: 'RETURN' | 'REJECT'; capacity: string; signatureMeaning: string; reason?: string }, actor: ControlledActor) {
  if (!clean(input.signatureMeaning)) throw new TraceabilityBomError('SIGNATURE_MEANING_REQUIRED', 'Signature meaning is required.');
  if (!clean(input.reason)) throw new TraceabilityBomError('DECISION_REASON_REQUIRED', 'A return or rejection reason is required.');
  return inTransaction(async (client) => {
    const nextStatus = input.decision === 'RETURN' ? 'RETURNED' : 'REJECTED';
    const result = await client.query(
      `UPDATE bom_revisions SET lifecycle_status=$2,approved_by=$3,
        approved_by_display_name=$4,approved_by_role=$5,approval_capacity=$6,
        signature_meaning=$7,approved_at=clock_timestamp(),decision_reason=$8,
        updated_at=now(),concurrency_version=concurrency_version+1
       WHERE id=$1 AND lifecycle_status='PENDING_APPROVAL' AND concurrency_version=$9
         AND submitted_by<>$3 RETURNING *`,
      [input.revisionId, nextStatus, actor.userId, actor.displayName, actor.role,
        clean(input.capacity), clean(input.signatureMeaning), clean(input.reason), input.expectedVersion]
    );
    const row = result.rows[0];
    if (!row) throw new TraceabilityBomError('BOM_VERSION_CONFLICT', 'BOM changed, is not awaiting approval, or requires an independent decision maker.', 409);
    await client.query(
      `INSERT INTO controlled_bom_events(bom_id,bom_revision_id,event_type,from_status,to_status,
        actor_user_id,actor_display_name,actor_role,signature_meaning,reason,evidence)
       VALUES($1,$2,$3,'PENDING_APPROVAL',$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [row.bom_id, row.id, `BOM_${nextStatus}`, nextStatus, actor.userId, actor.displayName,
        actor.role, clean(input.signatureMeaning), clean(input.reason), JSON.stringify({ approvalCapacity: clean(input.capacity) })]
    );
    return row;
  });
}

export async function getControlledBomStatus(parentInventoryItemId: number) {
  const result = await pool.query(
    `SELECT b.id bom_id,b.parent_inventory_item_id,br.id revision_id,br.rev_code,
            br.lifecycle_status,br.effectivity,br.updated_at,
            (SELECT count(*)::int FROM bom_lines bl WHERE bl.revision_id=br.id) line_count
       FROM boms b LEFT JOIN LATERAL (
         SELECT * FROM bom_revisions WHERE bom_id=b.id AND lifecycle_status IS NOT NULL
         ORDER BY created_at DESC LIMIT 1
       ) br ON true WHERE b.parent_inventory_item_id=$1 AND b.is_active=true`,
    [parentInventoryItemId]
  );
  return result.rows[0] || null;
}

export async function previewControlledBom(revisionId: string, maxDepth = 30) {
  const client = await pool.connect();
  try {
    const rootResult = await client.query(
      `SELECT br.id revision_id,br.rev_code,br.lifecycle_status,b.id bom_id,
              b.parent_inventory_item_id,ii.ag_part_number,ii.name
         FROM bom_revisions br JOIN boms b ON b.id=br.bom_id
         JOIN inventory_items ii ON ii.id=b.parent_inventory_item_id WHERE br.id=$1`,
      [revisionId]
    );
    const root = rootResult.rows[0];
    if (!root) throw new TraceabilityBomError('BOM_REVISION_NOT_FOUND', 'Controlled BOM revision was not found.', 404);
    const result = await client.query(
      `WITH RECURSIVE tree AS (
        SELECT bl.id line_id,bl.child_inventory_item_id item_id,bl.child_part_number_snapshot part_number,
               bl.child_name_snapshot part_name,bl.qty_per::numeric quantity,bl.unit_of_measure,
               bl.make_buy_disposition,bl.inherited_policy_type,bl.inherited_policy_revision,
               bl.traceability_override_policy_type,ARRAY[$2,bl.child_inventory_item_id] path,1 depth,
               false cycle,br.id bom_revision_id,br.rev_code bom_revision,
               EXISTS(SELECT 1 FROM boms cb JOIN bom_revisions cbr ON cbr.bom_id=cb.id
                 WHERE cb.parent_inventory_item_id=bl.child_inventory_item_id AND cb.is_active=true
                   AND cbr.lifecycle_status='RELEASED') has_released_child_bom,
               EXISTS(SELECT 1 FROM part_routings pr WHERE pr.part_number=bl.child_part_number_snapshot
                 AND pr.is_active=true) has_active_routing
          FROM bom_lines bl JOIN bom_revisions br ON br.id=bl.revision_id WHERE bl.revision_id=$1
        UNION ALL
        SELECT bl.id,bl.child_inventory_item_id,bl.child_part_number_snapshot,bl.child_name_snapshot,
               t.quantity*bl.qty_per::numeric,bl.unit_of_measure,bl.make_buy_disposition,
               bl.inherited_policy_type,bl.inherited_policy_revision,bl.traceability_override_policy_type,
               t.path||bl.child_inventory_item_id,t.depth+1,bl.child_inventory_item_id=ANY(t.path),
               child_br.id,child_br.rev_code,
               EXISTS(SELECT 1 FROM boms cb JOIN bom_revisions cbr ON cbr.bom_id=cb.id
                 WHERE cb.parent_inventory_item_id=bl.child_inventory_item_id AND cb.is_active=true
                   AND cbr.lifecycle_status='RELEASED'),
               EXISTS(SELECT 1 FROM part_routings pr WHERE pr.part_number=bl.child_part_number_snapshot
                 AND pr.is_active=true)
          FROM tree t JOIN boms child_b ON child_b.parent_inventory_item_id=t.item_id AND child_b.is_active=true
          JOIN bom_revisions child_br ON child_br.bom_id=child_b.id AND child_br.lifecycle_status='RELEASED'
          JOIN bom_lines bl ON bl.revision_id=child_br.id
         WHERE NOT t.cycle AND t.depth<$3
      ) SELECT * FROM tree ORDER BY path`,
      [revisionId, root.parent_inventory_item_id, maxDepth]
    );
    const blockers: Array<{ code: string; message: string; correctiveAction: string }> = [];
    if (result.rows.some((row) => row.cycle)) blockers.push({ code: 'BOM_CYCLE', message: 'Circular BOM relationship detected.', correctiveAction: 'Remove the child relationship that points back to an ancestor and create a new draft revision.' });
    if (result.rows.some((row) => Number(row.depth) >= maxDepth)) blockers.push({ code: 'BOM_MAX_DEPTH', message: `Maximum safe depth ${maxDepth} reached.`, correctiveAction: 'Review the assembly structure and reduce or explicitly resolve the excessive nesting before submission.' });
    if (result.rows.some((row) => !row.item_id)) blockers.push({ code: 'BOM_CHILD_ID_REQUIRED', message: 'A child Inventory Item identity is missing.', correctiveAction: 'Select an existing Inventory Item for every child line.' });
    if (result.rows.some((row) => !row.inherited_policy_type)) blockers.push({ code: 'POLICY_MISSING', message: 'A child released traceability policy is missing.', correctiveAction: 'Release one applicable traceability-policy revision for the child Inventory Item.' });
    if (result.rows.some((row) => row.make_buy_disposition === 'MAKE' && !row.has_released_child_bom)) blockers.push({ code: 'CHILD_BOM_MISSING', message: 'A manufactured child has no released controlled BOM.', correctiveAction: 'Create, complete, approve, and release the manufactured child BOM, or correct its Make/Buy decision.' });
    if (result.rows.some((row) => row.make_buy_disposition === 'MAKE' && !row.has_active_routing)) blockers.push({ code: 'CHILD_ROUTING_MISSING', message: 'A manufactured child has no active routing.', correctiveAction: 'Create or activate the applicable part routing for the manufactured child.' });
    return { root, nodes: result.rows, blockers, readOnly: true, downstreamWrites: [] };
  } finally {
    client.release();
  }
}
