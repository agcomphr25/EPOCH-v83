import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';

import { pgPool } from '../../db';
import { DESIGN_CONTROL_FORM_RENDERER_VERSION } from '../../../shared/designControlFormCatalog';

export type EcnActor = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
};

export class EcnError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const transitions: Record<string, string[]> = {
  draft: ['implementation_planned', 'cancelled', 'void'],
  implementation_planned: ['submitted', 'returned_for_revision', 'cancelled'],
  returned_for_revision: [
    'implementation_planned',
    'submitted',
    'cancelled',
    'void',
  ],
  submitted: ['approved', 'returned_for_revision', 'rejected', 'cancelled'],
  approved: ['in_implementation', 'returned_for_revision', 'cancelled'],
  in_implementation: ['verification_validation', 'cancelled'],
  verification_validation: ['release_ready', 'in_implementation', 'cancelled'],
  release_ready: ['implemented', 'verification_validation', 'cancelled'],
  implemented: ['closed'],
};
const terminal = new Set(['closed', 'rejected', 'cancelled', 'void']);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const sha256 = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : stable(value))
    .digest('hex');
const actorSnapshot = (actor: EcnActor) => ({
  userId: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
  capabilities: actor.capabilities,
});
const one = async (client: PoolClient, text: string, values: unknown[]) =>
  (await client.query(text, values)).rows[0] ?? null;

async function tx<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
const requireCapability = (actor: EcnActor, capability: string) => {
  if (
    !actor.capabilities.includes(capability) &&
    !actor.capabilities.includes('*')
  ) {
    throw new EcnError(
      'ECN_FORBIDDEN',
      `Capability ${capability} is required`,
      403
    );
  }
};

async function audit(
  client: PoolClient,
  ecn: any,
  eventType: string,
  actor: EcnActor | null,
  reason: string | null,
  beforeValues: unknown,
  afterValues: unknown
) {
  await client.query(
    `INSERT INTO engineering_change_notice_events (
      ecn_id,event_type,actor_user_id,actor_snapshot,ecr_id_snapshot,
      project_id_snapshot,design_control_record_id_snapshot,ecn_revision_id,
      content_checksum,reason,before_values,after_values
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    [
      ecn.id,
      eventType,
      actor?.id ?? null,
      actor ? JSON.stringify(actorSnapshot(actor)) : null,
      ecn.source_ecr_id,
      ecn.rd_project_id,
      ecn.design_control_record_id,
      ecn.current_content_revision_id,
      ecn.content_checksum ?? null,
      reason,
      beforeValues == null ? null : JSON.stringify(beforeValues),
      afterValues == null ? null : JSON.stringify(afterValues),
    ]
  );
}

async function approvedEcr(client: PoolClient, ecrId: string) {
  const ecr = await one(
    client,
    `SELECT e.*,r.content_checksum,r.id AS approved_revision_id,r.canonical_content
       FROM engineering_change_requests e
       JOIN engineering_change_request_revisions r ON r.id=e.current_content_revision_id
      WHERE e.id=$1 AND e.lifecycle_status='APPROVED'`,
    [ecrId]
  );
  if (!ecr) {
    throw new EcnError(
      'ECN_APPROVED_ECR_REQUIRED',
      'A new authoritative ECN requires an approved ECR and its immutable approved revision.',
      409
    );
  }
  return ecr;
}

async function releasedEcnTemplate(client: PoolClient) {
  const template = await one(
    client,
    `SELECT t.id AS registration_id,r.id AS revision_id,
            r.document_version_history_id,r.document_number_snapshot,
            r.document_revision_snapshot,r.definition_checksum
       FROM design_control_form_templates t
       JOIN design_control_form_template_revisions r
         ON r.design_control_form_template_id=t.id
      WHERE t.form_category='ENGINEERING_CHANGE_NOTICE'
        AND r.lifecycle_status='RELEASED'
        AND t.active_template_revision_id=r.id
      LIMIT 1`,
    []
  );
  if (!template) {
    throw new EcnError(
      'ECN_TEMPLATE_NOT_RELEASED',
      'ECN submission is blocked until Document Control releases the controlled Engineering Change Notice template.',
      409
    );
  }
  return template;
}

const validateEffectivity = (
  method: string,
  value: Record<string, unknown>
) => {
  const required: Record<string, string[]> = {
    effective_date: ['date'],
    first_serial_number: ['serialNumber'],
    lot_batch: ['lotBatch'],
    unit_range: ['startUnit', 'endUnit'],
    next_production_order: ['rule'],
    after_existing_inventory_depletion: ['inventoryScope'],
    retrofit_population: ['population'],
    other: ['rule'],
  };
  const supported = [
    'immediate',
    'effective_date',
    'first_serial_number',
    'lot_batch',
    'unit_range',
    'next_production_order',
    'after_existing_inventory_depletion',
    'retrofit_population',
    'other',
  ];
  if (!supported.includes(method)) {
    throw new EcnError(
      'ECN_EFFECTIVITY_INVALID',
      'Unsupported effectivity method'
    );
  }
  const missing = (required[method] ?? []).filter((key) => !value[key]);
  if (missing.length) {
    throw new EcnError(
      'ECN_EFFECTIVITY_VALUES_REQUIRED',
      'Effectivity values are incomplete',
      422,
      { missing }
    );
  }
};

const validateInventoryDisposition = (value: Record<string, any>) => {
  if (!value || !Object.keys(value).length) return;
  const supported = [
    'USE_AS_IS',
    'REWORK',
    'SCRAP',
    'RETURN_TO_SUPPLIER',
    'SEGREGATE',
    'RETROFIT',
    'PHASE_IN',
    'CONSUME_EXISTING_STOCK',
    'CUSTOMER_AUTHORIZED_DEVIATION',
    'OTHER',
  ];
  if (!supported.includes(value.disposition)) {
    throw new EcnError(
      'ECN_INVENTORY_DISPOSITION_INVALID',
      'Unsupported inventory/WIP disposition'
    );
  }
  const missing = [
    'affectedPopulation',
    'locationScope',
    'responsibleOwner',
    'requiredApproval',
    'completionStatus',
  ].filter((key) => !value[key]);
  if (missing.length) {
    throw new EcnError(
      'ECN_INVENTORY_DISPOSITION_INCOMPLETE',
      'Inventory/WIP disposition requires population, scope, owner, approval, and completion status.',
      422,
      { missing }
    );
  }
};

export function deriveEcnApprovalFunctions(content: Record<string, any>) {
  const impacts = content.impacts ?? {};
  const required = new Set([
    'ENGINEERING',
    'QUALITY',
    'MANUFACTURING_OPERATIONS',
    'PROGRAM_MANAGEMENT',
  ]);
  if (impacts.supplier || impacts.inventoryWip) required.add('SUPPLY_CHAIN');
  if (impacts.cost) required.add('FINANCE');
  if (impacts.safety) required.add('SAFETY');
  if (impacts.regulatoryContract) required.add('REGULATORY_CONTRACTS');
  if (impacts.customerApprovalRequired) required.add('CUSTOMER_APPROVAL');
  return Array.from(required);
}

export async function listEcns(projectId: string) {
  return (
    await pgPool.query(
      `SELECT e.*,
        (SELECT count(*)::int FROM engineering_change_notice_affected_items i WHERE i.ecn_id=e.id) AS affected_item_count,
        (SELECT count(*)::int FROM engineering_change_step_impacts s WHERE s.ecn_id=e.id) AS step_impact_count,
        (SELECT count(*)::int FROM engineering_change_implementation_actions a WHERE a.ecn_id=e.id) AS action_count,
        (SELECT count(*)::int FROM engineering_change_implementation_actions a WHERE a.ecn_id=e.id AND a.status='ACCEPTED') AS accepted_action_count,
        (SELECT count(*)::int FROM engineering_change_verification_records v WHERE v.ecn_id=e.id AND v.result_status='PASS') AS passed_vv_count,
        (SELECT count(*)::int FROM engineering_change_notice_approvals p WHERE p.ecn_id=e.id AND p.status='VALID' AND p.decision='APPROVED') AS approval_count
       FROM engineering_change_orders e
       WHERE e.rd_project_id=$1 AND e.ecn_number IS NOT NULL
       ORDER BY e.created_at DESC`,
      [projectId]
    )
  ).rows;
}

export async function getEcrEcnImplementationStatus(ecrId: string) {
  const rows = (
    await pgPool.query(
      `SELECT id,ecn_number,status,implementation_scope
         FROM engineering_change_orders
        WHERE source_ecr_id=$1 AND ecn_number IS NOT NULL
        ORDER BY created_at`,
      [ecrId]
    )
  ).rows;
  return {
    ecrId,
    ecns: rows,
    fullyImplemented:
      rows.length > 0 &&
      rows.every((row) => ['closed', 'cancelled', 'void'].includes(row.status)),
    pendingEcns: rows.filter(
      (row) => !['closed', 'cancelled', 'void'].includes(row.status)
    ),
  };
}

export async function getEcn(ecnId: string) {
  const [ecn, affected, steps, actions, vv, approvals] = await Promise.all([
    pgPool.query(
      `SELECT e.*,r.content_checksum,r.revision_number,r.created_at AS revision_created_at,
              q.ecr_number
         FROM engineering_change_orders e
         LEFT JOIN engineering_change_notice_revisions r ON r.id=e.current_content_revision_id
         LEFT JOIN engineering_change_requests q ON q.id=e.source_ecr_id
        WHERE e.id=$1`,
      [ecnId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_notice_affected_items WHERE ecn_id=$1 ORDER BY created_at`,
      [ecnId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_step_impacts WHERE ecn_id=$1 ORDER BY step_key`,
      [ecnId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_implementation_actions WHERE ecn_id=$1 ORDER BY action_number`,
      [ecnId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_verification_records WHERE ecn_id=$1 ORDER BY created_at`,
      [ecnId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_notice_approvals WHERE ecn_id=$1 ORDER BY decided_at`,
      [ecnId]
    ),
  ]);
  if (!ecn.rows[0]) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
  return {
    ...ecn.rows[0],
    affectedItems: affected.rows,
    stepImpacts: steps.rows,
    actions: actions.rows,
    verificationValidation: vv.rows,
    approvals: approvals.rows,
  };
}

