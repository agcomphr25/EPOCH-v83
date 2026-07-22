export type ProjectBomAssemblyRow = {
  node_key: string[];
  parent_key: string[] | null;
  root_part_number: string;
  part_number: string;
  part_name?: string | null;
  item_type?: string | null;
  qty_per?: string | number | null;
  operation_seq?: number | null;
  depth: number;
  bom_id?: string | null;
  bom_code?: string | null;
  bom_description?: string | null;
  bom_is_active?: boolean | null;
  latest_revision_id?: string | null;
  latest_rev_code?: string | null;
  latest_rev_created_at?: string | null;
  line_count?: number | null;
};

export type ProjectBomAssemblyNode = {
  key: string;
  partNumber: string;
  partName: string | null;
  quantityPerParent: number;
  operationSequence: number | null;
  depth: number;
  isManufactured: boolean;
  hasBom: boolean;
  bomId: string | null;
  bomCode: string | null;
  revisionId: string | null;
  revisionCode: string | null;
  children: ProjectBomAssemblyNode[];
};

const keyFor = (segments: string[]) => segments.join('/');

export function buildProjectBomAssemblyTree(rows: ProjectBomAssemblyRow[]): ProjectBomAssemblyNode[] {
  const nodes = new Map<string, ProjectBomAssemblyNode>();
  const parentKeys = new Map<string, string | null>();

  [...rows]
    .sort((left, right) => {
      const depthDifference = left.depth - right.depth;
      if (depthDifference !== 0) return depthDifference;
      const parentDifference = keyFor(left.parent_key ?? []).localeCompare(keyFor(right.parent_key ?? []));
      if (parentDifference !== 0) return parentDifference;
      const operationDifference = Number(left.operation_seq ?? 0) - Number(right.operation_seq ?? 0);
      return operationDifference || keyFor(left.node_key).localeCompare(keyFor(right.node_key));
    })
    .forEach((row) => {
      const key = keyFor(row.node_key);
      const normalizedType = String(row.item_type ?? '').trim().toUpperCase();
      nodes.set(key, {
        key,
        partNumber: row.part_number,
        partName: row.part_name ?? null,
        quantityPerParent: Number(row.qty_per ?? 1),
        operationSequence: row.operation_seq ?? null,
        depth: Number(row.depth),
        isManufactured: normalizedType === 'MANUFACTURED' || Boolean(row.bom_id),
        hasBom: Boolean(row.bom_id),
        bomId: row.bom_id ?? null,
        bomCode: row.bom_code ?? null,
        revisionId: row.latest_revision_id ?? null,
        revisionCode: row.latest_rev_code ?? null,
        children: [],
      });
      parentKeys.set(key, row.parent_key ? keyFor(row.parent_key) : null);
    });

  const roots: ProjectBomAssemblyNode[] = [];
  nodes.forEach((node, key) => {
    const parentKey = parentKeys.get(key);
    const parent = parentKey ? nodes.get(parentKey) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  return roots;
}
