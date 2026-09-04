import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync(path.join(process.cwd(), 'server/src/services/dailyTagUpService.ts'), 'utf8');
const route = fs.readFileSync(path.join(process.cwd(), 'server/src/routes/dailyTagUp.ts'), 'utf8');

describe('Daily Tag Up authority contract', () => {
  it('uses released frozen demand and actual P2 work-order authorities', () => {
    expect(service).toContain("p2_frozen_production_demand_baselines b ON b.project_id=p.id AND b.status='RELEASED'");
    expect(service).toContain('FROM p2_manufacturing_work_order_authorities a');
    expect(service).toContain('current_baseline.id=a.frozen_demand_baseline_id');
    expect(service).toContain("current_baseline.status='RELEASED'");
    expect(service).toContain('JOIN production_work_orders pwo ON pwo.id=a.production_work_order_id');
    expect(service).toContain("base.status='RELEASED'");
    expect(service).not.toContain('bom_revisions br');
  });

  it('uses authoritative inventory and only project-linked current purchasing supply', () => {
    expect(service).toContain('FROM inventory_balances');
    expect(service).toContain('WHERE vpi.project_id=ANY($1::uuid[])');
    expect(service).toContain('vp.is_current_revision=true');
    expect(service).toContain("vp.status IN ('Sent','Partially Received')");
    expect(service).not.toContain("vp.status NOT IN ('Cancelled','Voided','Fully Received')");
    expect(service).toContain("supplyStatus: supply ? 'OPEN SUPPLY' : 'NO OPEN SUPPLY'");
  });

  it('enforces server authorization and provides overview plus focused project endpoints', () => {
    expect(route).toContain("requirePermission('p2.work_orders.view')");
    expect(route).toContain("router.get('/',");
    expect(route).toContain("router.get('/projects/:projectId'");
  });

  it('links issues only to mounted project-scoped destinations', () => {
    expect(service).toContain('/p2-work-orders/queues/${encodeURIComponent');
    expect(service).toContain('?projectId=${encodeURIComponent');
    expect(service).toContain('/inventory/enhanced-mrp?search=${encodeURIComponent');
    expect(service).toContain('?tab=production');
    expect(service).not.toContain('href: `/p2-work-orders/${row.authorityId}`');
    expect(service).not.toContain('href: `/inventory/items/${node.inventoryItemId}`');
  });
});
