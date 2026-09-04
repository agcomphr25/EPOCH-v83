import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const redHawkText = `Date
Purchase Order
09/03/2026
Order #
P20511
Red Hawk Rifles LLC
Type Number Description Unit Cost
Qty
Ordered UOM Total Cost
Purchase AG-CRB-ADJ-
AHV205-CS
AG Composites - Carbon Stock - Adjustable Alpine Hunter
$ 709.00 1 ea $ 709.00
Purchase AG-CRB-
AHV205-SR
AG Composites - Carbon Stock - Alpine Hunter
$ 599.00 1 ea $ 599.00
Purchase AG-BM-M5-SA AG Composites - Bottom Metal - M5
DBM - SA
$ 109.00 5 ea $ 545.00
7
September 3, 2026, 11:27:59AM MDT Page 1 of 1
Total: $1,853.00`;

test('parses and reconciles the Red Hawk PO format', async () => {
  const { parseRedHawkPoText } = await import(
    '../src/services/p1CustomerPoImportService'
  );
  const parsed = parseRedHawkPoText(redHawkText);

  assert.equal(parsed.customerCode, 'RED_HAWK');
  assert.equal(parsed.customerName, 'Red Hawk Rifles LLC');
  assert.equal(parsed.poNumber, 'P20511');
  assert.equal(parsed.poDate, '2026-09-03');
  assert.equal(parsed.dueDate, null);
  assert.equal(parsed.totalQuantity, 7);
  assert.equal(parsed.poTotal, 1853);
  assert.deepEqual(
    parsed.lines.map((line) => ({
      sku: line.supplierProductNumber,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      extendedPrice: line.extendedPrice,
    })),
    [
      {
        sku: 'AG-CRB-ADJ-AHV205-CS',
        quantity: 1,
        unitPrice: 709,
        extendedPrice: 709,
      },
      {
        sku: 'AG-CRB-AHV205-SR',
        quantity: 1,
        unitPrice: 599,
        extendedPrice: 599,
      },
      { sku: 'AG-BM-M5-SA', quantity: 5, unitPrice: 109, extendedPrice: 545 },
    ]
  );
});

test('rejects a Red Hawk PO whose lines do not match the printed total', async () => {
  const { parseRedHawkPoText } = await import(
    '../src/services/p1CustomerPoImportService'
  );
  assert.throws(
    () => parseRedHawkPoText(redHawkText.replace('$1,853.00', '$1,852.00')),
    /do not reconcile/
  );
});