export async function createEcn(
  ecrId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.create');
  return tx(async (client) => {
    const ecr = await approvedEcr(client, ecrId);
    const scope = String(input.implementationScope ?? '').trim();
    if (!scope)
      throw new EcnError(
        'ECN_SCOPE_REQUIRED',
        'A documented implementation scope is required'
      );
    if (
      Array.isArray(input.affectedEcrItemIds) &&
      input.affectedEcrItemIds.length
    ) {
      const duplicate = await one(
        client,
        `SELECT i.source_ecr_affected_item_id
           FROM engineering_change_notice_affected_items i
           JOIN engineering_change_orders e ON e.id=i.ecn_id
          WHERE e.source_ecr_id=$1 AND e.status NOT IN ('cancelled','void','rejected','closed')
            AND i.source_ecr_affected_item_id=ANY($2::uuid[]) LIMIT 1`,
        [ecrId, input.affectedEcrItemIds]
      );
      if (duplicate) {
        throw new EcnError(
          'ECN_SPLIT_SCOPE_DUPLICATE',
          'An affected ECR item cannot be ambiguously assigned to multiple active ECNs.',
          409
        );
      }
    }
    const sequence = await one(
      client,
      `SELECT nextval('engineering_change_notice_number_seq')::bigint AS value`,
      []
    );
    const ecnNumber = `ECN-${new Date().getUTCFullYear()}-${String(sequence.value).padStart(4, '0')}`;
    const result = await client.query(
      `INSERT INTO engineering_change_orders (
        eco_number,ecn_number,title,reason,change_description,status,
        requested_by,source_ecr_id,source_ecr_revision_id,source_ecr_checksum,
        rd_project_id,design_control_record_id,source_engineering_release_id,
        source_engineering_release_baseline_id,implementation_scope,priority,
        change_classification,canonical_content,effectivity_method,effectivity_snapshot,
        inventory_wip_disposition,legacy_provenance,created_by_user_id,created_by_snapshot
      ) VALUES ($1,$1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16::jsonb,$17,$18::jsonb,$19::jsonb,'NATIVE_AUTHENTICATED',$20,$21::jsonb)
      RETURNING *`,
      [
        ecnNumber,
        input.title,
        input.reason ?? ecr.title,
        input.technicalDescription ?? input.changeDescription ?? '',
        actor.username,
        ecr.id,
        ecr.approved_revision_id,
        ecr.content_checksum,
        ecr.rd_project_id,
        ecr.design_control_record_id,
        ecr.source_engineering_release_id,
        ecr.source_engineering_release_baseline_id,
        scope,
        input.priority ?? ecr.priority,
        input.changeClassification ?? ecr.change_classification,
        JSON.stringify({
          implementationScope: scope,
          technicalDescription: input.technicalDescription ?? '',
          reasonJustificationSnapshot: ecr.content,
          impacts: input.impacts ?? ecr.content?.impacts ?? {},
          documentUpdates: input.documentUpdates ?? [],
          toolingSupplierActions: input.toolingSupplierActions ?? [],
          softwareFirmwareEffects: input.softwareFirmwareEffects ?? '',
          requiredVerification: input.requiredVerification ?? [],
          requiredValidation: input.requiredValidation ?? [],
        }),
        input.effectivityMethod ?? null,
        JSON.stringify(input.effectivity ?? {}),
        JSON.stringify(input.inventoryWipDisposition ?? {}),
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    const ecn = result.rows[0];
    for (const ecrItemId of input.affectedEcrItemIds ?? []) {
      const source = await one(
        client,
        `SELECT * FROM engineering_change_request_affected_items
          WHERE id=$1 AND ecr_id=$2`,
        [ecrItemId, ecrId]
      );
      if (!source)
        throw new EcnError(
          'ECN_ECR_ITEM_MISMATCH',
          'Affected item does not belong to the source ECR',
          422
        );
      await client.query(
        `INSERT INTO engineering_change_notice_affected_items (
          ecn_id,source_ecr_affected_item_id,source_type,stable_source_reference,
          part_document_number_snapshot,current_revision_snapshot,change_description,
          verification_required,evidence_references,created_by_user_id,created_by_snapshot
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)`,
        [
          ecn.id,
          source.id,
          source.source_type,
          source.source_id ?? source.stable_external_reference,
          source.part_document_number_snapshot,
          source.revision_snapshot,
          source.proposed_change,
          Boolean(source.impact_category),
          JSON.stringify(source.evidence_links ?? []),
          actor.id,
          JSON.stringify(actorSnapshot(actor)),
        ]
      );
    }
    await audit(
      client,
      ecn,
      'ECN_CREATED_FROM_APPROVED_ECR',
      actor,
      input.reason ?? null,
      null,
      ecn
    );
    return ecn;
  });
}

export async function updateEcn(
  ecnId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.edit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (
      !['draft', 'implementation_planned', 'returned_for_revision'].includes(
        ecn.status
      )
    ) {
      throw new EcnError(
        'ECN_CONTENT_IMMUTABLE',
        'Only draft, planned, or returned ECNs may be edited',
        409
      );
    }
    const method = input.effectivityMethod ?? ecn.effectivity_method;
    const effectivity = input.effectivity ?? ecn.effectivity_snapshot ?? {};
    if (method) validateEffectivity(method, effectivity);
    const inventoryDisposition =
      input.inventoryWipDisposition ?? ecn.inventory_wip_disposition ?? {};
    validateInventoryDisposition(inventoryDisposition);
    const content = {
      ...(ecn.canonical_content ?? {}),
      ...(input.content ?? {}),
    };
    const updated = await one(
      client,
      `UPDATE engineering_change_orders SET
        title=COALESCE($2,title),implementation_scope=COALESCE($3,implementation_scope),
        canonical_content=$4::jsonb,effectivity_method=$5,effectivity_snapshot=$6::jsonb,
        inventory_wip_disposition=COALESCE($7::jsonb,inventory_wip_disposition),
        updated_at=now() WHERE id=$1 RETURNING *`,
      [
        ecnId,
        input.title ?? null,
        input.implementationScope ?? null,
        JSON.stringify(content),
        method,
        JSON.stringify(effectivity),
        input.inventoryWipDisposition
          ? JSON.stringify(inventoryDisposition)
          : null,
      ]
    );
    await audit(
      client,
      updated,
      'ECN_PLAN_EDITED',
      actor,
      input.reason ?? null,
      ecn,
      updated
    );
    return updated;
  });
}

