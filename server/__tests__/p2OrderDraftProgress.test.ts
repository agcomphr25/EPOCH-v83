import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

describe('resumable P2 order wizard drafts', () => {
  it('uses a separate additive draft table outside production POs', () => {
    const migration = read('migrations/0288_p2_order_draft_progress.sql');
    expect(() =>
      runMigrationSafetyCheck(migration, '0288_p2_order_draft_progress.sql')
    ).not.toThrow();
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS p2_order_drafts');
    expect(migration).toContain(
      'CONSTRAINT p2_order_drafts_project_unique UNIQUE (project_id)'
    );
    expect(migration).not.toMatch(/\bDROP\b|\bTRUNCATE\b/i);
  });

  it('supports load, upsert, and delete for a project draft', () => {
    const routes = read('server/src/routes/projects.ts');
    expect(routes).toContain("router.get('/:id/p2-order-draft'");
    expect(routes).toContain("router.put('/:id/p2-order-draft'");
    expect(routes).toContain("router.delete('/:id/p2-order-draft'");
    expect(routes).toContain('ON CONFLICT (project_id) DO UPDATE');
    expect(routes).toContain(
      "draftActor?.username || draftActor?.email || 'unknown'"
    );
    expect(routes).toContain(
      "pool.query('DELETE FROM p2_order_drafts WHERE project_id = $1'"
    );
  });

  it('keeps PO date distinct from committed due date', () => {
    const wizard = read('client/src/components/p2/P2POCreationWizard.tsx');
    expect(wizard).toContain(
      "poDate: z.string().min(1, 'PO date is required')"
    );
    expect(wizard).toContain('data-testid="input-po-date"');
    expect(wizard).toContain('data-testid="input-due-date"');
    expect(wizard).toContain('data-testid="button-save-p2-draft"');
  });
});
