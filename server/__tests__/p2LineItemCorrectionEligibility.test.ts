import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = fs.readFileSync(path.resolve(process.cwd(), 'server/src/routes/index.ts'), 'utf8');

describe('P2 audited line-item correction eligibility', () => {
  it('does not treat pending setup placeholders as production activity', () => {
    expect(routes).toContain("COALESCE(UPPER(psi.status), 'PENDING') <> 'PENDING'");
    expect(routes).toContain("COALESCE(UPPER(ppo.status), 'PENDING') NOT IN ('PENDING', 'CANCELLED', 'CANCELED')");
  });

  it('blocks after scheduling, starting, or manufacturing activity', () => {
    expect(routes).toContain('ppo.scheduled_layup_date IS NOT NULL');
    expect(routes).toContain('ppo.started_at IS NOT NULL');
    expect(routes).toContain('COALESCE(ppo.quantity_manufactured, 0) > 0');
  });
});
