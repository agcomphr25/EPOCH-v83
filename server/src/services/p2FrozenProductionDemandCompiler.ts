import { createHash } from 'crypto';

export type FrozenDemandBlocker = {
  code: string;
  path: string;
  message: string;
  correctiveAction: string;
};
export type FrozenDemandSourceNode = {
  inventoryItemId: number | null;
  partNumber: string;
  itemName: string;
  classification: string;
  makeBuy: 'MAKE' | 'BUY' | string;
  unit: string;
  quantityPerParent: string | number;
  scrapPercent?: string | number;
  assemblyPath: string;
  bom?: Record<string, unknown> | null;
  bomLine?: Record<string, unknown> | null;
  routing?: Record<string, unknown> | null;
  traceability?: Record<string, unknown> | null;
  wadDecision?: Record<string, unknown> | null;
  inspection?: Record<string, unknown> | null;
  exceptionEvidence?: Record<string, unknown> | null;
  effectivity?: Record<string, unknown> | null;
  customerConfiguration?: Record<string, unknown> | null;
  children?: FrozenDemandSourceNode[];
};
export type FrozenDemandNode = Omit<
  FrozenDemandSourceNode,
  'children' | 'quantityPerParent' | 'scrapPercent'
> & {
  nodeIdentity: string;
  parentNodeIdentity: string | null;
  depth: number;
  quantityPerParent: string;
  scrapPercent: string;
  requiredGrossQuantity: string;
  nodeChecksum: string;
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const HUNDRED = BigInt(100);
const SCALE = BigInt(1_000_000);
const SUPPORTED = new Set([
  'RAW_MATERIAL',
  'PURCHASED_COMPONENT',
  'MANUFACTURED_COMPONENT',
  'SUBASSEMBLY',
  'ASSEMBLY',
  'CUSTOMER_SUPPLIED',
  'CONSUMABLE',
  'TOOLING',
  'NON_INVENTORY_SERVICE',
]);
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const frozenDemandChecksum = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');
function decimal(value: string | number): bigint {
  const raw = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) throw new Error('INVALID_DECIMAL');
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}
function format(value: bigint): string {
  return `${value / SCALE}.${String(value % SCALE).padStart(6, '0')}`;
}
function multiply(a: bigint, b: bigint): bigint {
  return (a * b + SCALE - ONE) / SCALE;
}

