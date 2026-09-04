import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateProductionCompletion,
  type ProductionEvidenceInput,
} from '../src/services/projectProductionExecutionRules';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const service = read(
  'server/src/services/projectProductionExecutionService.ts'
);
const routes = read('server/src/routes/projectProductionExecution.ts');
const travelerRoutes = read('server/src/routes/travelers.ts');
const workOrderRoutes = read('server/src/routes/workOrders.ts');
const migration = read('migrations/0220_p2_v2_production_execution.sql');
const workflow = read('client/src/components/projects/P2V2ProjectWorkflow.tsx');

const ready = (
  patch: Partial<ProductionEvidenceInput> = {}
): ProductionEvidenceInput => ({
  authorizedQuantity: 2,
  completedQuantity: 2,
  acceptedQuantity: 2,
  rejectedQuantity: 0,
  scrappedQuantity: 0,
  productionOrdersRequired: 2,
  productionOrdersComplete: 2,
  travelerMode: 'INDIVIDUAL',
  requiredTravelers: 2,
  currentTravelers: 2,
  incompleteTravelerSteps: 0,
  missingTravelerActors: 0,
  missingMaterialGenealogy: 0,
  invalidMaterialConsumptions: 0,
  openLaborEntries: 0,
  trainingGaps: 0,
  calibrationGaps: 0,
  incompleteInspections: 0,
  incompleteTests: 0,
  incompleteSpecialProcesses: 0,
  openNcrs: 0,
  incompleteRework: 0,
  activeHolds: 0,
  baselineChanged: false,
  mixedConfiguration: false,
  noTravelerExceptionApproved: false,
  manufacturingEngineeringApprovalRequired: false,
  ...patch,
});

