import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = read('migrations/0324_p2_work_order_management.sql');
const service = read('server/src/services/p2ManufacturingWorkOrderService.ts');
const routes = read('server/src/routes/p2ManufacturingWorkOrders.ts');
const queuePage = read('client/src/pages/P2WorkOrderQueuePage.tsx');
const demandPage = read(
  'client/src/components/p2/P2FrozenProductionDemand.tsx'
);
const legacyQueue = read('client/src/pages/ManufacturingQueue.tsx');
const legacyRoute = read('server/src/routes/manufacturingQueue.ts');
const safeBoot = read('server/scripts/migrations/runSafeBootMigrations.ts');

describe('P2 BOM-generated work-order management', () => {
  it('adds one canonical priority contract and registers its migration', () => {
    expect(migration).toContain(
      "CHECK (priority IN ('LOW','URGENT','CRITICAL'))"
    );
    expect(migration).toContain("'p2.work_orders.manage'");
    expect(safeBoot.match(/0324_p2_work_order_management\.sql/g)).toHaveLength(
      2
    );
  });

  it('registers the manufactured root for full batches while individual creation remains child-only', () => {
    expect(service).toContain("(node) => node.make_buy_disposition === 'MAKE'");
    expect(service).toContain('const isRoot = Number(node.depth) === 0');
    expect(service).toContain('releaseAuthority.wad_work_order_id');
    expect(service).toContain('Number(node.depth) > 0');
    expect(service).toContain(
      'allManufactured.filter((node) => !existingNodeIds.has(clean(node.id)))'
    );
    expect(demandPage).toContain('Create All Remaining Work Orders');
    expect(demandPage).toContain('select-generated-work-order-priority');
  });

  it('provides guarded, concurrent and audited management edits', () => {
    expect(routes).toContain("requirePermission('p2.work_orders.manage')");
    expect(routes).toContain("'/p2-work-orders/:authorityId/management'");
    expect(service).toContain("'STALE_WORK_ORDER'");
    expect(service).toContain("'WORK_ORDER_MANAGEMENT_UPDATED'");
    expect(service).toContain("['COMPLETE', 'CANCELLED']");
  });

  it('sorts department queues and defaults both queue views to active work', () => {
    expect(service).toContain('ORDER BY current_department_name_snapshot');
    expect(queuePage).toContain("useState<'ACTIVE' | 'ALL' | 'COMPLETE'>");
    expect(queuePage).toContain('Pending &amp; In Progress');
    expect(legacyQueue).toContain("useState<string>('ACTIVE')");
    expect(legacyRoute).toContain(
      "inArray(manufacturingQueue.status, ['PENDING', 'IN_PROGRESS'])"
    );
  });
});