export function compileFrozenProductionDemand(
  root: FrozenDemandSourceNode,
  projectQuantity: string | number
) {
  const blockers: FrozenDemandBlocker[] = [];
  const nodes: FrozenDemandNode[] = [];
  let rootQuantity: bigint;
  try {
    rootQuantity = decimal(projectQuantity);
    if (rootQuantity <= ZERO) throw new Error();
  } catch {
    return {
      nodes,
      blockers: [
        {
          code: 'INVALID_PROJECT_QUANTITY',
          path: root.assemblyPath,
          message: 'Project quantity must be a positive controlled quantity.',
          correctiveAction:
            'Correct the released PO-line quantity before previewing demand.',
        },
      ],
      checksum: null,
    };
  }
  const visit = (
    source: FrozenDemandSourceNode,
    parent: string | null,
    parentQty: bigint,
    ancestors: Set<number>,
    depth: number
  ) => {
    const path = String(source.assemblyPath || '').trim();
    const block = (code: string, message: string, correctiveAction: string) =>
      blockers.push({ code, path, message, correctiveAction });
    if (!source.inventoryItemId) {
      block(
        'INVENTORY_ITEM_MISSING',
        'An assembly node has no Inventory Item identity.',
        'Link the controlled BOM line to an Inventory Item.'
      );
      return;
    }
    if (ancestors.has(source.inventoryItemId)) {
      block(
        'CIRCULAR_BOM',
        'The controlled BOM contains a circular Inventory Item path.',
        'Release a corrected BOM revision with the cycle removed.'
      );
      return;
    }
    if (!path)
      block(
        'ASSEMBLY_PATH_MISSING',
        'A stable assembly path identity is missing.',
        'Assign a stable assembly-path identity on the controlled BOM line.'
      );
    if (!SUPPORTED.has(source.classification))
      block(
        'UNSUPPORTED_CLASSIFICATION',
        `Classification ${source.classification || '(missing)'} is not supported.`,
        'Release a supported Inventory Item classification.'
      );
    if (!String(source.unit || '').trim())
      block(
        'UNIT_MISSING',
        'The controlled unit of measure is missing.',
        'Release the item/BOM line with an explicit unit.'
      );
    if (!['MAKE', 'BUY'].includes(source.makeBuy))
      block(
        'MAKE_BUY_INVALID',
        'Make/Buy authority is missing or invalid.',
        'Correct the released BOM Make/Buy disposition.'
      );
    let per = ZERO,
      scrap = ZERO,
      required = ZERO;
    try {
      per = decimal(source.quantityPerParent);
      scrap = decimal(source.scrapPercent ?? 0);
      if (per <= ZERO || scrap < ZERO || scrap >= HUNDRED * SCALE)
        throw new Error();
      required = multiply(parentQty, per);
      required =
        (required * HUNDRED * SCALE + (HUNDRED * SCALE - scrap) - ONE) /
        (HUNDRED * SCALE - scrap);
    } catch {
      block(
        'QUANTITY_INVALID',
        'Quantity-per-parent or scrap allowance is invalid.',
        'Correct and release positive quantities and a scrap percent below 100.'
      );
      return;
    }
    if (source.makeBuy === 'MAKE') {
      if (!source.bom)
        block(
          'RELEASED_BOM_MISSING',
          'A manufactured item has no released controlled BOM revision.',
          'Release and select the controlled BOM revision.'
        );
      const departments = (
        source.routing as { departmentSequence?: unknown[] } | null
      )?.departmentSequence;
      if (!source.routing)
        block(
          'RELEASED_ROUTING_MISSING',
          'A manufactured item has no released routing snapshot.',
          'Release an item-linked routing revision.'
        );
      else if (
        !Array.isArray(departments) ||
        departments.length === 0 ||
        departments.some((entry) => !entry)
      )
        block(
          'ROUTING_DEPARTMENT_MISSING',
          'A released routing operation lacks an authoritative Department.',
          'Assign Departments to every routing operation and release a new routing revision.'
        );
      if (!source.wadDecision)
        block(
          'WAD_DECISION_MISSING',
          'The manufactured path has no validated WAD traveler decision.',
          'Complete and validate the WAD decision for this exact Inventory Item and assembly path.'
        );
      else if (source.wadDecision.status !== 'VALIDATED')
        block(
          'WAD_DECISION_NOT_VALIDATED',
          'The WAD traveler decision is not validated.',
          'Validate or independently approve its exception.'
        );
      else if (
        source.wadDecision.required_quantity !== undefined &&
        Number(source.wadDecision.required_quantity) !==
          Number(format(required))
      )
        block(
          'WAD_QUANTITY_CONFLICT',
          'The validated WAD decision quantity does not match compiled gross demand.',
          'Revise the WAD decision for this exact assembly path and released quantity.'
        );
      else if (
        source.wadDecision.traveler_type === 'BATCH' &&
        (Number(source.wadDecision.batch_approved_quantity) <
          Number(format(required)) ||
          !String(source.wadDecision.batch_coverage_scope ?? '').trim())
      )
        block(
          'WAD_BATCH_COVERAGE_INSUFFICIENT',
          'Approved batch coverage does not cover compiled gross demand.',
          'Approve a batch quantity and scope that cover the complete released demand.'
        );
    }
    if (!source.traceability)
      block(
        'TRACEABILITY_POLICY_MISSING',
        'No released traceability-policy revision applies.',
        'Release one traceability policy for the Inventory Item.'
      );
    else if (
      source.wadDecision &&
      source.wadDecision.traceability_policy_id !== undefined &&
      String(source.wadDecision.traceability_policy_id) !==
        String(source.traceability.id)
    )
      block(
        'TRACEABILITY_POLICY_CONFLICT',
        'The WAD decision does not match the released traceability policy.',
        'Revise the WAD decision against the released policy.'
      );
    const identity = frozenDemandChecksum({
      path,
      itemId: source.inventoryItemId,
    });
    const content = {
      ...source,
      children: undefined,
      nodeIdentity: identity,
      parentNodeIdentity: parent,
      depth,
      quantityPerParent: format(per),
      scrapPercent: format(scrap),
      requiredGrossQuantity: format(required),
    };
    nodes.push({
      ...content,
      nodeChecksum: frozenDemandChecksum(content),
    } as FrozenDemandNode);
    const next = new Set(ancestors);
    next.add(source.inventoryItemId);
    for (const child of source.children ?? [])
      visit(child, identity, required, next, depth + 1);
  };
  visit(root, null, rootQuantity, new Set(), 0);
  const identities = new Set<string>();
  for (const node of nodes) {
    if (identities.has(node.assemblyPath))
      blockers.push({
        code: 'DUPLICATE_ASSEMBLY_PATH',
        path: node.assemblyPath,
        message: 'Assembly path identities must be unique.',
        correctiveAction: 'Correct the released BOM path identities.',
      });
    identities.add(node.assemblyPath);
  }
  const checksum = blockers.length
    ? null
    : frozenDemandChecksum(
        nodes.map(({ nodeChecksum: _nodeChecksum, ...node }) => node)
      );
  return { nodes, blockers, checksum };
}
