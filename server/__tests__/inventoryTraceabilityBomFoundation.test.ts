import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { isStricterTraceabilityOverride, validatePolicyInput } from '../src/services/inventoryTraceabilityBomService';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Inventory Item traceability and stable-identity BOM foundation', () => {
  const migration = read('migrations/0295_inventory_traceability_bom_foundation.sql');
  const runner = read('server/scripts/migrations/runSafeBootMigrations.ts');
  const flags = read('server/src/lib/featureFlags.ts');
  const routes = read('server/src/routes/inventoryTraceabilityBoms.ts');
  const service = read('server/src/services/inventoryTraceabilityBomService.ts');

  it('is additive and preserves historical rows', () => {
    expect(migration).not.toMatch(/\bUPDATE\s+(inventory_items|boms|bom_revisions|bom_lines)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS parent_inventory_item_id');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS child_inventory_item_id');
    expect(migration).not.toMatch(/ADD COLUMN IF NOT EXISTS (parent|child)_inventory_item_id[^;]*NOT NULL/i);
  });

  it('registers migration 0295 as safe and critical', () => {
    expect(runner.match(/0295_inventory_traceability_bom_foundation\.sql/g)).toHaveLength(2);
  });

  it('keeps every Phase 2 runtime flag disabled by default', () => {
    for (const name of [
      'INVENTORY_TRACEABILITY_POLICY_READS_ENABLED',
      'INVENTORY_TRACEABILITY_POLICY_WRITES_ENABLED',
      'CONTROLLED_ITEM_LINKED_BOM_READS_ENABLED',
      'CONTROLLED_ITEM_LINKED_BOM_WRITES_ENABLED',
      'P2_CONFIGURATION_BOM_INTEGRATION_ENABLED',
      'RECURSIVE_TRACEABILITY_PREVIEW_ENABLED',
    ]) expect(flags).toContain(`envBool('${name}', false)`);
  });

  it('uses stable Inventory Item identities while retaining text snapshots', () => {
    expect(migration).toContain('parent_inventory_item_id INTEGER REFERENCES inventory_items(id)');
    expect(migration).toContain('child_inventory_item_id INTEGER REFERENCES inventory_items(id)');
    expect(migration).toContain('parent_part_number_snapshot TEXT');
    expect(migration).toContain('child_part_number_snapshot TEXT');
    expect(service).toContain('BOM_CHILD_ID_REQUIRED');
    expect(service).toContain('BOM_PARENT_NOT_MANUFACTURED');
  });

  it('models each controlled policy and required lifecycle state', () => {
    for (const value of ['SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED'])
      expect(migration).toContain(`'${value}'`);
    for (const value of ['DRAFT','PENDING_APPROVAL','RELEASED','SUPERSEDED','REJECTED','RETURNED'])
      expect(migration).toContain(`'${value}'`);
    expect(migration).toContain('inventory_traceability_policy_released_immutable');
    expect(migration).toContain('controlled_bom_line_released_immutable');
  });

  it.each([
    ['SERIAL', { outputSerializationRequired: true }],
    ['LOT', { lotScanRequired: true }],
    ['BATCH', { batchScanRequired: true }],
    ['STANDARD_QUANTITY', { quantityEntryRequired: true }],
    ['CUSTOMER_SUPPLIED', { customerCustodyRequired: true }],
    ['NONE_APPROVED', { noTraceabilityJustification: 'Approved configuration exception' }],
  ])('validates the %s conditional policy rule', (policyType, requirements) => {
    expect(() => validatePolicyInput({
      policyType,
      itemClassification: 'PURCHASED_COMPONENT',
      partConfigurationRevision: 'A',
      unitOfMeasure: 'EA',
      configurationEffectivity: { revision: 'A' },
      ...requirements,
    })).not.toThrow();
  });

  it('rejects missing conditional evidence and effectivity', () => {
    expect(() => validatePolicyInput({ policyType: 'SERIAL', itemClassification: 'PURCHASED_COMPONENT', partConfigurationRevision: 'A', unitOfMeasure: 'EA', configurationEffectivity: { revision: 'A' } })).toThrow(/controlled output identity/);
    expect(() => validatePolicyInput({ policyType: 'NONE_APPROVED', itemClassification: 'PURCHASED_COMPONENT', partConfigurationRevision: 'A', unitOfMeasure: 'EA', configurationEffectivity: {} })).toThrow(/effectivity/);
  });

  it('orders only deterministic strictly stronger overrides', () => {
    expect(isStricterTraceabilityOverride('STANDARD_QUANTITY', 'LOT')).toBe(true);
    expect(isStricterTraceabilityOverride('STANDARD_QUANTITY', 'SERIAL')).toBe(true);
    expect(isStricterTraceabilityOverride('LOT', 'SERIAL')).toBe(true);
    expect(isStricterTraceabilityOverride('SERIAL', 'LOT')).toBe(false);
    expect(isStricterTraceabilityOverride('LOT', 'STANDARD_QUANTITY')).toBe(false);
    expect(isStricterTraceabilityOverride('LOT', 'BATCH')).toBe(false);
    expect(isStricterTraceabilityOverride('CUSTOMER_SUPPLIED', 'LOT')).toBe(false);
  });

  it('fails closed for missing policy, duplicate children, cycles and depth', () => {
    for (const code of ['POLICY_MISSING','POLICY_AMBIGUOUS','BOM_DUPLICATE_CHILD','BOM_CYCLE','BOM_MAX_DEPTH','BOM_TRACEABILITY_WEAKENING'])
      expect(service).toContain(code);
    expect(service).not.toContain('silently skip');
  });

  it('enforces narrow permissions on every consequential route', () => {
    for (const capability of [
      'inventory.traceability_policy.view','inventory.traceability_policy.edit',
      'inventory.traceability_policy.submit','inventory.traceability_policy.approve',
      'engineering.controlled_bom.view','engineering.controlled_bom.edit','engineering.controlled_bom.submit',
      'engineering.controlled_bom.approve','engineering.controlled_bom.traceability_override',
    ]) expect(`${migration}\n${routes}`).toContain(capability);
    expect(routes).not.toContain("requirePermission('inventory.adjust')");
    expect(service).toContain('INDEPENDENT_APPROVAL_REQUIRED');
    expect(service).toContain('submitted_by<>$3');
    expect(routes).toMatch(/traceability-policies\/:policyId\/decision'[\s\S]*?inventory\.traceability_policy\.approve/);
    expect(routes).toMatch(/controlled-bom-revisions\/:revisionId\/decision'[\s\S]*?engineering\.controlled_bom\.approve/);
    expect(routes).toMatch(/requireOverrideAuthority[\s\S]*?engineering\.controlled_bom\.traceability_override/);
  });

  it('creates no downstream execution records', () => {
    const controlledWrites = service.slice(
      service.indexOf('export async function createTraceabilityPolicyDraft'),
      service.indexOf('export async function getControlledBomStatus')
    );
    for (const table of [
      'inventory_transactions','work_orders','travelers','production_schedule',
      'receipts','barcodes','inventory_balances','inspections','nonconformance',
      'labor_entries','project_received_materials','genealogy',
    ]) expect(controlledWrites).not.toMatch(new RegExp(`INSERT\\s+INTO\\s+${table}`, 'i'));
  });

  it('keeps the recursive preview read-only and free of downstream creation', () => {
    const preview = service.slice(service.indexOf('export async function previewControlledBom'));
    expect(preview).toContain('WITH RECURSIVE tree');
    expect(preview).toContain('readOnly: true');
    expect(preview).not.toMatch(/INSERT INTO|UPDATE\s|DELETE FROM|create.*(traveler|work.?order|transaction)/i);
  });
});
