/**
 * Convert one explicitly identified legacy project to the released P2 V2 workflow.
 *
 * The conversion is intentionally opt-in and transactional. Legacy project_steps
 * remain unchanged as historical evidence; their linked records are copied into
 * the corresponding V2 stages as non-authoritative evidence links.
 *
 * Usage:
 *   npx tsx server/scripts/convertLegacyProjectToP2V2.ts --project=PRJ-0001
 *   npx tsx server/scripts/convertLegacyProjectToP2V2.ts --project=PRJ-0001 --apply --confirm-project=PRJ-0001
 */

import { sql } from 'drizzle-orm';

import { db, pgPool } from '../db';
import { initializeV2Workflow } from '../src/services/projectWorkflowInstanceService';

type Args = {
  project: string | null;
  listCreatedOn: string | null;
  apply: boolean;
  confirmation: string | null;
};

type ProjectRow = {
  id: string;
  project_code: string;
  project_name: string;
  workflow_version: string | null;
  created_at: Date | string | null;
};

type LegacyEvidenceRow = {
  step_type: string;
  status: string | null;
  record_type: string;
  record_id: string;
  target_stage: string;
};

function parseArgs(argv: string[]): Args {
  const value = (prefix: string) =>
    argv
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || null;
  const project = value('--project=');
  const listCreatedOn = value('--list-created-on=');
  if (!project && !listCreatedOn)
    throw new Error(
      'Pass --project=<UUID-or-code> or --list-created-on=YYYY-MM-DD.'
    );
  return {
    project,
    listCreatedOn,
    apply: argv.includes('--apply'),
    confirmation: value('--confirm-project='),
  };
}