export async function addEcnAffectedItem(
  ecnId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.edit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (
      !['draft', 'implementation_planned', 'returned_for_revision'].includes(
        ecn.status
      )
    ) {
      throw new EcnError(
        'ECN_AFFECTED_ITEMS_IMMUTABLE',
        'Affected items are immutable after submission',
        409
      );
    }
    const item = await one(
      client,
      `INSERT INTO engineering_change_notice_affected_items (
        ecn_id,source_ecr_affected_item_id,source_type,stable_source_reference,
        part_document_number_snapshot,current_revision_snapshot,proposed_revision,
        change_description,responsible_owner_user_id,responsible_owner_role,
        verification_required,effectivity_snapshot,evidence_references,
        created_by_user_id,created_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15::jsonb)
      RETURNING *`,
      [
        ecnId,
        input.sourceEcrAffectedItemId ?? null,
        input.sourceType,
        input.stableSourceReference,
        input.partDocumentNumberSnapshot ?? null,
        input.currentRevisionSnapshot ?? null,
        input.proposedRevision ?? null,
        input.changeDescription,
        input.responsibleOwnerUserId ?? null,
        input.responsibleOwnerRole ?? null,
        Boolean(input.verificationRequired),
        JSON.stringify(input.effectivity ?? {}),
        JSON.stringify(input.evidenceReferences ?? []),
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    await audit(
      client,
      ecn,
      'ECN_AFFECTED_ITEM_ADDED',
      actor,
      input.reason ?? null,
      null,
      item
    );
    return item;
  });
}

export async function addStepImpact(
  ecnId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.edit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (!/^(?:[1-9]|1[0-2])$/.test(String(input.stepKey))) {
      throw new EcnError(
        'ECN_STEP_KEY_INVALID',
        'Only targeted Design Control steps 1–12 may be impacted'
      );
    }
    const impact = await one(
      client,
      `INSERT INTO engineering_change_step_impacts (
        ecn_id,step_key,impact_reason,reopen_required,required_new_form_revision,
        required_approvals,verification_required,validation_required,
        created_by_user_id,created_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
      ON CONFLICT (ecn_id,step_key) DO UPDATE SET
        impact_reason=EXCLUDED.impact_reason,reopen_required=EXCLUDED.reopen_required,
        required_new_form_revision=EXCLUDED.required_new_form_revision,
        required_approvals=EXCLUDED.required_approvals,
        verification_required=EXCLUDED.verification_required,
        validation_required=EXCLUDED.validation_required,updated_at=now()
      RETURNING *`,
      [
        ecnId,
        String(input.stepKey),
        input.impactReason,
        Boolean(input.reopenRequired),
        Boolean(input.requiredNewFormRevision),
        JSON.stringify(input.requiredApprovals ?? []),
        Boolean(input.verificationRequired),
        Boolean(input.validationRequired),
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    await audit(
      client,
      ecn,
      'ECN_STEP_IMPACT_PLANNED',
      actor,
      input.reason ?? null,
      null,
      impact
    );
    return impact;
  });
}

