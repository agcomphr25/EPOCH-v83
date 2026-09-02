import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  new URL('../pages/CombinedManufacturingProcessesPage.tsx', import.meta.url),
  'utf8'
);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(
  new URL('../components/Navigation.tsx', import.meta.url),
  'utf8'
);

describe('combined manufacturing process administration', () => {
  it('uses exact read and write feature gates', () => {
    expect(pageSource).toContain(
      "VITE_COMBINED_MANUFACTURING_PROCESS_READS_ENABLED === 'true'"
    );
    expect(pageSource).toContain(
      "VITE_COMBINED_MANUFACTURING_PROCESS_WRITES_ENABLED === 'true'"
    );
  });

  it('requires the scoped view, manage, and approve capabilities', () => {
    expect(pageSource).toContain(
      "can('manufacturing.combined_processes.view')"
    );
    expect(pageSource).toContain(
      "can('manufacturing.combined_processes.manage')"
    );
    expect(pageSource).toContain(
      "can('manufacturing.combined_processes.approve')"
    );
  });

  it('routes and exposes the administration page only behind the read flag', () => {
    expect(appSource).toContain('path="/manufacturing/combined-processes"');
    expect(navigationSource).toContain(
      "VITE_COMBINED_MANUFACTURING_PROCESS_READS_ENABLED === 'true'"
    );
    expect(navigationSource).toContain(
      "path: '/manufacturing/combined-processes'"
    );
  });

  it('preserves multiple-output and primary-output controls', () => {
    expect(pageSource).toContain('outputs.length >= 2');
    expect(pageSource).toContain(
      'outputs.filter((output) => output.isPrimary).length === 1'
    );
    expect(pageSource).toContain("item.itemType === 'MANUFACTURED'");
  });
});
