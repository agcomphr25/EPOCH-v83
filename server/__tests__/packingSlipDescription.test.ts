/**
 * Tests for the packing slip description fallback chain.
 *
 * The bug: raw database identifiers (e.g. "mesa_universal") were appearing on
 * printed PDFs because the code was using stockModelId as the primary value
 * instead of as a last resort.
 *
 * The helper `resolvePackingSlipDescription` centralises and enforces the
 * correct priority:
 *   stockModelName  →  itemName  →  stockModelId  →  'N/A'
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePackingSlipDescription,
  type PoItemDescriptionFields,
} from '../src/helpers/packingSlipHelper';

describe('resolvePackingSlipDescription — fallback chain', () => {
  it('uses stockModelName when it is set, regardless of other fields', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: 'Mesa Universal Suppressor',
      itemName: 'Some Item',
      stockModelId: 'mesa_universal',
    };

    expect(resolvePackingSlipDescription(poItem)).toBe('Mesa Universal Suppressor');
  });

  it('falls back to itemName when stockModelName is absent', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: '',
      itemName: 'Custom Item Name',
      stockModelId: 'mesa_universal',
    };

    expect(resolvePackingSlipDescription(poItem)).toBe('Custom Item Name');
  });

  it('falls back to itemName when stockModelName is null', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: null,
      itemName: 'Custom Item Name',
      stockModelId: 'mesa_universal',
    };

    expect(resolvePackingSlipDescription(poItem)).toBe('Custom Item Name');
  });

  it('uses stockModelId only as a last resort when both stockModelName and itemName are absent', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: null,
      itemName: null,
      stockModelId: 'mesa_universal',
    };

    expect(resolvePackingSlipDescription(poItem)).toBe('mesa_universal');
  });

  it('does NOT use stockModelId when stockModelName is available', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: 'Readable Name',
      itemName: null,
      stockModelId: 'raw_db_identifier',
    };

    const result = resolvePackingSlipDescription(poItem);
    expect(result).not.toBe('raw_db_identifier');
    expect(result).toBe('Readable Name');
  });

  it('does NOT use stockModelId when itemName is available', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: null,
      itemName: 'Item From Operator',
      stockModelId: 'raw_db_identifier',
    };

    const result = resolvePackingSlipDescription(poItem);
    expect(result).not.toBe('raw_db_identifier');
    expect(result).toBe('Item From Operator');
  });

  it('returns N/A when all fields are absent', () => {
    const poItem: PoItemDescriptionFields = {
      stockModelName: null,
      itemName: null,
      stockModelId: null,
    };

    expect(resolvePackingSlipDescription(poItem)).toBe('N/A');
  });

  it('returns N/A when the poItem has no description fields at all', () => {
    expect(resolvePackingSlipDescription({})).toBe('N/A');
  });
});
