import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, '../pages/EpochSoftwareValidationPage.tsx'),
  'utf8'
);

describe('EPOCH software validation create submission', () => {
  it('has one authoritative form submission path and no create click handler', () => {
    expect(source).toContain(
      'onSubmit={e=>{e.preventDefault();submitCreate(e.currentTarget)}}'
    );
    expect(source).not.toMatch(/onClick=.*create\.mutate/);
    expect(source).not.toMatch(/useEffect[\s\S]{0,300}create\.mutate/);
  });

  it('synchronously ignores rapid repeat submissions before React rerenders', () => {
    expect(source).toContain('if(createSubmission.current)return;');
    expect(source).toContain('createSubmission.current=idempotencyKey;');
    expect(
      source.indexOf('createSubmission.current=idempotencyKey;')
    ).toBeLessThan(source.indexOf('create.mutate({body:'));
  });

  it('uses a fresh key per deliberate action and disables the pending submit', () => {
    expect(source).toContain('const idempotencyKey=crypto.randomUUID()');
    expect(source).toContain(
      "headers:{'Idempotency-Key':input.idempotencyKey}"
    );
    expect(source).toContain('retry:false');
    expect(source).toContain(
      'disabled={create.isPending||Boolean(createSubmission.current)}'
    );
    expect(source).toContain("'Creating package\\u2026'");
    expect(source).toContain('setSelected(p.id)');
  });
});
