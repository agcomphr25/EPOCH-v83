import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserPermissions } = vi.hoisted(() => ({
  getUserPermissions: vi.fn(),
}));
vi.mock('../src/services/permissionService', () => ({ getUserPermissions }));
vi.mock('../src/services/auditLedgerService', () => ({ recordAuditEvent: vi.fn() }));

import { requirePermission } from '../middleware/requirePermission';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('shared Department management permission hardening', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies a direct API request from a user with only inventory.adjust', async () => {
    getUserPermissions.mockResolvedValue({
      permissionSet: new Set(['inventory.adjust']),
    });
    const req: any = { user: { id: 42, role: 'INVENTORY_MANAGER' } };
    const res = response();
    const next = vi.fn();

    await requirePermission('inventory.departments.manage')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      requiredCapability: 'inventory.departments.manage',
    });
  });

  it('allows an authenticated user with the dedicated permission', async () => {
    getUserPermissions.mockResolvedValue({
      permissionSet: new Set(['inventory.departments.manage']),
    });
    const req: any = { user: { id: 7, role: 'INVENTORY_MANAGER' } };
    const res = response();
    const next = vi.fn();

    await requirePermission('inventory.departments.manage')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('uses the dedicated permission for every shared mutation surface', () => {
    const shared = read('server/src/routes/sharedDepartments.ts');
    const inventory = read('server/src/routes/inventory.ts');
    const routing = read('server/src/routes/partRoutings.ts');

    expect(shared.match(/requirePermission\('inventory\.departments\.manage'\)/g)).toHaveLength(3);
    expect(inventory.match(/requirePermission\('inventory\.departments\.manage'\)/g)).toHaveLength(3);
    expect(routing.match(/requirePermission\('inventory\.departments\.manage'\)/g)).toHaveLength(3);
    expect(shared).not.toContain("requirePermission('inventory.adjust')");
  });

  it('defines the permission but does not broaden manager role grants', () => {
    const index = read('server/index.ts');
    expect(index).toContain("key: 'inventory.departments.manage'");
    const managerBlock = index.slice(
      index.indexOf('const managerCaps = ['),
      index.indexOf('const inventoryManagerCaps = [')
    );
    const inventoryManagerBlock = index.slice(
      index.indexOf('const inventoryManagerCaps = ['),
      index.indexOf("WHERE pr.name = 'PURCHASING_BUYER'")
    );
    expect(managerBlock).not.toContain('inventory.departments.manage');
    expect(inventoryManagerBlock).not.toContain('inventory.departments.manage');
    expect(index).toContain("for (const roleName of ['ADMIN', 'OWNER'])");
  });

  it('keeps viewing and selection separate from Department management', () => {
    const shared = read('server/src/routes/sharedDepartments.ts');
    const routing = read('server/src/routes/partRoutings.ts');
    expect(shared).toContain("router.get('/', async");
    expect(routing).toContain("router.get('/departments/list', async");
    expect(routing).toContain('listSharedDepartments({ routingOnly: true })');
  });

  it('hides shared Department management controls without hiding selection', () => {
    const inventoryUi = read('client/src/components/inventory/InventoryItemsCard.tsx');
    const routingUi = read('client/src/components/PartRoutingWizard.tsx');
    for (const source of [inventoryUi, routingUi]) {
      expect(source).toContain("can('inventory.departments.manage')");
      expect(source).toContain('canManageDepartments');
      expect(source).toContain('Department management permission is required');
    }
    expect(inventoryUi).toContain('sortedDepartments.map');
    expect(routingUi).toContain('onClick={() => toggleDepartment(dept)}');
  });

  it('retains authenticated actor identity in Department audit events', () => {
    const service = read('server/src/services/sharedDepartmentService.ts');
    expect(service.match(/actor,/g)?.length).toBeGreaterThanOrEqual(3);
    expect(service).toContain("eventType: 'SHARED_DEPARTMENT_CREATED'");
    expect(service).toContain("eventType: 'SHARED_DEPARTMENT_UPDATED'");
    expect(service).toContain("eventType: 'SHARED_DEPARTMENT_DEACTIVATED'");
  });

  it('does not enable any Phase 1 feature flag', () => {
    const flags = read('server/src/lib/featureFlags.ts');
    for (const key of [
      'SHARED_INVENTORY_DEPARTMENT_READS_ENABLED',
      'SHARED_INVENTORY_DEPARTMENT_WRITES_ENABLED',
      'STABLE_ROUTING_INVENTORY_ITEM_FK_ENABLED',
      'ROUTING_OPERATION_DEPARTMENT_IDS_ENABLED',
    ]) expect(flags).toContain(`envBool('${key}', false)`);
  });
});
