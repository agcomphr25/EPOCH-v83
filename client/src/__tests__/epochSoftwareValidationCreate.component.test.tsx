import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, '../pages/EpochSoftwareValidationPage.tsx'),
  'utf8'
);
const compact = source.replace(/\s+/g, '');

describe('EPOCH software validation create submission', () => {
  it('has one authoritative form submission path and no create click handler', () => {
    expect(compact).toContain(
      'onSubmit={(e)=>{e.preventDefault();submitCreate(e.currentTarget);}}'
    );
    expect(source).not.toMatch(/onClick=.*create\.mutate/);
    expect(source).not.toMatch(/useEffect[\s\S]{0,300}create\.mutate/);
  });

  it('synchronously ignores rapid repeat submissions before React rerenders', () => {
    expect(compact).toContain('if(createSubmission.current)return;');
    expect(compact).toContain('createSubmission.current=idempotencyKey;');
    expect(
      compact.indexOf('createSubmission.current=idempotencyKey;')
    ).toBeLessThan(compact.indexOf('create.mutate({body,'));
  });

  it('uses a fresh key per deliberate action and disables the pending submit', () => {
    expect(compact).toContain('constidempotencyKey=crypto.randomUUID()');
    expect(compact).toContain(
      "headers:{'Idempotency-Key':input.idempotencyKey}"
    );
    expect(compact).toContain('retry:false');
    expect(compact).toContain(
      'disabled={create.isPending||Boolean(createSubmission.current)}'
    );
    expect(compact).toContain("'Creatingpackage\\u2026'");
    expect(compact).toContain('setSelected(p.id)');
  });

  it('omits blank optional values before creating a package', () => {
    expect(compact).toContain("'productionDeploymentDate'");
    expect(compact).toContain('if(!body[field]?.trim())deletebody[field]');
    expect(compact).toContain('create.mutate({body,idempotencyKey,})');
  });
});
