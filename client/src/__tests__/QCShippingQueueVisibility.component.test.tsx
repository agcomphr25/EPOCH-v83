import { describe, expect, it } from 'vitest';

import { shouldShowP1ShippingQueueItem } from '@/pages/QCShippingQueuePage';

describe('P1 Shipping QC queue visibility', () => {
  it('keeps active, actionable production records', () => {
    expect(
      shouldShowP1ShippingQueueItem({
        isFulfilled: false,
        productionStatus: 'IN_PROGRESS',
      })
    ).toBe(true);
    expect(
      shouldShowP1ShippingQueueItem({
        isFulfilled: false,
        productionStatus: 'PENDING',
      })
    ).toBe(true);
  });

  it.each(['CANCELLED', 'CANCELED', 'SCRAPPED', ' cancelled '])(
    'excludes terminal historical status %s',
    (productionStatus) => {
      expect(
        shouldShowP1ShippingQueueItem({
          isFulfilled: false,
          productionStatus,
        })
      ).toBe(false);
    }
  );

  it('continues to exclude fulfilled records', () => {
    expect(
      shouldShowP1ShippingQueueItem({
        isFulfilled: true,
        productionStatus: 'SHIPPED',
      })
    ).toBe(false);
  });
});
