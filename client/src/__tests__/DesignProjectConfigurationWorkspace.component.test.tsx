import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    '../features/design-control/DesignProjectConfigurationWorkspace.tsx'
  ),
  'utf8'
);

describe('Design Project configuration item creation', () => {
  it('submits the item and optional parent relationship in one request', () => {
    expect(source).toContain(
      'parentConfigurationItemId: itemForm.parentId || null'
    );
    expect(source).toContain('quantity: itemForm.parentId');
    expect(source).toContain('unitOfMeasure: itemForm.parentId');
    expect(source).toContain('setSelectedItemId(created.item.id)');
    expect(source).not.toMatch(
      /if \(created && itemForm\.parentId\)[\s\S]{0,300}configuration\/relationships/
    );
  });
});
