import { describe, expect, it, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import { jsonValuesEqual } from '../src/services/auditLedgerService';

describe('jsonValuesEqual', () => {
  it('ignores top-level and nested object key order', () => {
    expect(jsonValuesEqual({ alpha: 1, beta: 2 }, { beta: 2, alpha: 1 })).toBe(
      true
    );
    expect(
      jsonValuesEqual(
        { baseline: { revision: 4, effectivity: 'A' } },
        { baseline: { effectivity: 'A', revision: 4 } }
      )
    ).toBe(true);
  });

  it('detects scalar, property, and nested changes', () => {
    expect(jsonValuesEqual({ revision: 1 }, { revision: 2 })).toBe(false);
    expect(
      jsonValuesEqual({ revision: 1 }, { revision: 1, active: true })
    ).toBe(false);
    expect(
      jsonValuesEqual(
        { baseline: { revision: 1 } },
        { baseline: { revision: 2 } }
      )
    ).toBe(false);
  });

  it('preserves meaningful array order', () => {
    expect(
      jsonValuesEqual(
        { routing: ['CNC', 'Assembly'] },
        { routing: ['Assembly', 'CNC'] }
      )
    ).toBe(false);
  });

  it('handles null without conflating it with missing properties', () => {
    expect(jsonValuesEqual(null, null)).toBe(true);
    expect(jsonValuesEqual({ revision: null }, {})).toBe(false);
  });
});
