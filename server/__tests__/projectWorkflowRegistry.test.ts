import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { projectStepTypeEnum } from '../schema';
import {
  getInitializableProjectWorkflowSteps,
  getOrderedProjectWorkflowSteps,
  getProjectWorkflowDefinition,
  getProjectWorkflowStepDefinition,
  getP2V2StagesForDefinitionVersion,
  isLegacyProjectWorkflow,
  LEGACY_STARTUP_REPAIR_STEPS,
  validateProjectWorkflowDefinition,
} from '../src/services/projectWorkflowRegistry';
import { ProjectWorkflowVersionError } from '../src/services/projectWorkflowVersionService';

const root = resolve(__dirname, '../..');
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), 'utf8');

const LEGACY_TYPES = [
  'rfq_risk_assessment',
  'quote',
  'purchase_review_checklist',
  'preproduction_checklist',
  'p2_order',
] as const;

describe('project workflow registry', () => {
  it('resolves legacy_v1 and NULL to the exact active legacy definition', () => {
    const explicit = getProjectWorkflowDefinition('legacy_v1');
    const implicit = getProjectWorkflowDefinition(null);
    expect(explicit).toBe(implicit);
    expect(explicit).toMatchObject({
      version: 'legacy_v1',
      active: true,
      initializable: true,
    });
    expect(explicit.steps).toHaveLength(5);
    expect(explicit.steps.map((step) => step.type)).toEqual(LEGACY_TYPES);
    expect(explicit.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5]);
    expect(explicit.steps.map((step) => step.initialStatus)).toEqual([
      'in_progress',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(isLegacyProjectWorkflow(null)).toBe(true);
    expect(isLegacyProjectWorkflow('legacy_v1')).toBe(true);
  });

  it('defines p2_v2 as ten initializable customer-PO workflow stages with no legacy database steps', () => {
    const definition = getProjectWorkflowDefinition('p2_v2');
    expect(definition).toMatchObject({
      version: 'p2_v2',
      active: true,
      initializable: true,
    });
    expect(definition.steps).toEqual([]);
    expect(
      definition.stages.map(({ type, label }) => ({ type, label }))
    ).toEqual([
      { type: 'rfq_risk_assessment', label: 'RFQ Review' },
      { type: 'estimate_quote', label: 'Estimate & Quote' },
      { type: 'contract_review', label: 'Contract Review' },
      {
        type: 'technical_configuration_review',
        label: 'Technical & Configuration Review',
      },
      { type: 'production_planning', label: 'Production Planning' },
      { type: 'wad_authorization', label: 'WAD Authorization' },
      { type: 'preproduction_release', label: 'Preproduction Readiness' },
      { type: 'production_quality', label: 'Production' },
      {
        type: 'final_release_shipping',
        label: 'Quality & Product Release',
      },
      { type: 'project_closing', label: 'Shipping & Project Closing' },
    ]);
    expect(definition.stages.map((stage) => stage.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(isLegacyProjectWorkflow('p2_v2')).toBe(false);
    expect(getInitializableProjectWorkflowSteps('p2_v2')).toEqual([]);
  });

  it('retains the definition-version-1 snapshot without converting existing instances', () => {
    expect(
      getP2V2StagesForDefinitionVersion(1).map(({ type, label }) => ({
        type,
        label,
      }))
    ).toContainEqual({
      type: 'design_applicability',
      label: 'Design Applicability',
    });
    expect(
      getP2V2StagesForDefinitionVersion(1).some(
        (stage) => stage.type === 'technical_configuration_review'
      )
    ).toBe(false);
    expect(() => getP2V2StagesForDefinitionVersion(999)).toThrow(
      'Unknown p2_v2 definition version 999'
    );
  });

  it('rejects unknown versions with the Phase 1 structured error', () => {
    expect(() => getProjectWorkflowDefinition('future_v3')).toThrow(
      ProjectWorkflowVersionError
    );
  });

  it('returns immutable definitions and nested metadata', () => {
    const legacy = getProjectWorkflowDefinition('legacy_v1');
    const v2 = getProjectWorkflowDefinition('p2_v2');
    expect(Object.isFrozen(legacy)).toBe(true);
    expect(Object.isFrozen(legacy.steps)).toBe(true);
    expect(Object.isFrozen(legacy.steps[0])).toBe(true);
    expect(Object.isFrozen(v2.stages)).toBe(true);
    expect(Object.isFrozen(v2.stages[0])).toBe(true);
  });

  it('validates both registered definitions at test time', () => {
    expect(() =>
      validateProjectWorkflowDefinition(
        getProjectWorkflowDefinition('legacy_v1')
      )
    ).not.toThrow();
    expect(() =>
      validateProjectWorkflowDefinition(getProjectWorkflowDefinition('p2_v2'))
    ).not.toThrow();
  });

  it('rejects duplicate step orders', () => {
    const legacy = getProjectWorkflowDefinition('legacy_v1');
    expect(() =>
      validateProjectWorkflowDefinition({
        ...legacy,
        steps: legacy.steps.map((step, index) => ({
          ...step,
          order: index === 1 ? 1 : step.order,
        })),
      })
    ).toThrow('legacy_v1 has duplicate step orders');
  });

  it('rejects non-contiguous step orders', () => {
    const legacy = getProjectWorkflowDefinition('legacy_v1');
    expect(() =>
      validateProjectWorkflowDefinition({
        ...legacy,
        steps: legacy.steps.map((step, index) => ({
          ...step,
          order: index === legacy.steps.length - 1 ? 6 : step.order,
        })),
      })
    ).toThrow('legacy_v1 step orders must be contiguous from 1');
  });

  it('keeps legacy types exactly equivalent to the PostgreSQL enum', () => {
    expect(
      getOrderedProjectWorkflowSteps('legacy_v1').map((step) => step.type)
    ).toEqual(projectStepTypeEnum.enumValues);
  });

  it('keeps exact legacy labels and routes', () => {
    expect(
      getOrderedProjectWorkflowSteps('legacy_v1').map(
        ({ type, label, route }) => ({ type, label, route })
      )
    ).toEqual([
      {
        type: 'rfq_risk_assessment',
        label: 'RFQ Risk Assessment',
        route: '/rfq-risk-assessment',
      },
      { type: 'quote', label: 'Quote', route: '/p2-quote-form' },
      {
        type: 'purchase_review_checklist',
        label: 'Purchase Review Checklist',
        route: '/purchase-review-checklist',
      },
      {
        type: 'preproduction_checklist',
        label: 'Pre-production Checklist',
        route: '/preproduction-checklists',
      },
      { type: 'p2_order', label: 'P2 Order', route: '/p2-control-center' },
    ]);
    expect(
      getProjectWorkflowStepDefinition('legacy_v1', 'quote')?.legacyLinkedField
    ).toBe('linkedQuoteId');
  });

  it('keeps startup repair exactly equivalent to the registry', () => {
    expect(LEGACY_STARTUP_REPAIR_STEPS).toEqual(
      getOrderedProjectWorkflowSteps('legacy_v1').map(
        ({ type, order, initialStatus }) => ({
          type,
          order,
          initialStatus,
        })
      )
    );
  });
});

describe('Phase 2 isolation guards', () => {
  const projectsRoute = read('server/src/routes/projects.ts');
  const quotesRoute = read('server/src/routes/quotes.ts');
  const startup = read('server/index.ts');
  const schema = read('server/schema.ts');
  const migrations = read('migrations/0199_project_workflow_version.sql');

  it('keeps legacy step creation isolated from p2_v2 stage initialization', () => {
    expect(projectsRoute).toContain(
      "getInitializableProjectWorkflowSteps('legacy_v1')"
    );
    expect(quotesRoute).toContain(
      "getInitializableProjectWorkflowSteps('legacy_v1')"
    );
    expect(projectsRoute).not.toContain(
      "getInitializableProjectWorkflowSteps('p2_v2')"
    );
    expect(quotesRoute).not.toContain(
      "getInitializableProjectWorkflowSteps('p2_v2')"
    );
  });

  it('keeps startup repair legacy-only and registry-derived', () => {
    expect(startup).toContain('const STEP_TYPES = LEGACY_STARTUP_REPAIR_STEPS');
    expect(startup).toContain(
      "COALESCE(p.workflow_version, 'legacy_v1') = 'legacy_v1'"
    );
  });

  it('does not add V2 stage identifiers to the database enum or migration', () => {
    for (const type of getProjectWorkflowDefinition('p2_v2')
      .stages.map((stage) => stage.type)
      .slice(1)) {
      expect(projectStepTypeEnum.enumValues).not.toContain(type as never);
      expect(schema).not.toMatch(
        new RegExp(`projectStepTypeEnum[\\s\\S]{0,300}'${type}'`)
      );
      expect(migrations).not.toContain(type);
    }
  });
});
