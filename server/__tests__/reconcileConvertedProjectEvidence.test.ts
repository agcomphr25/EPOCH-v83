import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'server/scripts/reconcileConvertedProjectEvidence.ts'),
  'utf8'
);

describe('converted-project evidence reconciliation guardrails', () => {
  it('requires exact project confirmation and preserves legacy records', () => {
    expect(source).toContain('--confirm-project=');
    expect(source).toContain("workflow_version !== 'p2_v2'");
    expect(source).toContain('preservedLegacyRecords: true');
    expect(source).not.toMatch(/DELETE\s+FROM\s+project_steps/i);
    expect(source).not.toMatch(/UPDATE\s+project_steps/i);
  });

  it('requires completed legacy gates plus released PO and WAD authority', () => {
    expect(source).toContain("status !== 'completed'");
    expect(source).toContain("status='RELEASED' AND wad_status='APPROVED'");
    expect(source).toContain(
      "status IN ('released','in_production','completed')"
    );
    expect(source).toContain("'SATISFIES_REQUIREMENT',true");
  });

  it('opens P2 release but does not bypass P2 execution or closing', () => {
    expect(source).toContain("byStage.get('p2_release')");
    expect(source).not.toContain("byStage.get('p2_execution')");
    expect(source).not.toContain("byStage.get('project_closing')");
  });
});
