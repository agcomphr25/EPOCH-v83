import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { PoolClient } from 'pg';

import { pgPool } from '../../db';
import { DESIGN_CONTROL_FORM_RENDERER_VERSION } from '../../../shared/designControlFormCatalog';

export type EcrActor = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
};

export class EcrError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const terminal = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'VOID']);
const transitions: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED', 'VOID'],
  SUBMITTED: [
    'IMPACT_REVIEW',
    'RETURNED_FOR_REVISION',
    'REJECTED',
    'CANCELLED',
  ],
  IMPACT_REVIEW: ['APPROVED', 'RETURNED_FOR_REVISION', 'REJECTED', 'CANCELLED'],
  RETURNED_FOR_REVISION: ['SUBMITTED', 'CANCELLED', 'VOID'],
};

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
const checksum = (value: unknown) =>
  createHash('sha256').update(stable(value)).digest('hex');
const snapshot = (actor: EcrActor) => ({
  userId: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
  capabilities: actor.capabilities,
});
const queryOne = async (client: PoolClient, text: string, values: unknown[]) =>
  (await client.query(text, values)).rows[0] ?? null;

async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
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

const assertCapability = (actor: EcrActor, capability: string) => {
  if (
    !actor.capabilities.includes(capability) &&
    !actor.capabilities.includes('*')
  ) {
    throw new EcrError(
      'ECR_FORBIDDEN',
      `Capability ${capability} is required`,
      403
    );
  }
};

async function loadAuthority(
  client: PoolClient,
  projectId: string,
  recordId?: string
) {
  const row = await queryOne(
    client,
    `SELECT rp.id AS rd_project_id, dcr.id AS record_id
       FROM rd_projects rp
       JOIN design_control_records dcr ON dcr.rd_project_id = rp.id
      WHERE rp.id = $1
        AND ($2::uuid IS NULL OR dcr.id = $2::uuid)
      ORDER BY dcr.created_at DESC LIMIT 1`,
    [projectId, recordId ?? null]
  );
  if (!row) {
    throw new EcrError(
      'ECR_DESIGN_AUTHORITY_NOT_FOUND',
      'ECRs require an R&D Design Project and its authoritative Design Control record; P2 project identifiers are not accepted.',
      422
    );
  }
  return row;
}

async function loadReleasedTemplate(client: PoolClient) {
  const row = await queryOne(
    client,
    `SELECT t.id AS registration_id, r.document_number_snapshot AS document_number,
            r.id AS revision_id, r.document_revision_snapshot AS revision, r.definition_checksum,
            r.document_version_history_id
       FROM design_control_form_templates t
       JOIN design_control_form_template_revisions r
         ON r.design_control_form_template_id = t.id
      WHERE t.form_category = 'ENGINEERING_CHANGE_REQUEST'
        AND r.lifecycle_status = 'RELEASED'
        AND t.active_template_revision_id = r.id
      LIMIT 1`,
    []
  );
  if (!row) {
    throw new EcrError(
      'ECR_TEMPLATE_NOT_RELEASED',
      'ECR submission is blocked until Document Control releases the controlled Engineering Change Request template.',
      409
    );
  }
  return row;
}

async function assertSourceOwnership(
  client: PoolClient,
  projectId: string,
  recordId: string,
  releaseId?: string | null,
  baselineId?: string | null
) {
  if (!releaseId && !baselineId) return;
  const row = await queryOne(
    client,
    `SELECT er.id, erb.id AS baseline_id
       FROM engineering_releases er
       LEFT JOIN engineering_release_baselines erb
         ON erb.engineering_release_id = er.id
      WHERE er.id = $1::uuid
        AND er.rd_project_id = $2
        AND er.design_control_record_id = $3::uuid
        AND ($4::uuid IS NULL OR erb.id = $4::uuid)`,
    [releaseId ?? null, projectId, recordId, baselineId ?? null]
  );
  if (!row) {
    throw new EcrError(
      'ECR_SOURCE_BASELINE_MISMATCH',
      'The source Engineering Release and baseline must belong to the same R&D project and authoritative Design Control record.',
      422
    );
  }
}

