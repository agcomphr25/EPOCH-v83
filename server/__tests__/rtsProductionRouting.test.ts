import { describe, expect, it } from 'vitest';
import { getNextRtsDepartment } from '../src/lib/rtsProductionRouting';

describe('getNextRtsDepartment', () => {
  it.each([
    ['Layup/Plugging', 'Barcode'],
    ['Barcode', 'CNC'],
    ['CNC', 'Gunsmith'],
    ['Gunsmith', 'Finish'],
    ['Finish', 'Finish QC'],
    ['Finish QC', 'Paint'],
    ['Paint', 'Shipping QC'],
    ['Shipping QC', 'Shipping'],
  ])('resumes after %s in %s', (lastDepartment, nextDepartment) => {
    expect(getNextRtsDepartment(lastDepartment)).toBe(nextDepartment);
  });

  it.each([null, undefined, '', 'Shipping', 'Unknown'])(
    'rejects an unroutable completion point: %s',
    (lastDepartment) => {
      expect(getNextRtsDepartment(lastDepartment)).toBeNull();
    },
  );
});
