import { describe, expect, it } from 'vitest';
import { buildP2SerializedUnitLedger } from '../src/lib/p2SerializedUnitLedger';

describe('buildP2SerializedUnitLedger', () => {
  it('uses mutually exclusive precedence and enforces the PO quantity invariant', () => {
    const rows = [
      ...Array.from({ length: 318 }, (_, index) => ({
        id: `ship-${index}`,
        serialNumber: `SERIAL-${index}`,
        status: 'COMPLETED',
        currentDepartment: 'Inventory',
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `final-${index}`,
        serialNumber: `FINAL-${index}`,
        status: 'ACTIVE',
        currentDepartment: 'QC',
        finalizedAt: new Date(),
      })),
      ...Array.from({ length: 27 }, (_, index) => ({
        id: `oven-${index}`,
        serialNumber: `OVEN-${index}`,
        status: 'ACTIVE',
        currentDepartment: 'Oven',
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        id: `qc-${index}`,
        serialNumber: `QC-${index}`,
        status: 'ACTIVE',
        currentDepartment: 'QC',
      })),
      ...Array.from({ length: 33 }, (_, index) => ({
        id: `layup-${index}`,
        serialNumber: `LAYUP-${index}`,
        status: 'ACTIVE',
        currentDepartment: 'Layup',
      })),
      // A lower-precedence historical duplicate must not double-count a unit.
      {
        id: 'old-duplicate',
        serialNumber: 'SERIAL-0',
        status: 'ACTIVE',
        currentDepartment: 'Layup',
      },
      // These legacy/ghost records are not legitimate serialized workflow units.
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `inventory-${index}`,
        serialNumber: `INVENTORY-${index}`,
        status: 'COMPLETED',
        currentDepartment: 'Inventory',
      })),
      {
        id: 'qc-ghost',
        serialNumber: null,
        status: 'ACTIVE',
        currentDepartment: 'QC',
      },
    ];

    const ledger = buildP2SerializedUnitLedger(
      390,
      rows,
      Array.from({ length: 318 }, (_, index) => `ship-${index}`),
    );

    expect(ledger).toMatchObject({
      shipped: 318,
      finalization: 2,
      activeProduction: 29,
      scheduled: 33,
      missing: 8,
      productionPipeline: 62,
      total: 390,
      accounted: 382,
    });
    expect(
      ledger.shipped
        + ledger.finalization
        + ledger.activeProduction
        + ledger.scheduled
        + ledger.missing,
    ).toBe(ledger.total);
  });

  it('does not treat production completion as shipment evidence', () => {
    const ledger = buildP2SerializedUnitLedger(1, [{
      id: 'completed-only',
      serialNumber: 'SERIAL-1',
      status: 'COMPLETED',
      currentDepartment: 'Inventory',
    }], []);

    expect(ledger.shipped).toBe(0);
    expect(ledger.missing).toBe(1);
  });

  it('treats Pending Layup placeholders as available capacity, not scheduled work', () => {
    const ledger = buildP2SerializedUnitLedger(3, [
      {
        id: 'pending-1',
        serialNumber: 'SERIAL-1',
        status: 'ACTIVE',
        currentDepartment: 'Pending Layup',
      },
      {
        id: 'scheduled-1',
        serialNumber: 'SERIAL-2',
        status: 'ACTIVE',
        currentDepartment: 'Layup',
      },
    ], []);

    expect(ledger.scheduled).toBe(1);
    expect(ledger.missing).toBe(2);
  });
});
