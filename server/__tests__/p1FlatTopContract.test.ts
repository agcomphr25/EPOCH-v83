import { describe, expect, it } from 'vitest';
import {
  isP1FlatTop,
  normalizeP1FlatTopSpecifications,
} from '../src/utils/p1FlatTop';

describe('P1 Flat Top contract', () => {
  it('recognizes legacy and current Flat Top shapes', () => {
    expect(isP1FlatTop({ isFlattop: true })).toBe(true);
    expect(isP1FlatTop({ flatTop: 'true' })).toBe(true);
    expect(isP1FlatTop({ features: { flattop: true } })).toBe(true);
    expect(isP1FlatTop({ features: { flat_top: 'yes' } })).toBe(true);
    expect(isP1FlatTop({ flatTop: false })).toBe(false);
  });

  it('writes canonical aliases without discarding other specifications', () => {
    const normalized = normalizeP1FlatTopSpecifications({
      isFlattop: true,
      action_length: 'short',
      features: { paint: 'black' },
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        action_length: 'short',
        isFlattop: true,
        flatTop: true,
        flat_top: true,
        features: expect.objectContaining({
          paint: 'black',
          isFlattop: true,
          flatTop: true,
          flat_top: true,
          flattop: true,
        }),
      }),
    );
  });
});
