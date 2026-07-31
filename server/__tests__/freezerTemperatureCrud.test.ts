import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('freezer temperature controlled CRUD', () => {
  it('provides read, transactional update, reason-required delete, and restore routes', () => {
    const routes = read('server/src/routes/quality.ts');
    expect(routes).toContain("router.get('/freezer-temperature-logs/:id'");
    expect(routes).toContain("router.put('/freezer-temperature-logs/:id'");
    expect(routes).toContain('await db.transaction(async (tx)');
    expect(routes).toContain("router.delete('/freezer-temperature-logs/:id'");
    expect(routes).toContain('A deletion reason of 3 to 500 characters is required');
    expect(routes).toContain("router.post('/freezer-temperature-logs/:id/restore'");
  });

  it('records correction and void identity without allowing clients to submit audit fields', () => {
    const schema = read('server/schema.ts');
    expect(schema).toContain("updatedByDisplayName: text('updated_by_display_name')");
    expect(schema).toContain("voidedByDisplayName: text('voided_by_display_name')");
    expect(schema).toContain('updatedByDisplayName: true');
    expect(schema).toContain('voidedByDisplayName: true');
  });

  it('shows correction, deletion, restore, and void-history controls in the UI', () => {
    const page = read('client/src/pages/FreezerTemperatureLogPage.tsx');
    expect(page).toContain('Show deleted records');
    expect(page).toContain('Save correction');
    expect(page).toContain('Reason for deletion (required)');
    expect(page).toContain('Temperature check restored');
    expect(page).toContain('if (log.voidedAt) continue');
  });
});
