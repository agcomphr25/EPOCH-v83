import { describe, it, expect } from 'vitest';
import { deriveOrderLabels } from '../utils/deriveOrderLabels';

describe('deriveOrderLabels - material derivation', () => {
  describe('materialCanonical takes priority over features.material', () => {
    it('uses materialCanonical "carbon_fiber" even when features.material is "fiberglass"', () => {
      const order = {
        orderId: 'FC015',
        modelId: 'mesa_universal',
        materialCanonical: 'carbon_fiber',
        features: { material: 'fiberglass' },
      };
      const { materialLabel } = deriveOrderLabels(order);
      expect(materialLabel).toBe('Carbon Fiber');
    });

    it('uses materialCanonical "Carbon Fiber" directly when features.material is stale', () => {
      const order = {
        orderId: 'FC016',
        modelId: 'mesa_universal',
        materialCanonical: 'Carbon Fiber',
        features: { material: 'fiberglass' },
      };
      const { materialLabel } = deriveOrderLabels(order);
      expect(materialLabel).toBe('Carbon Fiber');
    });

    it('falls back to features.material when materialCanonical is absent', () => {
      const order = {
        orderId: 'FC017',
        modelId: 'mesa_universal',
        features: { material: 'fiberglass' },
      };
      const { materialLabel } = deriveOrderLabels(order);
      expect(materialLabel).toBe('Fiberglass');
    });
  });

  describe('normalizeMaterialLabel handles underscore variants', () => {
    it('normalizes carbon_fiber to Carbon Fiber', () => {
      const order = { orderId: 'X001', materialCanonical: 'carbon_fiber', features: {} };
      expect(deriveOrderLabels(order).materialLabel).toBe('Carbon Fiber');
    });

    it('normalizes carbon_fibre to Carbon Fiber', () => {
      const order = { orderId: 'X002', materialCanonical: 'carbon_fibre', features: {} };
      expect(deriveOrderLabels(order).materialLabel).toBe('Carbon Fiber');
    });

    it('normalizes "fiberglass" to Fiberglass', () => {
      const order = { orderId: 'X003', materialCanonical: 'fiberglass', features: {} };
      expect(deriveOrderLabels(order).materialLabel).toBe('Fiberglass');
    });
  });

  describe('mesa_universal fallback when no canonical material is set', () => {
    it('returns Carbon Fiber for mesa_universal with no materialCanonical and no features.material', () => {
      const order = {
        orderId: 'M001',
        modelId: 'mesa_universal',
        features: {},
      };
      expect(deriveOrderLabels(order).materialLabel).toBe('Carbon Fiber');
    });

    it('returns Carbon Fiber for mesa_tikka with no materialCanonical and no features.material', () => {
      const order = {
        orderId: 'M002',
        modelId: 'mesa_tikka',
        features: {},
      };
      expect(deriveOrderLabels(order).materialLabel).toBe('Carbon Fiber');
    });
  });
});
