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

  it('uses the parsed API helper result exactly once', () => {
    expect(compact).toContain(
      "returnrequestJson<Package>('/api/qms/epoch-software-validation',{"
    );
    expect(source).not.toContain('.json()');
  });

  it('treats a successful create as successful and opens the package', () => {
    expect(source).toContain('Controlled draft created successfully.');
    expect(compact).toContain('setCreateOpen(false)');
    expect(compact).toContain('setSelected(p.id)');
    expect(compact).toContain(
      "qc.invalidateQueries({queryKey:['/api/qms/epoch-software-validation']},{throwOnError:true})"
    );
  });

  it('reserves the idempotency guard and offers refresh after uncertain UI recovery', () => {
    expect(source).toContain(
      'The draft was created, but EPOCH could not refresh the screen. Refresh the package list before trying again.'
    );
    expect(source).toContain('Refresh package list');
    expect(compact).toContain('setCreateRecovery(p)');
    expect(compact).toContain('disabled={Boolean(createRecovery)}');
    expect(compact).not.toContain(
      'catch{createSubmission.current=null;setCreateRecovery(p)'
    );
  });

  it('only reports create failure from the request error path', () => {
    expect(source).toContain("title: 'Package was not created'");
    expect(compact).toContain(
      'onError:(e:Error)=>{createSubmission.current=null;'
    );
  });
});
