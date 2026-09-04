import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const page = fs.readFileSync(
  path.join(root, 'client/src/pages/ProjectDetailPage.tsx'),
  'utf8'
);

describe('Project Production navigation contract', () => {
  it('preserves project and linked PO context for every P2 Control Center view', () => {
    expect(page).toContain("tab: 'status' | 'production' | 'production-map'");
    expect(page).toContain('new URLSearchParams({ tab, projectId: project.id })');
    expect(page).toContain("params.set('poId', String(project.poId))");
    expect(page).toContain("params.set('po', String(currentPoNumber))");
    expect(page).toContain("buildP2ControlCenterUrl('status')");
    expect(page).toContain("buildP2ControlCenterUrl('production')");
    expect(page).toContain("buildP2ControlCenterUrl('production-map')");
  });

  it('links the Production tab to PM, Daily Tag Up, and all P2 work-order queues', () => {
    expect(page).toContain('/pm-control-center?project=${encodeURIComponent(project.id)}');
    expect(page).toContain('const dailyTagUpUrl = `/daily-tag-up?${dailyTagUpParams.toString()}`');
    expect(page).toContain(
      'const p2WorkOrderQueuesUrl = `/p2-work-orders/queues/all?${p2WorkOrderQueueParams.toString()}`'
    );
    expect(page).toContain('data-testid="button-open-project-daily-tag-up"');
    expect(page).toContain('data-testid="button-open-project-p2-work-order-queues"');
  });
});
