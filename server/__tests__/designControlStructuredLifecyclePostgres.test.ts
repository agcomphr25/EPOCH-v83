import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addProjectAssignment,
  activateProjectAssignmentPolicy,
  closeReviewAction,
  createReviewAction,
  createStructuredLink,
  createStructuredRecord,
  decideStructuredRecord,
  getStructuredHistory,
  listProjectAssignments,
  revokeProjectAssignment,
  reviseStructuredRecord,
  saveStructuredDraft,
  submitStructuredRecord,
  verifyRdProjectIdentity,
  type StructuredActor,
} from '../src/services/designControlStructuredLifecycleService';
import {
  calculateDesignControlTraceability,
  calculateFinalDesignReviewReadiness,
  createFinalDesignReviewSnapshot,
} from '../src/services/designControlTraceabilityService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const parsed = new URL(databaseUrl);
if (
  process.env.DESIGN_CONTROL_STRUCTURED_CERTIFICATION !== 'isolated_test' ||
  parsed.hostname !== '127.0.0.1' ||
  parsed.pathname.slice(1) !== 'epoch_p2_v2_certification'
) {
  throw new Error(
    'Disposable Design Control structured certification boundary rejected'
  );
}

const pool = new Pool({ connectionString: databaseUrl });
const suffix = randomUUID().slice(0, 8);
const projectA = `dc-structured-a-${suffix}`;
const projectB = `dc-structured-b-${suffix}`;
const recordA = randomUUID();
const recordB = randomUUID();
const configurationA = randomUUID();
const configurationB = randomUUID();
const revisionA = randomUUID();
const designOutputA = randomUUID();
let authorityUserId = 0;
let qualityUserId = 0;
let auditorUserId = 0;
let overrideAdminUserId = 0;
let manufacturingUserId = 0;
let requirementId = '';
let requirementVersionId = '';
let verificationId = '';

const actor = (id: number, role = 'EMPLOYEE'): StructuredActor => ({
  id,
  displayName: `Synthetic user ${id}`,
  role,
  capabilities: [
    'design.control.view',
    'design.control.edit',
    'design.control.submit',
    'design.control.approve',
  ],
});

const completeRequirement = {
  requirementNumber: `REQ-${suffix}`,
  category: 'Functional',
  source: 'Synthetic certification protocol',
  sourceReference: 'DC-P2-STRUCTURED-1',
  requirementStatement:
    'The synthetic configuration shall retain authoritative traceability.',
  acceptanceCriterion: 'All required persisted links resolve within Project A.',
  verificationMethod: 'Inspection',
  validationRequired: false,
  criticality: 'CRITICAL',
  owner: 'Synthetic Design Authority',
  clarification: '',
  resolution: '',
};

