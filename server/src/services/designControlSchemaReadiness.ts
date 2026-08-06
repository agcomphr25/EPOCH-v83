import { sql } from 'drizzle-orm';

import { db } from '../../db';

export const requiredDesignControlMigrations = [
  '0189_design_control_workflow.sql',
  '0190_design_control_requirement_applicability.sql',
  '0191_engineering_releases.sql',
  '0192_engineering_packages.sql',
  '0207_design_control_authority_foundation.sql',
  '0208_design_control_authenticated_approvals.sql',
  '0248_design_project_manufacturing_configuration.sql',
  '0251_design_project_configuration_workspace.sql',
  '0258_design_control_structured_lifecycle.sql',
] as const;

export const requiredDesignControlTables = [
  'design_control_records',
  'design_control_steps',
  'design_control_step_content_versions',
  'design_control_step_approvals',
  'design_control_requirements',
  'design_control_risks',
  'design_control_reviews',
  'design_control_verification',
  'design_control_validation',
  'design_control_changes',
  'design_control_release_gate',
  'design_control_requirement_applicability',
  'engineering_releases',
  'engineering_release_baselines',
  'engineering_release_baseline_items',
  'engineering_release_approvals',
  'engineering_packages',
  'engineering_package_items',
  'design_project_configuration_items',
  'design_project_configuration_item_relationships',
  'design_project_part_revisions',
  'design_project_document_applicability',
  'design_project_part_revision_artifacts',
  'routing_operation_work_instruction_revisions',
  'design_project_configuration_reconciliation_queue',
  'design_project_configuration_reconciliation_events',
  'design_project_configuration_workspaces',
  'design_control_project_access_policies',
  'design_control_project_assignments',
  'design_control_project_assignment_events',
  'design_control_structured_record_versions',
  'design_control_structured_record_decisions',
  'design_control_structured_record_links',
  'design_control_review_actions',
  'design_control_traceability_snapshots',
  'design_control_final_review_exceptions',
  'design_control_final_review_snapshots',
] as const;

type ReadinessClient = Pick<typeof db, 'execute'>;

export class DesignControlSchemaNotReadyError extends Error {
  readonly code = 'DESIGN_CONTROL_SCHEMA_NOT_READY';
  readonly requiredMigrations = [...requiredDesignControlMigrations];
  readonly missingObjects: string[];
  readonly causeMessage?: string;

  constructor(missingObjects: string[], cause?: unknown) {
    super('Required Design Control migrations have not completed.');
    this.name = 'DesignControlSchemaNotReadyError';
    this.missingObjects = missingObjects;
    this.causeMessage =
      cause instanceof Error
        ? cause.message
        : cause
          ? String(cause)
          : undefined;
  }
}

let schemaReady = false;
let readinessPromise: Promise<void> | null = null;

export function designControlSchemaNotReadyPayload(
  error?: DesignControlSchemaNotReadyError
) {
  return {
    error: 'DESIGN_CONTROL_SCHEMA_NOT_READY',
    message: 'Required Design Control migrations have not completed.',
    requiredMigrations: [...requiredDesignControlMigrations],
    missingObjects: error?.missingObjects ?? [],
  };
}

export function isDesignControlSchemaNotReadyError(
  error: unknown
): error is DesignControlSchemaNotReadyError {
  return (
    error instanceof DesignControlSchemaNotReadyError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'DESIGN_CONTROL_SCHEMA_NOT_READY')
  );
}

