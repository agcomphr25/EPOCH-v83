import { describe, expect, it } from 'vitest';
import { isP1FlatTopOrder } from '../utils/p1FlatTop';

describe('isP1FlatTopOrder', () => {
  it.each([
    { isFlattop: true },
    { is_flattop: true },
    { features: { isFlattop: true } },
    { features: { flat_top: 'yes' } },
    { specifications: { flatTop: true } },
    { features: { specifications: { features: { flattop: 'flat top' } } } },
  ])('recognizes persisted flat-top aliases', (order) => {
    expect(isP1FlatTopOrder(order)).toBe(true);
  });

  it('does not classify an ordinary stock as flat top', () => {
    expect(
      isP1FlatTopOrder({
        orderId: 'FB354',
        stockModelId: 'cf_privateer',
        features: {},
      })
    ).toBe(false);
  });
});
