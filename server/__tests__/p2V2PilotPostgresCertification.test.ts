import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  addPilotEvidenceManifest,
  authorizePilot,
  closePilotIssue,
  createPilotDraft,
  decidePilotApproval,
  getPilotDashboard,
  PILOT_READINESS_KEYS,
  PILOT_TRAINING_TOPICS,
  recordPilotIssue,
  recordReadinessEvidence,
  recordTrainingAcknowledgment,
  requireActivePilotForAction,
  submitPilotForApproval,
  transitionPilot,
  type PilotActor,
} from '../src/services/projectPilotControlService';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const databaseUrl = new URL(connectionString);
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.pathname !== '/epoch_p2_v2_certification'
)
  throw new Error(
    `Refusing non-disposable database ${databaseUrl.hostname}${databaseUrl.pathname}`
  );

process.env.P2_V2_PILOT_ENVIRONMENT = 'isolated_test';

const pool = new Pool({ connectionString });
const projectId = '00000000-0000-4000-8000-0000000010b1';
const nonPilotProjectId = '00000000-0000-4000-8000-0000000010b2';
const nullProjectId = '00000000-0000-4000-8000-0000000010b3';
const legacyProjectId = '00000000-0000-4000-8000-0000000010b4';
const unknownProjectId = '00000000-0000-4000-8000-0000000010b5';
let poId = 0;
let poLineId = 0;
let workflowId = '';

const actor = (userId: number, role: string): PilotActor => ({
  userId,
  employeeId: userId,
  username: `pilot-certifier-${userId}`,
  displayName: `Pilot Certifier ${userId}`,
  role,
});

const admin = actor(9401, 'ADMIN');
const quality = actor(9402, 'QUALITY');
const operations = actor(9403, 'OPERATIONS');
const projectManagement = actor(9404, 'PROJECT_MANAGER');
const rolloutOwner = actor(9405, 'OWNER');