function isMissingSchemaError(error: unknown) {
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: string }).code
      : undefined;
  const message = error instanceof Error ? error.message : String(error ?? '');

  return (
    code === '42P01' ||
    code === '42703' ||
    /relation .* does not exist/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

export async function assertDesignControlSchemaReady(
  client: ReadinessClient = db
) {
  if (client === db && schemaReady) return;
  if (client === db && readinessPromise) return readinessPromise;

  const run = async () => {
    for (const table of requiredDesignControlTables) {
      try {
        await client.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 0`));
      } catch (error) {
        if (isMissingSchemaError(error)) {
          throw new DesignControlSchemaNotReadyError([table], error);
        }
        throw error;
      }
    }

    const authorityColumns = await client.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'design_control_records'
        AND column_name IN (
          'authority_status', 'designated_authoritative_at', 'designated_authoritative_by',
          'superseded_at', 'superseded_by', 'supersession_reason',
          'superseded_by_record_id', 'record_version'
        )
    `);
    const columnRows = ((authorityColumns as any)?.rows ??
      authorityColumns) as Array<{ column_name?: string }>;
    const presentColumns = new Set(
      Array.isArray(columnRows) ? columnRows.map((row) => row.column_name) : []
    );
    const requiredColumns = [
      'authority_status',
      'designated_authoritative_at',
      'designated_authoritative_by',
      'superseded_at',
      'superseded_by',
      'supersession_reason',
      'superseded_by_record_id',
      'record_version',
    ];
    const missingColumns = requiredColumns.filter(
      (column) => !presentColumns.has(column)
    );
    if (missingColumns.length > 0) {
      throw new DesignControlSchemaNotReadyError(
        missingColumns.map((column) => `design_control_records.${column}`)
      );
    }

    const authorityIndex = await client.execute(sql`
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'design_control_records'
        AND indexname = 'design_control_records_authoritative_rd_project_unique'
      LIMIT 1
    `);
    const indexRows = (authorityIndex as any)?.rows ?? authorityIndex;
    if (!Array.isArray(indexRows) || indexRows.length === 0) {
      throw new DesignControlSchemaNotReadyError([
        'design_control_records_authoritative_rd_project_unique',
      ]);
    }

    const authorityConstraints = await client.execute(sql`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'design_control_records_authority_status_check',
        'design_control_records_superseded_by_record_fk'
      )
    `);
    const constraintRows = ((authorityConstraints as any)?.rows ??
      authorityConstraints) as Array<{ conname?: string }>;
    const presentConstraints = new Set(
      Array.isArray(constraintRows)
        ? constraintRows.map((row) => row.conname)
        : []
    );
    const requiredConstraints = [
      'design_control_records_authority_status_check',
      'design_control_records_superseded_by_record_fk',
    ];
    const missingConstraints = requiredConstraints.filter(
      (name) => !presentConstraints.has(name)
    );
    if (missingConstraints.length > 0) {
      throw new DesignControlSchemaNotReadyError(missingConstraints);
    }

    const approvalColumns = await client.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'design_control_steps'
        AND column_name IN (
          'current_content_version_id', 'content_version', 'approval_mode',
          'submitted_at', 'submitted_by_user_id', 'submitted_by_snapshot'
        )
    `);
    const approvalColumnRows = ((approvalColumns as any)?.rows ??
      approvalColumns) as Array<{ column_name?: string }>;
    const presentApprovalColumns = new Set(
      Array.isArray(approvalColumnRows)
        ? approvalColumnRows.map((row) => row.column_name)
        : []
    );
    const requiredApprovalColumns = [
      'current_content_version_id',
      'content_version',
      'approval_mode',
      'submitted_at',
      'submitted_by_user_id',
      'submitted_by_snapshot',
    ];
    const missingApprovalColumns = requiredApprovalColumns.filter(
      (column) => !presentApprovalColumns.has(column)
    );
    if (missingApprovalColumns.length > 0) {
      throw new DesignControlSchemaNotReadyError(
        missingApprovalColumns.map((column) => `design_control_steps.${column}`)
      );
    }

    const approvalStructures = await client.execute(sql`
      SELECT indexname AS object_name
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'design_control_step_content_versions_step_version_unique',
          'design_control_step_approvals_valid_slot_unique'
        )
      UNION ALL
      SELECT tgname AS object_name
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'prevent_design_control_step_version_delete',
          'prevent_design_control_step_approval_delete'
        )
    `);
    const structureRows = ((approvalStructures as any)?.rows ??
      approvalStructures) as Array<{ object_name?: string }>;
    const presentStructures = new Set(
      Array.isArray(structureRows)
        ? structureRows.map((row) => row.object_name)
        : []
    );
    const requiredStructures = [
      'design_control_step_content_versions_step_version_unique',
      'design_control_step_approvals_valid_slot_unique',
      'prevent_design_control_step_version_delete',
      'prevent_design_control_step_approval_delete',
    ];
    const missingStructures = requiredStructures.filter(
      (name) => !presentStructures.has(name)
    );
    if (missingStructures.length > 0) {
      throw new DesignControlSchemaNotReadyError(missingStructures);
    }

    if (client === db) {
      schemaReady = true;
    }
  };

  if (client === db) {
    readinessPromise = run().catch((error) => {
      readinessPromise = null;
      throw error;
    });
    return readinessPromise;
  }

  return run();
}
