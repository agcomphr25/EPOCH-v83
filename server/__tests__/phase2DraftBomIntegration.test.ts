import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Phase 2 Draft BOM controlled-lifecycle integration', () => {
  const client = read('client/src/pages/DraftBOMBuilderPage.tsx');
  const legacyRoute = read('server/src/routes/robustBoms.ts');
  const controlledRoute = read('server/src/routes/inventoryTraceabilityBoms.ts');
  const flags = read('server/src/lib/featureFlags.ts');

  it('routes controlled-mode Draft BOM writes through the controlled endpoint', () => {
    expect(client).toContain("import.meta.env.VITE_CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED === 'true'");
    expect(client).toContain("apiRequest('/api/configuration-control/controlled-boms'");
    expect(client).toContain('parentInventoryItemId');
    expect(client).toContain('childInventoryItemId');
    expect(client).toContain("unitOfMeasure: component.unitOfMeasure || 'EA'");
    expect(client).toContain("status: 'draft'");
  });

  it('requires real Inventory Item identities without text fallback', () => {
    const controlledBranch = client.slice(
      client.indexOf('if (controlledItemLinkedBomWritesEnabled)'),
      client.indexOf("return await apiRequest('/api/robust-boms/from-draft-builder'"),
    );
    expect(controlledBranch).toContain('Number(bom.rootPart.inventoryItemId)');
    expect(controlledBranch).toContain('Number(component.inventoryItemId)');
    expect(controlledBranch).not.toMatch(/partNumber\s*:/);
  });

  it('never promotes or releases a controlled Draft BOM during project handoff', () => {
    expect(client).toContain("controlledItemLinkedBomWritesEnabled ? 'draft' : 'active'");
    expect(client).toContain('Submission, independent approval, release, and project execution remain separate controlled actions.');
    expect(client).not.toMatch(/configuration-control\/controlled-boms[\s\S]{0,800}(submit|decision|release)/);
  });

  it('fails closed on the legacy mutation route when controlled writes are enabled', () => {
    expect(legacyRoute).toContain('areControlledItemLinkedBomWritesEnabled()');
    expect(legacyRoute).toContain("error: 'CONTROLLED_BOM_ENDPOINT_REQUIRED'");
    expect(legacyRoute.indexOf('CONTROLLED_BOM_ENDPOINT_REQUIRED')).toBeLessThan(
      legacyRoute.indexOf('draftBuilderBomImportSchema.parse(req.body)'),
    );
  });

  it('keeps server permissions authoritative and inventory.adjust insufficient', () => {
    expect(controlledRoute).toMatch(/post\('\/controlled-boms'[\s\S]*?requirePermission\('engineering\.controlled_bom\.edit'\)/);
    expect(controlledRoute).toMatch(/controlled-bom-revisions\/:revisionId\/submit'[\s\S]*?engineering\.controlled_bom\.submit/);
    expect(controlledRoute).toMatch(/controlled-bom-revisions\/:revisionId\/decision'[\s\S]*?engineering\.controlled_bom\.approve/);
    expect(controlledRoute).not.toContain("requirePermission('inventory.adjust')");
  });

  it('keeps every Phase 2 server feature disabled by default', () => {
    for (const name of [
      'INVENTORY_TRACEABILITY_POLICY_READS_ENABLED',
      'INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED',
      'CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED',
      'CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED',
      'P2_CONFIGURATION_BOM_INTEGRATION_ENABLED',
      'RECURSIVE_TRACEABILITY_PREVIEW_ENABLED',
    ]) expect(flags).toContain(`envBool('${name}', false)`);
  });
});
