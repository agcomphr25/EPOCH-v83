import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('P2 project source-part inventory relink', () => {
  const projectsRoute = readFileSync(
    join(process.cwd(), 'server/src/routes/projects.ts'),
    'utf8'
  );

  it('casts the conditional item type to the PostgreSQL inventory enum', () => {
    expect(projectsRoute).toMatch(
      /SET item_type = \(\s*CASE WHEN \$3::boolean THEN 'PURCHASED' ELSE 'MANUFACTURED' END\s*\)::inventory_item_type/
    );
  });

  it('casts inventory classification values at the shared write boundary', () => {
    const storage = readFileSync(
      join(process.cwd(), 'server/storage.ts'),
      'utf8'
    );

    expect(storage).toMatch(
      /sql`\$\{data\.itemType\}::inventory_item_type`/
    );
    expect(storage).toMatch(
      /sql`\$\{data\.manufacturedCategory\}::inventory_manufactured_category`/
    );
    expect(storage).toMatch(
      /sql`\$\{data\.manufacturingLevel\}::inventory_manufacturing_level`/
    );
    expect(storage).toMatch(
      /\.values\(\[withInventoryItemEnumCasts\(data\)\]\)/
    );
    expect(storage).toMatch(
      /const updateData: any = withInventoryItemEnumCasts\(data\)/
    );
  });

  it('preserves source-part inventory identity across PO edits and revisions', () => {
    const indexRoute = readFileSync(
      join(process.cwd(), 'server/src/routes/index.ts'),
      'utf8'
    );

    expect(indexRoute).toMatch(
      /item\.inventoryItemId\s*\|\| existingItem\?\.inventoryItemId \|\| null/
    );
    expect(indexRoute).toMatch(
      /item\.inventoryItemId\s*\|\| sourceItem\?\.inventory_item_id \|\| null/
    );
  });
});
