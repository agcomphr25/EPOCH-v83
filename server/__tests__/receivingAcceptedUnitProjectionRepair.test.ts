import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('accepted receiving unit inventory projection repair', () => {
  const source = readFileSync(join(process.cwd(), 'server/src/routes/receiving.ts'), 'utf8');
  const handler = source.slice(
    source.indexOf('async function handleAcceptedUnit'),
    source.indexOf('async function lineRequiresStrictSplit')
  );

  it('does not treat an existing material lot as proof that all inventory writes completed', () => {
    expect(handler).not.toMatch(/if \(unit\.materialLotId\) \{\s*return;/);
    expect(handler).toContain('existingInventoryEvent');
    expect(handler).toContain('existingFabricInventory');
  });

  it('creates the fabric inventory row and receipt transaction atomically', () => {
    const fabricRepair = handler.slice(handler.indexOf('if (!existingFabricInventory)'));
    expect(fabricRepair).toContain('await db.transaction(async (tx) =>');
    expect(fabricRepair).toMatch(/await tx\s*\.insert\(cuttingFabricInventory\)/);
    expect(fabricRepair).toMatch(/await tx\.insert\(cuttingFabricInventoryTransactions\)/);
  });

  it('uses the Fabric (Cutting Table) flag without requiring production-line flags', () => {
    expect(handler).toContain('const isCuttingFabric = Boolean(invItem.is_fabric)');
    expect(handler).not.toMatch(/isCuttingFabric[\s\S]{0,150}utilized_in_pl[12]/);
  });
});
