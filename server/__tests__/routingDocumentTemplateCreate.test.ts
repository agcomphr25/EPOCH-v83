import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'server/src/routes/routingDocuments.ts'), 'utf8');
const queryClient = readFileSync(join(process.cwd(), 'client/src/lib/queryClient.ts'), 'utf8');
const createHandler = route.slice(
  route.indexOf("router.post('/templates'"),
  route.indexOf('// Update template'),
);

describe('Form & Document Builder template creation', () => {
  it('creates the template and its fields in one transaction', () => {
    expect(createHandler).toContain('db.transaction(async (tx) =>');
    expect(createHandler).toContain("['id', 'template_name', 'template_type'], tx");
    expect(createHandler).toContain("['id', 'template_id', 'field_name', 'field_label', 'field_type'], tx");
  });

  it('rejects a template without fillable fields before inserting it', () => {
    expect(createHandler).toContain('normalizedFields.length === 0');
    expect(createHandler).toContain('At least one template field is required');
  });

  it('serializes structured defaults before writing them to text columns', () => {
    expect(route).toContain("dataType === 'text' || dataType?.startsWith('character')");
    expect(route).toContain('sql`${JSON.stringify(value)}`');
  });

  it('shows the actionable server detail instead of the generic create error', () => {
    expect(queryClient.indexOf("typeof data?.detail === 'string'")).toBeLessThan(
      queryClient.indexOf('data?.error ||'),
    );
  });
});
