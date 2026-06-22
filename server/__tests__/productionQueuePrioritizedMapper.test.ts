import { describe, expect, it } from 'vitest';
import { mapPrioritizedQueueRow } from '../src/helpers/prioritizedProductionQueue';

describe('mapPrioritizedQueueRow', () => {
  it('keeps active PO production orders visible in the prioritized queue shape', () => {
    const row = mapPrioritizedQueueRow(
      {
        orderid: 'P1-P18261-18-1',
        fbordernumber: null,
        modelid: 'AG-CRB-PV105-ER',
        stockmodelid: 'AG-CRB-PV105-ER',
        duedate: '2026-01-28T00:00:00.000Z',
        orderdate: '2025-11-10T00:00:00.000Z',
        currentdepartment: 'P1 Production Queue',
        status: 'PENDING',
        customerid: '547',
        customername: 'Red Hawk Rifles LLC',
        features: {
          actionLength: 'Short',
          bottomMetal: 'ADL',
          lengthOfPull: 'lop_adj_13_5',
          otherOptions: ['heavy_fill'],
        },
        urgency: null,
        ismanualurgency: false,
        manual_priority_override: null,
        ordersource: 'PO',
        ponumber: 'P18261',
        poitemid: 18,
      },
      0
    );

    expect(row).toMatchObject({
      orderId: 'P1-P18261-18-1',
      modelId: 'AG-CRB-PV105-ER',
      stockModelId: 'AG-CRB-PV105-ER',
      currentDepartment: 'P1 Production Queue',
      status: 'PENDING',
      customerId: '547',
      customerName: 'Red Hawk Rifles LLC',
      orderSource: 'PO',
      poNumber: 'P18261',
      poItemId: 18,
    });
    expect(row.features.action_length).toBe('Short');
    expect(row.features.bottom_metal).toBe('ADL');
    expect(row.features.length_of_pull).toBe('lop_adj_13_5');
    expect(row.features.other_options).toEqual(['heavy_fill']);
  });
});
