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
  it('keeps the legacy launch route while the project action uses controlled queue materialization', () => {
    expect(route).toContain(
      "'/launch/:launchId/create-manufacturing-work-orders'"
    );
    expect(ui).toContain(
      '/frozen-production-demand/${action.baselineId}/materialize-work-orders'
    );
  });

  it('uses released baseline evidence and a deterministic retry key', () => {
    expect(ui).toContain('manufacturing-work-orders:${action.baselineId}');
    expect(ui).toContain(
      'expectedBaselineChecksum: action.expectedBaselineChecksum'
    );
  });

  it('exposes the completed launch and released frozen-demand authority', () => {
    expect(hub).toContain('manufacturingWorkOrderAction');
    expect(hub).toContain(
      'areP2ManufacturingWorkOrderMaterializationEnabled()'
    );
    expect(hub).toContain("status = 'RELEASED'");
    expect(hub).toContain('wad_authorization_id = pl.wad_authorization_id');
    expect(hub).toContain('p2_manufacturing_work_order_authorities');
    expect(hub).toContain('expectedBaselineChecksum');
  });

  it('shows one plain-language button only while work orders are missing and disables it until launch is eligible', () => {
    expect(ui).toContain('Create Manufacturing Work Orders');
    expect(ui).toContain('hasMissingManufacturingWorkOrder');
    expect(ui).toContain(
      'Complete Production Launch and release Frozen Production Demand before creating manufacturing work orders.'
    );
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.launchId');
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.expectedLaunchDigest');
    expect(ui).toContain(
      '!hubProduction.manufacturingWorkOrderAction?.baselineId'
    );
    expect(ui).toContain(
      '!hubProduction.manufacturingWorkOrderAction?.expectedBaselineChecksum'
    );
    expect(ui).toContain('!hubProduction.manufacturingWorkOrderAction?.enabled');
    expect(ui).toContain('manufacturing-work-orders-launch-required');
    expect(ui).not.toContain('Authorize Execution</Button>');
    expect(ui).not.toContain('Provision P2 Orders</Button>');
  });
});
