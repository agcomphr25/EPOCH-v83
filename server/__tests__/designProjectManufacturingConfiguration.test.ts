import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESIGN_CONTROL_AUTHORIZATION } from '../src/designControlAuthorization';
import {
  requiredDesignControlMigrations,
  requiredDesignControlTables,
} from '../src/services/designControlSchemaReadiness';
import {
  criticalMigrationFiles,
  safeMigrationFiles,
} from '../scripts/migrations/runSafeBootMigrations';

const migrationName = '0248_design_project_manufacturing_configuration.sql';
const migration = readFileSync(
  join(process.cwd(), 'migrations', migrationName),
  'utf8'
);
const schema = readFileSync(join(process.cwd(), 'server/schema.ts'), 'utf8');

describe('Design Project manufacturing-configuration Phase 1', () => {
  it('registers the migration as safe, critical, and Design Control required', () => {
    expect(safeMigrationFiles).toContain(migrationName);
    expect(criticalMigrationFiles.has(migrationName)).toBe(true);
    expect(requiredDesignControlMigrations).toContain(migrationName);
  });

  it('models a multi-level tree with same-project and cycle guards', () => {
    expect(migration).toContain(
      'design_project_configuration_item_relationships'
    );
    expect(migration).toContain('WITH RECURSIVE descendants');
    expect(migration).toContain('parent_project <> child_project');
    expect(migration).toContain('NEW.rd_project_id <> parent_project');
  });

  it('uses rd_projects text identity and never part_routings.project_id for ownership', () => {
    expect(migration).toContain(
      'rd_project_id text NOT NULL REFERENCES rd_projects(id) ON DELETE RESTRICT'
    );
    expect(migration).not.toMatch(
      /design_project_configuration_items[\s\S]*?REFERENCES projects\(id\)/
    );
    expect(schema).toContain("rdProjectId: text('rd_project_id')");
  });

  it('retains multiple immutable part revisions and supports supersession', () => {
    expect(migration).toContain(
      'predecessor_revision_id uuid REFERENCES design_project_part_revisions(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'design_project_part_revisions_item_identifier_unique'
    );
    expect(migration).toContain(
      'design_project_part_revisions_predecessor_successor_unique'
    );
    expect(migration).toContain(
      'A released successor must reference the current released predecessor'
    );
    expect(migration).toContain(
      "OLD.lifecycle_state IN ('RELEASED','SUPERSEDED','OBSOLETE')"
    );
  });

  it('links exact controlled drawing, BOM, routing, and work-instruction revisions', () => {
    for (const role of [
      'CAD',
      'DRAWING',
      'BOM',
      'ROUTING',
      'WORK_INSTRUCTION',
    ]) {
      expect(migration).toContain(`'${role}'`);
    }
    expect(migration).toContain(
      'controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id)'
    );
    expect(migration).toContain('revision_snapshot text NOT NULL');
    expect(migration).toContain('checksum_snapshot text NOT NULL');
  });

  it('pins work instructions to exact revisions for a released routing revision', () => {
    expect(migration).toContain(
      'routing_controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id)'
    );
    expect(migration).toContain(
      'work_instruction_controlled_revision_id uuid NOT NULL REFERENCES engineering_controlled_revisions(id)'
    );
    expect(migration).toContain(
      'work_instruction_revision_snapshot text NOT NULL'
    );
    expect(migration).toContain(
      'routing_operation_work_instruction_revisions_guard'
    );
  });

  it('extends immutable Engineering Release baselines with configuration evidence', () => {
    for (const column of [
      'configuration_item_id',
      'part_revision_id',
      'artifact_role',
      'controlled_revision_id',
      'artifact_checksum',
      'effectivity_snapshot',
      'applicability_decision',
      'omission_justification',
      'ecr_id',
      'ecn_id',
    ])
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    expect(migration).not.toContain('ON DELETE CASCADE,\n  ADD COLUMN');
  });

  it('keeps missing evidence visible and requires approved justification for not applicable', () => {
    expect(migration).toContain(
      "decision IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE')"
    );
    expect(migration).toContain("decision <> 'NOT_APPLICABLE' OR");
    expect(migration).toContain('approved_by_user_id IS NOT NULL');
    expect(migration).toContain('approved_at IS NOT NULL');
  });

  it('queues ambiguity without auto-linking legacy records', () => {
    expect(migration).toContain(
      'design_project_configuration_reconciliation_queue'
    );
    expect(migration).toContain(
      "ambiguity_status text NOT NULL DEFAULT 'PENDING_REVIEW'"
    );
    expect(migration).not.toMatch(
      /INSERT INTO design_project_configuration_items[\s\S]*SELECT/i
    );
    expect(migration).not.toMatch(
      /UPDATE\s+(rd_projects|part_routings|routing_documents)/i
    );
  });

  it('registers fail-closed server authorization actions', () => {
    expect(DESIGN_CONTROL_AUTHORIZATION.configurationView).toEqual([
      'design.configuration.view',
    ]);
    expect(DESIGN_CONTROL_AUTHORIZATION.configurationEdit).toEqual([
      'design.configuration.edit',
    ]);
    expect(
      DESIGN_CONTROL_AUTHORIZATION.configurationApplicabilityApproval
    ).toEqual(['design.configuration.applicability.approve']);
    expect(DESIGN_CONTROL_AUTHORIZATION.configurationRevisionRelease).toEqual([
      'design.configuration.revision.release',
    ]);
    expect(DESIGN_CONTROL_AUTHORIZATION.configurationBaselineCreate).toEqual([
      'design.configuration.baseline.create',
    ]);
    expect(DESIGN_CONTROL_AUTHORIZATION.configurationReconciliation).toEqual([
      'design.configuration.reconcile',
    ]);
  });

  it('adds every Phase 1 table to schema readiness', () => {
    for (const table of [
      'design_project_configuration_items',
      'design_project_configuration_item_relationships',
      'design_project_part_revisions',
      'design_project_document_applicability',
      'design_project_part_revision_artifacts',
      'routing_operation_work_instruction_revisions',
      'design_project_configuration_reconciliation_queue',
      'design_project_configuration_reconciliation_events',
    ] as const)
      expect(requiredDesignControlTables).toContain(table);
  });

  it('is additive and replay-safe', () => {
    expect(migration).not.toMatch(
      /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM)\b/i
    );
    expect(migration.match(/CREATE TABLE IF NOT EXISTS/g)?.length).toBe(8);
    expect(migration).not.toMatch(/INSERT INTO (?!perm_capabilities)/i);
    expect(migration).toContain('ON CONFLICT (key) DO NOTHING');
  });
});