async function listLegacyProjectsCreatedOn(createdOn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdOn))
    throw new Error('--list-created-on must use YYYY-MM-DD.');
  const result = await pgPool.query(
    `SELECT p.id, p.project_code, p.project_name, p.workflow_version, p.created_at,
            json_agg(json_build_object('type', s.step_type, 'status', s.status)
                     ORDER BY s.step_order) FILTER (WHERE s.id IS NOT NULL) AS steps
       FROM projects p
       LEFT JOIN project_steps s ON s.project_id = p.id
      WHERE p.created_at >= $1::date
        AND p.created_at < $1::date + INTERVAL '1 day'
        AND COALESCE(p.workflow_version, 'legacy_v1') = 'legacy_v1'
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
    [createdOn]
  );
  return result.rows;
}

async function findProject(identifier: string): Promise<ProjectRow> {
  const result = await pgPool.query<ProjectRow>(
    `SELECT id, project_code, project_name, workflow_version, created_at
       FROM projects
      WHERE id::text = $1 OR project_code = $1
      ORDER BY created_at DESC`,
    [identifier]
  );
  if (result.rowCount !== 1) {
    throw new Error(
      result.rowCount === 0
        ? `Project ${identifier} was not found.`
        : `Project ${identifier} is ambiguous; use its UUID.`
    );
  }
  return result.rows[0];
}

async function loadEvidence(projectId: string): Promise<LegacyEvidenceRow[]> {
  const result = await pgPool.query<LegacyEvidenceRow>(
    `SELECT ps.step_type,
            ps.status,
            evidence.record_type,
            evidence.record_id,
            evidence.target_stage
       FROM project_steps ps
       CROSS JOIN LATERAL (
         VALUES
           ('rfq_risk_assessment', ps.linked_rfq_id::text, 'rfq_risk_assessment'),
           ('quote', ps.linked_quote_id::text, 'estimate_quote'),
           ('purchase_review_checklist', ps.linked_purchase_review_id::text, 'contract_review'),
           ('preproduction_checklist', ps.linked_preproduction_checklist_id::text, 'preproduction_release'),
           ('p2_purchase_order', ps.linked_p2_order_id::text, 'production_planning')
       ) AS evidence(record_type, record_id, target_stage)
      WHERE ps.project_id = $1
        AND evidence.record_id IS NOT NULL
        AND (
          (ps.step_type = 'rfq_risk_assessment' AND evidence.record_type = 'rfq_risk_assessment') OR
          (ps.step_type = 'quote' AND evidence.record_type = 'quote') OR
          (ps.step_type = 'purchase_review_checklist' AND evidence.record_type = 'purchase_review_checklist') OR
          (ps.step_type = 'preproduction_checklist' AND evidence.record_type = 'preproduction_checklist') OR
          (ps.step_type = 'p2_order' AND evidence.record_type = 'p2_purchase_order')
        )
      ORDER BY ps.step_order`,
    [projectId]
  );
  return result.rows;
}

async function applyConversion(
  project: ProjectRow,
  evidence: LegacyEvidenceRow[]
) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, project_code, workflow_version
        FROM projects
       WHERE id = ${project.id}
       FOR UPDATE
    `);
    const row = (locked as unknown as { rows: ProjectRow[] }).rows?.[0];
    if (!row) throw new Error('Project disappeared before conversion.');
    if (row.workflow_version !== null && row.workflow_version !== 'legacy_v1') {
      throw new Error(`Project is ${row.workflow_version}, not legacy_v1.`);
    }

    const existing = await tx.execute(sql`
      SELECT id FROM project_workflow_instances
       WHERE project_id = ${project.id}
         AND status NOT IN ('SUPERSEDED', 'CANCELLED')
    `);
    if ((existing as unknown as { rows: unknown[] }).rows?.length) {
      throw new Error('Project already has an active workflow instance.');
    }

    await tx.execute(sql`
      UPDATE projects
         SET workflow_version = 'p2_v2', updated_at = now()
       WHERE id = ${project.id}
    `);

    const workflow = await initializeV2Workflow(
      project.id,
      { displayName: 'Controlled legacy-to-P2-V2 conversion' },
      tx
    );
    const steps = new Map(
      workflow.steps.map((step) => [String(step.step_type), String(step.id)])
    );

    for (const item of evidence) {
      const stepId = steps.get(item.target_stage);
      if (!stepId)
        throw new Error(`V2 target stage ${item.target_stage} is missing.`);
      await tx.execute(sql`
        INSERT INTO project_workflow_step_links
          (workflow_step_instance_id, project_id, record_type, record_id,
           relationship_type, is_authoritative, linked_by_display_name)
        VALUES
          (${stepId}, ${project.id}, ${item.record_type}, ${item.record_id},
           'EVIDENCE', false, 'Controlled legacy-to-P2-V2 conversion')
      `);
    }

    await tx.execute(sql`
      INSERT INTO project_activity_log
        (project_id, activity_type, description, performed_by_display_name, metadata)
      VALUES
        (${project.id}, 'workflow_version_converted',
         'Project converted from legacy_v1 to p2_v2; legacy steps retained as historical evidence.',
         'Controlled legacy-to-P2-V2 conversion',
         ${JSON.stringify({
           fromWorkflowVersion: project.workflow_version ?? 'legacy_v1',
           toWorkflowVersion: 'p2_v2',
           preservedLegacyStepRows: true,
           copiedEvidenceLinks: evidence.length,
         })}::jsonb)
    `);

    return {
      instanceId: String(workflow.instance.id),
      copiedEvidenceLinks: evidence.length,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.listCreatedOn) {
    console.log(
      JSON.stringify(
        await listLegacyProjectsCreatedOn(args.listCreatedOn),
        null,
        2
      )
    );
    return;
  }
  if (!args.project) throw new Error('--project is required for conversion.');
  const project = await findProject(args.project);
  const evidence = await loadEvidence(project.id);
  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'APPLY' : 'DRY_RUN',
        project: {
          id: project.id,
          code: project.project_code,
          name: project.project_name,
          workflowVersion: project.workflow_version ?? 'legacy_v1',
          createdAt: project.created_at,
        },
        legacyEvidenceLinksToCopy: evidence,
      },
      null,
      2
    )
  );

  if (
    project.workflow_version !== null &&
    project.workflow_version !== 'legacy_v1'
  ) {
    throw new Error(
      `Project is already ${project.workflow_version}; no conversion is allowed.`
    );
  }
  if (!args.apply) {
    console.log(
      'Dry run only. Re-run with --apply and --confirm-project=<exact project code>.'
    );
    return;
  }
  if (args.confirmation !== project.project_code) {
    throw new Error(
      `Apply requires --confirm-project=${project.project_code}.`
    );
  }
  console.log(
    JSON.stringify(await applyConversion(project, evidence), null, 2)
  );
}

main()
  .then(async () => {
    await pgPool.end();
  })
  .catch(async (error) => {
    await pgPool.end().catch(() => undefined);
    console.error('[convert-legacy-project-to-p2-v2] failed:', error);
    process.exitCode = 1;
  });
