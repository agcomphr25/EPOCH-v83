import type { ProductionLaunchPreviewNode } from './productionLaunchPreviewResolver';

export type FrozenProductionPlanItem = {
  id: string;
  assemblyPath: string;
  partNumber: string;
  productionPlanId: string;
  projectId: string;
};

export type ProductionDemandSpec = {
  key: string;
  parentKey: string | null;
  projectId: string;
  productionPlanId: string;
  productionPlanItemId: string;
  poItemId: number;
  demandLineIdentity: string;
  demandKey: string;
  assemblyPath: string;
  pathDepth: number;
  inventoryItemId: number | null;
  partNumber: string;
  partRevision: string | null;
  description: string | null;
  classification: string;
  disposition:
    | 'MAKE'
    | 'BUY'
    | 'OUTSIDE_PROCESS'
    | 'PHANTOM'
    | 'STOCK_SATISFIED'
    | 'UNRESOLVED';
  quantityPerParent: number;
  grossRequiredQuantity: number;
  availableQuantitySnapshot: number;
  allocatedQuantitySnapshot: number;
  shortageQuantity: number;
  originalCustomerQuantity: number;
  effectiveCustomerQuantity: number;
  customerDemandEventDigest: string;
  customerDemandSnapshot: unknown;
  unitOfMeasure: string | null;
  requiredByDate: string | null;
  bomId: string | null;
  bomRevisionId: string | null;
  bomRevisionSnapshot: string | null;
  routingId: string | null;
  routingRevisionSnapshot: string | null;
  firstDepartmentSnapshot: string | null;
  demandStatus: 'PLANNED' | 'STOCK_SATISFIED' | 'BLOCKED';
  blockerSnapshot: ProductionLaunchPreviewNode['blockers'];
};

export type ProductionDemandDependencySpec = {
  predecessorKey: string;
  successorKey: string;
  dependencyType: 'COMPLETE' | 'ACCEPT' | 'ISSUE_OR_SCAN';
};

export class ProductionDemandGraphError extends Error {
  constructor(
    public code:
      | 'PLAN_ITEM_MISSING'
      | 'PLAN_ITEM_AMBIGUOUS'
      | 'PLAN_ITEM_MISMATCH',
    message: string
  ) {
    super(message);
  }
}

const normalize = (value: string) => value.trim().toUpperCase();

function poItemId(node: ProductionLaunchPreviewNode) {
  const match = /^root:(\d+)$/.exec(
    node.productionPlanAssemblyPath.split('/')[0]
  );
  if (!match)
    throw new ProductionDemandGraphError(
      'PLAN_ITEM_MISMATCH',
      `${node.partNumber} has an invalid Production Plan assembly path.`
    );
  return Number(match[1]);
}

export function compileProductionDemandGraph(
  nodes: ProductionLaunchPreviewNode[],
  planItems: FrozenProductionPlanItem[]
) {
  const planByPath = new Map<string, FrozenProductionPlanItem[]>();
  for (const item of planItems) {
    const matches = planByPath.get(item.assemblyPath) ?? [];
    matches.push(item);
    planByPath.set(item.assemblyPath, matches);
  }
  const demands: ProductionDemandSpec[] = [];
  const dependencies: ProductionDemandDependencySpec[] = [];

  function visit(node: ProductionLaunchPreviewNode, parentKey: string | null) {
    const matches = planByPath.get(node.productionPlanAssemblyPath) ?? [];
    if (matches.length === 0)
      throw new ProductionDemandGraphError(
        'PLAN_ITEM_MISSING',
        `${node.partNumber} at ${node.productionPlanAssemblyPath} is absent from the released Production Plan.`
      );
    if (matches.length > 1)
      throw new ProductionDemandGraphError(
        'PLAN_ITEM_AMBIGUOUS',
        `${node.productionPlanAssemblyPath} resolves to multiple released Production Plan items.`
      );
    const planItem = matches[0];
    if (normalize(planItem.partNumber) !== normalize(node.partNumber))
      throw new ProductionDemandGraphError(
        'PLAN_ITEM_MISMATCH',
        `${node.partNumber} does not match released Production Plan item ${planItem.partNumber}.`
      );
    const key = `${poItemId(node)}:${node.productionPlanAssemblyPath}`;
    const disposition: ProductionDemandSpec['disposition'] =
      node.shortageQuantity === 0 ? 'STOCK_SATISFIED' : node.makeBuy;
    const demandStatus: ProductionDemandSpec['demandStatus'] = node.blockers
      .length
      ? 'BLOCKED'
      : disposition === 'STOCK_SATISFIED'
        ? 'STOCK_SATISFIED'
        : 'PLANNED';
    demands.push({
      key,
      parentKey,
      projectId: planItem.projectId,
      productionPlanId: planItem.productionPlanId,
      productionPlanItemId: planItem.id,
      poItemId: poItemId(node),
      demandLineIdentity: node.demandLineIdentity,
      demandKey: key,
      assemblyPath: node.productionPlanAssemblyPath,
      pathDepth: node.productionPlanAssemblyPath.split('/').length - 1,
      inventoryItemId: node.inventoryItemId,
      partNumber: node.partNumber,
      partRevision: node.revision,
      description: node.description,
      classification: node.classification,
      disposition,
      quantityPerParent: node.quantityPerParent,
      grossRequiredQuantity: node.extendedProjectQuantity,
      availableQuantitySnapshot: node.availableQuantity,
      allocatedQuantitySnapshot: node.allocatedQuantity,
      shortageQuantity: node.shortageQuantity,
      originalCustomerQuantity: node.originalCustomerQuantity,
      effectiveCustomerQuantity: node.effectiveCustomerQuantity,
      customerDemandEventDigest: node.customerDemandEventDigest,
      customerDemandSnapshot: node.customerDemandSnapshot,
      unitOfMeasure: node.unitOfMeasure,
      requiredByDate: node.requiredByDate,
      bomId: node.bomId,
      bomRevisionId: node.bomRevisionId,
      bomRevisionSnapshot: node.bomRevision,
      routingId: node.routingId,
      routingRevisionSnapshot: node.routingRevision,
      firstDepartmentSnapshot: node.firstDepartment,
      demandStatus,
      blockerSnapshot: node.blockers,
    });
    if (parentKey && disposition !== 'STOCK_SATISFIED') {
      const dependencyTypes: ProductionDemandDependencySpec['dependencyType'][] =
        disposition === 'MAKE' || disposition === 'OUTSIDE_PROCESS'
          ? ['COMPLETE', 'ACCEPT', 'ISSUE_OR_SCAN']
          : ['ACCEPT', 'ISSUE_OR_SCAN'];
      for (const dependencyType of dependencyTypes)
        dependencies.push({
          predecessorKey: key,
          successorKey: parentKey,
          dependencyType,
        });
    }
    for (const child of node.children) visit(child, key);
  }

  for (const node of nodes) visit(node, null);
  return { demands, dependencies };
}