async function event(
  client: PoolClient,
  ecr: any,
  type: string,
  actor: EcrActor | null,
  reason: string | null,
  beforeValues: unknown,
  afterValues: unknown
) {
  await client.query(
    `INSERT INTO engineering_change_request_events (
       ecr_id, event_type, actor_user_id, actor_snapshot,
       project_id_snapshot, design_control_record_id_snapshot,
       source_release_id_snapshot, source_baseline_id_snapshot,
       content_revision_id, content_checksum, reason, before_values, after_values
     ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
    [
      ecr.id,
      type,
      actor?.id ?? null,
      actor ? JSON.stringify(snapshot(actor)) : null,
      ecr.rd_project_id,
      ecr.design_control_record_id,
      ecr.source_engineering_release_id,
      ecr.source_engineering_release_baseline_id,
      ecr.current_content_revision_id,
      ecr.content_checksum ?? null,
      reason,
      beforeValues == null ? null : JSON.stringify(beforeValues),
      afterValues == null ? null : JSON.stringify(afterValues),
    ]
  );
}

export async function listEcrs(projectId: string) {
  const result = await pgPool.query(
    `SELECT e.*, u.username AS owner_username,
       (SELECT count(*)::int FROM engineering_change_request_affected_items i WHERE i.ecr_id=e.id) AS affected_item_count,
       (SELECT count(*)::int FROM engineering_change_request_reviews r WHERE r.ecr_id=e.id AND r.status='VALID') AS completed_reviews
     FROM engineering_change_requests e
     LEFT JOIN users u ON u.id=e.current_owner_user_id
     WHERE e.rd_project_id=$1 ORDER BY e.created_at DESC`,
    [projectId]
  );
  return result.rows;
}

export async function getEcr(ecrId: string) {
  const [ecr, items, reviews] = await Promise.all([
    pgPool.query(
      `SELECT e.*,r.content_checksum,r.revision_number,r.created_at AS revision_created_at
         FROM engineering_change_requests e
         LEFT JOIN engineering_change_request_revisions r
           ON r.id=e.current_content_revision_id
        WHERE e.id=$1`,
      [ecrId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_request_affected_items WHERE ecr_id=$1 ORDER BY created_at`,
      [ecrId]
    ),
    pgPool.query(
      `SELECT * FROM engineering_change_request_reviews WHERE ecr_id=$1 ORDER BY decided_at`,
      [ecrId]
    ),
  ]);
  if (!ecr.rows[0]) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
  return { ...ecr.rows[0], affectedItems: items.rows, reviews: reviews.rows };
}

export async function createEcr(
  projectId: string,
  input: Record<string, any>,
  actor: EcrActor
) {
  assertCapability(actor, 'engineering.ecr.create');
  return transaction(async (client) => {
    const authority = await loadAuthority(
      client,
      projectId,
      input.designControlRecordId
    );
    await assertSourceOwnership(
      client,
      projectId,
      authority.record_id,
      input.sourceEngineeringReleaseId,
      input.sourceBaselineId
    );
    const seq = await queryOne(
      client,
      `SELECT nextval('engineering_change_request_number_seq')::bigint AS value`,
      []
    );
    const number = `ECR-${new Date().getUTCFullYear()}-${String(seq.value).padStart(4, '0')}`;
    const content = {
      problemOpportunityStatement: input.problemOpportunityStatement ?? '',
      requestedChange: input.requestedChange ?? '',
      reasonBusinessJustification: input.reasonBusinessJustification ?? '',
      changeSource: input.changeSource ?? 'INTERNAL',
      impacts: input.impacts ?? {},
      verificationImpact: input.verificationImpact ?? '',
      validationImpact: input.validationImpact ?? '',
    };
    const result = await client.query(
      `INSERT INTO engineering_change_requests (
        ecr_number, rd_project_id, design_control_record_id,
        source_engineering_release_id, source_engineering_release_baseline_id,
        title, priority, change_classification, current_owner_user_id,
        content, affected_design_control_steps, proposed_effectivity,
        created_by_user_id, created_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$9,$13::jsonb)
      RETURNING *`,
      [
        number,
        projectId,
        authority.record_id,
        input.sourceEngineeringReleaseId ?? null,
        input.sourceBaselineId ?? null,
        String(input.title ?? '').trim(),
        input.priority ?? 'NORMAL',
        input.changeClassification ?? 'DESIGN',
        actor.id,
        JSON.stringify(content),
        JSON.stringify(input.affectedDesignControlSteps ?? []),
        JSON.stringify(input.proposedEffectivity ?? {}),
        JSON.stringify(snapshot(actor)),
      ]
    );
    const ecr = result.rows[0];
    await event(client, ecr, 'CREATED', actor, input.reason ?? null, null, ecr);
    return ecr;
  });
}