describe('Design Control structured lifecycle PostgreSQL certification', () => {
  beforeAll(async () => {
    const users = await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, 'synthetic-not-a-secret', 'ADMIN'),
              ($2, 'synthetic-not-a-secret', 'EMPLOYEE'),
              ($3, 'synthetic-not-a-secret', 'EMPLOYEE'),
              ($4, 'synthetic-not-a-secret', 'ADMIN'),
              ($5, 'synthetic-not-a-secret', 'EMPLOYEE')
       RETURNING id`,
      [
        `dc-authority-${suffix}`,
        `dc-quality-${suffix}`,
        `dc-auditor-${suffix}`,
        `dc-override-admin-${suffix}`,
        `dc-manufacturing-${suffix}`,
      ]
    );
    [
      authorityUserId,
      qualityUserId,
      auditorUserId,
      overrideAdminUserId,
      manufacturingUserId,
    ] = users.rows.map((row) => row.id);
    await pool.query(
      `INSERT INTO rd_projects (id, project_name) VALUES ($1, 'Synthetic Design A'), ($2, 'Synthetic Design B')`,
      [projectA, projectB]
    );
    await pool.query(
      `INSERT INTO design_control_records
         (id, record_number, title, status, authority_status, rd_project_id)
       VALUES ($1, $2, 'Synthetic structured A', 'draft', 'authoritative', $3),
              ($4, $5, 'Synthetic structured B', 'draft', 'authoritative', $6)`,
      [recordA, `DC-A-${suffix}`, projectA, recordB, `DC-B-${suffix}`, projectB]
    );
    await pool.query(
      `INSERT INTO design_project_configuration_items
         (id, rd_project_id, configuration_item_number, part_number, title, item_type, created_by_snapshot)
       VALUES ($1, $2, 'CI-A', 'PART-A', 'Synthetic A item', 'MANUFACTURED_PART', '{}'::jsonb),
              ($3, $4, 'CI-B', 'PART-B', 'Synthetic B item', 'MANUFACTURED_PART', '{}'::jsonb)`,
      [configurationA, projectA, configurationB, projectB]
    );
    await pool.query(
      `INSERT INTO design_project_part_revisions
         (id, configuration_item_id, revision_identifier, revision_sequence, change_summary, created_by_snapshot)
       VALUES ($1, $2, 'A', 1, 'Synthetic initial revision', '{}'::jsonb)`,
      [revisionA, configurationA]
    );
    await pool.query(
      `INSERT INTO design_control_steps
         (id, record_id, step_key, title, status, rd_project_id)
       VALUES ($1, $2, '6', 'Synthetic Design Output', 'approved', $3)`,
      [designOutputA, recordA, projectA]
    );
  });

  afterAll(async () => {
    // Evidence is deliberately immutable. The PostgreSQL 16.4 service database
    // is destroyed with the CI job, so certification records are not deleted.
    await pool.end();
  });

  it('keeps legacy projects unenforced until explicit prospective activation', async () => {
    const before = await pool.query(
      'SELECT count(*)::int AS count FROM design_control_project_access_policies'
    );
    const draft = await createStructuredRecord({
      recordId: recordB,
      type: 'REQUIREMENT',
      content: { requirementNumber: `LEGACY-${suffix}` },
      changeReason: 'Legacy-compatible draft',
      actor: actor(qualityUserId),
    });
    expect(draft.version.lifecycleStatus).toBe('DRAFT');
    const after = await pool.query(
      'SELECT count(*)::int AS count FROM design_control_project_access_policies'
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it('activates policy and initial Design Authority assignment atomically', async () => {
    await activateProjectAssignmentPolicy({
      recordId: recordA,
      actor: actor(authorityUserId, 'ADMIN'),
      reason: 'Synthetic prospective certification',
    });
    const team = await listProjectAssignments(
      recordA,
      actor(authorityUserId, 'ADMIN')
    );
    expect(team.activated).toBe(true);
    expect(team.assignments).toEqual([
      expect.objectContaining({
        userId: authorityUserId,
        projectRole: 'DESIGN_AUTHORITY',
        status: 'ACTIVE',
      }),
    ]);
    expect(team.history[0]).toEqual(
      expect.objectContaining({ eventType: 'ASSIGNED' })
    );
  });

  it('rejects unassigned and read-only mutation while permitting assigned Quality approval', async () => {
    await expect(
      createStructuredRecord({
        recordId: recordA,
        type: 'REQUIREMENT',
        content: {},
        changeReason: 'Unauthorized probe',
        actor: actor(qualityUserId),
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ASSIGNMENT_REQUIRED' });
    await addProjectAssignment({
      recordId: recordA,
      userId: qualityUserId,
      projectRole: 'QUALITY',
      responsibilityClass: 'QUALITY',
      capabilities: [],
      reason: 'Quality approval certification',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await addProjectAssignment({
      recordId: recordA,
      userId: manufacturingUserId,
      projectRole: 'MANUFACTURING',
      responsibilityClass: 'PRODUCTION',
      capabilities: [],
      reason: 'Manufacturing visibility certification',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await addProjectAssignment({
      recordId: recordA,
      userId: auditorUserId,
      projectRole: 'AUDITOR',
      responsibilityClass: 'AUDIT',
      capabilities: [],
      reason: 'Read-only certification',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await expect(
      createStructuredRecord({
        recordId: recordA,
        type: 'RISK',
        content: {},
        changeReason: 'Read-only probe',
        actor: actor(auditorUserId),
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ASSIGNMENT_READ_ONLY' });
    await expect(
      createStructuredRecord({
        recordId: recordA,
        type: 'RISK',
        content: {},
        changeReason: 'Wrong-role mutation probe',
        actor: actor(manufacturingUserId),
      })
    ).rejects.toMatchObject({ code: 'PROJECT_ASSIGNMENT_ROLE_REQUIRED' });
  });

  it('requires and immutably logs an explicit administrator override', async () => {
    await expect(
      createStructuredRecord({
        recordId: recordA,
        type: 'RISK',
        content: {},
        changeReason: 'Unreasoned override probe',
        actor: actor(overrideAdminUserId, 'ADMIN'),
      })
    ).rejects.toMatchObject({ code: 'ADMIN_OVERRIDE_REASON_REQUIRED' });
    await createStructuredRecord({
      recordId: recordA,
      type: 'RISK',
      content: { riskNumber: `OVERRIDE-RISK-${suffix}` },
      changeReason: 'Audited override probe',
      actor: {
        ...actor(overrideAdminUserId, 'ADMIN'),
        adminOverrideReason: 'Synthetic emergency administrator certification',
      },
    });
    const event = await pool.query(
      `SELECT event_type, actor_user_id, reason
       FROM design_control_project_assignment_events
       WHERE rd_project_id = $1 AND event_type = 'ADMIN_OVERRIDE'
       ORDER BY occurred_at DESC LIMIT 1`,
      [projectA]
    );
    expect(event.rows[0]).toEqual(
      expect.objectContaining({
        event_type: 'ADMIN_OVERRIDE',
        actor_user_id: overrideAdminUserId,
        reason: 'Synthetic emergency administrator certification',
      })
    );
    await expect(
      pool.query(
        `UPDATE design_control_project_assignment_events
         SET reason = 'tampered' WHERE id = (
           SELECT id FROM design_control_project_assignment_events
           WHERE rd_project_id = $1 AND event_type = 'ADMIN_OVERRIDE'
           ORDER BY occurred_at DESC LIMIT 1
         )`,
        [projectA]
      )
    ).rejects.toThrow(/immutable/i);
  });

  it('fails incomplete submission atomically and preserves reason-gated reject and return history', async () => {
    const created = await createStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      content: { requirementNumber: `DECISION-${suffix}` },
      changeReason: 'Decision lifecycle draft',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await expect(
      submitStructuredRecord({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: created.record.id,
        expectedVersion: 1,
        actor: actor(authorityUserId, 'ADMIN'),
      })
    ).rejects.toMatchObject({ code: 'STRUCTURED_RECORD_INCOMPLETE' });
    const afterFailedSubmit = await getStructuredHistory(
      recordA,
      'REQUIREMENT',
      created.record.id,
      actor(authorityUserId, 'ADMIN')
    );
    expect(afterFailedSubmit.versions).toEqual([
      expect.objectContaining({ version: 1, lifecycleStatus: 'DRAFT' }),
    ]);
    await saveStructuredDraft({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      expectedVersion: 1,
      content: {
        ...completeRequirement,
        requirementNumber: `DECISION-${suffix}`,
      },
      changeReason: 'Complete decision lifecycle evidence',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    const firstSubmission = await submitStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      expectedVersion: 2,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await expect(
      decideStructuredRecord({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: created.record.id,
        versionId: firstSubmission.id,
        decision: 'REJECTED',
        actor: actor(qualityUserId),
      })
    ).rejects.toMatchObject({ code: 'DECISION_REASON_REQUIRED' });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      versionId: firstSubmission.id,
      decision: 'REJECTED',
      comment: 'Synthetic rejection reason',
      actor: actor(qualityUserId),
    });
    await saveStructuredDraft({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      expectedVersion: 2,
      content: {
        ...completeRequirement,
        requirementNumber: `DECISION-${suffix}`,
        clarification: 'Addressed rejection',
      },
      changeReason: 'Address rejected evidence',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    const secondSubmission = await submitStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      expectedVersion: 3,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: created.record.id,
      versionId: secondSubmission.id,
      decision: 'RETURNED',
      comment: 'Synthetic return reason',
      actor: actor(qualityUserId),
    });
    const history = await getStructuredHistory(
      recordA,
      'REQUIREMENT',
      created.record.id,
      actor(qualityUserId)
    );
    expect(history.decisions.map((decision) => decision.decision)).toEqual([
      'RETURNED',
      'REJECTED',
    ]);
  });

  it('creates, reloads, and version-controls a complete requirement', async () => {
    const created = await createStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      content: completeRequirement,
      changeReason: 'Initial controlled requirement',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    requirementId = created.record.id;
    const edited = await saveStructuredDraft({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: requirementId,
      expectedVersion: 1,
      content: {
        ...completeRequirement,
        acceptanceCriterion: 'All persisted links resolve and reload.',
      },
      changeReason: 'Clarify objective acceptance',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    expect(edited.version.version).toBe(2);
    const history = await getStructuredHistory(
      recordA,
      'REQUIREMENT',
      requirementId,
      actor(authorityUserId, 'ADMIN')
    );
    expect(history.versions.map((version) => version.lifecycleStatus)).toEqual([
      'DRAFT',
      'SUPERSEDED',
    ]);
  });

  it('rejects stale writes and leaves every row unchanged', async () => {
    const before = await pool.query(
      'SELECT id, version, lifecycle_status, content_checksum, created_at FROM design_control_structured_record_versions WHERE structured_record_id = $1 ORDER BY version',
      [requirementId]
    );
    await expect(
      saveStructuredDraft({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: requirementId,
        expectedVersion: 1,
        content: completeRequirement,
        changeReason: 'Stale overwrite probe',
        actor: actor(authorityUserId, 'ADMIN'),
      })
    ).rejects.toMatchObject({ code: 'STALE_STRUCTURED_RECORD_VERSION' });
    const after = await pool.query(
      'SELECT id, version, lifecycle_status, content_checksum, created_at FROM design_control_structured_record_versions WHERE structured_record_id = $1 ORDER BY version',
      [requirementId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('submits and records immutable assigned-role approval evidence', async () => {
    const submitted = await submitStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: requirementId,
      expectedVersion: 2,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    requirementVersionId = submitted.id;
    await expect(
      decideStructuredRecord({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: requirementId,
        versionId: requirementVersionId,
        decision: 'APPROVED',
        actor: actor(authorityUserId, 'ADMIN'),
      })
    ).rejects.toMatchObject({ code: 'REVIEWER_INDEPENDENCE_REQUIRED' });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: requirementId,
      versionId: requirementVersionId,
      decision: 'APPROVED',
      actor: actor(qualityUserId),
    });
    const history = await getStructuredHistory(
      recordA,
      'REQUIREMENT',
      requirementId,
      actor(qualityUserId)
    );
    expect(history.versions[0].lifecycleStatus).toBe('APPROVED');
    expect(history.decisions[0]).toEqual(
      expect.objectContaining({
        decision: 'APPROVED',
        approvalRoleSnapshot: 'QUALITY',
        actorUserId: qualityUserId,
      })
    );
  });

  it('requires rejection and return reasons at both service and database boundaries', async () => {
    await expect(
      pool.query(
        `INSERT INTO design_control_structured_record_decisions
         (version_id, rd_project_id, decision, approval_role_snapshot, actor_user_id,
          actor_display_name_snapshot, actor_role_snapshot)
       VALUES ($1, $2, 'REJECTED', 'QUALITY', $3, 'Synthetic Quality', 'EMPLOYEE')`,
        [requirementVersionId, projectA, qualityUserId]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps risk acceptance and intended-use validation as distinct controlled lifecycles', async () => {
    const risk = await createStructuredRecord({
      recordId: recordA,
      type: 'RISK',
      changeReason: 'Synthetic controlled risk',
      actor: actor(authorityUserId, 'ADMIN'),
      content: {
        riskNumber: `RISK-${suffix}`,
        hazardFailureMode: 'Traceability evidence could be incomplete',
        cause: 'Missing persisted relationship',
        effect: 'Release readiness could be overstated',
        severity: 'High',
        likelihood: 'Low',
        detectability: 'High',
        initialRating: 'HIGH',
        mitigation: 'Server-calculated persisted-link matrix',
        owner: 'Synthetic Design Authority',
        dueDate: '2026-08-06',
        residualRating: 'LOW',
        verificationEvidence: 'SYNTHETIC-RISK-VERIFY-1',
        acceptanceAuthority: 'Quality',
      },
    });
    const submittedRisk = await submitStructuredRecord({
      recordId: recordA,
      type: 'RISK',
      itemId: risk.record.id,
      expectedVersion: 1,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'RISK',
      itemId: risk.record.id,
      versionId: submittedRisk.id,
      decision: 'APPROVED',
      comment: 'Residual risk accepted for synthetic certification',
      actor: actor(qualityUserId),
    });

    const validation = await createStructuredRecord({
      recordId: recordA,
      type: 'VALIDATION',
      changeReason: 'Synthetic intended-use validation',
      actor: actor(authorityUserId, 'ADMIN'),
      content: {
        validationNumber: `VAL-${suffix}`,
        intendedUseRequirementId: requirementId,
        objective: 'Validate intended use independently from verification',
        method: 'Synthetic user walkthrough',
        environment: 'Disposable PostgreSQL certification environment',
        testedConfiguration: 'Synthetic Revision A',
        partSoftwareRevisions: ['PART-A Rev A'],
        customerUserRepresentative: 'Synthetic user representative',
        acceptanceCriterion: 'Intended-use workflow completes',
        result: 'Accepted',
        deviation: '',
        correctiveAction: '',
        customerAcceptanceRequired: true,
        customerAcceptance: 'SYNTHETIC-CUSTOMER-ACCEPTANCE-1',
      },
    });
    const submittedValidation = await submitStructuredRecord({
      recordId: recordA,
      type: 'VALIDATION',
      itemId: validation.record.id,
      expectedVersion: 1,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'VALIDATION',
      itemId: validation.record.id,
      versionId: submittedValidation.id,
      decision: 'APPROVED',
      actor: actor(qualityUserId),
    });
    const [riskHistory, validationHistory] = await Promise.all([
      getStructuredHistory(
        recordA,
        'RISK',
        risk.record.id,
        actor(qualityUserId)
      ),
      getStructuredHistory(
        recordA,
        'VALIDATION',
        validation.record.id,
        actor(qualityUserId)
      ),
    ]);
    expect(riskHistory.versions[0].lifecycleStatus).toBe('APPROVED');
    expect(validationHistory.versions[0].lifecycleStatus).toBe('APPROVED');
    expect(validationHistory.versions[0].contentSnapshot).toEqual(
      expect.objectContaining({
        customerAcceptance: 'SYNTHETIC-CUSTOMER-ACCEPTANCE-1',
      })
    );
  });

  it('rejects a cross-project configuration link without partial evidence', async () => {
    const before = await pool.query(
      'SELECT count(*)::int AS count FROM design_control_structured_record_links WHERE source_record_id = $1',
      [requirementId]
    );
    await expect(
      createStructuredLink({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: requirementId,
        targetType: 'CONFIGURATION_ITEM',
        targetId: configurationB,
        relationType: 'ALLOCATED_TO',
        actor: actor(authorityUserId, 'ADMIN'),
      })
    ).rejects.toMatchObject({ code: 'CROSS_PROJECT_LINK_REJECTED' });
    const after = await pool.query(
      'SELECT count(*)::int AS count FROM design_control_structured_record_links WHERE source_record_id = $1',
      [requirementId]
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('does not substitute another R&D project or a P2 UUID for text-project ownership', async () => {
    await expect(
      verifyRdProjectIdentity(recordA, projectB)
    ).rejects.toMatchObject({ code: 'RD_PROJECT_IDENTITY_MISMATCH' });
    await expect(
      verifyRdProjectIdentity(recordA, randomUUID())
    ).rejects.toMatchObject({ code: 'RD_PROJECT_IDENTITY_MISMATCH' });
    await expect(
      verifyRdProjectIdentity(recordA, projectA)
    ).resolves.toBeUndefined();
  });

  it('calculates full traceability only after authoritative persisted relationships exist', async () => {
    const verification = await createStructuredRecord({
      recordId: recordA,
      type: 'VERIFICATION',
      changeReason: 'Synthetic verification',
      actor: actor(authorityUserId, 'ADMIN'),
      content: {
        verificationNumber: `VER-${suffix}`,
        requirementId,
        method: 'Inspection',
        procedureEvidence: 'SYN-PROC-1',
        acceptanceCriterion: 'Persisted relationships resolve.',
        plannedPerformer: 'Synthetic Engineer',
        actualPerformer: 'Synthetic Engineer',
        performedDate: '2026-08-05',
        result: 'All links resolved.',
        passFail: 'PASS',
        exceptionDisposition: '',
        reviewer: 'Synthetic Quality',
      },
    });
    verificationId = verification.record.id;
    const submittedVerification = await submitStructuredRecord({
      recordId: recordA,
      type: 'VERIFICATION',
      itemId: verificationId,
      expectedVersion: 1,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await decideStructuredRecord({
      recordId: recordA,
      type: 'VERIFICATION',
      itemId: verificationId,
      versionId: submittedVerification.id,
      decision: 'APPROVED',
      actor: actor(qualityUserId),
    });
    for (const target of [
      { targetType: 'DESIGN_OUTPUT', targetId: designOutputA },
      { targetType: 'CONFIGURATION_ITEM', targetId: configurationA },
      { targetType: 'PART_REVISION', targetId: revisionA },
      { targetType: 'VERIFICATION', targetId: verificationId },
    ])
      await createStructuredLink({
        recordId: recordA,
        type: 'REQUIREMENT',
        itemId: requirementId,
        ...target,
        relationType: 'TRACES_TO',
        actor: actor(authorityUserId, 'ADMIN'),
      });
    const matrix = await calculateDesignControlTraceability(
      recordA,
      actor(authorityUserId, 'ADMIN')
    );
    const row = matrix.rows.find(
      (item) => item.requirementId === requirementId
    );
    expect(row?.primaryStatus).toBe('FULLY_TRACED');
    expect(matrix.source).toBe('PERSISTED_DESIGN_CONTROL_RELATIONSHIPS');
  });

  it('keeps a locked traceability snapshot immutable as live relationships change', async () => {
    const matrix = await calculateDesignControlTraceability(
      recordA,
      actor(authorityUserId, 'ADMIN')
    );
    const snapshot = await pool.query(
      `INSERT INTO design_control_traceability_snapshots
         (rd_project_id, design_control_record_id, matrix_snapshot, matrix_checksum,
          captured_by_user_id, captured_by_display_name)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'Synthetic Design Authority')
       RETURNING id, matrix_snapshot`,
      [
        projectA,
        recordA,
        JSON.stringify(matrix),
        'synthetic-checksum',
        authorityUserId,
      ]
    );
    await expect(
      pool.query(
        `UPDATE design_control_traceability_snapshots
         SET matrix_snapshot = '{}'::jsonb WHERE id = $1`,
        [snapshot.rows[0].id]
      )
    ).rejects.toThrow(/immutable/i);
    const retained = await pool.query(
      'SELECT matrix_snapshot FROM design_control_traceability_snapshots WHERE id = $1',
      [snapshot.rows[0].id]
    );
    expect(retained.rows[0].matrix_snapshot).toEqual(
      snapshot.rows[0].matrix_snapshot
    );
  });

  it('aggregates authoritative Final Design Review sources and fails closed', async () => {
    const review = await createStructuredRecord({
      recordId: recordA,
      type: 'REVIEW',
      changeReason: 'Synthetic Final Design Review',
      actor: actor(authorityUserId, 'ADMIN'),
      content: {
        reviewNumber: `FDR-${suffix}`,
        reviewType: 'FINAL',
        reviewPurpose:
          'Synthetic final readiness review for isolated certification only',
        reviewDate: '2026-08-05',
        attendees: [
          { name: 'Synthetic Design Authority', role: 'DESIGN_AUTHORITY' },
        ],
        productDescription: 'Synthetic certification article',
        reviewedConfiguration: 'Synthetic Revision A',
        decision: 'PROCEED',
        conditions: '',
        minutesEvidence: 'SYN-FDR-MINUTES-1',
        requirementsAssessment: 'Synthetic requirements assessment complete',
        manufacturingAssessment:
          'Synthetic manufacturing-readiness assessment complete',
        preliminaryAnalysis: 'Synthetic analysis evidence reviewed',
        risksAndOpenIssues: 'Synthetic risks and issues reviewed',
        readinessCriteria: 'Synthetic readiness criteria satisfied',
        controlledDocumentReference: 'SYN-MDR-FDR-001',
        sourceMappingStatus: 'CONFIRMED',
        requiredApprovals: ['QUALITY'],
      },
    });
    const submitted = await submitStructuredRecord({
      recordId: recordA,
      type: 'REVIEW',
      itemId: review.record.id,
      expectedVersion: 1,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    const action = await createReviewAction({
      recordId: recordA,
      reviewId: review.record.id,
      actionNumber: `FDR-ACT-${suffix}`,
      description: 'Confirm synthetic readiness evidence',
      ownerUserId: qualityUserId,
      ownerDisplayName: 'Synthetic Quality',
      dueDate: '2026-08-06',
      mandatory: true,
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await expect(
      decideStructuredRecord({
        recordId: recordA,
        type: 'REVIEW',
        itemId: review.record.id,
        versionId: submitted.id,
        decision: 'APPROVED',
        actor: actor(qualityUserId),
      })
    ).rejects.toMatchObject({ code: 'MANDATORY_REVIEW_ACTIONS_OPEN' });
    await expect(
      closeReviewAction({
        recordId: recordA,
        actionId: action.id,
        expectedVersion: action.rowVersion,
        closureEvidence: {},
        excepted: false,
        actor: actor(qualityUserId),
      })
    ).rejects.toMatchObject({ code: 'CLOSURE_EVIDENCE_REQUIRED' });
    const closedAction = await closeReviewAction({
      recordId: recordA,
      actionId: action.id,
      expectedVersion: action.rowVersion,
      closureEvidence: { reference: 'SYNTHETIC-ACTION-CLOSURE' },
      excepted: false,
      actor: actor(qualityUserId),
    });
    expect(closedAction).toEqual(
      expect.objectContaining({ status: 'CLOSED', rowVersion: 2 })
    );
    await decideStructuredRecord({
      recordId: recordA,
      type: 'REVIEW',
      itemId: review.record.id,
      versionId: submitted.id,
      decision: 'APPROVED',
      actor: actor(qualityUserId),
    });
    const readiness = await calculateFinalDesignReviewReadiness(
      recordA,
      actor(authorityUserId, 'ADMIN')
    );
    expect(readiness.status).toBe('BLOCKED');
    expect(readiness.categories.map((category) => category.key)).toEqual(
      expect.arrayContaining([
        'project_intake',
        'design_plan',
        'design_inputs',
        'design_risks',
        'preliminary_review',
        'review_actions',
        'design_outputs',
        'configuration',
        'verification',
        'validation',
        'changes',
        'traceability',
        'dhf',
        'exceptions',
      ])
    );
    expect(
      readiness.blocking.every(
        (category) => category.reason && category.owner && category.href
      )
    ).toBe(true);
    await expect(
      createFinalDesignReviewSnapshot({
        recordId: recordA,
        reviewRecordId: review.record.id,
        reviewVersionId: submitted.id,
        actor: actor(qualityUserId),
      })
    ).rejects.toMatchObject({ code: 'FINAL_DESIGN_REVIEW_BLOCKED' });
    const snapshots = await pool.query(
      'SELECT count(*)::int AS count FROM design_control_final_review_snapshots WHERE design_control_record_id = $1',
      [recordA]
    );
    expect(snapshots.rows[0].count).toBe(0);

    const traceSnapshot = await pool.query(
      `SELECT id FROM design_control_traceability_snapshots
       WHERE design_control_record_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [recordA]
    );
    const certifiedSnapshot = await pool.query(
      `INSERT INTO design_control_final_review_snapshots
         (rd_project_id, design_control_record_id, traceability_snapshot_id,
          review_record_id, review_version_id, readiness_status,
          readiness_snapshot, readiness_checksum, approved_by_user_id,
          approved_by_display_name, approved_role_snapshot)
       VALUES ($1, $2, $3, $4, $5, 'COMPLETE', $6::jsonb, $7, $8,
               'Synthetic Quality', 'QUALITY')
       RETURNING id`,
      [
        projectA,
        recordA,
        traceSnapshot.rows[0].id,
        review.record.id,
        submitted.id,
        JSON.stringify({
          status: 'COMPLETE',
          source: 'SYNTHETIC_DATABASE_CONSTRAINT_CERTIFICATION',
        }),
        'synthetic-final-review-checksum',
        qualityUserId,
      ]
    );
    await expect(
      pool.query(
        `UPDATE design_control_final_review_snapshots
         SET readiness_snapshot = '{}'::jsonb WHERE id = $1`,
        [certifiedSnapshot.rows[0].id]
      )
    ).rejects.toThrow(/immutable/i);
    const release = await pool.query(
      `INSERT INTO engineering_releases
         (rd_project_id, design_control_record_id, final_review_snapshot_id,
          release_number, release_revision, product_name)
       VALUES ($1, $2, $3, $4, 'A', 'Synthetic Design A')
       RETURNING final_review_snapshot_id`,
      [
        projectA,
        recordA,
        certifiedSnapshot.rows[0].id,
        `ER-STRUCTURED-${suffix}`,
      ]
    );
    expect(release.rows[0].final_review_snapshot_id).toBe(
      certifiedSnapshot.rows[0].id
    );
  });

  it('supersedes an approved version without carrying its approval forward', async () => {
    const revised = await reviseStructuredRecord({
      recordId: recordA,
      type: 'REQUIREMENT',
      itemId: requirementId,
      expectedVersion: 2,
      changeReason: 'Synthetic controlled supersession',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    expect(revised.version).toEqual(
      expect.objectContaining({ version: 3, lifecycleStatus: 'DRAFT' })
    );
    const history = await getStructuredHistory(
      recordA,
      'REQUIREMENT',
      requirementId,
      actor(authorityUserId, 'ADMIN')
    );
    expect(history.versions[1]).toEqual(
      expect.objectContaining({ version: 2, lifecycleStatus: 'SUPERSEDED' })
    );
    expect(history.decisions).toHaveLength(1);
    expect(history.decisions[0].versionId).toBe(requirementVersionId);
  });

  it('revocation stops future access without deleting prior approval evidence', async () => {
    const team = await listProjectAssignments(
      recordA,
      actor(authorityUserId, 'ADMIN')
    );
    const quality = team.assignments.find(
      (assignment) => assignment.userId === qualityUserId
    )!;
    await revokeProjectAssignment({
      recordId: recordA,
      assignmentId: quality.id,
      expectedVersion: quality.rowVersion,
      reason: 'End synthetic Quality assignment',
      actor: actor(authorityUserId, 'ADMIN'),
    });
    await expect(
      getStructuredHistory(
        recordA,
        'REQUIREMENT',
        requirementId,
        actor(qualityUserId)
      )
    ).rejects.toMatchObject({ code: 'PROJECT_ASSIGNMENT_REQUIRED' });
    const evidence = await pool.query(
      'SELECT decision, actor_user_id, approval_role_snapshot FROM design_control_structured_record_decisions WHERE version_id = $1',
      [requirementVersionId]
    );
    expect(evidence.rows).toEqual([
      expect.objectContaining({
        decision: 'APPROVED',
        actor_user_id: qualityUserId,
        approval_role_snapshot: 'QUALITY',
      }),
    ]);
  });
});