export async function authorizeTargetedStepReopen(
  ecnId: string,
  stepKey: string,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.implement');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn || !['approved', 'in_implementation'].includes(ecn.status)) {
      throw new EcnError(
        'ECN_REOPEN_NOT_AUTHORIZED',
        'Approved ECN authorization is required',
        409
      );
    }
    const impact = await one(
      client,
      `SELECT * FROM engineering_change_step_impacts
        WHERE ecn_id=$1 AND step_key=$2 AND reopen_required=true FOR UPDATE`,
      [ecnId, stepKey]
    );
    if (!impact)
      throw new EcnError(
        'ECN_TARGETED_STEP_NOT_PLANNED',
        'This specific step is not authorized for reopening',
        409
      );
    const generationId = `ecn:${ecn.ecn_number}:step:${stepKey}:generation:${Date.now()}`;
    await client.query(
      `UPDATE engineering_change_step_impacts SET reopened_step_generation_id=$3,
        completion_status='REOPEN_AUTHORIZED',updated_at=now()
       WHERE ecn_id=$1 AND step_key=$2`,
      [ecnId, stepKey, generationId]
    );
    await audit(
      client,
      ecn,
      'ECN_TARGETED_STEP_REOPEN_AUTHORIZED',
      actor,
      'Preserve prior approved generation; create new generation through Design Control adapter',
      impact,
      { generationId }
    );
    return {
      generationId,
      priorGenerationPreserved: true,
      approvalsInvalidatedForStepOnly: true,
      sourceBaselineMutated: false,
      adapterExecutionRequired: true,
    };
  });
}

export async function addImplementationAction(
  ecnId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.edit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    const count = await one(
      client,
      `SELECT count(*)::int AS value FROM engineering_change_implementation_actions WHERE ecn_id=$1`,
      [ecnId]
    );
    const action = await one(
      client,
      `INSERT INTO engineering_change_implementation_actions (
        ecn_id,action_number,affected_item_id,description,responsible_user_id,
        responsible_role,due_date,comments
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        ecnId,
        Number(count.value) + 1,
        input.affectedItemId ?? null,
        input.description,
        input.responsibleUserId ?? null,
        input.responsibleRole ?? null,
        input.dueDate ?? null,
        input.comments ?? null,
      ]
    );
    await audit(
      client,
      ecn,
      'ECN_ACTION_ASSIGNED',
      actor,
      input.reason ?? null,
      null,
      action
    );
    return action;
  });
}

export async function updateImplementationAction(
  ecnId: string,
  actionId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.implement');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    const action = await one(
      client,
      `SELECT * FROM engineering_change_implementation_actions WHERE id=$1 AND ecn_id=$2 FOR UPDATE`,
      [actionId, ecnId]
    );
    if (!ecn || !action)
      throw new EcnError('ECN_ACTION_NOT_FOUND', 'ECN action not found', 404);
    if (action.status === 'ACCEPTED')
      throw new EcnError(
        'ECN_ACTION_IMMUTABLE',
        'Accepted actions are immutable',
        409
      );
    const nextStatus = input.status ?? action.status;
    if (
      ['COMPLETE', 'ACCEPTED'].includes(nextStatus) &&
      !(input.completionEvidence?.length || action.completion_evidence?.length)
    ) {
      throw new EcnError(
        'ECN_ACTION_EVIDENCE_REQUIRED',
        'Completed actions require execution evidence',
        422
      );
    }
    if (nextStatus === 'ACCEPTED' && action.completed_by_user_id === actor.id) {
      throw new EcnError(
        'ECN_ACTION_REVIEW_INDEPENDENCE',
        'The action completer cannot independently accept the same action',
        409
      );
    }
    const updated = await one(
      client,
      `UPDATE engineering_change_implementation_actions SET
        status=$3,completion_evidence=COALESCE($4::jsonb,completion_evidence),
        completed_by_user_id=CASE WHEN $3 IN ('COMPLETE','ACCEPTED') THEN COALESCE(completed_by_user_id,$5) ELSE completed_by_user_id END,
        completed_by_snapshot=CASE WHEN $3 IN ('COMPLETE','ACCEPTED') THEN COALESCE(completed_by_snapshot,$6::jsonb) ELSE completed_by_snapshot END,
        completed_at=CASE WHEN $3 IN ('COMPLETE','ACCEPTED') THEN COALESCE(completed_at,now()) ELSE completed_at END,
        accepted_by_user_id=CASE WHEN $3='ACCEPTED' THEN $5 ELSE accepted_by_user_id END,
        accepted_by_snapshot=CASE WHEN $3='ACCEPTED' THEN $6::jsonb ELSE accepted_by_snapshot END,
        accepted_at=CASE WHEN $3='ACCEPTED' THEN now() ELSE accepted_at END,
        comments=COALESCE($7,comments),updated_at=now()
       WHERE id=$1 AND ecn_id=$2 RETURNING *`,
      [
        actionId,
        ecnId,
        nextStatus,
        input.completionEvidence
          ? JSON.stringify(input.completionEvidence)
          : null,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        input.comments ?? null,
      ]
    );
    await audit(
      client,
      ecn,
      'ECN_ACTION_STATUS_CHANGED',
      actor,
      input.reason ?? null,
      action,
      updated
    );
    return updated;
  });
}

export async function submitEcn(
  ecnId: string,
  actor: EcnActor,
  reason: string
) {
  requireCapability(actor, 'engineering.ecn.submit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (
      !['implementation_planned', 'returned_for_revision'].includes(ecn.status)
    ) {
      throw new EcnError(
        'ECN_INVALID_TRANSITION',
        `Cannot submit from ${ecn.status}`,
        409
      );
    }
    const ecr = await approvedEcr(client, ecn.source_ecr_id);
    if (
      ecr.rd_project_id !== ecn.rd_project_id ||
      ecr.design_control_record_id !== ecn.design_control_record_id ||
      ecr.approved_revision_id !== ecn.source_ecr_revision_id ||
      ecr.content_checksum !== ecn.source_ecr_checksum
    ) {
      throw new EcnError(
        'ECN_ECR_AUTHORITY_MISMATCH',
        'ECN authority no longer matches the exact approved ECR revision',
        409
      );
    }
    if (
      ecr.source_engineering_release_id !== ecn.source_engineering_release_id ||
      ecr.source_engineering_release_baseline_id !==
        ecn.source_engineering_release_baseline_id
    ) {
      throw new EcnError(
        'ECN_SOURCE_BASELINE_MISMATCH',
        'ECN source release/baseline must exactly match its approved ECR',
        409
      );
    }
    if (!ecn.effectivity_method)
      throw new EcnError(
        'ECN_EFFECTIVITY_REQUIRED',
        'Controlled effectivity is required before submission',
        422
      );
    validateEffectivity(ecn.effectivity_method, ecn.effectivity_snapshot ?? {});
    validateInventoryDisposition(ecn.inventory_wip_disposition ?? {});
    const template = await releasedEcnTemplate(client);
    if (ecn.current_content_revision_id) {
      const invalidated = await client.query(
        `UPDATE engineering_change_notice_approvals SET status='INVALIDATED',
          invalidated_at=now(),invalidation_reason='Material ECN revision resubmitted'
         WHERE ecn_id=$1 AND ecn_revision_id=$2 AND status='VALID' RETURNING id`,
        [ecnId, ecn.current_content_revision_id]
      );
      if (invalidated.rowCount) {
        await audit(
          client,
          ecn,
          'ECN_APPROVALS_INVALIDATED',
          actor,
          'Material ECN revision resubmitted',
          invalidated.rows,
          null
        );
      }
    }
    const canonical = {
      ecnNumber: ecn.ecn_number,
      sourceEcrId: ecn.source_ecr_id,
      sourceEcrRevisionId: ecn.source_ecr_revision_id,
      sourceEcrChecksum: ecn.source_ecr_checksum,
      projectId: ecn.rd_project_id,
      designControlRecordId: ecn.design_control_record_id,
      implementationScope: ecn.implementation_scope,
      content: ecn.canonical_content,
      effectivityMethod: ecn.effectivity_method,
      effectivity: ecn.effectivity_snapshot,
      inventoryWipDisposition: ecn.inventory_wip_disposition,
    };
    const digest = sha256(canonical);
    const count = await one(
      client,
      `SELECT count(*)::int AS value FROM engineering_change_notice_revisions WHERE ecn_id=$1`,
      [ecnId]
    );
    const revision = await one(
      client,
      `INSERT INTO engineering_change_notice_revisions (
        ecn_id,revision_number,canonical_content,content_checksum,
        source_ecr_revision_id,source_ecr_checksum,template_definition_revision_id,
        template_document_version_id,template_checksum_snapshot,change_reason,
        created_by_user_id,created_by_snapshot
      ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`,
      [
        ecnId,
        Number(count.value) + 1,
        JSON.stringify(canonical),
        digest,
        ecn.source_ecr_revision_id,
        ecn.source_ecr_checksum,
        template.revision_id,
        template.document_version_history_id,
        template.definition_checksum,
        reason,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    const updated = await one(
      client,
      `UPDATE engineering_change_orders SET status='submitted',
        current_content_revision_id=$2,template_registration_id=$3,
        template_definition_revision_id=$4,template_document_version_id=$5,
        template_document_number_snapshot=$6,template_revision_snapshot=$7,
        template_checksum_snapshot=$8,submitted_at=now(),updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        ecnId,
        revision.id,
        template.registration_id,
        template.revision_id,
        template.document_version_history_id,
        template.document_number_snapshot,
        template.document_revision_snapshot,
        template.definition_checksum,
      ]
    );
    updated.content_checksum = digest;
    await audit(client, updated, 'ECN_SUBMITTED', actor, reason, ecn, revision);
    return {
      ecn: updated,
      revision,
      requiredApprovals: deriveEcnApprovalFunctions(ecn.canonical_content),
    };
  });
}

