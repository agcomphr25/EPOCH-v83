import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoutes = readFileSync(
  resolve(process.cwd(), 'server/src/routes/projects.ts'),
  'utf8'
);

describe('Project P2 Hub serialized-items query', () => {
  it('qualifies the outer status column when the traveler lateral join also exposes status', () => {
    const queryStart = projectRoutes.indexOf("'serialized items'");
    const queryEnd = projectRoutes.indexOf("'lots'", queryStart);
    expect(queryStart).toBeGreaterThanOrEqual(0);
    expect(queryEnd).toBeGreaterThan(queryStart);

    const query = projectRoutes.slice(queryStart, queryEnd);
    expect(query).toContain('FROM p2_serialized_items si');
    expect(query).toContain(
      'si.part_name, si.current_department, si.status, si.completed_at'
    );
    expect(query).toContain('active_traveler.status AS active_traveler_status');
    expect(query).toContain('WHERE si.po_id = ANY($1::int[])');
    expect(query).toContain(
      'LOWER(TRIM(t.serial_number)) = LOWER(TRIM(si.serial_number))'
    );
    expect(query).not.toContain('p2_serialized_items.serial_number');
    expect(query).not.toContain('p2_serialized_items.barcode');
  });
});
