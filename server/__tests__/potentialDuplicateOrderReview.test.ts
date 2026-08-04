import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { scorePotentialDuplicateOrder } from '../src/services/potentialDuplicateOrderService';

vi.mock('../db', () => ({ db: {}, pool: {} }));

const coreFeatures = {
  handedness: 'right',
  action_length: 'long',
  action_inlet: 'remington_700',
  bottom_metal: 'rem_bdl',
  texture: 'grip_only',
};

describe('potential duplicate stock review', () => {
  it('surfaces the James Hall / Jim Hall regression case despite finish differences', () => {
    const result = scorePotentialDuplicateOrder(
      {
        orderId: 'FB530',
        customerId: '200',
        customerName: 'James Hall',
        modelId: 'cf_privateer',
        features: {
          ...coreFeatures,
          barrel_inlet: 'bartlein_3b',
          paint: 'carbon_urban',
        },
        isFlattop: false,
      },
      {
        orderId: 'EI062',
        orderDate: '2025-09-02',
        customerId: '100',
        customerName: 'Jim Hall',
        modelId: 'cf_privateer',
        features: {
          ...coreFeatures,
          barrel_inlet: 'proof_sendero',
          paint: 'carbon_bronze',
        },
        isFlattop: false,
        status: 'FULFILLED',
        currentDepartment: 'Fulfilled',
      },
      new Date('2026-08-04T12:00:00Z')
    );

    expect(result).not.toBeNull();
    expect(result?.riskLevel).toMatch(/MEDIUM|HIGH/);
    expect(result?.matchedSignals.map((signal) => signal.code)).toContain(
      'CUSTOMER_NAME_ALIAS'
    );
    expect(
      result?.configurationDifferences.map((item) => item.field)
    ).toContain('barrel inlet');
    expect(
      result?.configurationDifferences.map((item) => item.field)
    ).toContain('paint');
  });

  it('rates an active same-customer same-model order high risk', () => {
    const result = scorePotentialDuplicateOrder(
      {
        orderId: 'NEW001',
        customerId: '42',
        modelId: 'model_a',
        features: coreFeatures,
      },
      {
        orderId: 'OLD001',
        orderDate: '2026-07-01',
        customerId: '42',
        customerName: 'Customer',
        modelId: 'model_a',
        features: coreFeatures,
        status: 'FINALIZED',
        currentDepartment: 'Paint',
      }
    );
    expect(result?.riskLevel).toBe('HIGH');
  });

  it('suppresses an explicitly linked replacement', () => {
    expect(
      scorePotentialDuplicateOrder(
        {
          orderId: 'NEW002',
          customerId: '42',
          modelId: 'model_a',
          replacedOrderId: 'OLD002',
          isReplacement: true,
        },
        {
          orderId: 'OLD002',
          orderDate: '2026-07-01',
          customerId: '42',
          modelId: 'model_a',
        }
      )
    ).toBeNull();
  });

  it('does not flag unrelated customers merely because their stock configuration matches', () => {
    expect(
      scorePotentialDuplicateOrder(
        {
          orderId: 'NEW003',
          customerId: '42',
          customerName: 'Alice Smith',
          modelId: 'model_a',
          features: coreFeatures,
        },
        {
          orderId: 'OLD003',
          orderDate: '2026-07-01',
          customerId: '99',
          customerName: 'John Jones',
          modelId: 'model_a',
          features: coreFeatures,
          status: 'FINALIZED',
          currentDepartment: 'Paint',
        }
      )
    ).toBeNull();
  });

  it('places the server-side check before packet inventory consumption and exposes employee review UI', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const route = fs.readFileSync(
      path.join(root, 'server/src/routes/orders.ts'),
      'utf8'
    );
    const orderEntry = fs.readFileSync(
      path.join(root, 'client/src/components/OrderEntry.tsx'),
      'utf8'
    );
    const lookupPosition = route.indexOf(
      'findPotentialDuplicateOrders(orderData)'
    );
    const inventoryPosition = route.indexOf(
      'consumeP1PacketInventoryForOrder(order)',
      lookupPosition
    );
    expect(lookupPosition).toBeGreaterThan(-1);
    expect(inventoryPosition).toBeGreaterThan(lookupPosition);
    expect(orderEntry).toContain('Potential Unnecessary Duplicate Stock');
    expect(orderEntry).toContain('UNNECESSARY_DUPLICATE');
    expect(orderEntry).toContain('CUSTOMER_CONFIRMATION_NEEDED');
  });
});