export async function decideEcn(
  ecnId: string,
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.approve');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT e.*,r.content_checksum FROM engineering_change_orders e
       JOIN engineering_change_notice_revisions r ON r.id=e.current_content_revision_id
       WHERE e.id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn || ecn.status !== 'submitted')
      throw new EcnError(
        'ECN_DECISION_NOT_OPEN',
        'ECN is not awaiting approval',
        409
      );
    if (
      ecn.created_by_user_id === actor.id &&
      ['QUALITY', 'MANUFACTURING_OPERATIONS', 'PROGRAM_MANAGEMENT'].includes(
        input.approvalFunction
      )
    ) {
      throw new EcnError(
        'ECN_SEGREGATION_OF_DUTIES',
        'The ECN author cannot satisfy every independent approval',
        409
      );
    }
    const required = deriveEcnApprovalFunctions(ecn.canonical_content);
    if (!required.includes(input.approvalFunction)) {
      throw new EcnError(
        'ECN_APPROVAL_FUNCTION_NOT_REQUIRED',
        'This approval function is not required'
      );
    }
    const approval = await one(
      client,
      `INSERT INTO engineering_change_notice_approvals (
        ecn_id,ecn_revision_id,content_checksum,source_ecr_revision_id,
        source_ecr_checksum,approval_function,required_capability_snapshot,
        decision,signature_meaning,actor_user_id,actor_username_snapshot,
        actor_display_name_snapshot,actor_role_snapshot,actor_capabilities_snapshot,
        comment_conditions
      ) VALUES ($1,$2,$3,$4,$5,$6,'engineering.ecn.approve',$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
      ON CONFLICT (ecn_id,ecn_revision_id,approval_function,actor_user_id) DO NOTHING
      RETURNING *`,
      [
        ecnId,
        ecn.current_content_revision_id,
        ecn.content_checksum,
        ecn.source_ecr_revision_id,
        ecn.source_ecr_checksum,
        input.approvalFunction,
        input.decision,
        input.signatureMeaning ?? 'Approve ECN implementation plan',
        actor.id,
        actor.username,
        actor.displayName,
        actor.role,
        JSON.stringify(actor.capabilities),
        input.comment ?? null,
      ]
    );
    if (!approval)
      throw new EcnError(
        'ECN_DUPLICATE_APPROVAL',
        'Actor already decided this exact ECN revision',
        409
      );
    await audit(
      client,
      ecn,
      'ECN_APPROVAL_DECIDED',
      actor,
      input.comment ?? null,
      null,
      approval
    );
    if (input.decision === 'REJECT') {
      await client.query(
        `UPDATE engineering_change_orders SET status='rejected',rejected_by=$2,rejected_at=now(),rejection_reason=$3,decision_at=now(),updated_at=now() WHERE id=$1`,
        [ecnId, actor.username, input.comment ?? 'Rejected']
      );
      return { approval, status: 'rejected' };
    }
    const approved = (
      await client.query(
        `SELECT DISTINCT approval_function FROM engineering_change_notice_approvals
          WHERE ecn_id=$1 AND ecn_revision_id=$2 AND content_checksum=$3
            AND status='VALID' AND decision='APPROVED'`,
        [ecnId, ecn.current_content_revision_id, ecn.content_checksum]
      )
    ).rows.map((row) => row.approval_function);
    const missing = required.filter((name) => !approved.includes(name));
    if (!missing.length) {
      if (!ecn.retained_form_checksum) {
        throw new EcnError(
          'ECN_CONTROLLED_FORM_EVIDENCE_REQUIRED',
          'Final approval requires a retained controlled ECN PDF or immutable paper original.',
          409
        );
      }
      await client.query(
        `UPDATE engineering_change_orders SET status='approved',approved_by=$2,approved_at=now(),decision_at=now(),updated_at=now() WHERE id=$1`,
        [ecnId, actor.username]
      );
    }
    return {
      approval,
      status: missing.length ? 'submitted' : 'approved',
      missingApprovals: missing,
    };
  });
}

