import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import { productionPlanItemBlockers } from '../src/services/projectProductionPlanningValidation';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('migrations/0204_project_production_plans.sql');
const service = read('server/src/services/projectProductionPlanningService.ts');
const routes = read('server/src/routes/projectProductionPlanning.ts');

describe('Phase 6 additive storage', () => {
  it('adds revision-controlled plan and item tables without legacy mutation', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_production_plans'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_production_plan_items'
    );
    expect(migration).toContain("workflow_step_type = 'production_planning'");
    expect(migration).toContain('project_production_plans_current_unique');
    expect(migration).not.toMatch(/UPDATE\s+(?:projects|project_steps)\b/i);
    expect(migration).not.toMatch(/ON DELETE CASCADE/i);
  });
  it('has no physical deletion endpoint or generic stage-status route', () => {
    expect(routes).not.toMatch(/router\.delete/i);
    expect(routes).not.toMatch(/stage-status/);
    expect(service).not.toContain("status='COMPLETE' WHERE id=${req");
  });
});

describe('production-plan readiness decisions', () => {
  const complete = {
    is_manufactured: true,
    part_number: 'P-100',
    bom_release_status: 'RELEASED',
    routing_requirement: 'REQUIRED',
    routing_release_status: 'RELEASED',
    traveler_requirement: 'REQUIRED',
    traveler_type: 'BATCH',
    work_instruction_requirement: 'DRAWING_SPEC_SUFFICIENT',
    work_instruction_basis: 'Released drawing defines all work',
    inspection_extent: 'ONE_HUNDRED_PERCENT',
    fai_requirement: 'NOT_REQUIRED',
    fai_reason: 'No new design/configuration trigger',
    traceability_level: 'BATCH',
    special_process_source: 'NONE',
    special_process_requirements: [],
    required_certifications: [],
    required_test_records: [],
    tooling_requirements: [],
    cnc_program_requirements: [],
    packaging_instruction_requirement: 'NOT_REQUIRED_APPROVED',
    notes: 'Customer packaging specification applies',
  };
  it('accepts batch travelers and 100 percent inspection without a sampling plan', () => {
    expect(productionPlanItemBlockers(complete)).toEqual([]);
  });
  it('blocks sampling without an approved sampling plan', () => {
    expect(
      productionPlanItemBlockers({
        ...complete,
        inspection_extent: 'APPROVED_SAMPLING',
        sampling_plan_id: 'SP-1',
        sampling_plan_status: 'PENDING',
      })
    ).toContain('P-100: approved sampling plan required.');
  });
  it('requires reasons for traveler, routing, FAI, and packaging N/A decisions', () => {
    const blockers = productionPlanItemBlockers({
      ...complete,
      routing_requirement: 'NOT_REQUIRED_APPROVED',
      routing_not_required_reason: '',
      traveler_requirement: 'NOT_REQUIRED_APPROVED',
      traveler_not_required_reason: '',
      fai_reason: '',
      notes: '',
    });
    expect(blockers).toEqual(
      expect.arrayContaining([
        'P-100: routing N/A reason required.',
        'P-100: traveler N/A reason required.',
        'P-100: FAI N/A reason required.',
        'P-100: packaging N/A reason required.',
      ])
    );
  });
  it('does not impose manufacturing decisions on purchased reference leaves', () => {
    expect(
      productionPlanItemBlockers({
        is_manufactured: false,
        part_number: 'BUY-1',
      })
    ).toEqual([]);
  });
});

describe('controlled configuration and approval behavior', () => {
  it('uses the current PO, recursive cycle guard, separate approvals and immutable released revisions', () => {
    expect(service).toContain('po.is_current_revision=true');
    expect(service).toContain(
      'NOT bl.child_part_ag_number=ANY(tree.cycle_path)'
    );
    expect(service).toMatch(/'ENGINEERING',\s*'QUALITY',\s*'OPERATIONS'/);
    expect(service).toMatch(/plan\.status\s*!==\s*'DRAFT'/);
    expect(service).toContain('SEGREGATION_OF_DUTIES');
    expect(service).toContain("status='SUPERSEDED'");
  });

  it('builds Confirm the Order from authoritative PO, quote, commercial, and technical records', () => {
    expect(service).toContain('orderConfirmation: {');
    expect(service).toContain('LEFT JOIN quotes q ON q.id=po.source_quote_id');
    expect(service).toContain('project_commercial_stage_reviews');
    expect(service).toContain('project_technical_configuration_reviews');
    expect(service).toContain(
      'JOIN p2_purchase_order_items poi ON poi.po_id=p.po_id'
    );
    expect(service).toContain('customerPurchaseOrderRevision');
    expect(service).toContain(
      'releasedEvidence: technicalSource.released_evidence'
    );
  });
});
