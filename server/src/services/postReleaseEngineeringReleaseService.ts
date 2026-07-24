import { createHash } from 'crypto';
import type { PoolClient } from 'pg';

import { pgPool } from '../../db';
import { deriveEcnApprovalFunctions } from './engineeringChangeNoticeService';
import { deriveRequiredReviewFunctions } from './engineeringChangeRequestService';

export type ReleaseActor = {
  id: number;
  username: string;
  displayName: string;
  role: string;
  capabilities: string[];
};

export class ChangeReleaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

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
const digest = (value: unknown) =>
  createHash('sha256').update(stable(value)).digest('hex');
const actorSnapshot = (actor: ReleaseActor) => ({
  userId: actor.id,
  username: actor.username,
  displayName: actor.displayName,
  role: actor.role,
  capabilities: actor.capabilities,
});
const row = async (client: PoolClient, text: string, values: unknown[]) =>
  (await client.query(text, values)).rows[0] ?? null;

const nextHumanRevision = (sequence: number) => {
  let value = sequence;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

type ReadinessInput = {
  projectId: string;
  recordId: string;
  ecnId?: string | null;
  proposedRevision?: string | null;
};

export async function computeChangeReleaseReadiness(
  input: ReadinessInput,
  client?: PoolClient
) {
  const owned = !client;
  const connection = client ?? (await pgPool.connect());
  try {
    const record = await row(
      connection,
      `SELECT * FROM design_control_records
        WHERE id=$1 AND rd_project_id=$2 AND authority_status='authoritative'`,
      [input.recordId, input.projectId]
    );
    if (!record) {
      throw new ChangeReleaseError(
        'AUTHORITATIVE_DESIGN_CONTROL_RECORD_REQUIRED',
        'The authoritative R&D Design Control record is required',
        404
      );
    }
    const predecessor = await row(
      connection,
      `SELECT r.*,b.id AS baseline_id
         FROM engineering_releases r
         JOIN engineering_release_baselines b ON b.engineering_release_id=r.id
        WHERE r.rd_project_id=$1 AND r.design_control_record_id=$2
          AND r.release_status='RELEASED'
        ORDER BY COALESCE(r.release_sequence,1) DESC,r.released_at DESC NULLS LAST
        LIMIT 1`,
      [input.projectId, input.recordId]
    );
    const proposedSequence = predecessor
      ? Number(predecessor.release_sequence ?? 1) + 1
      : 1;
    const proposedRevision =
      input.proposedRevision?.trim() || nextHumanRevision(proposedSequence);
    const blockers: string[] = [];
    const warnings: string[] = [];
    let ecn: any = null;
    let ecr: any = null;
    let actions: any[] = [];
    let vv: any[] = [];
    let affectedItems: any[] = [];
    let stepImpacts: any[] = [];
    let generations: any[] = [];

    if (!predecessor) {
      if (input.ecnId)
        blockers.push('Revision A must not be authorized by an ECN');
    } else {
      if (!input.ecnId)
        blockers.push('Revision B+ requires an authorizing ECN');
      if (input.ecnId) {
        ecn = await row(
          connection,
          `SELECT e.*,r.content_checksum AS approved_checksum
             FROM engineering_change_orders e
             JOIN engineering_change_notice_revisions r
               ON r.id=e.current_content_revision_id
            WHERE e.id=$1 FOR SHARE`,
          [input.ecnId]
        );
        if (!ecn) blockers.push('Authorizing ECN was not found');
        if (ecn) {
          ecr = await row(
            connection,
            `SELECT e.*,r.content_checksum AS approved_checksum
               FROM engineering_change_requests e
               JOIN engineering_change_request_revisions r
                 ON r.id=e.current_content_revision_id
              WHERE e.id=$1 FOR SHARE`,
            [ecn.source_ecr_id]
          );
          if (!ecr || ecr.lifecycle_status !== 'APPROVED')
            blockers.push('The source ECR is not APPROVED');
          if (!['release_ready', 'implemented'].includes(ecn.status))
            blockers.push('The ECN is not RELEASE_READY or IMPLEMENTED');
          for (const [label, value] of [
            ['project', ecn.rd_project_id === input.projectId],
            [
              'Design Control record',
              ecn.design_control_record_id === input.recordId,
            ],
            [
              'predecessor release',
              ecn.source_engineering_release_id === predecessor.id,
            ],
            [
              'predecessor baseline',
              ecn.source_engineering_release_baseline_id ===
                predecessor.baseline_id,
            ],
          ] as const) {
            if (!value)
              blockers.push(`ECN ${label} does not match the proposed release`);
          }
          if (
            ecr &&
            (ecr.rd_project_id !== input.projectId ||
              ecr.design_control_record_id !== input.recordId ||
              ecr.source_engineering_release_id !== predecessor.id ||
              ecr.source_engineering_release_baseline_id !==
                predecessor.baseline_id)
          )
            blockers.push(
              'ECR project, record, release, or baseline identity is inconsistent'
            );
          if (ecr && ecn.source_ecr_checksum !== ecr.approved_checksum)
            blockers.push(
              'ECN is not bound to the immutable approved ECR checksum'
            );
          if (ecr) {
            const reviews = (
              await connection.query(
                `SELECT review_function,decision,status,content_checksum
                   FROM engineering_change_request_reviews
                  WHERE ecr_id=$1 AND ecr_revision_id=$2`,
                [ecr.id, ecr.current_content_revision_id]
              )
            ).rows;
            const requiredReviews = deriveRequiredReviewFunctions(
              ecr.content ?? {}
            );
            if (
              requiredReviews.some(
                (required) =>
                  !reviews.some(
                    (review) =>
                      review.review_function === required &&
                      review.decision === 'APPROVED' &&
                      review.status === 'VALID' &&
                      review.content_checksum === ecr.approved_checksum
                  )
              )
            )
              blockers.push(
                'All required ECR impact reviews must be current and approved'
              );
            const approvals = (
              await connection.query(
                `SELECT approval_function,decision,status,content_checksum
                   FROM engineering_change_notice_approvals
                  WHERE ecn_id=$1 AND ecn_revision_id=$2`,
                [ecn.id, ecn.current_content_revision_id]
              )
            ).rows;
            const requiredApprovals = deriveEcnApprovalFunctions(
              ecn.canonical_content ?? {}
            );
            if (
              requiredApprovals.some(
                (required) =>
                  !approvals.some(
                    (approval) =>
                      approval.approval_function === required &&
                      approval.decision === 'APPROVED' &&
                      approval.status === 'VALID' &&
                      approval.content_checksum === ecn.approved_checksum
                  )
              )
            )
              blockers.push(
                'All required ECN approvals must be current and checksum-bound'
              );
          }

          [actions, vv, affectedItems, stepImpacts, generations] =
            await Promise.all([
              connection
                .query(
                  `SELECT * FROM engineering_change_implementation_actions WHERE ecn_id=$1`,
                  [ecn.id]
                )
                .then((result) => result.rows),
              connection
                .query(
                  `SELECT * FROM engineering_change_verification_records WHERE ecn_id=$1`,
                  [ecn.id]
                )
                .then((result) => result.rows),
              connection
                .query(
                  `SELECT * FROM engineering_change_notice_affected_items WHERE ecn_id=$1`,
                  [ecn.id]
                )
                .then((result) => result.rows),
              connection
                .query(
                  `SELECT * FROM engineering_change_step_impacts WHERE ecn_id=$1 ORDER BY step_key`,
                  [ecn.id]
                )
                .then((result) => result.rows),
              connection
                .query(
                  `SELECT g.*,s.step_key,
                     EXISTS(SELECT 1 FROM design_control_step_approvals a
                       WHERE a.design_control_step_id=g.design_control_step_id
                         AND a.step_content_version_id=g.content_version_id
                         AND a.status='VALID' AND a.decision='APPROVED') AS has_current_approval,
                     EXISTS(SELECT 1 FROM project_form_instances p
                       WHERE p.id=g.project_form_instance_id
                         AND p.lifecycle_status='APPROVED'
                         AND p.retained_pdf_checksum IS NOT NULL) AS has_approved_form
                   FROM design_control_step_generations g
                   JOIN design_control_steps s ON s.id=g.design_control_step_id
                  WHERE g.authorizing_ecn_id=$1`,
                  [ecn.id]
                )
                .then((result) => result.rows),
            ]);
          if (actions.some((item) => item.status !== 'ACCEPTED'))
            blockers.push(
              'Every ECN implementation action must be COMPLETE and ACCEPTED'
            );
          if (
            vv.length === 0 ||
            vv.some((item) => item.result_status !== 'PASS')
          )
            blockers.push(
              'Required V&V must pass with independent review where required'
            );
          if (
            affectedItems.some(
              (item) =>
                !item.proposed_revision &&
                !item.resulting_controlled_revision_id &&
                !['NO_CHANGE', 'NOT_APPLICABLE'].includes(
                  String(item.implementation_status)
                )
            )
          )
            blockers.push(
              'Every affected item needs a resulting revision or approved no-change disposition'
            );
          if (!ecn.effectivity_method)
            blockers.push(
              'A valid ECN effectivity method and snapshot are required'
            );
          if (!ecn.retained_form_checksum)
            blockers.push('Retained controlled ECN evidence is required');
          const expected = new Set(
            stepImpacts
              .filter((impact) => impact.reopen_required)
              .map((impact) => String(impact.step_key))
          );
          for (const stepKey of expected) {
            const generation = generations.find(
              (item) => String(item.step_key) === stepKey
            );
            if (!generation)
              blockers.push(`Affected step ${stepKey} has not been reopened`);
            else if (
              generation.generation_status !== 'APPROVED' ||
              !generation.has_current_approval ||
              (!generation.has_approved_form &&
                !(
                  generation.form_revision_not_required &&
                  generation.form_reuse_justification &&
                  generation.form_reuse_approval_id
                ))
            )
              blockers.push(`Affected step ${stepKey} is not fully reapproved`);
          }
          const step12 = await row(
            connection,
            `SELECT g.*,EXISTS(SELECT 1 FROM design_control_step_approvals a
               WHERE a.design_control_step_id=g.design_control_step_id
                 AND a.step_content_version_id=g.content_version_id
                 AND a.status='VALID' AND a.decision='APPROVED') AS approved
             FROM design_control_step_generations g
             JOIN design_control_steps s ON s.id=g.design_control_step_id
            WHERE g.design_control_record_id=$1 AND s.step_key='12'
            ORDER BY g.generation_number DESC LIMIT 1`,
            [input.recordId]
          );
          if (
            !step12 ||
            step12.generation_status !== 'APPROVED' ||
            !step12.approved
          )
            blockers.push(
              'Step 12 Engineering Release Gate generation must be approved'
            );
        }
      }
    }
    const duplicateRevision = await row(
      connection,
      `SELECT id FROM engineering_releases
        WHERE rd_project_id=$1 AND design_control_record_id=$2
          AND (release_revision=$3 OR release_sequence=$4)`,
      [input.projectId, input.recordId, proposedRevision, proposedSequence]
    );
    if (duplicateRevision)
      blockers.push('The proposed revision or sequence is already used');
    if (predecessor && predecessor.release_sequence == null)
      warnings.push(
        'Legacy predecessor is treated as sequence 1 without rewriting history'
      );

    return {
      ready: blockers.length === 0,
      blockingIssues: blockers,
      warnings,
      releaseType: predecessor ? 'CHANGE_RELEASE' : 'INITIAL',
      predecessorStatus: predecessor
        ? { ready: true, release: predecessor }
        : { ready: true, release: null },
      ecrStatus: ecr
        ? { ready: ecr.lifecycle_status === 'APPROVED', ecr }
        : { ready: !predecessor, ecr: null },
      ecnStatus: ecn
        ? { ready: ['release_ready', 'implemented'].includes(ecn.status), ecn }
        : { ready: !predecessor, ecn: null },
      reopenedStepReadiness: {
        ready: !blockers.some((x) => x.includes('step ')),
        generations,
      },
      formReadiness: { ready: !blockers.some((x) => x.includes('form')) },
      approvalReadiness: {
        ready: !blockers.some((x) => x.includes('approved')),
      },
      vvReadiness: {
        ready: !blockers.some((x) => x.includes('V&V')),
        records: vv,
      },
      implementationActionReadiness: {
        ready: !blockers.some((x) => x.includes('action')),
        actions,
      },
      affectedItemReconciliation: {
        ready: !blockers.some((x) => x.includes('affected item')),
        items: affectedItems,
      },
      manufacturingEvidenceReadiness: {
        ready: true,
        mode: 'REFERENCED_BASELINE_EVIDENCE_ONLY',
      },
      proposedRevision,
      proposedSequence,
      effectivity: ecn?.effectivity_snapshot ?? {},
    };
  } finally {
    if (owned) connection.release();
  }
}

export async function reopenAffectedStepGenerations(
  ecnId: string,
  actor: ReleaseActor
) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const ecn = await row(
      client,
      `SELECT * FROM engineering_change_orders WHERE id=$1 FOR UPDATE`,
      [ecnId]
    );
    if (
      !ecn ||
      ![
        'approved',
        'in_implementation',
        'verification_validation',
        'release_ready',
        'implemented',
      ].includes(ecn.status)
    )
      throw new ChangeReleaseError(
        'ECN_NOT_APPROVED',
        'An approved ECN is required',
        409
      );
    const impacts = (
      await client.query(
        `SELECT i.*,s.id AS step_id
           FROM engineering_change_step_impacts i
           JOIN design_control_steps s
             ON s.record_id=$2 AND s.step_key=i.step_key
          WHERE i.ecn_id=$1 AND i.reopen_required=true`,
        [ecnId, ecn.design_control_record_id]
      )
    ).rows;
    for (const impact of impacts) {
      const prior = await row(
        client,
        `SELECT * FROM design_control_step_generations
          WHERE design_control_step_id=$1 ORDER BY generation_number DESC LIMIT 1`,
        [impact.step_id]
      );
      const generation = await row(
        client,
        `INSERT INTO design_control_step_generations (
           design_control_step_id,design_control_record_id,rd_project_id,
           generation_number,predecessor_generation_id,authorizing_ecr_id,
           authorizing_ecn_id,reopened_by_user_id,reopened_by_snapshot,immutable_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
         ON CONFLICT (design_control_step_id,generation_number) DO UPDATE
           SET design_control_step_id=EXCLUDED.design_control_step_id
         RETURNING *`,
        [
          impact.step_id,
          ecn.design_control_record_id,
          ecn.rd_project_id,
          Number(prior?.generation_number ?? 0) + 1,
          prior?.id ?? null,
          ecn.source_ecr_id,
          ecn.id,
          actor.id,
          JSON.stringify(actorSnapshot(actor)),
          JSON.stringify({ prior, impact }),
        ]
      );
      await client.query(
        `UPDATE design_control_step_approvals SET status='INVALIDATED',
           invalidated_at=now(),invalidated_reason=$2
         WHERE design_control_step_id=$1 AND status='VALID'`,
        [impact.step_id, `Reopened by ECN ${ecn.ecn_number}`]
      );
      await client.query(
        `UPDATE engineering_change_step_impacts
            SET reopened_step_generation_id=$2,reopened_at=now()
          WHERE id=$1`,
        [impact.id, generation.id]
      );
      await client.query(
        `INSERT INTO engineering_change_notice_events (
           ecn_id,event_type,actor_user_id,actor_snapshot,ecr_id_snapshot,
           project_id_snapshot,design_control_record_id_snapshot,before_values,after_values
         ) VALUES ($1,'DESIGN_CONTROL_STEP_REOPENED',$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [
          ecn.id,
          actor.id,
          JSON.stringify(actorSnapshot(actor)),
          ecn.source_ecr_id,
          ecn.rd_project_id,
          ecn.design_control_record_id,
          JSON.stringify(prior),
          JSON.stringify(generation),
        ]
      );
    }
    await client.query('COMMIT');
    return { reopened: impacts.length };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createChangeEngineeringRelease(
  input: ReadinessInput & {
    ecnId: string;
    idempotencyKey: string;
    reason: string;
  },
  actor: ReleaseActor
) {
  if (!input.idempotencyKey?.trim())
    throw new ChangeReleaseError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required'
    );
  if (!input.reason?.trim())
    throw new ChangeReleaseError(
      'RELEASE_REASON_REQUIRED',
      'A release reason is required'
    );
  const idempotencyHash = digest(input.idempotencyKey);
  const fingerprint = digest({
    projectId: input.projectId,
    recordId: input.recordId,
    ecnId: input.ecnId,
    proposedRevision: input.proposedRevision ?? null,
  });
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))`,
      [input.projectId, input.recordId]
    );
    const retry = await row(
      client,
      `SELECT * FROM engineering_releases
        WHERE rd_project_id=$1 AND idempotency_fingerprint=$2`,
      [input.projectId, idempotencyHash]
    );
    if (retry) {
      if (retry.metadata?.requestFingerprint !== fingerprint)
        throw new ChangeReleaseError(
          'IDEMPOTENCY_KEY_REUSE_CONFLICT',
          'The idempotency key was already used for a different release request',
          409
        );
      await client.query('COMMIT');
      return { release: retry, idempotentReplay: true };
    }
    const readiness = await computeChangeReleaseReadiness(input, client);
    if (!readiness.ready) {
      await client.query(
        `INSERT INTO engineering_release_attempts (
           rd_project_id,design_control_record_id,ecn_id,actor_user_id,actor_snapshot,
           idempotency_hash,request_fingerprint,outcome,blocking_issues,reason
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'BLOCKED',$8::jsonb,$9)`,
        [
          input.projectId,
          input.recordId,
          input.ecnId,
          actor.id,
          JSON.stringify(actorSnapshot(actor)),
          idempotencyHash,
          fingerprint,
          JSON.stringify(readiness.blockingIssues),
          input.reason,
        ]
      );
      throw new ChangeReleaseError(
        'CHANGE_RELEASE_NOT_READY',
        'The change release is blocked',
        409,
        { readiness }
      );
    }
    const predecessor = readiness.predecessorStatus.release;
    await client.query(
      `SELECT id FROM engineering_releases WHERE id=$1 FOR UPDATE`,
      [predecessor.id]
    );
    await client.query(
      `SELECT id FROM engineering_release_baselines WHERE id=$1 FOR UPDATE`,
      [predecessor.baseline_id]
    );
    const ecn = readiness.ecnStatus.ecn;
    const ecr = readiness.ecrStatus.ecr;
    const conflictingRole = await row(
      client,
      `SELECT
         ($2 = q.created_by_user_id) AS authored_ecr,
         ($2 = e.created_by_user_id) AS authored_ecn,
         EXISTS(SELECT 1 FROM engineering_change_verification_records v
           WHERE v.ecn_id=e.id AND v.performer_user_id=$2) AS performed_vv,
         EXISTS(SELECT 1 FROM engineering_change_notice_approvals a
           WHERE a.ecn_id=e.id AND a.actor_user_id=$2
             AND a.approval_function IN ('QUALITY','REGULATORY_CONTRACTS')
             AND a.status='VALID') AS quality_approved
       FROM engineering_change_orders e
       JOIN engineering_change_requests q ON q.id=e.source_ecr_id
       WHERE e.id=$1`,
      [ecn.id, actor.id]
    );
    if (
      conflictingRole &&
      Object.values(conflictingRole).some((value) => value === true)
    )
      throw new ChangeReleaseError(
        'ENGINEERING_RELEASE_SEGREGATION_REQUIRED',
        'The release actor must be independent from ECR/ECN authorship, V&V performance, and Quality/Regulatory approval',
        409
      );
    const evidence = {
      readiness,
      predecessor: {
        releaseId: predecessor.id,
        baselineId: predecessor.baseline_id,
      },
      ecr: {
        id: ecr.id,
        revisionId: ecr.current_content_revision_id,
        checksum: ecr.approved_checksum,
      },
      ecn: {
        id: ecn.id,
        revisionId: ecn.current_content_revision_id,
        checksum: ecn.approved_checksum,
      },
      capturedAt: new Date().toISOString(),
    };
    const checksum = digest(evidence);
    const release = await row(
      client,
      `INSERT INTO engineering_releases (
         rd_project_id,design_control_record_id,release_number,release_revision,
         release_status,product_name,effective_date,released_by,released_at,
         readiness_snapshot,source_evidence_snapshot,approval_snapshot,metadata,
         predecessor_engineering_release_id,predecessor_baseline_id,
         authorizing_ecr_id,authorizing_ecr_revision_id,authorizing_ecr_checksum,
         authorizing_ecn_id,authorizing_ecn_revision_id,authorizing_ecn_checksum,
         release_sequence,release_type,release_reason,effectivity_snapshot,
         released_by_user_id,released_by_snapshot,release_checksum,
         idempotency_fingerprint,evidence_manifest
       ) VALUES ($1,$2,$3,$4,'RELEASED',$5,CURRENT_DATE,$6,now(),
         $7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,
         $18,$19,'CHANGE_RELEASE',$20,$21::jsonb,$22,$23::jsonb,$24,$25,$26::jsonb)
       RETURNING *`,
      [
        input.projectId,
        input.recordId,
        `ER-${input.projectId}-${readiness.proposedSequence}`,
        readiness.proposedRevision,
        predecessor.product_name,
        actor.displayName,
        JSON.stringify(readiness),
        JSON.stringify(evidence),
        JSON.stringify({ authenticated: true, actor: actorSnapshot(actor) }),
        JSON.stringify({ requestFingerprint: fingerprint }),
        predecessor.id,
        predecessor.baseline_id,
        ecr.id,
        ecr.current_content_revision_id,
        ecr.approved_checksum,
        ecn.id,
        ecn.current_content_revision_id,
        ecn.approved_checksum,
        readiness.proposedSequence,
        input.reason,
        JSON.stringify(readiness.effectivity),
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        checksum,
        idempotencyHash,
        JSON.stringify(evidence),
      ]
    );
    const baseline = await row(
      client,
      `INSERT INTO engineering_release_baselines (
         engineering_release_id,rd_project_id,design_control_record_id,
         baseline_status,baseline_revision,locked_at,locked_by,metadata
       ) VALUES ($1,$2,$3,'LOCKED',$4,now(),$5,$6::jsonb) RETURNING *`,
      [
        release.id,
        input.projectId,
        input.recordId,
        readiness.proposedRevision,
        actor.displayName,
        JSON.stringify(evidence),
      ]
    );
    await client.query(
      `INSERT INTO engineering_release_approvals (
         engineering_release_id,approval_role,approved_by,approved_at,
         approval_status,metadata
       ) VALUES ($1,'RELEASE_AUTHORITY',$2,now(),'APPROVED',$3::jsonb)`,
      [
        release.id,
        actor.displayName,
        JSON.stringify({
          actor: actorSnapshot(actor),
          signatureMeaning:
            'I authorize this ECN-controlled Engineering Release and its immutable baseline.',
          contentChecksum: checksum,
        }),
      ]
    );
    const baselineEvidence = [
      [
        'predecessor_release',
        predecessor.id,
        predecessor.release_revision,
        predecessor.release_checksum,
        predecessor,
      ],
      [
        'authorizing_ecr',
        ecr.id,
        ecr.current_content_revision_id,
        ecr.approved_checksum,
        ecr,
      ],
      [
        'authorizing_ecn',
        ecn.id,
        ecn.current_content_revision_id,
        ecn.approved_checksum,
        ecn,
      ],
      [
        'affected_steps',
        input.recordId,
        String(readiness.proposedSequence),
        digest(readiness.reopenedStepReadiness),
        readiness.reopenedStepReadiness,
      ],
      [
        'project_forms_approvals',
        input.recordId,
        String(readiness.proposedSequence),
        digest({
          forms: readiness.formReadiness,
          approvals: readiness.approvalReadiness,
        }),
        {
          forms: readiness.formReadiness,
          approvals: readiness.approvalReadiness,
        },
      ],
      [
        'ecn_actions_vv_items',
        ecn.id,
        ecn.current_content_revision_id,
        digest({
          actions: readiness.implementationActionReadiness,
          vv: readiness.vvReadiness,
          items: readiness.affectedItemReconciliation,
        }),
        {
          actions: readiness.implementationActionReadiness,
          vv: readiness.vvReadiness,
          items: readiness.affectedItemReconciliation,
        },
      ],
      [
        'effectivity',
        ecn.id,
        ecn.current_content_revision_id,
        digest(readiness.effectivity),
        readiness.effectivity,
      ],
      [
        'manufacturing_evidence_references',
        input.recordId,
        null,
        digest(readiness.manufacturingEvidenceReadiness),
        readiness.manufacturingEvidenceReadiness,
      ],
    ];
    for (const item of baselineEvidence) {
      await client.query(
        `INSERT INTO engineering_release_baseline_items (
           engineering_release_id,baseline_id,baseline_category,source_table,
           source_module,source_record_id,source_revision,source_status,captured_at,
           immutable_snapshot,source_checksum,immutable_snapshot_id,metadata
         ) VALUES ($1,$2,$3,NULL,'Phase 8 Change Release',$4,$5,'CONTROLLED',now(),
           $6::jsonb,$7,$8,$6::jsonb)`,
        [
          release.id,
          baseline.id,
          item[0],
          item[1],
          item[2],
          JSON.stringify(item[4]),
          item[3],
          `sha256:${item[3]}`,
        ]
      );
      await client.query(
        `INSERT INTO engineering_release_change_evidence (
           engineering_release_id,evidence_type,source_record_id,source_revision_id,
           source_checksum,immutable_snapshot
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          release.id,
          item[0],
          item[1],
          item[2],
          item[3],
          JSON.stringify(item[4]),
        ]
      );
    }
    const engineeringPackage = await row(
      client,
      `INSERT INTO engineering_packages (
         engineering_release_id,engineering_baseline_id,rd_project_id,
         design_control_record_id,package_number,package_revision,package_status,
         product_name,locked_at,locked_by,package_snapshot,completeness_snapshot,
         contents_summary,metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,'LOCKED',$7,now(),$8,$9::jsonb,$10::jsonb,
         $11::jsonb,$12::jsonb)
       ON CONFLICT (engineering_release_id) DO NOTHING RETURNING *`,
      [
        release.id,
        baseline.id,
        input.projectId,
        input.recordId,
        `TDP-${release.release_number.replace(/[^A-Za-z0-9-]+/g, '-')}`,
        release.release_revision,
        release.product_name,
        actor.displayName,
        JSON.stringify({ releaseId: release.id, baselineId: baseline.id }),
        JSON.stringify({ phase8AuthoritativeChangeRelease: true }),
        JSON.stringify({
          baselineEvidence: baselineEvidence.map((item) => item[0]),
        }),
        JSON.stringify({
          source: 'phase8-engineering-release-compatibility',
          fullEngineeringPackageExpansion: false,
          createsManufacturedInventoryItem: false,
        }),
      ]
    );
    if (engineeringPackage) {
      await client.query(
        `INSERT INTO engineering_package_items (
           engineering_package_id,engineering_release_id,engineering_baseline_item_id,
           package_category,source_table,source_module,source_record_id,
           source_revision,source_status,reference_snapshot,source_checksum,metadata
         )
         SELECT $1,i.engineering_release_id,i.id,i.baseline_category,i.source_table,
                i.source_module,i.source_record_id,i.source_revision,i.source_status,
                i.immutable_snapshot,i.source_checksum,
                jsonb_build_object('compatibilityCapture',true)
           FROM engineering_release_baseline_items i WHERE i.baseline_id=$2`,
        [engineeringPackage.id, baseline.id]
      );
    }
    await client.query(
      `UPDATE engineering_change_orders
          SET resulting_engineering_release_id=$2,status='closed',updated_at=now()
        WHERE id=$1 AND resulting_engineering_release_id IS NULL
          AND status IN ('release_ready','implemented')`,
      [ecn.id, release.id]
    );
    await client.query(
      `UPDATE rd_projects SET engineering_status='RELEASED' WHERE id=$1`,
      [input.projectId]
    );
    await client.query(
      `UPDATE design_control_records
          SET status='released',updated_at=now() WHERE id=$1`,
      [input.recordId]
    );
    await client.query(
      `INSERT INTO engineering_release_attempts (
         rd_project_id,design_control_record_id,ecn_id,actor_user_id,actor_snapshot,
         idempotency_hash,request_fingerprint,outcome,resulting_release_id,reason
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'CREATED',$8,$9)`,
      [
        input.projectId,
        input.recordId,
        ecn.id,
        actor.id,
        JSON.stringify(actorSnapshot(actor)),
        idempotencyHash,
        fingerprint,
        release.id,
        input.reason,
      ]
    );
    await client.query('COMMIT');
    return { release, baseline, idempotentReplay: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await pgPool
      .query(
        `INSERT INTO engineering_release_attempts (
           rd_project_id,design_control_record_id,ecn_id,actor_user_id,actor_snapshot,
           idempotency_hash,request_fingerprint,outcome,blocking_issues,reason
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'ROLLED_BACK',$8::jsonb,$9)`,
        [
          input.projectId,
          input.recordId,
          input.ecnId,
          actor.id,
          JSON.stringify(actorSnapshot(actor)),
          idempotencyHash,
          fingerprint,
          JSON.stringify(
            error instanceof ChangeReleaseError
              ? [error.code, error.message]
              : ['INTERNAL_RELEASE_FAILURE']
          ),
          input.reason,
        ]
      )
      .catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getChangeRelease(releaseId: string) {
  const [release, baseline, authorization] = await Promise.all([
    pgPool.query(`SELECT * FROM engineering_releases WHERE id=$1`, [releaseId]),
    pgPool.query(
      `SELECT b.*,json_agg(i ORDER BY i.created_at) AS items
         FROM engineering_release_baselines b
         LEFT JOIN engineering_release_baseline_items i ON i.baseline_id=b.id
        WHERE b.engineering_release_id=$1 GROUP BY b.id`,
      [releaseId]
    ),
    pgPool.query(
      `SELECT predecessor_engineering_release_id,predecessor_baseline_id,
              authorizing_ecr_id,authorizing_ecr_revision_id,authorizing_ecr_checksum,
              authorizing_ecn_id,authorizing_ecn_revision_id,authorizing_ecn_checksum,
              release_sequence,release_type,release_checksum,effectivity_snapshot
         FROM engineering_releases WHERE id=$1`,
      [releaseId]
    ),
  ]);
  return {
    release: release.rows[0] ?? null,
    baseline: baseline.rows[0] ?? null,
    changeAuthorization: authorization.rows[0] ?? null,
  };
}