export async function recordVvEvidence(
  ecnId: string,
  type: 'VERIFICATION' | 'VALIDATION',
  input: Record<string, any>,
  actor: EcnActor
) {
  requireCapability(
    actor,
    type === 'VERIFICATION'
      ? 'engineering.ecn.verify'
      : 'engineering.ecn.validate'
  );
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (
      !ecn ||
      !['in_implementation', 'verification_validation'].includes(ecn.status)
    ) {
      throw new EcnError(
        'ECN_VV_NOT_OPEN',
        'Implementation must be active before recording V&V evidence',
        409
      );
    }
    if (
      !input.planProtocol ||
      !input.acceptanceCriteria ||
      !input.actualResult ||
      !input.evidenceReference
    ) {
      throw new EcnError(
        'ECN_VV_EVIDENCE_INCOMPLETE',
        'Protocol, criteria, actual result, and evidence reference are required',
        422
      );
    }
    const record = await one(
      client,
      `INSERT INTO engineering_change_verification_records (
        ecn_id,ecn_revision_id,evidence_type,plan_protocol,acceptance_criteria,
        actual_result,result_status,evidence_reference,performer_user_id,
        performer_snapshot,independent_reviewer_user_id,independent_reviewer_snapshot,
        reviewed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,
        CASE WHEN $11::integer IS NULL THEN NULL ELSE now() END) RETURNING *`,
      [
        ecnId,
        ecn.current_content_revision_id,
        type,
        input.planProtocol,
        input.acceptanceCriteria,
        input.actualResult,
        input.resultStatus,
        input.evidenceReference,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        null,
        null,
      ]
    );
    await audit(
      client,
      ecn,
      `ECN_${type}_EVIDENCE_RECORDED`,
      actor,
      input.reason ?? null,
      null,
      record
    );
    return record;
  });
}

export async function independentlyReviewVvEvidence(
  ecnId: string,
  recordId: string,
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.approve');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    const source = await one(
      client,
      `SELECT * FROM engineering_change_verification_records
        WHERE id=$1 AND ecn_id=$2`,
      [recordId, ecnId]
    );
    if (!ecn || !source)
      throw new EcnError(
        'ECN_VV_RECORD_NOT_FOUND',
        'V&V record not found',
        404
      );
    if (source.performer_user_id === actor.id) {
      throw new EcnError(
        'ECN_VV_REVIEW_INDEPENDENCE',
        'The performer cannot be their own independent reviewer',
        409
      );
    }
    const reviewed = await one(
      client,
      `INSERT INTO engineering_change_verification_records (
        ecn_id,ecn_revision_id,evidence_type,plan_protocol,acceptance_criteria,
        actual_result,result_status,evidence_reference,performer_user_id,
        performer_snapshot,independent_reviewer_user_id,independent_reviewer_snapshot,
        reviewed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,now())
      RETURNING *`,
      [
        ecnId,
        source.ecn_revision_id,
        source.evidence_type,
        source.plan_protocol,
        source.acceptance_criteria,
        source.actual_result,
        source.result_status,
        source.evidence_reference,
        source.performer_user_id,
        JSON.stringify(source.performer_snapshot),
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    await audit(
      client,
      ecn,
      'ECN_VV_INDEPENDENTLY_REVIEWED',
      actor,
      'Authenticated independent V&V review',
      source,
      reviewed
    );
    return reviewed;
  });
}

async function move(
  ecnId: string,
  next: string,
  actor: EcnActor,
  reason: string,
  capability: string
) {
  requireCapability(actor, capability);
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (!(transitions[ecn.status] ?? []).includes(next)) {
      throw new EcnError(
        'ECN_INVALID_TRANSITION',
        `${ecn.status} cannot transition to ${next}`,
        409
      );
    }
    if (next === 'in_implementation') {
      const revision = await one(
        client,
        `SELECT id FROM engineering_change_notice_revisions WHERE id=$1`,
        [ecn.current_content_revision_id]
      );
      const approvals = await client.query(
        `SELECT 1 FROM engineering_change_notice_approvals WHERE ecn_id=$1 AND ecn_revision_id=$2 AND status='VALID' AND decision='APPROVED' LIMIT 1`,
        [ecnId, revision?.id]
      );
      if (!revision || !approvals.rowCount)
        throw new EcnError(
          'ECN_CURRENT_APPROVALS_REQUIRED',
          'Current immutable ECN approvals are required before implementation',
          409
        );
    }
    if (
      next === 'closed' &&
      !ecn.resulting_engineering_release_id &&
      !ecn.no_release_required
    ) {
      throw new EcnError(
        'ECN_PHASE8_RELEASE_REQUIRED',
        'Closure requires the Phase 8 resulting Engineering Release or an approved no-release-required disposition',
        409
      );
    }
    const updated = await one(
      client,
      `UPDATE engineering_change_orders SET status=$2,
        implementation_started_at=CASE WHEN $2='in_implementation' THEN now() ELSE implementation_started_at END,
        release_ready_at=CASE WHEN $2='release_ready' THEN now() ELSE release_ready_at END,
        implementation_date=CASE WHEN $2='implemented' THEN current_date ELSE implementation_date END,
        implemented_by=CASE WHEN $2='implemented' THEN $3 ELSE implemented_by END,
        implemented_at=CASE WHEN $2='implemented' THEN now() ELSE implemented_at END,
        closed_by=CASE WHEN $2='closed' THEN $3 ELSE closed_by END,
        closed_at=CASE WHEN $2='closed' THEN now() ELSE closed_at END,
        updated_at=now() WHERE id=$1 RETURNING *`,
      [ecnId, next, actor.username]
    );
    await audit(
      client,
      updated,
      `ECN_STATUS_${next.toUpperCase()}`,
      actor,
      reason,
      ecn,
      updated
    );
    return updated;
  });
}

export const planEcn = (id: string, actor: EcnActor, reason: string) =>
  move(id, 'implementation_planned', actor, reason, 'engineering.ecn.edit');
export const startImplementation = (
  id: string,
  actor: EcnActor,
  reason: string
) => move(id, 'in_implementation', actor, reason, 'engineering.ecn.implement');
export const startVerificationValidation = (
  id: string,
  actor: EcnActor,
  reason: string
) =>
  move(
    id,
    'verification_validation',
    actor,
    reason,
    'engineering.ecn.implement'
  );
export const markImplemented = (id: string, actor: EcnActor, reason: string) =>
  move(id, 'implemented', actor, reason, 'engineering.ecn.implement');
