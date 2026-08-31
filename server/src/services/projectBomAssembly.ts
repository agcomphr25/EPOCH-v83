export type ProjectBomAssemblyRow = {
  node_key: string[];
  parent_key: string[] | null;
  root_part_number: string;
  part_number: string;
  part_name?: string | null;
  inventory_item_id?: number | null;
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
  isInventoryItem: boolean;
  isManufactured: boolean;
  hasBom: boolean;
  bomId: string | null;
  bomCode: string | null;
  revisionId: string | null;
  revisionCode: string | null;
  children: ProjectBomAssemblyNode[];
};

export type ProjectPurchasedBomPart = {
  id: string;
  part_number: string;
  part_name: string | null;
  quantity: number;
  bom_occurrence_count: number;
};

export type ProjectManufacturedBomPart = {
  id: string;
  part_number: string;
  part_name: string | null;
  quantity: number;
  bom_occurrence_count: number;
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
        isInventoryItem: Boolean(row.inventory_item_id),
        isManufactured: Boolean(row.inventory_item_id) && normalizedType === 'MANUFACTURED',
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

export function collectPurchasedBomParts(
  roots: ProjectBomAssemblyNode[],
  orderedQuantityByRootPart: ReadonlyMap<string, number>,
  availableManufacturedQuantityByPart?: Map<string, number>
): ProjectPurchasedBomPart[] {
  const purchasedByPart = new Map<string, ProjectPurchasedBomPart>();

  const visit = (node: ProjectBomAssemblyNode, extendedParentQuantity: number) => {
    const requiredQuantity = extendedParentQuantity * node.quantityPerParent;
    if (node.isInventoryItem && !node.isManufactured) {
      if (requiredQuantity <= 0) return;
      const normalizedPartNumber = node.partNumber.trim().toLowerCase();
      const existing = purchasedByPart.get(normalizedPartNumber);
      if (existing) {
        existing.quantity += requiredQuantity;
        existing.bom_occurrence_count += 1;
      } else {
        purchasedByPart.set(normalizedPartNumber, {
          id: `bom-purchased:${normalizedPartNumber}`,
          part_number: node.partNumber,
          part_name: node.partName,
          quantity: requiredQuantity,
          bom_occurrence_count: 1,
        });
      }
      return;
    }

    let downstreamQuantity = requiredQuantity;
    if (node.isManufactured && availableManufacturedQuantityByPart) {
      const normalizedPartNumber = node.partNumber.trim().toLowerCase();
      const availableQuantity = Math.max(
        0,
        availableManufacturedQuantityByPart.get(normalizedPartNumber) ?? 0
      );
      const inventoryFulfilledQuantity = Math.min(
        requiredQuantity,
        availableQuantity
      );
      downstreamQuantity = requiredQuantity - inventoryFulfilledQuantity;
      availableManufacturedQuantityByPart.set(
        normalizedPartNumber,
        availableQuantity - inventoryFulfilledQuantity
      );
    }

    node.children.forEach((child) => visit(child, downstreamQuantity));
  };

  roots.forEach((root) => {
    const orderedQuantity = orderedQuantityByRootPart.get(root.partNumber.trim().toLowerCase()) ?? 0;
    root.children.forEach((child) => visit(child, orderedQuantity));
  });

  return Array.from(purchasedByPart.values()).sort((left, right) =>
    left.part_number.localeCompare(right.part_number)
  );
}

export function collectManufacturedBomParts(
  roots: ProjectBomAssemblyNode[],
  orderedQuantityByRootPart: ReadonlyMap<string, number>
): ProjectManufacturedBomPart[] {
  const manufacturedByPart = new Map<string, ProjectManufacturedBomPart>();

  const visit = (node: ProjectBomAssemblyNode, extendedParentQuantity: number) => {
    const requiredQuantity = extendedParentQuantity * node.quantityPerParent;
    if (node.isManufactured) {
      const normalizedPartNumber = node.partNumber.trim().toLowerCase();
      const existing = manufacturedByPart.get(normalizedPartNumber);
      if (existing) {
        existing.quantity += requiredQuantity;
        existing.bom_occurrence_count += 1;
      } else {
        manufacturedByPart.set(normalizedPartNumber, {
          id: `bom-manufactured:${normalizedPartNumber}`,
          part_number: node.partNumber,
          part_name: node.partName,
          quantity: requiredQuantity,
          bom_occurrence_count: 1,
        });
      }
    }
    node.children.forEach((child) => visit(child, requiredQuantity));
  };

  roots.forEach((root) => {
    const orderedQuantity = orderedQuantityByRootPart.get(root.partNumber.trim().toLowerCase()) ?? 0;
    visit(root, orderedQuantity);
  });

  return Array.from(manufacturedByPart.values()).sort((left, right) =>
    left.part_number.localeCompare(right.part_number)
  );
}
