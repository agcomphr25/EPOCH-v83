import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync(new URL('../src/services/receiptReversalService.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../src/routes/receiving.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../client/src/pages/InventoryReceivingControlCenter.tsx', import.meta.url), 'utf8');

describe('controlled receipt reversal contract', () => {
  it('uses one transaction, preserves source records, and writes offsetting audit entries', () => {
    expect(service).toContain('return db.transaction(async tx =>');
    expect(service).toContain("transactionType: 'REVERSAL'");
    expect(service).toContain("transactionType: 'ADJUST'");
    expect(service).toContain("changeType: 'ADJUSTMENT'");
    expect(service).toContain("action: 'receipt_reversed'");
    expect(service).not.toContain('tx.delete(');
  });

  it('blocks reversal after downstream consumption, reservation, project, or cutting usage', () => {
    expect(service).toContain('travelerMaterialConsumption');
    expect(service).toContain('materialLotReservations');
    expect(service).toContain('projectReceivedMaterials');
    expect(service).toContain('cuttingPacketSessionLots');
    expect(service).toContain('cuttingPacketBOMCuts');
    expect(service).toContain('cuttingBuiltPacketFabricSources');
  });

  it('limits preview and execution to administrators or owners and requires a reason', () => {
    expect(routes).toContain("const requireReceiptReversalAccess = requireRole('ADMIN', 'OWNER')");
    expect(routes).toContain("router.get('/:id/reversal-preview', requireReceiptReversalAccess");
    expect(routes).toContain("router.post('/:id/reverse', requireReceiptReversalAccess");
    expect(service).toContain('trimmedReason.length < 10');
  });

  it('exposes preflight blockers and an explicit confirmation in Receiving Control Center', () => {
    expect(ui).toContain('Required audit reason');
    expect(ui).toContain('reversalPreview.blockers');
    expect(ui).toContain('Reverse Receipt');
  });
});