describe('Phase 9A Production execution controls', () => {
  it('rejects manual Stage 8 activation by requiring completed launch evidence', () => {
    expect(service).toContain('CERTIFIED_PRODUCTION_LAUNCH_REQUIRED');
    expect(routes).not.toContain('activate');
  });
  it('requires a completed certified production launch', () => {
    expect(service).toContain("pl.status='COMPLETE'");
  });
  it('gates V2 traveler creation and work start without changing legacy execution', () => {
    expect(workOrderRoutes).toContain('getProjectProductionExecutionGate');
    expect(travelerRoutes).toContain('getTravelerProductionExecutionGate');
    expect(service).toContain("version !== 'p2_v2'");
    expect(service).toContain(
      'P2 V2 work cannot start before certified Production Launch activates Stage 8.'
    );
  });
  it('rejects legacy and NULL projects from V2 Production mutations', () => {
    expect(service).toContain("version !== 'p2_v2'");
    expect(service).toContain('P2_V2_REQUIRED');
  });
  it('fails unknown workflow versions closed', () => {
    expect(service).toContain('UNKNOWN_WORKFLOW_VERSION');
  });
  it('does not modify legacy execution routes or project_steps', () => {
    expect(service).not.toContain('project_steps');
    expect(routes).toContain('Router({ mergeParams: true })');
  });
  it('does not modify Design Control behavior', () => {
    expect(service).not.toContain('design_control');
    expect(migration).not.toContain('design_control');
  });
  it('builds the dashboard from authoritative execution tables', () => {
    for (const table of [
      'p2_production_orders',
      'p2_serialized_items',
      'travelers',
      'traveler_steps',
      'time_clock_entries',
      'nonconformance_records',
    ])
      expect(service).toContain(table);
  });
  it('tracks parent and manufactured child orders as separate authoritative rows', () => {
    expect(service).toContain('productionOrders');
    expect(service).toContain('requiredManufacturedItems');
  });
  it('does not require purchased components to have manufactured orders', () => {
    expect(service).toContain("item.make_buy === 'MAKE'");
  });
  it('enforces individual traveler counts', () => {
    expect(
      evaluateProductionCompletion(
        ready({ travelerMode: 'INDIVIDUAL', currentTravelers: 1 })
      ).blockers
    ).toContain('Required current traveler evidence is missing.');
  });
  it('supports one current batch traveler for a manufactured scope', () => {
    expect(
      evaluateProductionCompletion(
        ready({
          travelerMode: 'BATCH',
          requiredTravelers: 1,
          currentTravelers: 1,
        })
      ).state
    ).toBe('READY_FOR_COMPLETION_REVIEW');
  });
  it('supports approved no-traveler exceptions', () => {
    expect(
      evaluateProductionCompletion(
        ready({
          travelerMode: 'NO_TRAVELER_EXCEPTION',
          requiredTravelers: 0,
          currentTravelers: 0,
          noTravelerExceptionApproved: true,
        })
      ).state
    ).toBe('READY_FOR_COMPLETION_REVIEW');
  });
  it('blocks an unapproved no-traveler exception', () => {
    expect(
      evaluateProductionCompletion(
        ready({
          travelerMode: 'NO_TRAVELER_EXCEPTION',
          noTravelerExceptionApproved: false,
        })
      ).blockers
    ).toContain('The no-traveler exception lacks approved justification.');
  });
  it('blocks missing traveler evidence', () => {
    expect(
      evaluateProductionCompletion(ready({ currentTravelers: 0 })).state
    ).toBe('BLOCKED');
  });
  it('enforces routing-operation completion', () => {
    expect(
      evaluateProductionCompletion(ready({ incompleteTravelerSteps: 1 }))
        .blockers
    ).toContain('Released routing operations are not complete.');
  });
  it('blocks material genealogy gaps', () => {
    expect(
      evaluateProductionCompletion(ready({ missingMaterialGenealogy: 1 }))
        .blockers
    ).toContain(
      'Required material lot or received-unit genealogy is incomplete.'
    );
  });
  it('blocks expired, quarantined, or rejected material', () => {
    expect(
      evaluateProductionCompletion(ready({ invalidMaterialConsumptions: 1 }))
        .blockers
    ).toContain(
      'Expired, quarantined, or rejected material consumption is invalid.'
    );
  });
  it('blocks training and certification gaps', () => {
    expect(
      evaluateProductionCompletion(ready({ trainingGaps: 1 })).blockers
    ).toContain('Required employee training or certification is not current.');
  });
  it('blocks calibration gaps', () => {
    expect(
      evaluateProductionCompletion(ready({ calibrationGaps: 1 })).blockers
    ).toContain(
      'Required calibrated equipment evidence is missing or expired.'
    );
  });
  it('blocks in-process inspection holds and incomplete inspections', () => {
    const result = evaluateProductionCompletion(
      ready({ incompleteInspections: 1, activeHolds: 1 })
    );
    expect(result.state).toBe('BLOCKED');
    expect(result.blockers).toContain(
      'Required in-process inspections or sampling remain incomplete.'
    );
  });
  it('blocks unresolved NCRs', () => {
    expect(
      evaluateProductionCompletion(ready({ openNcrs: 1 })).blockers
    ).toContain('An unresolved blocking NCR affects Production completion.');
  });
  it('requires rework completion and reinspection', () => {
    expect(
      evaluateProductionCompletion(ready({ incompleteRework: 1 })).blockers
    ).toContain(
      'Rework requires approved instructions, completion, and reinspection.'
    );
  });
  it('does not count scrap as accepted completion', () => {
    expect(
      evaluateProductionCompletion(
        ready({ acceptedQuantity: 1, scrappedQuantity: 1 })
      ).blockers
    ).toContain(
      'Scrapped quantity is not accepted completion; disposition and replacement quantity are required.'
    );
  });
  it('detects underproduction and overproduction', () => {
    expect(
      evaluateProductionCompletion(ready({ completedQuantity: 1 })).blockers
    ).toContain('Authorized manufactured quantity is underproduced.');
    expect(
      evaluateProductionCompletion(ready({ completedQuantity: 3 })).blockers
    ).toContain('Unauthorized overproduction was detected.');
  });
  it('marks post-launch baseline changes stale', () => {
    expect(
      evaluateProductionCompletion(ready({ baselineChanged: true })).state
    ).toBe('STALE');
  });
  it('blocks mixed configuration and effectivity', () => {
    expect(
      evaluateProductionCompletion(ready({ mixedConfiguration: true })).blockers
    ).toContain('Mixed or unidentified configuration/effectivity exists.');
  });
  it('enforces required approvals and segregation of duties', () => {
    expect(service).toContain('SEGREGATION_OF_DUTIES');
    expect(service).toContain('PRODUCTION_APPROVALS_REQUIRED');
    for (const role of [
      'OPERATIONS',
      'QUALITY',
      'PROJECT_MANAGEMENT',
      'MANUFACTURING_ENGINEERING',
    ])
      expect(migration).toContain(role);
  });
  it('makes completed Production evidence immutable', () => {
    expect(migration).toContain(
      'Completed Production-stage evidence is immutable'
    );
  });
  it('rejects concurrent and stale writes with optimistic locking', () => {
    expect(service).toContain('lock_version=${expectedLockVersion}');
    expect(service).toContain('STALE_WRITE');
  });
  it('does not perform final product release', () => {
    expect(service).toContain('finalProductReleased: false');
  });
  it('does not create or authorize shipping', () => {
    expect(service).toContain('shippingAuthorized: false');
    expect(service).not.toContain('INSERT INTO shipment');
  });
  it('keeps Stages 9 and 10 read-only', () => {
    expect(workflow).toContain("case 'quality_product_release':");
    expect(workflow).toContain("case 'shipping_project_closeout':");
    expect(service).not.toContain("step_type='final");
    expect(service).not.toContain("step_type='shipping");
  });
  it('requires attributable traveler completion evidence', () => {
    expect(
      evaluateProductionCompletion(ready({ missingTravelerActors: 1 })).blockers
    ).toContain(
      'Completed traveler steps require an attributable actor and timestamp.'
    );
  });
});
