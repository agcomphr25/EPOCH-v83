import type { ProjectBomAssemblyNode } from './projectBomAssembly';

type ProductionRecord = Record<string, unknown>;

export type ProjectProductionHierarchyNode = {
  key: string;
  partNumber: string;
  partName: string | null;
  sourceType:
    | 'ASSEMBLY_WORK_ORDER'
    | 'MANUFACTURED_WORK_ORDER'
    | 'STOCK_SATISFIED'
    | 'PURCHASED_MATERIAL';
  quantityPerParent: number;
  grossRequiredQuantity: number;
  requiredQuantity: number;
  inventoryAvailableQuantity: number;
  inventoryFulfilledQuantity: number;
  workOrders: ProductionRecord[];
  productionDemand: {
    recordCount: number;
    totalQuantity: number;
    quantityManufactured: number;
    legacyUnitRows: boolean;
    departments: string[];
  };
  children: ProjectProductionHierarchyNode[];
};

const normalized = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const finiteQuantity = (value: unknown) => {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) ? quantity : 0;
};

export function buildProjectProductionHierarchy(input: {
  root: ProjectBomAssemblyNode | null;
  orderedQuantity: number;
  workOrders: ProductionRecord[];
  productionOrders: ProductionRecord[];
  remainingManufacturedInventoryByPart?: Map<string, number>;
}): ProjectProductionHierarchyNode | null {
  if (!input.root) return null;
  const workOrdersByPart = new Map<string, ProductionRecord[]>();
  input.workOrders.forEach((record) => {
    const key = normalized(record.partNumber ?? record.part_number);
    if (!key) return;
    workOrdersByPart.set(key, [...(workOrdersByPart.get(key) ?? []), record]);
  });
  const productionOrdersByPart = new Map<string, ProductionRecord[]>();
  input.productionOrders.forEach((record) => {
    const key = normalized(record.sku ?? record.part_number);
    if (!key) return;
    productionOrdersByPart.set(key, [
      ...(productionOrdersByPart.get(key) ?? []),
      record,
    ]);
  });

  const visit = (
    node: ProjectBomAssemblyNode,
    parentRequiredQuantity: number,
    root = false
  ): ProjectProductionHierarchyNode => {
    const grossRequiredQuantity = root
      ? Math.max(0, input.orderedQuantity)
      : parentRequiredQuantity * Math.max(0, node.quantityPerParent);
    const key = normalized(node.partNumber);
    const inventoryAvailableQuantity =
      !root && node.isManufactured
        ? Math.max(
            0,
            input.remainingManufacturedInventoryByPart?.get(key) ?? 0
          )
        : 0;
    const inventoryFulfilledQuantity = Math.min(
      grossRequiredQuantity,
      inventoryAvailableQuantity
    );
    const requiredQuantity =
      grossRequiredQuantity - inventoryFulfilledQuantity;
    if (!root && node.isManufactured && input.remainingManufacturedInventoryByPart) {
      input.remainingManufacturedInventoryByPart.set(
        key,
        inventoryAvailableQuantity - inventoryFulfilledQuantity
      );
    }
    const demandRows = productionOrdersByPart.get(key) ?? [];
    const totalQuantity = demandRows.reduce(
      (total, record) => total + finiteQuantity(record.quantity),
      0
    );
    const quantityManufactured = demandRows.reduce(
      (total, record) =>
        total +
        finiteQuantity(
          record.quantityManufactured ?? record.quantity_manufactured
        ),
      0
    );
    const departments = Array.from(
      new Set(
        demandRows
          .map((record) => String(record.department ?? '').trim())
          .filter(Boolean)
      )
    );
    return {
      key: node.key,
      partNumber: node.partNumber,
      partName: node.partName,
      sourceType: root
        ? 'ASSEMBLY_WORK_ORDER'
        : node.isManufactured
          ? requiredQuantity === 0
            ? 'STOCK_SATISFIED'
            : 'MANUFACTURED_WORK_ORDER'
          : 'PURCHASED_MATERIAL',
      quantityPerParent: root ? 1 : node.quantityPerParent,
      grossRequiredQuantity,
      requiredQuantity,
      inventoryAvailableQuantity,
      inventoryFulfilledQuantity,
      workOrders: workOrdersByPart.get(key) ?? [],
      productionDemand: {
        recordCount: demandRows.length,
        totalQuantity,
        quantityManufactured,
        legacyUnitRows:
          demandRows.length > 1 &&
          demandRows.every((record) => finiteQuantity(record.quantity) === 1),
        departments,
      },
      children:
        requiredQuantity === 0 && !root
          ? []
          : node.children.map((child) => visit(child, requiredQuantity)),
    };
  };

  return visit(input.root, input.orderedQuantity, true);
}