export async function updateEcr(
  ecrId: string,
  input: Record<string, any>,
  actor: EcrActor
) {
  assertCapability(actor, 'engineering.ecr.edit');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    if (!['DRAFT', 'RETURNED_FOR_REVISION'].includes(ecr.lifecycle_status)) {
      throw new EcrError(
        'ECR_CONTENT_IMMUTABLE',
        'Only draft or returned ECR content may be edited',
        409
      );
    }
    const nextContent = { ...ecr.content, ...(input.content ?? {}) };
    const result = await client.query(
      `UPDATE engineering_change_requests SET
         title=COALESCE($2,title), priority=COALESCE($3,priority),
         change_classification=COALESCE($4,change_classification),
         content=$5::jsonb,
         affected_design_control_steps=COALESCE($6::jsonb,affected_design_control_steps),
         proposed_effectivity=COALESCE($7::jsonb,proposed_effectivity),
         updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        ecrId,
        input.title ?? null,
        input.priority ?? null,
        input.changeClassification ?? null,
        JSON.stringify(nextContent),
        input.affectedDesignControlSteps
          ? JSON.stringify(input.affectedDesignControlSteps)
          : null,
        input.proposedEffectivity
          ? JSON.stringify(input.proposedEffectivity)
          : null,
      ]
    );
    await event(
      client,
      result.rows[0],
      'DRAFT_EDITED',
      actor,
      input.reason ?? null,
      ecr,
      result.rows[0]
    );
    return result.rows[0];
  });
}

export async function addAffectedItem(
  ecrId: string,
  input: Record<string, any>,
  actor: EcrActor
) {
  assertCapability(actor, 'engineering.ecr.edit');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    if (!['DRAFT', 'RETURNED_FOR_REVISION'].includes(ecr.lifecycle_status)) {
      throw new EcrError(
        'ECR_AFFECTED_ITEMS_IMMUTABLE',
        'Affected items are immutable after submission',
        409
      );
    }
    if (!input.sourceId && !input.stableExternalReference) {
      throw new EcrError(
        'ECR_AFFECTED_ITEM_REFERENCE_REQUIRED',
        'A stable source ID or external reference is required'
      );
    }
    const result = await client.query(
      `INSERT INTO engineering_change_request_affected_items (
        ecr_id, source_type, source_id, stable_external_reference,
        part_document_number_snapshot, revision_snapshot, description,
        proposed_change, impact_category, disposition_recommendation,
        evidence_links, created_by_user_id, created_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
      RETURNING *`,
      [
        ecrId,
        input.sourceType,
        input.sourceId ?? null,
        input.stableExternalReference ?? null,
        input.partDocumentNumberSnapshot ?? null,
        input.revisionSnapshot ?? null,
        input.description,
        input.proposedChange,
        input.impactCategory,
        input.dispositionRecommendation ?? null,
        JSON.stringify(input.evidenceLinks ?? []),
        actor.id,
        JSON.stringify(snapshot(actor)),
      ]
    );
    await event(
      client,
      ecr,
      'AFFECTED_ITEM_ADDED',
      actor,
      input.reason ?? null,
      null,
      result.rows[0]
    );
    return result.rows[0];
  });
}

export function deriveRequiredReviewFunctions(content: Record<string, any>) {
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

export async function submitEcr(
  ecrId: string,
  actor: EcrActor,
  reason: string
) {
  assertCapability(actor, 'engineering.ecr.submit');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    if (!['DRAFT', 'RETURNED_FOR_REVISION'].includes(ecr.lifecycle_status)) {
      throw new EcrError(
        'ECR_INVALID_TRANSITION',
        `Cannot submit from ${ecr.lifecycle_status}`,
        409
      );
    }
    const template = await loadReleasedTemplate(client);
    await assertSourceOwnership(
      client,
      ecr.rd_project_id,
      ecr.design_control_record_id,
      ecr.source_engineering_release_id,
      ecr.source_engineering_release_baseline_id
    );
    const released = await queryOne(
      client,
      `SELECT id FROM engineering_releases
        WHERE rd_project_id=$1 AND design_control_record_id=$2 AND release_revision='A'
        LIMIT 1`,
      [ecr.rd_project_id, ecr.design_control_record_id]
    );
    if (
      released &&
      (!ecr.source_engineering_release_id ||
        !ecr.source_engineering_release_baseline_id)
    ) {
      throw new EcrError(
        'ECR_POST_RELEASE_SOURCE_REQUIRED',
        'A post-Revision-A ECR requires its source Engineering Release and immutable baseline.',
        422
      );
    }
    const canonical = {
      ecrNumber: ecr.ecr_number,
      title: ecr.title,
      content: ecr.content,
      priority: ecr.priority,
      changeClassification: ecr.change_classification,
      affectedDesignControlSteps: ecr.affected_design_control_steps,
      proposedEffectivity: ecr.proposed_effectivity,
    };
    const digest = checksum(canonical);
    if (ecr.current_content_revision_id) {
      const invalidated = await client.query(
        `UPDATE engineering_change_request_reviews
            SET status='INVALIDATED', invalidated_at=now(),
                invalidation_reason='Material revision resubmitted'
          WHERE ecr_id=$1 AND ecr_revision_id=$2 AND status='VALID'
          RETURNING id,review_function`,
        [ecrId, ecr.current_content_revision_id]
      );
      if (invalidated.rowCount) {
        await event(
          client,
          ecr,
          'APPROVAL_INVALIDATED',
          actor,
          'Material revision resubmitted',
          invalidated.rows,
          null
        );
      }
    }
    const count = await queryOne(
      client,
      `SELECT count(*)::int AS value FROM engineering_change_request_revisions WHERE ecr_id=$1`,
      [ecrId]
    );
    const revision = await queryOne(
      client,
      `INSERT INTO engineering_change_request_revisions (
        ecr_id, revision_number, canonical_content, content_checksum,
        template_definition_revision_id, template_document_version_id,
        template_checksum_snapshot, change_reason, created_by_user_id, created_by_snapshot
      ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
      [
        ecrId,
        Number(count.value) + 1,
        JSON.stringify(canonical),
        digest,
        template.revision_id,
        template.document_version_history_id,
        template.definition_checksum,
        reason,
        actor.id,
        JSON.stringify(snapshot(actor)),
      ]
    );
    const updated = await queryOne(
      client,
      `UPDATE engineering_change_requests SET lifecycle_status='SUBMITTED',
        current_content_revision_id=$2, template_registration_id=$3,
        template_definition_revision_id=$4, template_document_version_id=$5,
        template_document_number_snapshot=$6, template_revision_snapshot=$7,
        template_checksum_snapshot=$8, submitted_at=now(), updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        ecrId,
        revision.id,
        template.registration_id,
        template.revision_id,
        template.document_version_history_id,
        template.document_number,
        template.revision,
        template.definition_checksum,
      ]
    );
    updated.content_checksum = digest;
    await event(client, updated, 'SUBMITTED', actor, reason, ecr, revision);
    return {
      ecr: updated,
      revision,
      requiredReviews: deriveRequiredReviewFunctions(ecr.content),
    };
  });
}

export async function startImpactReview(
  ecrId: string,
  actor: EcrActor,
  reason: string
) {
  assertCapability(actor, 'engineering.ecr.review');
  return transition(ecrId, 'IMPACT_REVIEW', actor, reason, ['SUBMITTED']);
}

export async function recordReview(
  ecrId: string,
  input: Record<string, any>,
  actor: EcrActor
) {
  assertCapability(actor, 'engineering.ecr.review');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT e.*, r.content_checksum, r.created_by_user_id AS revision_creator
         FROM engineering_change_requests e
         JOIN engineering_change_request_revisions r ON r.id=e.current_content_revision_id
        WHERE e.id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    if (ecr.lifecycle_status !== 'IMPACT_REVIEW') {
      throw new EcrError(
        'ECR_REVIEW_NOT_OPEN',
        'Impact review is not open',
        409
      );
    }
    if (
      actor.id === ecr.created_by_user_id &&
      ['QUALITY', 'MANUFACTURING_OPERATIONS', 'PROGRAM_MANAGEMENT'].includes(
        input.reviewFunction
      )
    ) {
      throw new EcrError(
        'ECR_SEGREGATION_OF_DUTIES',
        'The requester cannot satisfy every independent impact review',
        409
      );
    }
    const required = deriveRequiredReviewFunctions(ecr.content);
    if (!required.includes(input.reviewFunction)) {
      throw new EcrError(
        'ECR_REVIEW_FUNCTION_NOT_REQUIRED',
        'This review function is not required by the declared impacts'
      );
    }
    const result = await client.query(
      `INSERT INTO engineering_change_request_reviews (
        ecr_id, ecr_revision_id, content_checksum, review_function,
        required_capability_snapshot, decision, impact_assessment, conditions,
        required_actions, actor_user_id, actor_username_snapshot,
        actor_display_name_snapshot, actor_role_snapshot, actor_capabilities_snapshot
      ) VALUES ($1,$2,$3,$4,'engineering.ecr.review',$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb)
      ON CONFLICT (ecr_id,ecr_revision_id,review_function,actor_user_id) DO NOTHING
      RETURNING *`,
      [
        ecrId,
        ecr.current_content_revision_id,
        ecr.content_checksum,
        input.reviewFunction,
        input.decision,
        input.impactAssessment,
        input.conditions ?? null,
        JSON.stringify(input.requiredActions ?? []),
        actor.id,
        actor.username,
        actor.displayName,
        actor.role,
        JSON.stringify(actor.capabilities),
      ]
    );
    if (!result.rows[0])
      throw new EcrError(
        'ECR_DUPLICATE_REVIEW',
        'This actor already reviewed this exact ECR revision',
        409
      );
    await event(
      client,
      ecr,
      'IMPACT_REVIEW_DECIDED',
      actor,
      input.reason ?? null,
      null,
      result.rows[0]
    );
    return result.rows[0];
  });
}

async function transition(
  ecrId: string,
  status: string,
  actor: EcrActor,
  reason: string,
  allowed?: string[]
) {
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    const valid = allowed ?? transitions[ecr.lifecycle_status] ?? [];
    if (!valid.includes(status)) {
      throw new EcrError(
        'ECR_INVALID_TRANSITION',
        `${ecr.lifecycle_status} cannot transition to ${status}`,
        409
      );
    }
    const updated = await queryOne(
      client,
      `UPDATE engineering_change_requests SET lifecycle_status=$2,
        disposition=COALESCE($3,disposition),
        decision_at=CASE WHEN $2 IN ('APPROVED','REJECTED','CANCELLED','VOID') THEN now() ELSE decision_at END,
        updated_at=now() WHERE id=$1 RETURNING *`,
      [ecrId, status, reason || null]
    );
    await event(
      client,
      updated,
      `STATUS_${status}`,
      actor,
      reason,
      ecr,
      updated
    );
    return updated;
  });
}

export async function approveEcr(
  ecrId: string,
  actor: EcrActor,
  reason: string
) {
  assertCapability(actor, 'engineering.ecr.disposition');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT e.*, r.content_checksum FROM engineering_change_requests e
       JOIN engineering_change_request_revisions r ON r.id=e.current_content_revision_id
       WHERE e.id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr || ecr.lifecycle_status !== 'IMPACT_REVIEW') {
      throw new EcrError(
        'ECR_APPROVAL_NOT_READY',
        'ECR must be in impact review',
        409
      );
    }
    if (!ecr.retained_form_checksum) {
      throw new EcrError(
        'ECR_CONTROLLED_FORM_EVIDENCE_REQUIRED',
        'Approval requires a retained controlled PDF or immutable original paper scan.',
        409
      );
    }
    const required = deriveRequiredReviewFunctions(ecr.content);
    const reviews = (
      await client.query(
        `SELECT DISTINCT review_function FROM engineering_change_request_reviews
          WHERE ecr_id=$1 AND ecr_revision_id=$2 AND content_checksum=$3
            AND status='VALID' AND decision='APPROVE'`,
        [ecrId, ecr.current_content_revision_id, ecr.content_checksum]
      )
    ).rows.map((row) => row.review_function);
    const missing = required.filter((name) => !reviews.includes(name));
    if (missing.length)
      throw new EcrError(
        'ECR_IMPACT_REVIEWS_INCOMPLETE',
        'Required impact reviews are incomplete',
        409,
        { missing }
      );
    await client.query(
      `INSERT INTO engineering_change_request_dispositions (
        ecr_id,ecr_revision_id,content_checksum,disposition,reason,
        actor_user_id,actor_username_snapshot,actor_display_name_snapshot,
        actor_role_snapshot,actor_capabilities_snapshot
      ) VALUES ($1,$2,$3,'APPROVED',$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        ecrId,
        ecr.current_content_revision_id,
        ecr.content_checksum,
        reason,
        actor.id,
        actor.username,
        actor.displayName,
        actor.role,
        JSON.stringify(actor.capabilities),
      ]
    );
    const updated = await queryOne(
      client,
      `UPDATE engineering_change_requests SET lifecycle_status='APPROVED',
        disposition=$2, decision_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
      [ecrId, reason]
    );
    await event(
      client,
      updated,
      'STATUS_APPROVED',
      actor,
      reason,
      ecr,
      updated
    );
    return updated;
  });
}

export const rejectEcr = (id: string, actor: EcrActor, reason: string) => {
  assertCapability(actor, 'engineering.ecr.disposition');
  return transition(id, 'REJECTED', actor, reason, [
    'SUBMITTED',
    'IMPACT_REVIEW',
  ]);
};
export const returnEcr = (id: string, actor: EcrActor, reason: string) => {
  assertCapability(actor, 'engineering.ecr.disposition');
  return transition(id, 'RETURNED_FOR_REVISION', actor, reason, [
    'SUBMITTED',
    'IMPACT_REVIEW',
  ]);
};
export const cancelEcr = (id: string, actor: EcrActor, reason: string) => {
  assertCapability(actor, 'engineering.ecr.admin');
  return transition(id, 'CANCELLED', actor, reason, [
    'DRAFT',
    'SUBMITTED',
    'IMPACT_REVIEW',
    'RETURNED_FOR_REVISION',
  ]);
};

export async function getEcrHistory(ecrId: string) {
  return (
    await pgPool.query(
      `SELECT * FROM engineering_change_request_events WHERE ecr_id=$1 ORDER BY occurred_at,id`,
      [ecrId]
    )
  ).rows;
}

export async function attachEcrEvidence(
  ecrId: string,
  input: {
    kind: string;
    originalFilename: string;
    storedPath: string;
    mimeType: string;
    bytes: Buffer;
    paperOriginal?: boolean;
  },
  actor: EcrActor
) {
  assertCapability(actor, 'engineering.ecr.edit');
  return transaction(async (client) => {
    const ecr = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    if (!ecr) throw new EcrError('ECR_NOT_FOUND', 'ECR not found', 404);
    if (terminal.has(ecr.lifecycle_status)) {
      throw new EcrError(
        'ECR_EVIDENCE_IMMUTABLE',
        'Terminal ECR evidence is immutable',
        409
      );
    }
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const row = await queryOne(
      client,
      `INSERT INTO engineering_change_request_attachments (
        ecr_id,ecr_revision_id,attachment_kind,original_filename,stored_path,
        mime_type,byte_size,sha256_checksum,uploaded_by_user_id,uploaded_by_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
      [
        ecrId,
        ecr.current_content_revision_id,
        input.kind,
        input.originalFilename,
        input.storedPath,
        input.mimeType,
        input.bytes.length,
        digest,
        actor.id,
        JSON.stringify(snapshot(actor)),
      ]
    );
    if (input.paperOriginal) {
      await client.query(
        `UPDATE engineering_change_requests SET completion_method='PAPER',
          retained_form_path=$2, retained_form_checksum=$3,
          retained_form_size=$4, retained_form_generated_at=now()
         WHERE id=$1`,
        [ecrId, input.storedPath, digest, input.bytes.length]
      );
    }
    await event(
      client,
      { ...ecr, content_checksum: digest },
      input.paperOriginal ? 'PAPER_ORIGINAL_UPLOADED' : 'EVIDENCE_ATTACHED',
      actor,
      null,
      null,
      row
    );
    return row;
  });
}

export async function reconcileLegacyChanges(actor: EcrActor) {
  assertCapability(actor, 'engineering.ecr.admin');
  return transaction(async (client) => {
    const changes = (
      await client.query(
        `SELECT c.*, r.rd_project_id
           FROM design_control_changes c
           JOIN design_control_records r ON r.id=c.record_id
          WHERE NOT EXISTS (
            SELECT 1 FROM engineering_change_request_legacy_reconciliation q
             WHERE q.legacy_change_id=c.id
          )`
      )
    ).rows;
    let queued = 0;
    for (const change of changes) {
      const deterministic = Boolean(change.rd_project_id);
      await client.query(
        `INSERT INTO engineering_change_request_legacy_reconciliation (
          legacy_change_id, design_control_record_id, rd_project_id,
          reconciliation_status, reason, stable_source_key
        ) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (stable_source_key) DO NOTHING`,
        [
          change.id,
          change.record_id,
          change.rd_project_id,
          deterministic
            ? 'READY_FOR_EXPLICIT_IMPORT'
            : 'RECONCILIATION_REQUIRED',
          deterministic
            ? 'Authoritative R&D linkage exists; explicit admin import is still required.'
            : 'Legacy record cannot be mapped deterministically.',
          `design_control_changes:${change.id}`,
        ]
      );
      queued += 1;
    }
    return { queued, automaticallyApproved: 0, automaticallyCreated: 0 };
  });
}

export async function renderEcrPdf(ecrId: string, actor: EcrActor) {
  assertCapability(actor, 'engineering.ecr.view');
  const ecr = await getEcr(ecrId);
  if (!ecr.current_content_revision_id) {
    throw new EcrError(
      'ECR_NOT_SUBMITTED',
      'Submit the ECR before generating controlled evidence',
      409
    );
  }
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setCreator(`EPOCH ${DESIGN_CONTROL_FORM_RENDERER_VERSION}`);
  const evidenceDate = new Date(
    ecr.revision_created_at ?? ecr.submitted_at ?? ecr.created_at
  );
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
  page.drawText('CONTROLLED ENGINEERING CHANGE REQUEST', {
    x: 40,
    y,
    size: 15,
    font: bold,
  });
  y -= 28;
  line('ECR', ecr.ecr_number);
  line('R&D Design Project', ecr.rd_project_id);
  line('Design Control Record', ecr.design_control_record_id);
  line('Source Release', ecr.source_engineering_release_id);
  line('Source Baseline', ecr.source_engineering_release_baseline_id);
  line('Lifecycle', ecr.lifecycle_status);
  line('Title', ecr.title);
  line(
    'Content checksum',
    (ecr as any).content_checksum ?? ecr.current_content_revision_id
  );
  line(
    'Template',
    `${ecr.template_document_number_snapshot} Rev ${ecr.template_revision_snapshot}`
  );
  line('Template checksum', ecr.template_checksum_snapshot);
  for (const [key, value] of Object.entries(ecr.content ?? {}))
    line(key, stable(value));
  for (const item of ecr.affectedItems)
    line(
      `Affected ${item.source_type}`,
      `${item.description} — ${item.proposed_change}`
    );
  for (const review of ecr.reviews)
    line(
      `Review ${review.review_function}`,
      `${review.decision} by ${review.actor_display_name_snapshot}`
    );
  line(
    'Future ECN',
    ecr.lifecycle_status === 'APPROVED'
      ? 'Expected; not created or authorized by this ECR'
      : 'Not authorized'
  );
  for (const [index, pdfPage] of pdf.getPages().entries()) {
    pdfPage.drawText(
      `Page ${index + 1} of ${pdf.getPageCount()} | ECR ${ecr.ecr_number}`,
      { x: 40, y: 25, size: 8, font }
    );
  }
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (ecr.retained_form_checksum && ecr.retained_form_checksum !== digest) {
    throw new EcrError(
      'ECR_RETAINED_FORM_CHECKSUM_MISMATCH',
      'Regenerated ECR form does not match its retained immutable evidence.',
      409
    );
  }
  const directory = path.resolve(
    process.cwd(),
    'uploads',
    'engineering-change-requests'
  );
  await fs.mkdir(directory, { recursive: true });
  const storedPath = path.join(directory, `${ecr.ecr_number}-${digest}.pdf`);
  await fs
    .writeFile(storedPath, bytes, { flag: 'wx' })
    .catch(async (error: any) => {
      if (error?.code !== 'EEXIST') throw error;
    });
  await transaction(async (client) => {
    const locked = await queryOne(
      client,
      `SELECT * FROM engineering_change_requests WHERE id=$1 FOR UPDATE`,
      [ecrId]
    );
    await client.query(
      `UPDATE engineering_change_requests SET retained_form_path=$2,
        retained_form_checksum=$3, retained_form_size=$4,
        retained_form_generated_at=now() WHERE id=$1`,
      [ecrId, storedPath, digest, bytes.length]
    );
    await event(
      client,
      { ...locked, content_checksum: digest },
      'PDF_GENERATED',
      actor,
      null,
      null,
      { checksum: digest, size: bytes.length }
    );
  });
  return { bytes, checksum: digest, filename: `${ecr.ecr_number}.pdf` };
}

export function assertNoEcnExecution() {
  return {
    ecnCreationEnabled: false,
    revisionBReleaseAuthorizationEnabled: false,
  };
}
