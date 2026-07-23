import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

import {
  inheritedRequirementBlockers,
  wadBudgetBlockers,
} from '../src/services/projectWadAuthorizationValidation';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('migrations/0205_project_wad_authorizations.sql');
const service = read('server/src/services/projectWadAuthorizationService.ts');
const routes = read('server/src/routes/projectWadAuthorization.ts');

describe('Phase 7 additive WAD bridge', () => {
  it('adds a controlled bridge without legacy backfill or project_steps mutation', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS project_wad_authorizations'
    );
    expect(migration).toContain("workflow_step_type = 'wad_authorization'");
    expect(migration).toContain('project_wad_authorizations_current_unique');
    expect(migration).not.toMatch(/UPDATE\s+(?:projects|project_steps)\b/i);
    expect(migration).not.toMatch(/ON DELETE CASCADE/i);
  });
  it('has scoped routes with no delete or arbitrary status input', () => {
    expect(routes).toContain("router.post('/create-draft'");
    expect(routes).toContain("router.post('/link-existing'");
    expect(routes).toContain("router.post('/:authorizationId/release'");
    expect(routes).not.toMatch(/router\.delete/i);
    expect(routes).not.toMatch(/stage-status|mark-complete|skip/i);
    expect(service).toContain('EXISTING_WAD_REQUIRES_LINK');
    expect(service).toContain('LINK_MATCHING_BASELINE');
  });
});

describe('WAD inheritance and budget readiness', () => {
  const manufactured = {
    is_manufactured: true,
    part_number: 'MAKE-1',
    routing_requirement: 'REQUIRED',
    traveler_requirement: 'REQUIRED',
    work_instruction_requirement: 'DRAWING_SPEC_SUFFICIENT',
    inspection_requirement: 'REQUIRED',
    inspection_extent: 'ONE_HUNDRED_PERCENT',
    fai_requirement: 'NOT_REQUIRED',
    traceability_level: 'LOT',
    special_process_source: 'NONE',
    packaging_instruction_requirement: 'NOT_REQUIRED_APPROVED',
  };
  it('accepts a complete manufactured requirement snapshot', () => {
    expect(inheritedRequirementBlockers([manufactured])).toEqual([]);
  });
  it('blocks missing sampling and manufacturing decisions exactly', () => {
    expect(
      inheritedRequirementBlockers([
        {
          ...manufactured,
          routing_requirement: null,
          inspection_extent: 'APPROVED_SAMPLING',
          sampling_plan_id: null,
        },
      ])
    ).toEqual(
      expect.arrayContaining([
        'MAKE-1: inherited routing decision is missing.',
        'MAKE-1: approved sampling requires a sampling-plan ID.',
      ])
    );
  });
  it('requires charge codes, budgets, schedule, risks and owners', () => {
    expect(
      wadBudgetBlockers({
        departments: [{ department: 'Assembly', hours: 0, chargeCodeId: null }],
        materialBudget: null,
        outsideProcessingBudget: null,
      })
    ).toEqual(
      expect.arrayContaining([
        'Assembly: an active charge code is required.',
        'Assembly: zero-budget work requires justification.',
        'A non-negative material budget is required.',
        'Outside-processing budget must be addressed with a non-negative value.',
        'WAD start and due dates are required.',
        'At least one project risk and control is required.',
        'At least one responsible owner is required.',
      ])
    );
  });
});

describe('controlled approval, release and revision behavior', () => {
  it('requires separate capabilities and exact-revision evidence', () => {
    for (const role of [
      'PROJECT_MANAGEMENT',
      'ENGINEERING',
      'QUALITY',
      'OPERATIONS',
      'FINANCE',
      'EXECUTIVE',
    ])
      expect(service).toContain(role);
    expect(service).toContain('SEGREGATION_OF_DUTIES');
    expect(service).toContain('step_revision_snapshot');
    expect(service).toContain('APPROVALS_REQUIRED');
  });
  it('releases authoritative WAD without calling production launch paths', () => {
    expect(service).toContain("wad_status='APPROVED',status='RELEASED'");
    expect(service).not.toMatch(
      /release-to-p2|manufacturing_queue|travelers|production_orders/i
    );
    expect(service).toContain("status='SUPERSEDED'");
    expect(service).toContain('superseded_by_authorization_id');
  });
});