export const returnEcn = (id: string, actor: EcnActor, reason: string) =>
  move(id, 'returned_for_revision', actor, reason, 'engineering.ecn.approve');
export const rejectEcn = (id: string, actor: EcnActor, reason: string) =>
  move(id, 'rejected', actor, reason, 'engineering.ecn.approve');
export const cancelEcn = (id: string, actor: EcnActor, reason: string) =>
  move(id, 'cancelled', actor, reason, 'engineering.ecn.admin');

export async function markReleaseReady(
  ecnId: string,
  actor: EcnActor,
  reason: string
) {
  requireCapability(actor, 'engineering.ecn.implement');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn || ecn.status !== 'verification_validation') {
      throw new EcnError(
        'ECN_RELEASE_READINESS_NOT_OPEN',
        'ECN must be in verification/validation',
        409
      );
    }
    const incomplete = await one(
      client,
      `SELECT count(*)::int AS value FROM engineering_change_implementation_actions
        WHERE ecn_id=$1 AND status NOT IN ('ACCEPTED','CANCELLED')`,
      [ecnId]
    );
    if (Number(incomplete.value) > 0) {
      throw new EcnError(
        'ECN_ACTIONS_INCOMPLETE',
        'All required implementation actions must be accepted',
        409
      );
    }
    const failed = await one(
      client,
      `SELECT count(*)::int AS value FROM engineering_change_verification_records
        WHERE ecn_id=$1 AND result_status='FAIL'`,
      [ecnId]
    );
    if (Number(failed.value) > 0)
      throw new EcnError(
        'ECN_VV_FAILED',
        'Failed V&V evidence blocks release readiness',
        409
      );
    const requirements = await client.query(
      `SELECT verification_required,validation_required FROM engineering_change_step_impacts WHERE ecn_id=$1`,
      [ecnId]
    );
    const vv = await client.query(
      `SELECT DISTINCT evidence_type FROM engineering_change_verification_records
        WHERE ecn_id=$1 AND ecn_revision_id=$2 AND result_status='PASS'`,
      [ecnId, ecn.current_content_revision_id]
    );
    const available = new Set(vv.rows.map((row) => row.evidence_type));
    const impacts = ecn.canonical_content?.impacts ?? {};
    const verificationDerived =
      requirements.rows.some((row) => row.verification_required) ||
      Boolean(
        impacts.fitFormFunction ||
        impacts.interchangeability ||
        impacts.safety ||
        impacts.regulatoryContract
      );
    const validationDerived =
      requirements.rows.some((row) => row.validation_required) ||
      Boolean(impacts.validation || impacts.customerApprovalRequired);
    if (verificationDerived && !available.has('VERIFICATION')) {
      throw new EcnError(
        'ECN_VERIFICATION_REQUIRED',
        'Passing version-bound verification evidence is required',
        409
      );
    }
    if (validationDerived && !available.has('VALIDATION')) {
      throw new EcnError(
        'ECN_VALIDATION_REQUIRED',
        'Passing version-bound validation evidence is required',
        409
      );
    }
    if (impacts.safety || impacts.regulatoryContract) {
      const independentlyReviewed = await one(
        client,
        `SELECT count(*)::int AS value FROM engineering_change_verification_records
          WHERE ecn_id=$1 AND ecn_revision_id=$2 AND result_status='PASS'
            AND independent_reviewer_user_id IS NOT NULL`,
        [ecnId, ecn.current_content_revision_id]
      );
      if (!Number(independentlyReviewed.value)) {
        throw new EcnError(
          'ECN_INDEPENDENT_VV_REVIEW_REQUIRED',
          'Safety or regulatory impact requires authenticated independent V&V review.',
          409
        );
      }
    }
    const updated = await one(
      client,
      `UPDATE engineering_change_orders SET status='release_ready',release_ready_at=now(),updated_at=now() WHERE id=$1 RETURNING *`,
      [ecnId]
    );
    await audit(client, updated, 'ECN_RELEASE_READY', actor, reason, ecn, {
      ...updated,
      resultingReleaseCreated: false,
    });
    return updated;
  });
}

export async function approveNoReleaseRequiredDisposition(
  ecnId: string,
  actor: EcnActor,
  reason: string
) {
  requireCapability(actor, 'engineering.ecn.admin');
  requireCapability(actor, 'engineering.ecn.approve');
  if (!reason.trim()) {
    throw new EcnError(
      'ECN_NO_RELEASE_REASON_REQUIRED',
      'A formal reason is required for a no-release-required disposition.'
    );
  }
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn || ecn.status !== 'implemented') {
      throw new EcnError(
        'ECN_NO_RELEASE_DISPOSITION_NOT_READY',
        'Only an implemented ECN may receive a no-release-required disposition.',
        409
      );
    }
    const updated = await one(
      client,
      `UPDATE engineering_change_orders SET no_release_required=true,
        release_linkage=jsonb_set(COALESCE(release_linkage,'{}'::jsonb),
          '{noReleaseRequiredDisposition}',
          jsonb_build_object('approvedBy',$2::text,'reason',$3::text,'approvedAt',now())),
        updated_at=now() WHERE id=$1 RETURNING *`,
      [ecnId, actor.username, reason]
    );
    await audit(
      client,
      updated,
      'ECN_NO_RELEASE_REQUIRED_APPROVED',
      actor,
      reason,
      ecn,
      updated
    );
    return updated;
  });
}

