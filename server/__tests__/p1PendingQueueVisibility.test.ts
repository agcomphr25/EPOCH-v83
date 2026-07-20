import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P1 pending queue visibility', () => {
  it('normalizes camelCase PO action length when generating demand', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/src/routes/p1POQueue.ts'),
      'utf8',
    );

    expect(source).toContain(
      "action_length: specs.action_length || specs.actionLength || ''",
    );
  });

  it('accepts action length stored in nested PO specifications', () => {
    const source = readFileSync(
      join(process.cwd(), 'server/src/routes/productionQueue.ts'),
      'utf8',
    );

    expect(source).toContain("o.features->'specifications'->>'action_length'");
    expect(source).toContain("o.features->'specifications'->>'actionLength'");
  });
});
