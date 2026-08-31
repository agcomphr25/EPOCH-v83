import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectRoutes = readFileSync(
  new URL('../src/routes/projects.ts', import.meta.url),
  'utf8',
);
const projectPage = readFileSync(
  new URL('../../client/src/pages/ProjectDetailPage.tsx', import.meta.url),
  'utf8',
);
const robustBomPage = readFileSync(
  new URL('../../client/src/pages/RobustBOMAdministration.tsx', import.meta.url),
  'utf8',
);

test('project BOM discovery uses the linked inventory identity before the AG-number fallback', () => {
  assert.match(
    projectRoutes,
    /b\.parent_inventory_item_id = ANY\(\$1::int\[\]\)/,
  );
  assert.match(
    projectRoutes,
    /sb\.parent_inventory_item_id = inventory\.id/,
  );
  assert.match(
    projectRoutes,
    /child_bom\.parent_inventory_item_id = inventory\.id/,
  );
  assert.match(
    projectRoutes,
    /inventory\.id = line\.child_inventory_item_id/,
  );
  assert.match(
    projectRoutes,
    /sb\.parent_inventory_item_id IS NULL[\s\S]*sb\.parent_part_ag_number/,
  );
});

test('project source parts expose released Robust BOM authority and actionable missing states', () => {
  assert.match(projectRoutes, /bomAuthority: \{/);
  assert.match(
    projectRoutes,
    /Released Robust BOM is linked through the inventory item identity/,
  );
  assert.match(projectPage, /source-part-bom-linked-/);
  assert.match(projectPage, /source-part-bom-missing-/);
  assert.match(projectPage, /No released Robust BOM hierarchy is available/);
});

test('Robust BOM explosion declares the recursive TreeNode used by the dialog', () => {
  assert.match(robustBomPage, /function TreeNode\(\{/);
  assert.match(robustBomPage, /<TreeNode[\s\S]*level=\{level \+ 1\}/);
  assert.match(robustBomPage, /expandedNodes\.has\(nodeId\)/);
});
