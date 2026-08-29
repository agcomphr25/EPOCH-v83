import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const route = readFileSync(
  join(process.cwd(), 'server/src/routes/projectProductionPlanning.ts'),
  'utf8'
);
const hub = readFileSync(
  join(process.cwd(), 'server/src/routes/projects.ts'),
  'utf8'
);
const ui = readFileSync(
  join(process.cwd(), 'client/src/pages/ProjectDetailPage.tsx'),
  'utf8'
);

describe('simple manufacturing work-order action', () => {
  it('exposes one operator action backed by the controlled sequence', () => {
    expect(route).toContain(
      "'/launch/:launchId/create-manufacturing-work-orders'"
    );
    expect(route).toContain('authorizeProductionExecution(');
    expect(route).toContain('provisionP2ProductionOrders(');
    expect(route).toContain('provisionP2WorkOrders(');
    expect(route).toContain('provisionP2ComponentTravelers(');
    expect(route).toContain("'projects.production_launch.launch'");
  });

  it('uses a deterministic retry key and server-owned quantities', () => {
    expect(route).toContain('manufacturing-work-orders:${req.params.launchId}');
    expect(route).not.toContain('req.body.quantity');
    expect(route).not.toContain('req.body.partNumber');
  });

  it('exposes only enabled launch identity in the read model', () => {
    expect(hub).toContain('manufacturingWorkOrderAction');
    expect(hub).toContain('isP2V2ExecutionAuthorizationEnabled()');
    expect(hub).toContain('isP2V2ProductionOrderProvisioningEnabled()');
    expect(hub).toContain('isP2V2WorkOrderProvisioningEnabled()');
    expect(hub).toContain('isP2V2ComponentTravelerProvisioningEnabled()');
    expect(hub).toContain("event_type = 'P2_COMPONENT_TRAVELERS_PROVISIONED'");
  });

  it('shows one plain-language button only while work orders are missing and disables it until launch is eligible', () => {
    expect(ui).toContain('Create Manufacturing Work Orders');
    expect(ui).toContain('hasMissingManufacturingWorkOrder');
    expect(ui).toContain(
      'Complete Production Launch before creating manufacturing work orders.'
    );
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.launchId');
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.expectedLaunchDigest');
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.enabled');
    expect(ui).toContain('manufacturing-work-orders-launch-required');
    expect(ui).not.toContain('Authorize Execution</Button>');
    expect(ui).not.toContain('Provision P2 Orders</Button>');
  });
});
