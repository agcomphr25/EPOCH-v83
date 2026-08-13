import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const certification = readFileSync(
  join(process.cwd(), 'server/__tests__/p2V2PostgresCertification.test.ts'),
  'utf8'
);

describe('serialized-unit PostgreSQL certification identity', () => {
  it('counts project units through the immutable serialized-unit audit link', () => {
    expect(certification).toContain(
      'JOIN p2_serialized_items si ON si.id=su.serialized_item_id'
    );
    expect(certification).toContain('WHERE su.project_id=$1');
  });

  it('proves PO ownership through projects.po_id rather than PO-local project metadata', () => {
    expect(certification).toContain('p.id=su.project_id AND p.po_id=si.po_id');
    expect(certification).not.toContain(
      'JOIN p2_purchase_orders po ON po.id=si.po_id WHERE po.project_id=$1'
    );
  });
});
