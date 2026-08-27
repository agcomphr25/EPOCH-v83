import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'client/src/pages/P2ControlCenter.tsx'), 'utf8');

describe('P2 Control Center Production Map consolidation', () => {
  it('replaces the three top-level program views with one Production Map tab', () => {
    expect(source).toContain('value="production-map"');
    expect(source).toContain('data-testid="tab-production-map"');
    expect(source).not.toContain('data-testid="tab-program-overview"');
    expect(source).not.toContain('data-testid="tab-assembly-tree"');
    expect(source).not.toContain('data-testid="tab-swimlane"');
  });

  it('switches one selected-PO orchestration surface between all three views', () => {
    expect(source).toContain('production-map-view-program');
    expect(source).toContain('production-map-view-assembly');
    expect(source).toContain('production-map-view-swimlane');
    expect(source).toContain('ProgramManufacturingOrchestration mode={productionMapView} projectId={programProjectId}');
    expect(source).toContain('Select one PO to view its Production Map');
  });

  it('keeps legacy tab links routed to the matching Production Map view', () => {
    expect(source).toContain("if (tab === 'assembly-tree') return 'tree'");
    expect(source).toContain("if (tab === 'swimlane') return 'swimlane'");
    expect(source).toContain("return 'production-map'");
  });
});
