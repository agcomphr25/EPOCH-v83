import { describe, expect, it } from 'vitest';

import {
  FABRIC_INVENTORY_IN_USE_MESSAGE,
  getFabricInventoryDeleteErrorResponse,
} from '../src/services/fabricInventoryDeletion';

describe('fabric inventory deletion errors', () => {
  it('returns an actionable conflict for a referenced traceability record', () => {
    expect(
      getFabricInventoryDeleteErrorResponse({
        code: '23503',
        constraint: 'cutting_fabric_inventory_transactions_fabric_inventory_id_fkey',
      }),
    ).toEqual({
      status: 409,
      body: {
        error: 'FABRIC_INVENTORY_IN_USE',
        message: FABRIC_INVENTORY_IN_USE_MESSAGE,
      },
    });
  });

  it('leaves unrelated database errors for the generic handler', () => {
    expect(getFabricInventoryDeleteErrorResponse({ code: '42P01' })).toBeNull();
  });
});
