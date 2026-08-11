export type PreviewBlockerCode =
  | 'INVENTORY_ITEM_MISSING'
  | 'INVENTORY_ITEM_AMBIGUOUS'
  | 'CLASSIFICATION_REQUIRED'
  | 'CLASSIFICATION_CONFLICT'
  | 'PART_DESCRIPTION_MISSING'
  | 'PART_REVISION_REQUIRED'
  | 'BOM_MISSING'
  | 'BOM_EMPTY'
  | 'BOM_INACTIVE'
  | 'BOM_NOT_RELEASED'
  | 'BOM_NOT_EFFECTIVE'
  | 'BOM_AMBIGUOUS'
  | 'BOM_CYCLE'
  | 'BOM_DEPTH_EXCEEDED'
  | 'BOM_DUPLICATE_RELATIONSHIP'
  | 'CHILD_QUANTITY_INVALID'
  | 'ROUTING_MISSING'
  | 'ROUTING_AMBIGUOUS'
  | 'ROUTING_INACTIVE'
  | 'ROUTING_NOT_RELEASED'
  | 'ROUTING_EMPTY'
  | 'ROUTING_EFFECTIVITY_UNRESOLVED'
  | 'PURCHASING_PATH_MISSING';

export type PreviewBlocker = {
  code: PreviewBlockerCode;
  partNumber: string;
  path: string[];
  message: string;
  correctionTarget: 'inventory' | 'bom' | 'routing' | 'purchasing';
};

export type PreviewInventoryItem = {
  id: number;
  partNumber: string;
  description: string | null;
  itemType: string | null;
  planningClassification:
    | 'MANUFACTURED'
    | 'PURCHASED'
    | 'RAW_MATERIAL'
    | 'CUSTOMER_SUPPLIED'
    | null;
  classificationRevision: number | null;
  classificationSourceRevision: string | null;
  partConfigurationRevision: string | null;
  classificationCandidateCount: number;
  manufacturedCategory: string | null;
  manufacturingLevel: string | null;
  unitOfMeasure: string | null;
  availableQuantity: number;
  allocatedQuantity: number;
  vendorId: number | null;
  orderUrl: string | null;
};

export type PreviewBomCandidate = {
  bomId: string;
  revisionId: string;
  revision: string;
  isActive: boolean;
  isReleased: boolean;
  isEffective: boolean;
};

export type PreviewBomLine = {
  id: string;
  childPartNumber: string;
  quantityPerParent: number;
};

export type PreviewRoutingCandidate = {
  id: string;
  revision: string;
  isActive: boolean;
  releaseStatus: string | null;
  departmentSequence: string[];
  precedence: 1 | 3;
};

export type PreviewRoot = {
  poItemId: number;
  partNumber: string;
  quantity: number;
  inventoryItemId: number | null;
  requiredByDate: string | null;
  demandLineIdentity: string;
  originalCustomerQuantity: number;
  effectiveCustomerQuantity: number;
  customerDemandEventDigest: string;
  customerDemandSnapshot: unknown;
};

export interface ProductionLaunchPreviewSource {
  prepare?(roots: PreviewRoot[], effectiveAt: Date): Promise<void>;
  findInventory(
    partNumber: string,
    inventoryItemId: number | null,
    effectiveAt: Date
  ): Promise<PreviewInventoryItem[]>;
  findBoms(
    partNumber: string,
    effectiveAt: Date
  ): Promise<PreviewBomCandidate[]>;
  getBomLines(revisionId: string): Promise<PreviewBomLine[]>;
  findRoutings(
    partNumber: string,
    path: string[]
  ): Promise<PreviewRoutingCandidate[]>;
}

export type ProductionLaunchPreviewNode = {
  path: string[];
  productionPlanAssemblyPath: string;
  bomLineId: string | null;
  demandLineIdentity: string;
  originalCustomerQuantity: number;
  effectiveCustomerQuantity: number;
  customerDemandEventDigest: string;
  customerDemandSnapshot: unknown;
  parentPartNumber: string | null;
  inventoryItemId: number | null;
  partNumber: string;
  revision: string | null;
  description: string | null;
  classification: string;
  makeBuy: 'MAKE' | 'BUY' | 'RAW_MATERIAL' | 'CUSTOMER_SUPPLIED' | 'UNRESOLVED';
  quantityPerParent: number;
  extendedProjectQuantity: number;
  unitOfMeasure: string | null;
  bomId: string | null;
  bomRevisionId: string | null;
  bomRevision: string | null;
  routingId: string | null;
  routingRevision: string | null;
  firstDepartment: string | null;
  availableQuantity: number;
  allocatedQuantity: number;
  shortageQuantity: number;
  requiredByDate: string | null;
  demandStatus:
    | 'BLOCKED'
    | 'STOCK_SATISFIED'
    | 'MAKE_REQUIRED'
    | 'BUY_REQUIRED'
    | 'RAW_MATERIAL_REQUIRED'
    | 'CUSTOMER_SUPPLIED_REQUIRED';
  blockers: PreviewBlocker[];
  children: ProductionLaunchPreviewNode[];
};