export async function attachEcnEvidence(
  ecnId: string,
  input: {
    kind: string;
    originalFilename: string;
    storedPath: string;
    mimeType: string;
    bytes: Buffer;
    paperOriginal?: boolean;
  },
  actor: EcnActor
) {
  requireCapability(actor, 'engineering.ecn.edit');
  return tx(async (client) => {
    const ecn = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (!ecn) throw new EcnError('ECN_NOT_FOUND', 'ECN not found', 404);
    if (terminal.has(ecn.status))
      throw new EcnError(
        'ECN_EVIDENCE_IMMUTABLE',
        'Terminal ECN evidence is immutable',
        409
      );
    const digest = sha256(input.bytes.toString('base64'));
    const attachment = await one(
      client,
      `INSERT INTO engineering_change_notice_attachments (
        ecn_id,ecn_revision_id,attachment_kind,original_filename,stored_path,
        mime_type,byte_size,sha256_checksum,uploaded_by_user_id,uploaded_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
      [
        ecnId,
        ecn.current_content_revision_id,
        input.kind,
        input.originalFilename,
        input.storedPath,
        input.mimeType,
        input.bytes.length,
        digest,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
      ]
    );
    if (input.paperOriginal) {
      await client.query(
        `UPDATE engineering_change_orders SET completion_method='PAPER',
          retained_form_path=$2,retained_form_checksum=$3,retained_form_size=$4,
          retained_form_generated_at=now() WHERE id=$1`,
        [ecnId, input.storedPath, digest, input.bytes.length]
      );
    }
    await audit(
      client,
      { ...ecn, content_checksum: digest },
      input.paperOriginal
        ? 'ECN_PAPER_ORIGINAL_UPLOADED'
        : 'ECN_EVIDENCE_ATTACHED',
      actor,
      null,
      null,
      attachment
    );
    return attachment;
  });
}

export async function renderEcnPdf(ecnId: string, actor: EcnActor) {
  requireCapability(actor, 'engineering.ecn.view');
  const ecn = await getEcn(ecnId);
  if (!ecn.current_content_revision_id)
    throw new EcnError(
      'ECN_NOT_SUBMITTED',
      'Submit an immutable ECN revision before rendering',
      409
    );
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const evidenceDate = new Date(
    ecn.revision_created_at ?? ecn.submitted_at ?? ecn.created_at
  );
  pdf.setCreator(`EPOCH ${DESIGN_CONTROL_FORM_RENDERER_VERSION}`);
  pdf.setCreationDate(evidenceDate);
  pdf.setModificationDate(evidenceDate);
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 750;
  const line = (label: string, value: unknown) => {
    if (y < 60) {
      page = pdf.addPage([612, 792]);
      y = 750;
    }
    page.drawText(`${label}: ${String(value ?? '')}`.slice(0, 105), {
      x: 40,
      y,
      size: 9,
      font,
    });
    y -= 14;
  };
  page.drawText('CONTROLLED ENGINEERING CHANGE NOTICE', {
    x: 40,
    y,
    size: 15,
    font: bold,
  });
  y -= 28;
  line('ECN', ecn.ecn_number);
  line('Source ECR', `${ecn.ecr_number} / ${ecn.source_ecr_checksum}`);
  line('R&D Design Project', ecn.rd_project_id);
  line('Design Control Record', ecn.design_control_record_id);
  line(
    'Source release / baseline',
    `${ecn.source_engineering_release_id} / ${ecn.source_engineering_release_baseline_id}`
  );
  line('Status', ecn.status);
  line('Scope', ecn.implementation_scope);
  line('Content checksum', ecn.content_checksum);
  line(
    'Template',
    `${ecn.template_document_number_snapshot} Rev ${ecn.template_revision_snapshot}`
  );
  line(
    'Effectivity',
    `${ecn.effectivity_method} ${stable(ecn.effectivity_snapshot)}`
  );
  line('Inventory/WIP disposition', stable(ecn.inventory_wip_disposition));
  for (const item of ecn.affectedItems)
    line(
      `Affected ${item.source_type}`,
      `${item.stable_source_reference}: ${item.current_revision_snapshot} -> ${item.proposed_revision}`
    );
  for (const step of ecn.stepImpacts)
    line(
      `Step ${step.step_key}`,
      `${step.impact_reason}; reopen=${step.reopen_required}`
    );
  for (const action of ecn.actions)
    line(
      `Action ${action.action_number}`,
      `${action.status}: ${action.description}`
    );
  for (const record of ecn.verificationValidation)
    line(
      record.evidence_type,
      `${record.result_status}: ${record.actual_result}`
    );
  for (const approval of ecn.approvals)
    line(
      `Approval ${approval.approval_function}`,
      `${approval.decision} by ${approval.actor_display_name_snapshot}`
    );
  line(
    'Resulting Engineering Release',
    ecn.resulting_engineering_release_id ??
      'Phase 8 pending; not created by this ECN'
  );
  for (const [index, pdfPage] of pdf.getPages().entries()) {
    pdfPage.drawText(
      `Page ${index + 1} of ${pdf.getPageCount()} | ECN ${ecn.ecn_number}`,
      { x: 40, y: 25, size: 8, font }
    );
  }
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (ecn.retained_form_checksum && ecn.retained_form_checksum !== digest) {
    throw new EcnError(
      'ECN_RETAINED_FORM_CHECKSUM_MISMATCH',
      'Regenerated ECN form differs from immutable retained evidence',
      409
    );
  }
  const directory = path.resolve(
    process.cwd(),
    'uploads',
    'engineering-change-notices'
  );
  await fs.mkdir(directory, { recursive: true });
  const storedPath = path.join(directory, `${ecn.ecn_number}-${digest}.pdf`);
  await fs.writeFile(storedPath, bytes, { flag: 'wx' }).catch((error: any) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  await tx(async (client) => {
    const locked = await one(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    await client.query(
      `UPDATE engineering_change_orders SET retained_form_path=$2,
        retained_form_checksum=$3,retained_form_size=$4,
        retained_form_generated_at=now() WHERE id=$1`,
      [ecnId, storedPath, digest, bytes.length]
    );
    await audit(
      client,
      { ...locked, content_checksum: digest },
      'ECN_PDF_GENERATED',
      actor,
      null,
      null,
      { checksum: digest, size: bytes.length }
    );
  });
  return { bytes, checksum: digest, filename: `${ecn.ecn_number}.pdf` };
}

export async function getEcnHistory(ecnId: string) {
  return (
    await pgPool.query(
      `SELECT * FROM engineering_change_notice_events WHERE ecn_id=$1 ORDER BY occurred_at,id`,
      [ecnId]
    )
  ).rows;
}

export async function reconcileLegacyEcos(actor: EcnActor) {
  requireCapability(actor, 'engineering.ecn.admin');
  return tx(async (client) => {
    const rows = (
      await client.query(
        `SELECT e.id,e.eco_number,e.metadata
           FROM engineering_change_orders e
          WHERE e.ecn_number IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM engineering_change_notice_legacy_reconciliation r
               WHERE r.eco_id=e.id
            )`
      )
    ).rows;
    for (const row of rows) {
      await client.query(
        `INSERT INTO engineering_change_notice_legacy_reconciliation (
          eco_id,reconciliation_status,stable_source_key,reason
        ) VALUES ($1,'RECONCILIATION_REQUIRED',$2,$3)
        ON CONFLICT (stable_source_key) DO NOTHING`,
        [
          row.id,
          `engineering_change_orders:${row.id}`,
          'Legacy ECO retained as LEGACY_UNVERIFIED; explicit authoritative ECR/project mapping is required.',
        ]
      );
    }
    return {
      queued: rows.length,
      automaticallyApproved: 0,
      legacyRowsMutated: 0,
    };
  });
}

export function phase8Compatibility() {
  return {
    resultingEngineeringReleasePlaceholder: true,
    revisionBReleaseCreationEnabled: false,
    automaticInventoryMutationEnabled: false,
    automaticP2MutationEnabled: false,
  };
}
