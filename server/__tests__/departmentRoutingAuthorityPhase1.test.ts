import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('department routing authority Phase 1 foundation', () => {
  const migration = read('migrations/0294_shared_department_routing_authority_phase1.sql');
  const schema = read('server/schema.ts');
  const flags = read('server/src/lib/featureFlags.ts');
  const sharedRoute = read('server/src/routes/sharedDepartments.ts');
  const routingRoute = read('server/src/routes/partRoutings.ts');

  it('is additive and performs no historical data mutation', () => {
    expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\b/i);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS default_department_id');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS inventory_item_fk');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS department_id');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS department_name_snapshot');
  });

  it('preserves the existing department and routing identity columns', () => {
    expect(schema).toContain("name: text('name').notNull()");
    expect(schema).toContain("inventoryItemId: text('inventory_item_id').notNull()");
    expect(schema).toContain("departmentName: text('department_name').notNull()");
    expect(schema).toContain("departmentSequence: jsonb('department_sequence').notNull()");
  });

  it('adds only nullable prospective foreign keys and snapshots', () => {
    expect(schema).toContain("defaultDepartmentId: integer('default_department_id').references");
    expect(schema).toContain("inventoryItemFk: integer('inventory_item_fk').references");
    expect(schema).toContain("departmentId: integer('department_id').references");
    expect(schema).toContain("departmentNameSnapshot: text('department_name_snapshot')");
    expect(migration).not.toMatch(/ADD COLUMN IF NOT EXISTS default_department_id\s+INTEGER\s+NOT NULL/i);
    expect(migration).not.toMatch(/ADD COLUMN IF NOT EXISTS inventory_item_fk\s+INTEGER\s+NOT NULL/i);
    expect(migration).not.toMatch(/ADD COLUMN IF NOT EXISTS department_id\s+INTEGER\s+NOT NULL/i);
  });

  it('keeps all Phase 1 flags disabled by default', () => {
    for (const name of [
      'SHARED_INVENTORY_DEPARTMENT_READS_ENABLED',
      'SHARED_INVENTORY_DEPARTMENT_WRITES_ENABLED',
      'STABLE_ROUTING_INVENTORY_ITEM_FK_ENABLED',
      'ROUTING_OPERATION_DEPARTMENT_IDS_ENABLED',
    ]) {
      expect(flags).toContain(`envBool('${name}', false)`);
    }
  });

  it('protects department mutations with permission checks and audit events', () => {
    expect(sharedRoute.match(/requirePermission\('inventory\.adjust'\)/g)?.length).toBe(3);
    const service = read('server/src/services/sharedDepartmentService.ts');
    expect(service).toContain('SHARED_DEPARTMENT_CREATED');
    expect(service).toContain('SHARED_DEPARTMENT_UPDATED');
    expect(service).toContain('SHARED_DEPARTMENT_DEACTIVATED');
    expect(service).toContain('DEPARTMENT_NAME_DUPLICATE');
    expect(service).toContain('DEPARTMENT_CODE_DUPLICATE');
    expect(service).toContain('DEPARTMENT_REFERENCED');
  });

  it('uses one shared inventory department source when routing reads are enabled', () => {
    expect(routingRoute).toContain('listSharedDepartments({ routingOnly: true })');
    expect(routingRoute).toContain('createSharedDepartment(');
    expect(read('server/src/routes/index.ts')).toContain("app.use('/api/shared-departments', sharedDepartmentsRoutes)");
  });

  it('requires stable inventory and operation identity only behind their flags', () => {
    expect(routingRoute).toContain('ROUTING_INVENTORY_ITEM_FK_REQUIRED');
    expect(routingRoute).toContain('ROUTING_INVENTORY_ITEM_NOT_MANUFACTURED');
    expect(routingRoute).toContain('ROUTING_INVENTORY_IDENTITY_MISMATCH');
    expect(routingRoute).toContain('ROUTING_OPERATION_DEPARTMENT_ID_REQUIRED');
    expect(routingRoute).toContain('ROUTING_OPERATION_SEQUENCE_INVALID');
    expect(routingRoute).toContain('departmentNameSnapshot');
  });

  it('reads PostgreSQL query results through the pg rows collection', () => {
    expect(routingRoute).toContain('const item = result.rows[0]');
    expect(routingRoute).toContain('const department = result.rows[0]');
    expect(routingRoute).not.toMatch(/const item = rows\[0\]|if \(!rows\[0\]\)/);
  });
});
