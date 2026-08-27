import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const scanner = read('client/src/components/MaterialScanner.tsx');
const traveler = read('client/src/pages/TravelerExecution.tsx');

describe('Phase 9 controlled material scanner client gate', () => {
  it('requires both client gates and never falls back to legacy consumption for a P2 traveler', () => {
    expect(scanner).toContain(
      "VITE_P2_MATERIAL_CONSUMPTION_READS_ENABLED === 'true'"
    );
    expect(scanner).toContain(
      "VITE_P2_MATERIAL_CONSUMPTION_WRITES_ENABLED === 'true'"
    );
    expect(scanner).toContain('isP2Traveler && !isP2Controlled');
    expect(scanner).toContain('Both certified client gates must be enabled');
  });

  it('requires permission, operator authentication, and controlled barcodes', () => {
    expect(scanner).toContain("can('p2.material_consumption.record')");
    expect(scanner).toContain("icn.startsWith('P2RCV:')");
    expect(scanner).toContain("p2TravelerBarcode?.startsWith('P2TRV:')");
    expect(scanner).toMatch(
      /window\.sessionStorage\.getItem\(\s*'epoch\.operatorAuth\.token'\s*\)/
    );
    expect(scanner).toMatch(
      /apiRequest\(\s*'\/api\/p2-material-consumption\/resolve'/
    );
    expect(scanner).toContain('Released BOM demand path');
    expect(scanner).toContain('materialRequirementId: p2MaterialRequirementId');
  });

  it('uses the server-authoritative Phase 9 endpoint from the existing traveler UI', () => {
    expect(scanner).toContain(
      "apiRequest('/api/p2-material-consumption/consume'"
    );
    expect(traveler).toContain(
      'p2TravelerBarcode={traveler.internalControlNumber}'
    );
  });
});
