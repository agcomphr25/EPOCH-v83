import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  getInternalP2V2InitializationStages,
  getP2V2StagesForDefinitionVersion,
  P2_V2_DEFINITION_VERSION,
} from '../src/services/projectWorkflowRegistry';
import { validateWorkflowInstanceIntegrity } from '../src/services/projectWorkflowInstanceIntegrity';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('migrations/0202_project_workflow_instances.sql');

describe('Phase 3 additive migration safety', () => {
  it('adds four V2 evidence tables without mutating legacy data or enum definitions', () => {
    for (const table of [
      'project_workflow_instances',
      'project_workflow_step_instances',
      'project_workflow_step_links',
      'project_workflow_step_approvals',
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i')
      );
    }
    expect(migration).not.toMatch(/UPDATE\s+(?:projects|project_steps)\b/i);
    expect(
      migration.replace(/ON DELETE (?:RESTRICT|SET NULL)/gi, '')
    ).not.toMatch(/\b(?:DELETE|DROP|ALTER\s+TYPE)\b/i);
    expect(migration).not.toContain('project_step_type');
  });

  it('keeps evidence through restrictive foreign keys and project-matching composite keys', () => {
    expect(
      migration.match(/ON DELETE RESTRICT/g)?.length
    ).toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      'FOREIGN KEY (workflow_instance_id, project_id)'
    );
    expect(migration).toContain(
      'FOREIGN KEY (workflow_step_instance_id, project_id)'
    );
    expect(migration).toContain("workflow_version = 'p2_v2'");
  });
});

describe('p2_v2 workflow instance snapshots and integrity', () => {
  const stages = getInternalP2V2InitializationStages();
  const instance = {
    project_id: 'project-1',
    workflow_version: 'p2_v2',
    definition_version: P2_V2_DEFINITION_VERSION,
  };
  const validSteps = stages.map((stage) => ({
    project_id: 'project-1',
    step_type: stage.type,
    step_order: stage.order,
    label_snapshot: stage.label,
    description_snapshot: stage.description,
  }));

  it('exposes the exact immutable ten-stage initialization snapshot', () => {
    expect(Object.isFrozen(stages)).toBe(true);
    expect(stages.map((stage) => stage.type)).toEqual([
      'rfq_risk_assessment',
      'estimate_quote',
      'contract_review',
      'technical_configuration_review',
      'production_planning',
      'wad_authorization',
      'preproduction_release',
      'production_quality',
      'final_release_shipping',
      'project_closing',
    ]);
    expect(stages.every((stage) => stage.label && stage.description)).toBe(
      true
    );
  });

  it('accepts a complete registry-matching instance', () => {
    expect(validateWorkflowInstanceIntegrity(instance, validSteps)).toEqual([]);
  });

  it('continues to validate stored definition-version-1 snapshots unchanged', () => {
    const legacySnapshot = getP2V2StagesForDefinitionVersion(1);
    expect(
      validateWorkflowInstanceIntegrity(
        { ...instance, definition_version: 1 },
        legacySnapshot.map((stage) => ({
          project_id: instance.project_id,
          step_type: stage.type,
          step_order: stage.order,
          label_snapshot: stage.label,
          description_snapshot: stage.description,
        }))
      )
    ).toEqual([]);
  });

  it('reports missing, duplicate, order, project, unknown, definition, and version corruption', () => {
    const corrupt = [
      ...validSteps.slice(1),
      { ...validSteps[1], project_id: 'wrong-project' },
      { ...validSteps[2], step_type: 'unknown_stage', step_order: 2 },
      { ...validSteps[4], label_snapshot: 'Changed live label' },
    ];
    const codes = validateWorkflowInstanceIntegrity(
      { ...instance, workflow_version: 'legacy_v1' },
      corrupt
    ).map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'WRONG_WORKFLOW_VERSION',
        'MISSING_STAGE',
        'DUPLICATE_STAGE',
        'DUPLICATE_ORDER',
        'PROJECT_MISMATCH',
        'UNKNOWN_STEP_TYPE',
        'REGISTRY_DEFINITION_MISMATCH',
      ])
    );
  });
});

describe('Phase 3 activation isolation', () => {
  const service = read('server/src/services/projectWorkflowInstanceService.ts');
  const projectsRoute = read('server/src/routes/projects.ts');
  const quotesRoute = read('server/src/routes/quotes.ts');

  it('allows initialization only from transactional creation paths and rejects legacy-effective projects', () => {
    expect(service).toContain("version !== 'p2_v2'");
    expect(projectsRoute).toContain('initializeV2Workflow(');
    expect(quotesRoute).toContain('initializeV2Workflow(');
    expect(projectsRoute).not.toMatch(/router\.post\([^)]*initialize/i);
    expect(quotesRoute).not.toMatch(/router\.post\([^)]*initialize/i);
  });

  it('does not write project_steps or project workflow progress fields', () => {
    expect(service).not.toMatch(/INSERT INTO project_steps/i);
    expect(service).not.toMatch(/UPDATE\s+projects/i);
    expect(service).not.toMatch(/current_stage\s*=|current_step_type\s*=/i);
  });

  it('initializes the first stage in progress and leaves later stages not started', () => {
    expect(service).toContain(
      "stage.order === 1 ? 'IN_PROGRESS' : 'NOT_STARTED'"
    );
    expect(service).toContain("'REQUIRED'");
    expect(service).toContain('P2_V2_WORKFLOW_INITIALIZED');
  });
});
