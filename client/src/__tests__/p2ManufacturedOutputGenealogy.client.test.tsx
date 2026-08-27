import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const page = readFileSync(
  resolve(process.cwd(), 'client/src/pages/P2WorkOrderQueuePage.tsx'),
  'utf8'
);

describe('Phase 10 manufactured-output client gates', () => {
  it('requires exact matching disabled-by-default VITE gates', () => {
    expect(page).toContain(
      "VITE_P2_MANUFACTURED_OUTPUT_READS_ENABLED === 'true'"
    );
    expect(page).toContain(
      "VITE_P2_MANUFACTURED_OUTPUT_WRITES_ENABLED === 'true'"
    );
  });
});
