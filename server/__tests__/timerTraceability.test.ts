import { describe, expect, it } from 'vitest';
import { isOvenCureDepartmentName } from '../src/lib/timerTraceability';

describe('isOvenCureDepartmentName', () => {
  it.each(['Oven Cure', 'OVEN/CURE', 'Curing', 'Oven 1'])(
    'identifies timer-managed traveler department %s',
    (departmentName) => {
      expect(isOvenCureDepartmentName(departmentName)).toBe(true);
    },
  );

  it.each(['Layup', 'CNC', 'Final QC', null])(
    'does not classify unrelated department %s as timer-managed',
    (departmentName) => {
      expect(isOvenCureDepartmentName(departmentName)).toBe(false);
    },
  );
});