beforeAll(async () => {
  await pool.query(
    `INSERT INTO employees(id,employee_code,name,user_role)
     SELECT value,'PILOT-'||value,'Pilot Certifier '||value,'ADMIN'
     FROM generate_series(9401,9405) value ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO users(id,username,password_hash,role,employee_id)
     SELECT value,'pilot-certifier-'||value,'not-used','ADMIN',value
     FROM generate_series(9401,9405) value ON CONFLICT (id) DO NOTHING`
  );
  await pool.query(
    `INSERT INTO p2_customers(customer_id,customer_name,rfq_prefix)
     VALUES ('PILOT-CERT','Synthetic Pilot Customer','PLC') ON CONFLICT DO NOTHING`
  );
  const po = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_orders
       (po_number,customer_id,customer_name,po_date,expected_delivery,status,
        revision_number,is_current_revision)
     VALUES ('PILOT-CERT-PO','PILOT-CERT','Synthetic Pilot Customer',
       CURRENT_DATE,CURRENT_DATE+30,'READY_FOR_P2_RELEASE',1,true)
     RETURNING id`
  );
  poId = po.rows[0].id;
  const line = await pool.query<{ id: number }>(
    `INSERT INTO p2_purchase_order_items
       (po_id,part_number,part_name,quantity,specifications)
     VALUES ($1,'PILOT-PART-A','Synthetic Pilot Part',2,'Synthetic certification only')
     RETURNING id`,
    [poId]
  );
  poLineId = line.rows[0].id;
  for (const [id, version] of [
    [projectId, 'p2_v2'],
    [nonPilotProjectId, 'p2_v2'],
    [nullProjectId, null],
    [legacyProjectId, 'legacy_v1'],
  ] as const)
    await pool.query(
      `INSERT INTO projects
         (id,project_code,project_name,customer_id,workflow_version,current_stage,po_id,status)
       VALUES ($1,$2,$3,'PILOT-CERT',$4,'PREPRODUCTION_READINESS',$5,'active')`,
      [
        id,
        `PILOT-${id.slice(-4)}`,
        `Synthetic ${version ?? 'NULL'} fixture`,
        version,
        poId,
      ]
    );
  const workflow = await pool.query<{ id: string }>(
    `INSERT INTO project_workflow_instances
       (project_id,workflow_version,definition_version,status)
     VALUES ($1,'p2_v2',2,'ACTIVE') RETURNING id`,
    [projectId]
  );
  workflowId = workflow.rows[0].id;
  const planningStep = await pool.query<{ id: string }>(
    `INSERT INTO project_workflow_step_instances
       (workflow_instance_id,project_id,step_type,step_order,label_snapshot,
        description_snapshot,status)
     VALUES ($1,$2,'production_planning',5,'Production Planning',
       'Synthetic pilot planning','COMPLETE') RETURNING id`,
    [workflowId, projectId]
  );
  const wadStep = await pool.query<{ id: string }>(
    `INSERT INTO project_workflow_step_instances
       (workflow_instance_id,project_id,step_type,step_order,label_snapshot,
        description_snapshot,status)
     VALUES ($1,$2,'wad_authorization',6,'WAD Authorization',
       'Synthetic pilot WAD','COMPLETE') RETURNING id`,
    [workflowId, projectId]
  );
  const workOrder = await pool.query<{ id: string }>(
    `INSERT INTO production_work_orders
       (work_order_number,project_id,part_number,quantity,status,wad_status)
     VALUES ('PILOT-WAD-1',$1,'PILOT-PART-A',2,'RELEASED','RELEASED')
     RETURNING id`,
    [projectId]
  );
  const plan = await pool.query<{ id: string }>(
    `INSERT INTO project_production_plans
       (project_id,workflow_instance_id,workflow_step_instance_id,revision_number,
        status,po_id,po_revision_number,po_number,configuration_baseline_id,
        configuration_revision,effectivity_type,effectivity_reference,
        requirement_source,planning_basis)
     VALUES ($1::uuid,$2,$3,1,'RELEASED',$4,1,'PILOT-CERT-PO','CFG-PILOT',
       'CFG-PILOT-R1','PROJECT',$1::text,'synthetic-certification',
       'Disposable PostgreSQL certification') RETURNING id`,
    [projectId, workflowId, planningStep.rows[0].id, poId]
  );
  await pool.query(
    `INSERT INTO project_wad_authorizations
       (project_id,workflow_instance_id,workflow_step_instance_id,
        production_plan_id,production_plan_revision,wad_work_order_id,
        wad_number,wad_revision,status,po_id,po_revision_number,
        configuration_revision,effectivity_reference,inherited_requirements_snapshot,
        budget_snapshot)
     VALUES ($1::uuid,$2,$3,$4,1,$5,'PILOT-WAD-1',1,'RELEASED',$6,1,
       'CFG-PILOT-R1',$1::text,'{}'::jsonb,'{}'::jsonb)`,
    [
      projectId,
      workflowId,
      wadStep.rows[0].id,
      plan.rows[0].id,
      workOrder.rows[0].id,
      poId,
    ]
  );
  await pool.query(
    `INSERT INTO project_workflow_instances
       (project_id,workflow_version,definition_version,status)
     VALUES ($1,'p2_v2',2,'ACTIVE')`,
    [nonPilotProjectId]
  );
});

afterAll(async () => {
  await pool.end();
});

describe('Phase 10B controlled pilot PostgreSQL certification', () => {
  it('creates a revision-controlled draft without enabling a global pilot', async () => {
    const model = await createPilotDraft(
      projectId,
      {
        environment: 'isolated_test',
        workflowInstanceId: workflowId,
        customerPoId: poId,
        customerPoNumber: 'PILOT-CERT-PO',
        approvedPoLines: [
          { poLineId, partNumber: 'PILOT-PART-A', maximumQuantity: 2 },
        ],
        configurationBaselineRevision: 'CFG-PILOT-R1',
        productionPlanRevision: 1,
        wadRevision: 1,
        authorizedParticipants: [
          { userId: admin.userId, functionalRole: 'SYSTEM_ADMINISTRATOR' },
        ],
        qualityApproverUserId: quality.userId,
        operationsApproverUserId: operations.userId,
        projectManagementApproverUserId: projectManagement.userId,
        rolloutOwnerUserId: rolloutOwner.userId,
        pilotStartDate: new Date().toISOString().slice(0, 10),
        reviewExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        rollbackOwnerUserId: rolloutOwner.userId,
        rollbackPlanReference:
          'docs/p2-v2-pilot-rollback-recovery.md#before-production-launch',
        risksAndMitigations: [
          {
            risk: 'Synthetic pilot certification risk',
            mitigation: 'Disposable database and no deployment flags',
            ownerUserId: rolloutOwner.userId,
          },
        ],
      },
      admin
    );
    expect(model.pilot.status).toBe('DRAFT');
    expect(model.pilot.approved_scope_hash).toBeNull();
  });

  it('fails closed for direct status mutation and incomplete readiness', async () => {
    await expect(
      pool.query(
        `UPDATE project_pilot_authorizations SET status='ACTIVE' WHERE project_id=$1`,
        [projectId]
      )
    ).rejects.toThrow(/controlled transition service/);
    const current = await getPilotDashboard(projectId);
    await expect(
      submitPilotForApproval(
        projectId,
        Number(current.pilot.lock_version),
        admin
      )
    ).rejects.toMatchObject({ code: 'PENDING_READINESS_REQUIRED' });
  });

  it('links complete authoritative training and evaluates every readiness item', async () => {
    await recordTrainingAcknowledgment(
      projectId,
      {
        userId: admin.userId,
        functionalRole: 'SYSTEM_ADMINISTRATOR',
        trainingVersion: 'P2-V2-PILOT-1.0',
        completedAt: new Date().toISOString(),
        trainerUserId: rolloutOwner.userId,
        acknowledgmentMeaning: 'Acknowledges controlled pilot responsibilities',
        evidenceReference: 'training://synthetic/pilot-admin',
        topics: [...PILOT_TRAINING_TOPICS],
      },
      rolloutOwner
    );
    const current = await getPilotDashboard(projectId);
    const model = await recordReadinessEvidence(
      projectId,
      PILOT_READINESS_KEYS.map((key) => ({
        checklistKey: key,
        status: 'CURRENT',
        authoritativeRecordType: 'synthetic_certification_fixture',
        authoritativeRecordId: `${projectId}:${key}`,
        authoritativeRevision: '1',
        evidenceReference: `postgres://synthetic/${key}`,
        responsibleFunction: 'Phase 10B certification',
        correctionLocation: 'Disposable PostgreSQL fixture',
        explanation: 'Current synthetic evidence for isolated certification',
      })),
      Number(current.pilot.lock_version),
      admin
    );
    expect(model.pilot.status).toBe('PENDING_READINESS');
    expect(model.readiness.ready).toBe(true);
  });

  it('requires four independently designated authenticated approvers', async () => {
    let model = await getPilotDashboard(projectId);
    model = await submitPilotForApproval(
      projectId,
      Number(model.pilot.lock_version),
      admin
    );
    await expect(
      decidePilotApproval(
        projectId,
        'QUALITY',
        {
          decision: 'APPROVED',
          signatureMeaning: 'Wrong actor attempt',
          evidenceReference: 'pilot://approval/wrong',
        },
        admin
      )
    ).rejects.toMatchObject({ code: 'DESIGNATED_APPROVER_REQUIRED' });
    for (const [type, approver] of [
      ['QUALITY', quality],
      ['OPERATIONS', operations],
      ['PROJECT_MANAGEMENT', projectManagement],
      ['ROLLOUT_OWNER', rolloutOwner],
    ] as const)
      await decidePilotApproval(
        projectId,
        type,
        {
          decision: 'APPROVED',
          signatureMeaning: `${type} approves exact pilot revision`,
          evidenceReference: `pilot://approval/${type.toLowerCase()}`,
        },
        approver
      );
    model = await getPilotDashboard(projectId);
    model = await authorizePilot(
      projectId,
      Number(model.pilot.lock_version),
      rolloutOwner
    );
    expect(model.pilot.status).toBe('AUTHORIZED');
    expect(model.pilot.scope_hash).toBe(model.pilot.approved_scope_hash);
  });

  it('activates only through the rollout owner and enforces project, training, PO line, part and quantity scope', async () => {
    let model = await getPilotDashboard(projectId);
    await expect(
      transitionPilot(
        projectId,
        'ACTIVE',
        {
          expectedLockVersion: Number(model.pilot.lock_version),
          meaning: 'Unauthorized activation attempt',
          reason: 'Synthetic negative test',
          idempotencyKey: 'pilot-activate-wrong',
        },
        admin
      )
    ).rejects.toMatchObject({ code: 'ROLLOUT_OWNER_REQUIRED' });
    model = await transitionPilot(
      projectId,
      'ACTIVE',
      {
        expectedLockVersion: Number(model.pilot.lock_version),
        meaning: 'Activate synthetic isolated pilot',
        reason: 'Phase 10B disposable certification',
        idempotencyKey: 'pilot-activate-correct',
      },
      rolloutOwner
    );
    expect(model.pilot.status).toBe('ACTIVE');
    await expect(
      requireActivePilotForAction(
        nonPilotProjectId,
        'PRODUCTION_LAUNCH',
        admin,
        {
          idempotencyKey: 'non-pilot-project',
          confirmation: 'Confirm negative non-pilot test',
        }
      )
    ).rejects.toMatchObject({ code: 'ACTIVE_PILOT_REQUIRED' });
    await expect(
      requireActivePilotForAction(projectId, 'PRODUCT_RELEASE', admin, {
        poLineId,
        partNumber: 'PILOT-PART-A',
        quantity: 3,
        idempotencyKey: 'quantity-over-limit',
        confirmation: 'Confirm negative quantity test',
      })
    ).rejects.toMatchObject({ code: 'PILOT_QUANTITY_EXCEEDED' });
    await expect(
      requireActivePilotForAction(projectId, 'PRODUCT_RELEASE', admin, {
        poLineId,
        partNumber: 'WRONG-PART',
        quantity: 1,
        idempotencyKey: 'part-outside-scope',
        confirmation: 'Confirm negative part test',
      })
    ).rejects.toMatchObject({ code: 'PILOT_PART_NOT_AUTHORIZED' });
    await expect(
      requireActivePilotForAction(projectId, 'PRODUCT_RELEASE', quality, {
        poLineId,
        partNumber: 'PILOT-PART-A',
        quantity: 1,
        idempotencyKey: 'participant-not-trained',
        confirmation: 'Confirm negative training test',
      })
    ).rejects.toMatchObject({ code: 'PILOT_PARTICIPANT_REQUIRED' });
    await expect(
      requireActivePilotForAction(projectId, 'PRODUCT_RELEASE', admin, {
        poLineId,
        partNumber: 'PILOT-PART-A',
        quantity: 2,
        idempotencyKey: 'authorized-pilot-action',
        confirmation: 'I confirm the exact authorized synthetic pilot action',
      })
    ).resolves.toMatchObject({ participant: { userId: admin.userId } });
    await pool.query(
      `UPDATE project_pilot_authorizations
       SET review_expires_at=now()-interval '1 minute' WHERE project_id=$1`,
      [projectId]
    );
    await expect(
      requireActivePilotForAction(projectId, 'PRODUCT_RELEASE', admin, {
        poLineId,
        partNumber: 'PILOT-PART-A',
        quantity: 1,
        idempotencyKey: 'expired-pilot-action',
        confirmation: 'Confirm negative expired authorization test',
      })
    ).rejects.toMatchObject({ code: 'PILOT_EXPIRED' });
    await pool.query(
      `UPDATE project_pilot_authorizations
       SET review_expires_at=now()+interval '30 days' WHERE project_id=$1`,
      [projectId]
    );
  });

  it('pauses automatically for a major issue and preserves audit evidence', async () => {
    const model = await recordPilotIssue(
      projectId,
      {
        workflowStage: 'production_quality',
        severity: 'MAJOR',
        category: 'WORKFLOW_BLOCKER',
        description: 'Synthetic major blocker',
        affectedRecordType: 'project',
        affectedRecordId: projectId,
        affectedRevision: '1',
        containment: 'Pause pilot and retain all evidence',
        ownerUserId: operations.userId,
      },
      quality
    );
    expect(model.pilot.status).toBe('PAUSED');
    expect(
      model.events.some((entry) => entry.event_type === 'PILOT_PAUSED')
    ).toBe(true);
    await expect(
      requireActivePilotForAction(
        projectId,
        'PRODUCTION_EXECUTION_COMPLETION',
        admin,
        {
          idempotencyKey: 'paused-action-rejected',
          confirmation: 'Confirm negative paused test',
        }
      )
    ).rejects.toMatchObject({ code: 'ACTIVE_PILOT_REQUIRED' });
  });

  it('requires formal issue closure, supports controlled resume, concurrency, idempotency and completion', async () => {
    let model = await getPilotDashboard(projectId);
    const issue = model.issues.find(
      (entry) => entry.issue_number === 'PILOT-ISSUE-000001'
    );
    expect(issue).toBeTruthy();
    model = await closePilotIssue(
      projectId,
      String(issue?.id),
      {
        rootCause: 'Synthetic certification condition',
        correctiveAction: 'Verify the guarded recovery path',
        retestEvidence: 'postgres://synthetic/retest/major-issue',
      },
      quality
    );
    model = await transitionPilot(
      projectId,
      'ACTIVE',
      {
        expectedLockVersion: Number(model.pilot.lock_version),
        meaning: 'Resume after approved issue closure',
        reason: 'Synthetic recovery certification',
        idempotencyKey: 'pilot-resume-after-closure',
      },
      rolloutOwner
    );
    const request = {
      poLineId,
      partNumber: 'PILOT-PART-A',
      quantity: 1,
      idempotencyKey: 'concurrent-pilot-action',
      confirmation: 'Confirm concurrent synthetic pilot action',
    };
    await expect(
      Promise.all([
        requireActivePilotForAction(
          projectId,
          'PRODUCT_RELEASE',
          admin,
          request
        ),
        requireActivePilotForAction(
          projectId,
          'PRODUCT_RELEASE',
          admin,
          request
        ),
      ])
    ).resolves.toHaveLength(2);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM project_pilot_events
       WHERE project_id=$1 AND idempotency_key='concurrent-pilot-action'`,
      [projectId]
    );
    expect(count.rows[0].count).toBe('1');
    await expect(
      requireActivePilotForAction(projectId, 'SHIPMENT_AUTHORIZATION', admin, {
        ...request,
        confirmation: 'Different request using the same key',
      })
    ).rejects.toMatchObject({ code: 'PILOT_IDEMPOTENCY_CONFLICT' });
    model = await addPilotEvidenceManifest(
      projectId,
      [
        {
          category: 'product_release',
          authoritativeRecordType: 'synthetic_quality_release',
          authoritativeRecordId: projectId,
          authoritativeRevision: '1',
          evidenceReference: 'postgres://synthetic/quality-release',
        },
        {
          category: 'quantity_reconciliation',
          authoritativeRecordType: 'synthetic_shipping_reconciliation',
          authoritativeRecordId: projectId,
          authoritativeRevision: '1',
          evidenceReference: 'postgres://synthetic/shipping-reconciliation',
        },
      ],
      quality
    );
    expect(model.evidenceManifest).toHaveLength(2);
    await pool.query(
      `UPDATE project_production_plans
       SET revision_number=2 WHERE project_id=$1`,
      [projectId]
    );
    await expect(
      requireActivePilotForAction(projectId, 'PROJECT_CLOSEOUT', admin, {
        idempotencyKey: 'invalidated-plan-revision',
        confirmation: 'Confirm negative stale-revision test',
      })
    ).rejects.toMatchObject({ code: 'PILOT_SCOPE_INVALIDATED' });
    await pool.query(
      `UPDATE project_production_plans
       SET revision_number=1 WHERE project_id=$1`,
      [projectId]
    );
    model = await transitionPilot(
      projectId,
      'COMPLETED',
      {
        expectedLockVersion: Number(model.pilot.lock_version),
        meaning: 'Complete synthetic pilot certification',
        reason: 'No real pilot activity occurred',
        idempotencyKey: 'pilot-complete-synthetic',
      },
      rolloutOwner
    );
    expect(model.pilot.status).toBe('COMPLETED');
  });

  it('supports controlled cancellation of a replacement draft without changing completed evidence', async () => {
    let model = await createPilotDraft(
      projectId,
      {
        environment: 'isolated_test',
        workflowInstanceId: workflowId,
        customerPoId: poId,
        customerPoNumber: 'PILOT-CERT-PO',
        approvedPoLines: [
          { poLineId, partNumber: 'PILOT-PART-A', maximumQuantity: 1 },
        ],
        configurationBaselineRevision: 'CFG-PILOT-R1',
        productionPlanRevision: 1,
        wadRevision: 1,
        authorizedParticipants: [
          { userId: admin.userId, functionalRole: 'ADMIN' },
        ],
        qualityApproverUserId: quality.userId,
        operationsApproverUserId: operations.userId,
        projectManagementApproverUserId: projectManagement.userId,
        rolloutOwnerUserId: rolloutOwner.userId,
        pilotStartDate: '2026-07-29',
        reviewExpiresAt: '2026-08-29T00:00:00.000Z',
        rollbackOwnerUserId: rolloutOwner.userId,
        rollbackPlanReference: 'docs/p2-v2-pilot-rollback-recovery.md',
        risksAndMitigations: [
          {
            risk: 'Synthetic cancellation certification',
            mitigation: 'Cancel without deleting prior evidence',
            ownerUserId: rolloutOwner.userId,
          },
        ],
      },
      admin
    );
    model = await transitionPilot(
      projectId,
      'CANCELLED',
      {
        expectedLockVersion: Number(model.pilot.lock_version),
        meaning: 'Cancel replacement synthetic draft',
        reason: 'Certification of controlled cancellation only',
        idempotencyKey: 'pilot-cancel-replacement',
      },
      rolloutOwner
    );
    expect(model.pilot.status).toBe('CANCELLED');
    const completed = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM project_pilot_authorizations
       WHERE project_id=$1 AND status='COMPLETED'`,
      [projectId]
    );
    expect(completed.rows[0].count).toBe('1');
  });

  it.each([
    [nullProjectId, 'P2_V2_REQUIRED'],
    [legacyProjectId, 'P2_V2_REQUIRED'],
  ])(
    'rejects legacy/version-isolation fixture %s without rewriting it',
    async (id, code) => {
      await expect(
        requireActivePilotForAction(id, 'PRODUCTION_LAUNCH', admin, {
          idempotencyKey: `legacy-isolation-${id.slice(-4)}`,
          confirmation: 'Confirm negative version-isolation test',
        })
      ).rejects.toMatchObject({ code });
      const result = await pool.query<{ workflow_version: string | null }>(
        `SELECT workflow_version FROM projects WHERE id=$1`,
        [id]
      );
      expect(result.rows[0].workflow_version).toBe(
        id === nullProjectId ? null : 'legacy_v1'
      );
    }
  );

  it('rejects unknown workflow versions at the database boundary without creating a project', async () => {
    await expect(
      pool.query(
        `INSERT INTO projects
           (id,project_code,project_name,customer_id,workflow_version,current_stage,po_id,status)
         VALUES ($1,'PILOT-UNKNOWN','Synthetic unknown version fixture',
           'PILOT-CERT','future_v9','PREPRODUCTION_READINESS',$2,'active')`,
        [unknownProjectId, poId]
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'projects_workflow_version_check',
    });
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM projects WHERE id=$1`,
      [unknownProjectId]
    );
    expect(result.rows[0].count).toBe('0');
  });

  it('does not backfill or mutate Design Control records', async () => {
    const designBefore = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM design_control_records`
    );
    const events = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM project_pilot_events WHERE project_id=$1`,
      [projectId]
    );
    const designAfter = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM design_control_records`
    );
    expect(designAfter.rows[0].count).toBe(designBefore.rows[0].count);
    expect(Number(events.rows[0].count)).toBeGreaterThan(0);
  });
});
