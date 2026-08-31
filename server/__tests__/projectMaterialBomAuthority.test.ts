import { readFileSync } from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  path.join(process.cwd(), 'server/src/routes/projects.ts'),
  'utf8',
);
const pageSource = readFileSync(
  path.join(process.cwd(), 'client/src/pages/ProjectDetailPage.tsx'),
  'utf8',
);

describe('project Material tab BOM authority', () => {
  it('calculates demand from the active released effective BOM revision', () => {
    const assemblyQueryStart = routeSource.indexOf("'BOM assembly tree'");
    const assemblyQueryEnd = routeSource.indexOf('const assemblyTree', assemblyQueryStart);
    const assemblyQuery = routeSource.slice(assemblyQueryStart, assemblyQueryEnd);

    expect(assemblyQuery).toContain('WHERE bom_id = b.id');
    expect(assemblyQuery).toContain('AND is_released = true');
    expect(assemblyQuery).toContain('AND (effective_from IS NULL OR effective_from <= NOW())');
    expect(assemblyQuery).toContain('AND (effective_to IS NULL OR effective_to > NOW())');
    expect(assemblyQuery).toContain('WHERE b.is_active = true');
    expect(assemblyQuery).toContain('line.qty_per');
  });

  it('nets manufactured child availability before exposing production and raw-material demand', () => {
    expect(routeSource).toContain('availableManufacturedInventoryByPart');
    expect(routeSource).toContain('remainingManufacturedInventoryByPart');
    expect(routeSource).toContain('production_required_quantity');
    expect(pageSource).toContain("node.sourceType === 'STOCK_SATISFIED'");
    expect(pageSource).toContain('No child work order or downstream raw-material demand is required.');
  });
});
