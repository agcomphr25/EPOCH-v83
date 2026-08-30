import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'client/src/pages/DraftBOMBuilderPage.tsx'),
  'utf8',
);

describe('Draft BOM Assembly Tree expansion controls', () => {
  it('starts with every BOM and child closed', () => {
    expect(source).toContain('const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);');
    expect(source).toContain('value={rootExpandableNodeIds.filter((id) => expandedNodeIds.includes(id))}');
  });

  it('lets the user open or close every expandable descendant', () => {
    expect(source).toContain('tree.flatMap(collectExpandableAssemblyNodeIds)');
    expect(source).toContain('onClick={() => setExpandedNodeIds(expandableNodeIds)}');
    expect(source).toContain('onClick={() => setExpandedNodeIds([])}');
    expect(source).toContain('Open all');
    expect(source).toContain('Close all');
  });

  it('keeps nested manufactured parts individually controllable', () => {
    expect(source).toContain('setExpandedNodeIds((currentIds) => [');
    expect(source).toContain('expandedNodeIds={expandedNodeIds}');
    expect(source).toContain('setExpandedNodeIds={setExpandedNodeIds}');
  });
});