const normalized = (value: string) => value.trim().toUpperCase();
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

function blocker(
  code: PreviewBlockerCode,
  partNumber: string,
  path: string[],
  message: string,
  correctionTarget: PreviewBlocker['correctionTarget']
): PreviewBlocker {
  return { code, partNumber, path, message, correctionTarget };
}

function classification(
  item: PreviewInventoryItem | null,
  _makeBuy: ProductionLaunchPreviewNode['makeBuy']
) {
  if (!item) return 'BLOCKED_UNRESOLVED';
  return item.planningClassification ?? 'BLOCKED_UNRESOLVED';
}

export async function resolveProductionLaunchPreview(
  roots: PreviewRoot[],
  source: ProductionLaunchPreviewSource,
  effectiveAt = new Date()
) {
  await source.prepare?.(roots, effectiveAt);
  const allBlockers: PreviewBlocker[] = [];

  async function visit(input: {
    partNumber: string;
    inventoryItemId: number | null;
    parentPartNumber: string | null;
    quantityPerParent: number;
    extendedQuantity: number;
    requiredByDate: string | null;
    path: string[];
    ancestry: string[];
    productionPlanAssemblyPath: string;
    bomLineId: string | null;
    demandLineIdentity: string;
    originalCustomerQuantity: number;
    effectiveCustomerQuantity: number;
    customerDemandEventDigest: string;
    customerDemandSnapshot: unknown;
  }): Promise<ProductionLaunchPreviewNode> {
    const partNumber = input.partNumber.trim();
    const path = [...input.path, partNumber];
    const nodeBlockers: PreviewBlocker[] = [];
    const add = (entry: PreviewBlocker) => {
      nodeBlockers.push(entry);
      allBlockers.push(entry);
    };

    if (
      !finitePositive(input.quantityPerParent) ||
      !finitePositive(input.extendedQuantity)
    )
      add(
        blocker(
          'CHILD_QUANTITY_INVALID',
          partNumber,
          path,
          `${partNumber} has a non-positive or invalid extended quantity.`,
          'bom'
        )
      );

    if (input.ancestry.includes(normalized(partNumber)))
      add(
        blocker(
          'BOM_CYCLE',
          partNumber,
          path,
          `BOM cycle detected at ${path.join(' > ')}.`,
          'bom'
        )
      );
    if (input.ancestry.length >= 50)
      add(
        blocker(
          'BOM_DEPTH_EXCEEDED',
          partNumber,
          path,
          `${partNumber} exceeds the controlled maximum BOM depth of 50.`,
          'bom'
        )
      );

    const inventoryMatches = await source.findInventory(
      partNumber,
      input.inventoryItemId,
      effectiveAt
    );
    if (inventoryMatches.length === 0)
      add(
        blocker(
          'INVENTORY_ITEM_MISSING',
          partNumber,
          path,
          `${partNumber} does not resolve to an inventory item.`,
          'inventory'
        )
      );
    if (inventoryMatches.length > 1)
      add(
        blocker(
          'INVENTORY_ITEM_AMBIGUOUS',
          partNumber,
          path,
          `${partNumber} resolves to multiple inventory items.`,
          'inventory'
        )
      );
    const item = inventoryMatches.length === 1 ? inventoryMatches[0] : null;
    if (item && !item.description?.trim())
      add(
        blocker(
          'PART_DESCRIPTION_MISSING',
          partNumber,
          path,
          `${partNumber} has no controlled description.`,
          'inventory'
        )
      );
    if (item && !item.partConfigurationRevision?.trim())
      add(
        blocker(
          'PART_REVISION_REQUIRED',
          partNumber,
          path,
          `${partNumber} has no controlled part or configuration revision.`,
          'inventory'
        )
      );
    const controlledClassification = item?.planningClassification ?? null;
    const makeBuy: ProductionLaunchPreviewNode['makeBuy'] =
      controlledClassification === 'MANUFACTURED'
        ? 'MAKE'
        : controlledClassification === 'PURCHASED'
          ? 'BUY'
          : controlledClassification === 'RAW_MATERIAL'
            ? 'RAW_MATERIAL'
            : controlledClassification === 'CUSTOMER_SUPPLIED'
              ? 'CUSTOMER_SUPPLIED'
              : 'UNRESOLVED';
    if (item && item.classificationCandidateCount > 1)
      add(
        blocker(
          'CLASSIFICATION_CONFLICT',
          partNumber,
          path,
          `${partNumber} has overlapping released planning classifications.`,
          'inventory'
        )
      );
    else if (item && makeBuy === 'UNRESOLVED')
      add(
        blocker(
          'CLASSIFICATION_REQUIRED',
          partNumber,
          path,
          `${partNumber} has no released authoritative planning classification.`,
          'inventory'
        )
      );

    const available = Math.max(0, Number(item?.availableQuantity ?? 0));
    const allocated = Math.max(0, Number(item?.allocatedQuantity ?? 0));
    const shortage = Math.max(0, input.extendedQuantity - available);
    let bom: PreviewBomCandidate | null = null;
    let routing: PreviewRoutingCandidate | null = null;
    const children: ProductionLaunchPreviewNode[] = [];

    if (
      (makeBuy === 'BUY' || makeBuy === 'RAW_MATERIAL') &&
      shortage > 0 &&
      !item?.vendorId &&
      !item?.orderUrl
    )
      add(
        blocker(
          'PURCHASING_PATH_MISSING',
          partNumber,
          path,
          `${partNumber} has a shortage but no approved purchasing path.`,
          'purchasing'
        )
      );

    if (
      makeBuy === 'MAKE' &&
      !nodeBlockers.some((entry) =>
        ['BOM_CYCLE', 'BOM_DEPTH_EXCEEDED'].includes(entry.code)
      )
    ) {
      const candidates = await source.findBoms(partNumber, effectiveAt);
      const active = candidates.filter((candidate) => candidate.isActive);
      const releasedBoms = active.filter((candidate) => candidate.isReleased);
      const effective = releasedBoms.filter(
        (candidate) => candidate.isEffective
      );
      if (candidates.length === 0)
        add(
          blocker(
            'BOM_MISSING',
            partNumber,
            path,
            `${partNumber} has no unique effective released BOM.`,
            'bom'
          )
        );
      else if (active.length === 0)
        add(
          blocker(
            'BOM_INACTIVE',
            partNumber,
            path,
            `${partNumber} BOM is inactive.`,
            'bom'
          )
        );
      else if (releasedBoms.length === 0)
        add(
          blocker(
            'BOM_NOT_RELEASED',
            partNumber,
            path,
            `${partNumber} has no released BOM revision.`,
            'bom'
          )
        );
      else if (effective.length === 0)
        add(
          blocker(
            'BOM_NOT_EFFECTIVE',
            partNumber,
            path,
            `${partNumber} has no released BOM revision effective for the preview date.`,
            'bom'
          )
        );
      else if (effective.length > 1)
        add(
          blocker(
            'BOM_AMBIGUOUS',
            partNumber,
            path,
            `${partNumber} has multiple effective released BOM revisions.`,
            'bom'
          )
        );
      else bom = effective[0];

      const routings = await source.findRoutings(partNumber, path);
      const preferred = routings.filter(
        (candidate) =>
          candidate.precedence ===
          Math.min(...routings.map((entry) => entry.precedence))
      );
      const released = preferred.filter(
        (candidate) =>
          candidate.isActive && candidate.releaseStatus === 'APPROVED'
      );
      if (routings.length === 0)
        add(
          blocker(
            'ROUTING_MISSING',
            partNumber,
            path,
            `${partNumber} has no routing candidate.`,
            'routing'
          )
        );
      else if (!preferred.some((candidate) => candidate.isActive))
        add(
          blocker(
            'ROUTING_INACTIVE',
            partNumber,
            path,
            `${partNumber} routing is inactive.`,
            'routing'
          )
        );
      else if (released.length === 0)
        add(
          blocker(
            'ROUTING_NOT_RELEASED',
            partNumber,
            path,
            `${partNumber} routing is not released.`,
            'routing'
          )
        );
      else if (released.length > 1)
        add(
          blocker(
            'ROUTING_AMBIGUOUS',
            partNumber,
            path,
            `${partNumber} has multiple released routings at the same precedence.`,
            'routing'
          )
        );
      else if (released[0].departmentSequence.length === 0)
        add(
          blocker(
            'ROUTING_EMPTY',
            partNumber,
            path,
            `${partNumber} released routing has no executable department.`,
            'routing'
          )
        );
      else if (released[0].precedence === 3)
        add(
          blocker(
            'ROUTING_EFFECTIVITY_UNRESOLVED',
            partNumber,
            path,
            `${partNumber} has a released routing, but the current schema cannot prove part revision and effectivity for fallback routing precedence.`,
            'routing'
          )
        );
      else routing = released[0];

      if (bom && finitePositive(input.extendedQuantity)) {
        const lines = await source.getBomLines(bom.revisionId);
        if (lines.length === 0)
          add(
            blocker(
              'BOM_EMPTY',
              partNumber,
              path,
              `${partNumber} released BOM has no active component lines.`,
              'bom'
            )
          );
        const relationshipKeys = new Set<string>();
        for (const line of lines) {
          const relationshipKey = normalized(line.childPartNumber);
          if (relationshipKeys.has(relationshipKey))
            add(
              blocker(
                'BOM_DUPLICATE_RELATIONSHIP',
                line.childPartNumber,
                [...path, line.childPartNumber],
                `${partNumber} contains duplicate BOM relationships for ${line.childPartNumber}.`,
                'bom'
              )
            );
          relationshipKeys.add(relationshipKey);
          const extended =
            input.extendedQuantity * Number(line.quantityPerParent);
          children.push(
            await visit({
              partNumber: line.childPartNumber,
              inventoryItemId: null,
              parentPartNumber: partNumber,
              quantityPerParent: Number(line.quantityPerParent),
              extendedQuantity: extended,
              requiredByDate: input.requiredByDate,
              path,
              ancestry: [...input.ancestry, normalized(partNumber)],
              productionPlanAssemblyPath: `${input.productionPlanAssemblyPath}/line:${line.id}`,
              bomLineId: line.id,
              demandLineIdentity: input.demandLineIdentity,
              originalCustomerQuantity: input.originalCustomerQuantity,
              effectiveCustomerQuantity: input.effectiveCustomerQuantity,
              customerDemandEventDigest: input.customerDemandEventDigest,
              customerDemandSnapshot: input.customerDemandSnapshot,
            })
          );
        }
      }
    }

    const demandStatus: ProductionLaunchPreviewNode['demandStatus'] =
      nodeBlockers.length
        ? 'BLOCKED'
        : shortage === 0
          ? 'STOCK_SATISFIED'
          : makeBuy === 'MAKE'
            ? 'MAKE_REQUIRED'
            : makeBuy === 'RAW_MATERIAL'
              ? 'RAW_MATERIAL_REQUIRED'
              : makeBuy === 'CUSTOMER_SUPPLIED'
                ? 'CUSTOMER_SUPPLIED_REQUIRED'
                : 'BUY_REQUIRED';

    return {
      path,
      productionPlanAssemblyPath: input.productionPlanAssemblyPath,
      bomLineId: input.bomLineId,
      demandLineIdentity: input.demandLineIdentity,
      originalCustomerQuantity: input.originalCustomerQuantity,
      effectiveCustomerQuantity: input.effectiveCustomerQuantity,
      customerDemandEventDigest: input.customerDemandEventDigest,
      customerDemandSnapshot: input.customerDemandSnapshot,
      parentPartNumber: input.parentPartNumber,
      inventoryItemId: item?.id ?? null,
      partNumber,
      revision: item?.partConfigurationRevision ?? null,
      description: item?.description ?? null,
      classification: classification(item, makeBuy),
      makeBuy,
      quantityPerParent: input.quantityPerParent,
      extendedProjectQuantity: input.extendedQuantity,
      unitOfMeasure: item?.unitOfMeasure ?? null,
      bomId: bom?.bomId ?? null,
      bomRevisionId: bom?.revisionId ?? null,
      bomRevision: bom?.revision ?? null,
      routingId: routing?.id ?? null,
      routingRevision: routing?.revision ?? null,
      firstDepartment: routing?.departmentSequence[0] ?? null,
      availableQuantity: available,
      allocatedQuantity: allocated,
      shortageQuantity: shortage,
      requiredByDate: input.requiredByDate,
      demandStatus,
      blockers: nodeBlockers,
      children,
    };
  }

  const nodes = await Promise.all(
    roots.map((root) =>
      visit({
        partNumber: root.partNumber,
        inventoryItemId: root.inventoryItemId,
        parentPartNumber: null,
        quantityPerParent: root.quantity,
        extendedQuantity: root.quantity,
        requiredByDate: root.requiredByDate,
        path: [`po-item:${root.poItemId}`],
        ancestry: [],
        productionPlanAssemblyPath: `root:${root.poItemId}`,
        bomLineId: null,
        demandLineIdentity: root.demandLineIdentity,
        originalCustomerQuantity: root.originalCustomerQuantity,
        effectiveCustomerQuantity: root.effectiveCustomerQuantity,
        customerDemandEventDigest: root.customerDemandEventDigest,
        customerDemandSnapshot: root.customerDemandSnapshot,
      })
    )
  );

  return { ready: allBlockers.length === 0, blockers: allBlockers, nodes };
}
