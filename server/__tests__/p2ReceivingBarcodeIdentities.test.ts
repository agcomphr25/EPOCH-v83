import { readFileSync } from 'fs';
import { resolve } from 'path';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('migrations/0303_p2_receiving_barcode_identities.sql');
const service = read('server/src/services/p2ReceivingBarcodeService.ts');
const routes = read('server/src/routes/receiving.ts');
const client = read('client/src/pages/InventoryReceivingControlCenter.tsx');

describe('Phase 8 controlled Receiving barcode identities', () => {
  it('is prospective, additive, registered, and disabled by default', () => {
    const registry = read('server/scripts/migrations/runSafeBootMigrations.ts');
    const flags = read('server/src/lib/featureFlags.ts');
    expect(
      registry.match(/0303_p2_receiving_barcode_identities\.sql/g)
    ).toHaveLength(2);
    expect(migration).toContain(
      'No historical receipt, unit, lot, balance, or transaction is changed'
    );
    expect(migration).not.toMatch(
      /\b(UPDATE|DELETE FROM)\s+(received_units|material_lots|inventory_transactions|orders)\b/i
    );
    expect(flags).toContain(
      "envBool('P2_RECEIVING_BARCODE_IDENTITIES_ENABLED', false)"
    );
    expect(client).toContain(
      "VITE_P2_RECEIVING_BARCODE_IDENTITIES_ENABLED === 'true'"
    );
  });

  it('resolves one exact Inventory Item and released traceability policy', () => {
    expect(service).toContain('i.ag_part_number');
    expect(service).toContain("p.status='RELEASED'");
    expect(service).toContain('RECEIVING_BARCODE_AUTHORITY_MISSING');
    expect(migration).toContain('received_unit_id INTEGER NOT NULL UNIQUE');
  });

  it('fails closed for missing policy-required supplier evidence', () => {
    for (const evidence of [
      'serial number',
      'lot number',
      'batch number',
      'heat lot',
      'manufacture and expiration dates',
      'certificate reference',
    ])
      expect(service).toContain(evidence);
    expect(service).toContain('RECEIVING_TRACEABILITY_EVIDENCE_REQUIRED');
  });

  it('separates read-only preview from controlled print evidence', () => {
    expect(routes).toContain(
      "requirePermission('p2.receiving_barcodes.print')"
    );
    expect(service).toContain('REPRINT_REASON_REQUIRED');
    expect(migration).toContain('printer_name TEXT NOT NULL');
    expect(migration).toContain('copies INTEGER NOT NULL');
    expect(migration).toContain('label_format TEXT NOT NULL');
    expect(client).toContain('recordControlledPrint');
  });

  it('reuses identity and barcode across copies and retry replay', () => {
    expect(service).toContain(
      'SELECT * FROM p2_receiving_barcode_identities WHERE received_unit_id=$1'
    );
    expect(service).toContain('PRINT_IDEMPOTENCY_CONFLICT');
    expect(service).toContain('replayed: true');
    expect(migration).toContain('UNIQUE(identity_id,request_key)');
  });

  it('does not create availability, balances, transactions, travelers, or genealogy', () => {
    for (const forbidden of [
      'INSERT INTO inventory_transactions',
      'INSERT INTO material_lots',
      'INSERT INTO travelers',
      'INSERT INTO genealogy',
      'UPDATE received_units',
    ])
      expect(service).not.toContain(forbidden);
    expect(service).toContain('changesInventory: false');
  });
});
