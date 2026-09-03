export type ProgramQueueLink = {
  id: string;
  linkType: string;
  manufacturingQueueId: number | null;
  productionWorkOrderId: string | null;
  travelerId: string | null;
  p2SerializedItemId: string | null;
  p2WorkOrderAuthorityId?: string | null;
  departmentId?: number | null;
  projectId?: string | null;
  label: string;
  department: string | null;
  status: string | null;
  completedQuantity: number;
  requiredQuantity: number;
};

export type ProgramAssemblyRollupInput = {
  id: string;
  parentAssemblyId: string | null;
  assemblyCode: string;
  assemblyName: string;
  level: number;
  sequence: number;
  assemblyType: string;
  partNumber: string | null;
  status: string;
  requiredQuantity: number;
  targetShipDate: string | null;
  metadata: Record<string, unknown>;
  links: ProgramQueueLink[];
};

export type ProgramAssemblyDependencyInput = {
  assemblyId: string;
  dependsOnAssemblyId: string;
  dependencyType: string;
  isBlocking: boolean;
  notes: string | null;
};

export type ProgramAssemblyRollup = ProgramAssemblyRollupInput & {
  children: ProgramAssemblyRollup[];
  dependencyIds: string[];
  blockedBy: {
    assemblyId: string;
    assemblyCode: string;
    assemblyName: string;
    dependencyType: string;
    notes: string | null;
  }[];
  directCompletionPercent: number;
  completionPercent: number;
  computedStatus: 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETE';
  totalQueueItems: number;
  completedQueueItems: number;
};

export type ProgramBuildStatus = {
  build: {
    id: string;
    projectId: string | null;
    projectCode: string | null;
    projectName: string | null;
    p2PurchaseOrderId: number | null;
    poNumber: string | null;
    programCode: string;
    programName: string;
    buildName: string;
    buildType: string;
    status: string;
    priority: number;
    targetShipDate: string | null;
    customerName: string | null;
    notes: string | null;
  };
  summary: {
    totalAssemblies: number;
    completeAssemblies: number;
    blockedAssemblies: number;
    inProgressAssemblies: number;
    totalQueueItems: number;
    completedQueueItems: number;
    completionPercent: number;
    shipReady: boolean;
    criticalPath: ProgramAssemblyRollup[];
  };
  assemblies: ProgramAssemblyRollup[];
  flatAssemblies: ProgramAssemblyRollup[];
  blockers: ProgramAssemblyRollup[];
  swimlanes: {
    name: string;
    assemblies: ProgramAssemblyRollup[];
    completionPercent: number;
    blockedCount: number;
  }[];
};

export type P2ProductionMapNodeInput = {
  id: string;
  nodeIdentity: string;
  parentNodeIdentity: string | null;
  assemblyPathIdentity: string;
  depth: number | string;
  inventoryItemSnapshot: Record<string, unknown> | null;
  itemClassification: string;
  makeBuyDisposition: string;
  requiredGrossQuantity: number | string;
  unitOfMeasure: string;
  authorityId: string | null;
  productionWorkOrderId: string | null;
  workOrderNumber: string | null;
  authorityStatus: string | null;
  departmentId: number | string | null;
  departmentName: string | null;
  completedQuantity: number | string | null;
  authorityRequiredQuantity: number | string | null;
  travelerId: string | null;
  travelerNumber: string | null;
  materialRequirementId?: string | null;
  materialRequirementStatus?: string | null;
  materialRequiredQuantity?: number | string | null;
  materialAcceptedQuantity?: number | string | null;
  materialIssuedQuantity?: number | string | null;
};

export type P2ProductionMapDependencyInput = {
  predecessorNodeId: string;
  successorNodeId: string;
  dependencyType: string;
  requiredQuantity: number | string;
  satisfiedQuantity: number | string;
  status: string;
};

const COMPLETE_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'CLOSED', 'SHIPPED', 'DONE']);
const ACTIVE_STATUSES = new Set(['IN_PROGRESS', 'RELEASED', 'ACTIVE', 'READY', 'SCHEDULED']);

function normalizeStatus(status: unknown) {
  return String(status ?? '').trim().toUpperCase();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isCompleteStatus(status: unknown) {
  return COMPLETE_STATUSES.has(normalizeStatus(status));
}

function optionalString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function computeDirectCompletion(assembly: ProgramAssemblyRollupInput) {
  if (assembly.links.length === 0) {
    return isCompleteStatus(assembly.status) ? 100 : 0;
  }

  const required = assembly.links.reduce((sum, link) => sum + Math.max(1, link.requiredQuantity || 1), 0);
  const completed = assembly.links.reduce((sum, link) => {
    const requiredQuantity = Math.max(1, link.requiredQuantity || 1);
    if (isCompleteStatus(link.status)) return sum + requiredQuantity;
    return sum + Math.min(requiredQuantity, Math.max(0, link.completedQuantity || 0));
  }, 0);

  return required > 0 ? Math.round((completed / required) * 100) : 0;
}

export function computeProgramAssemblyRollups(
  assemblies: ProgramAssemblyRollupInput[],
  dependencies: ProgramAssemblyDependencyInput[],
): ProgramAssemblyRollup[] {
  const byId = new Map<string, ProgramAssemblyRollup>();
  const dependencyMap = new Map<string, ProgramAssemblyDependencyInput[]>();

  for (const dependency of dependencies) {
    const existing = dependencyMap.get(dependency.assemblyId) ?? [];
    existing.push(dependency);
    dependencyMap.set(dependency.assemblyId, existing);
  }

  for (const assembly of assemblies) {
    byId.set(assembly.id, {
      ...assembly,
      children: [],
      dependencyIds: (dependencyMap.get(assembly.id) ?? []).map((d) => d.dependsOnAssemblyId),
      blockedBy: [],
      directCompletionPercent: computeDirectCompletion(assembly),
      completionPercent: 0,
      computedStatus: 'PLANNED',
      totalQueueItems: assembly.links.length,
      completedQueueItems: assembly.links.filter((link) => isCompleteStatus(link.status)).length,
    });
  }

  const roots: ProgramAssemblyRollup[] = [];
  for (const assembly of byId.values()) {
    if (assembly.parentAssemblyId && byId.has(assembly.parentAssemblyId)) {
      byId.get(assembly.parentAssemblyId)!.children.push(assembly);
    } else {
      roots.push(assembly);
    }
  }

  const finalized = new Set<string>();
  const visiting = new Set<string>();

  const finalize = (assembly: ProgramAssemblyRollup): ProgramAssemblyRollup => {
    if (finalized.has(assembly.id)) return assembly;
    if (visiting.has(assembly.id)) return assembly;
    visiting.add(assembly.id);

    assembly.children.sort((a, b) => a.sequence - b.sequence || a.assemblyName.localeCompare(b.assemblyName));
    assembly.children.forEach(finalize);

    const childPercent = assembly.children.length > 0
      ? Math.round(assembly.children.reduce((sum, child) => sum + child.completionPercent, 0) / assembly.children.length)
      : null;
    assembly.completionPercent = childPercent == null
      ? assembly.directCompletionPercent
      : assembly.links.length > 0
        ? Math.round((childPercent + assembly.directCompletionPercent) / 2)
        : childPercent;

    const blockingDependencies = (dependencyMap.get(assembly.id) ?? [])
      .filter((dependency) => dependency.isBlocking)
      .map((dependency) => {
        const dependedOn = byId.get(dependency.dependsOnAssemblyId);
        if (dependedOn && !finalized.has(dependedOn.id)) finalize(dependedOn);
        if (!dependedOn || dependedOn.computedStatus === 'COMPLETE') return null;
        return {
          assemblyId: dependedOn.id,
          assemblyCode: dependedOn.assemblyCode,
          assemblyName: dependedOn.assemblyName,
          dependencyType: dependency.dependencyType,
          notes: dependency.notes,
        };
      })
      .filter((dependency): dependency is NonNullable<typeof dependency> => dependency != null);

    assembly.blockedBy = blockingDependencies;

    const normalized = normalizeStatus(assembly.status);
    if (blockingDependencies.length > 0 || normalized === 'BLOCKED') {
      assembly.computedStatus = 'BLOCKED';
    } else if (assembly.completionPercent >= 100 || isCompleteStatus(assembly.status)) {
      assembly.computedStatus = 'COMPLETE';
      assembly.completionPercent = 100;
    } else if (normalized === 'READY') {
      assembly.computedStatus = 'READY';
    } else if (assembly.completionPercent > 0 || ACTIVE_STATUSES.has(normalized)) {
      assembly.computedStatus = 'IN_PROGRESS';
    } else {
      assembly.computedStatus = 'PLANNED';
    }

    assembly.totalQueueItems += assembly.children.reduce((sum, child) => sum + child.totalQueueItems, 0);
    assembly.completedQueueItems += assembly.children.reduce((sum, child) => sum + child.completedQueueItems, 0);
    visiting.delete(assembly.id);
    finalized.add(assembly.id);
    return assembly;
  };

  return roots.sort((a, b) => a.sequence - b.sequence || a.assemblyName.localeCompare(b.assemblyName)).map(finalize);
}

function flattenAssemblies(assemblies: ProgramAssemblyRollup[]): ProgramAssemblyRollup[] {
  return assemblies.flatMap((assembly) => [assembly, ...flattenAssemblies(assembly.children)]);
}

function buildSwimlanes(flatAssemblies: ProgramAssemblyRollup[]) {
  const lanes = new Map<string, ProgramAssemblyRollup[]>();
  for (const assembly of flatAssemblies) {
    const lane = String(assembly.metadata?.swimlane || assembly.assemblyType || 'Program');
    lanes.set(lane, [...(lanes.get(lane) ?? []), assembly]);
  }

  return [...lanes.entries()].map(([name, laneAssemblies]) => ({
    name,
    assemblies: laneAssemblies,
    completionPercent: laneAssemblies.length > 0
      ? Math.round(laneAssemblies.reduce((sum, assembly) => sum + assembly.completionPercent, 0) / laneAssemblies.length)
      : 0,
    blockedCount: laneAssemblies.filter((assembly) => assembly.computedStatus === 'BLOCKED').length,
  }));
}

function buildProgramStatus(
  build: ProgramBuildStatus['build'],
  assemblyInputs: ProgramAssemblyRollupInput[],
  dependencies: ProgramAssemblyDependencyInput[]
): ProgramBuildStatus {
  const assemblies = computeProgramAssemblyRollups(
    assemblyInputs,
    dependencies
  );
  const flatAssemblies = flattenAssemblies(assemblies);
  const blockers = flatAssemblies.filter(
    (assembly) => assembly.computedStatus === 'BLOCKED'
  );
  const criticalPath = [...flatAssemblies]
    .filter((assembly) => assembly.computedStatus !== 'COMPLETE')
    .sort(
      (a, b) =>
        b.blockedBy.length - a.blockedBy.length ||
        a.completionPercent - b.completionPercent ||
        a.sequence - b.sequence
    )
    .slice(0, 6);

  const totalQueueItems = flatAssemblies.reduce(
    (sum, assembly) => sum + assembly.links.length,
    0
  );
  const completedQueueItems = flatAssemblies.reduce(
    (sum, assembly) =>
      sum +
      assembly.links.filter((link) => isCompleteStatus(link.status)).length,
    0
  );
  const completionPercent =
    flatAssemblies.length > 0
      ? Math.round(
          flatAssemblies.reduce(
            (sum, assembly) => sum + assembly.completionPercent,
            0
          ) / flatAssemblies.length
        )
      : 0;

  return {
    build,
    summary: {
      totalAssemblies: flatAssemblies.length,
      completeAssemblies: flatAssemblies.filter(
        (assembly) => assembly.computedStatus === 'COMPLETE'
      ).length,
      blockedAssemblies: blockers.length,
      inProgressAssemblies: flatAssemblies.filter(
        (assembly) => assembly.computedStatus === 'IN_PROGRESS'
      ).length,
      totalQueueItems,
      completedQueueItems,
      completionPercent,
      shipReady:
        flatAssemblies.length > 0 &&
        blockers.length === 0 &&
        flatAssemblies.every(
          (assembly) => assembly.computedStatus === 'COMPLETE'
        ),
      criticalPath,
    },
    assemblies,
    flatAssemblies,
    blockers,
    swimlanes: buildSwimlanes(flatAssemblies),
  };
}

export function buildP2ProductionMapProjection(
  build: ProgramBuildStatus['build'],
  baselineId: string,
  nodes: P2ProductionMapNodeInput[],
  dependencyRows: P2ProductionMapDependencyInput[]
): ProgramBuildStatus {
  const nodeIdByIdentity = new Map(
    nodes.map((node) => [node.nodeIdentity, node.id])
  );
  const assemblyInputs: ProgramAssemblyRollupInput[] = nodes.map(
    (node, sequence) => {
      const item = record(node.inventoryItemSnapshot);
      const partNumber = optionalString(item.partNumber);
      const assemblyName =
        optionalString(item.name) ?? partNumber ?? node.assemblyPathIdentity;
      const authorityStatus = optionalString(node.authorityStatus);
      const normalizedAuthorityStatus = normalizeStatus(authorityStatus);
      const assemblyStatus = ['BLOCKED', 'HOLD', 'CANCELLED'].includes(
        normalizedAuthorityStatus
      )
        ? 'BLOCKED'
        : (authorityStatus ?? 'PLANNED');
      const departmentId = optionalNumber(node.departmentId);
      const departmentName = optionalString(node.departmentName);
      const requiredQuantity = toNumber(
        node.authorityRequiredQuantity ?? node.requiredGrossQuantity,
        1
      );
      const materialRequiredQuantity = toNumber(
        node.materialRequiredQuantity ?? node.requiredGrossQuantity,
        requiredQuantity
      );
      const materialSatisfiedQuantity = Math.min(
        toNumber(node.materialAcceptedQuantity),
        toNumber(node.materialIssuedQuantity)
      );
      const materialStatus = normalizeStatus(node.materialRequirementStatus);
      const materialComplete =
        materialStatus === 'SATISFIED' ||
        materialSatisfiedQuantity >= materialRequiredQuantity;
      const materialBlocked = materialStatus === 'CANCELLED';
      const links: ProgramQueueLink[] = node.authorityId
        ? [
            {
              id: node.authorityId,
              linkType: 'p2_work_order_authority',
              manufacturingQueueId: null,
              productionWorkOrderId: node.productionWorkOrderId,
              travelerId: node.travelerId,
              p2SerializedItemId: null,
              p2WorkOrderAuthorityId: node.authorityId,
              departmentId,
              projectId: build.projectId,
              label:
                node.workOrderNumber ??
                node.travelerNumber ??
                `P2 work order - ${partNumber ?? assemblyName}`,
              department: departmentName,
              status: authorityStatus,
              completedQuantity: toNumber(node.completedQuantity),
              requiredQuantity,
            },
          ]
        : node.materialRequirementId
          ? [
              {
                id: node.materialRequirementId,
                linkType: 'material_requirement',
                manufacturingQueueId: null,
                productionWorkOrderId: null,
                travelerId: null,
                p2SerializedItemId: null,
                projectId: build.projectId,
                label: `Material - ${partNumber ?? assemblyName}`,
                department: 'Purchasing',
                status: materialComplete
                  ? 'COMPLETE'
                  : materialBlocked
                    ? 'BLOCKED'
                    : materialStatus || 'OPEN',
                completedQuantity: materialSatisfiedQuantity,
                requiredQuantity: materialRequiredQuantity,
              },
            ]
          : [];
      const projectedStatus = node.authorityId
        ? assemblyStatus
        : node.materialRequirementId
          ? materialComplete
            ? 'COMPLETE'
            : materialBlocked
              ? 'BLOCKED'
              : materialSatisfiedQuantity > 0
                ? 'IN_PROGRESS'
                : 'PLANNED'
          : assemblyStatus;

      return {
        id: node.id,
        parentAssemblyId: node.parentNodeIdentity
          ? (nodeIdByIdentity.get(node.parentNodeIdentity) ?? null)
          : null,
        assemblyCode: partNumber ?? node.assemblyPathIdentity,
        assemblyName,
        level: toNumber(node.depth),
        sequence,
        assemblyType:
          node.itemClassification || node.makeBuyDisposition || 'assembly',
        partNumber,
        status: projectedStatus,
        requiredQuantity: node.materialRequirementId
          ? materialRequiredQuantity
          : requiredQuantity,
        targetShipDate: build.targetShipDate,
        metadata: {
          source: 'p2_frozen_production_demand',
          baselineId,
          assemblyPathIdentity: node.assemblyPathIdentity,
          makeBuyDisposition: node.makeBuyDisposition,
          unitOfMeasure: node.unitOfMeasure,
          swimlane:
            departmentName ??
            (normalizeStatus(node.makeBuyDisposition) === 'BUY'
              ? 'Purchasing'
              : 'Awaiting Materialization'),
        },
        links,
      };
    }
  );
  const nodeIds = new Set(nodes.map((node) => node.id));
  const dependencies: ProgramAssemblyDependencyInput[] = dependencyRows
    .filter(
      (dependency) =>
        nodeIds.has(dependency.successorNodeId) &&
        nodeIds.has(dependency.predecessorNodeId)
    )
    .map((dependency) => ({
      assemblyId: dependency.successorNodeId,
      dependsOnAssemblyId: dependency.predecessorNodeId,
      dependencyType: dependency.dependencyType,
      isBlocking:
        normalizeStatus(dependency.status) === 'OPEN' &&
        toNumber(dependency.satisfiedQuantity) <
          toNumber(dependency.requiredQuantity),
      notes: `${toNumber(dependency.satisfiedQuantity)} of ${toNumber(dependency.requiredQuantity)} required units satisfied`,
    }));

  return buildProgramStatus(build, assemblyInputs, dependencies);
}

async function tableExists(tableName: string) {
  const { pool } = await import('../../db');
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS "exists"`,
    [tableName],
  );
  return Boolean(((result as any).rows ?? result)[0]?.exists);
}

export async function programManufacturingTablesReady() {
  const requiredTables = [
    'program_builds',
    'program_assemblies',
    'program_assembly_links',
    'program_assembly_dependencies',
  ];
  const states = await Promise.all(requiredTables.map(tableExists));
  return states.every(Boolean);
}

async function p2ProductionMapTablesReady() {
  const requiredTables = [
    'p2_frozen_production_demand_baselines',
    'p2_frozen_production_demand_nodes',
    'p2_manufacturing_work_order_authorities',
    'p2_manufacturing_work_order_dependencies',
    'p2_manufacturing_work_order_material_requirements',
  ];
  const states = await Promise.all(requiredTables.map(tableExists));
  return states.every(Boolean);
}

export async function getProgramBuilds(filters: { projectId?: string | null } = {}) {
  if (!(await programManufacturingTablesReady())) return [];
  const { pool } = await import('../../db');

  const params: unknown[] = [];
  const where: string[] = [];
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`pb.project_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT
       pb.id,
       pb.project_id AS "projectId",
       p.project_code AS "projectCode",
       p.project_name AS "projectName",
       pb.p2_purchase_order_id AS "p2PurchaseOrderId",
       po.po_number AS "poNumber",
       pb.program_code AS "programCode",
       pb.program_name AS "programName",
       pb.build_name AS "buildName",
       pb.build_type AS "buildType",
       pb.status,
       pb.priority,
       pb.target_ship_date AS "targetShipDate",
       COALESCE(pb.customer_name, po.customer_name) AS "customerName",
       pb.notes
     FROM program_builds pb
     LEFT JOIN projects p ON p.id = pb.project_id
     LEFT JOIN p2_purchase_orders po ON po.id = pb.p2_purchase_order_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY pb.priority ASC, pb.target_ship_date ASC NULLS LAST, pb.created_at DESC`,
    params,
  );

  return ((result as any).rows ?? result) as ProgramBuildStatus['build'][];
}

async function getP2ProductionMapStatus(
  projectId: string
): Promise<ProgramBuildStatus | null> {
  if (!(await p2ProductionMapTablesReady())) return null;
  const { pool } = await import('../../db');
  const baselineResult = await pool.query(
    `SELECT
       b.id AS "baselineId",
       b.revision_number AS "baselineRevision",
       p.id AS "projectId",
       p.project_code AS "projectCode",
       p.project_name AS "projectName",
       p.target_ship_date AS "targetShipDate",
       p.customer_name_snapshot AS "projectCustomerName",
       p.po_id AS "p2PurchaseOrderId",
       po.po_number AS "poNumber",
       po.customer_name AS "poCustomerName",
       po.expected_delivery AS "poExpectedDelivery"
     FROM p2_frozen_production_demand_baselines b
     JOIN projects p ON p.id = b.project_id
     LEFT JOIN p2_purchase_orders po ON po.id = p.po_id
     WHERE b.project_id = $1 AND b.status = 'RELEASED'
     ORDER BY b.revision_number DESC, b.released_at DESC
     LIMIT 1`,
    [projectId]
  );
  const baseline = (
    ((baselineResult as any).rows ?? baselineResult) as any[]
  )[0];
  if (!baseline) return null;

  const [nodeResult, dependencyResult] = await Promise.all([
    pool.query(
      `SELECT
         n.id,
         n.node_identity AS "nodeIdentity",
         n.parent_node_identity AS "parentNodeIdentity",
         n.assembly_path_identity AS "assemblyPathIdentity",
         n.depth,
         n.inventory_item_snapshot AS "inventoryItemSnapshot",
         n.item_classification AS "itemClassification",
         n.make_buy_disposition AS "makeBuyDisposition",
         n.required_gross_quantity AS "requiredGrossQuantity",
         n.unit_of_measure AS "unitOfMeasure",
         a.id AS "authorityId",
         a.production_work_order_id AS "productionWorkOrderId",
         a.status AS "authorityStatus",
         a.current_department_id AS "departmentId",
         a.current_department_name_snapshot AS "departmentName",
         a.completed_quantity AS "completedQuantity",
         a.required_quantity AS "authorityRequiredQuantity",
         a.traveler_id AS "travelerId",
         pwo.work_order_number AS "workOrderNumber",
         t.traveler_number AS "travelerNumber",
         material.id AS "materialRequirementId",
         material.status AS "materialRequirementStatus",
         material.required_quantity AS "materialRequiredQuantity",
         material.accepted_quantity AS "materialAcceptedQuantity",
         material.issued_quantity AS "materialIssuedQuantity"
       FROM p2_frozen_production_demand_nodes n
       LEFT JOIN p2_manufacturing_work_order_authorities a
         ON a.frozen_demand_node_id = n.id
        AND a.frozen_demand_baseline_id = n.baseline_id
        AND a.project_id = $2
       LEFT JOIN production_work_orders pwo ON pwo.id = a.production_work_order_id
       LEFT JOIN travelers t ON t.id = a.traveler_id
       LEFT JOIN LATERAL (
         SELECT requirement.id,requirement.status,requirement.required_quantity,
           requirement.accepted_quantity,requirement.issued_quantity
         FROM p2_manufacturing_work_order_material_requirements requirement
         WHERE requirement.frozen_demand_node_id = n.id
           AND requirement.project_id = $2
         ORDER BY requirement.created_at DESC,requirement.id
         LIMIT 1
       ) material ON true
       WHERE n.baseline_id = $1
       ORDER BY n.depth ASC, n.assembly_path_identity ASC`,
      [baseline.baselineId, projectId]
    ),
    pool.query(
      `SELECT
         predecessor.frozen_demand_node_id AS "predecessorNodeId",
         successor.frozen_demand_node_id AS "successorNodeId",
         dependency.dependency_type AS "dependencyType",
         dependency.required_quantity AS "requiredQuantity",
         dependency.satisfied_quantity AS "satisfiedQuantity",
         dependency.status
       FROM p2_manufacturing_work_order_dependencies dependency
       JOIN p2_manufacturing_work_order_authorities predecessor
         ON predecessor.id = dependency.predecessor_authority_id
        AND predecessor.frozen_demand_baseline_id = $1
       JOIN p2_manufacturing_work_order_authorities successor
         ON successor.id = dependency.successor_authority_id
        AND successor.frozen_demand_baseline_id = $1
       WHERE dependency.project_id = $2
       UNION ALL
       SELECT
         material.frozen_demand_node_id AS "predecessorNodeId",
         successor.frozen_demand_node_id AS "successorNodeId",
         'MATERIAL' AS "dependencyType",
         material.required_quantity AS "requiredQuantity",
         LEAST(material.accepted_quantity,material.issued_quantity) AS "satisfiedQuantity",
         material.status
       FROM p2_manufacturing_work_order_material_requirements material
       JOIN p2_manufacturing_work_order_authorities successor
         ON successor.id = material.successor_authority_id
        AND successor.frozen_demand_baseline_id = $1
       WHERE material.project_id = $2`,
      [baseline.baselineId, projectId]
    ),
  ]);

  const projectCode = optionalString(baseline.projectCode) ?? projectId;
  const projectName = optionalString(baseline.projectName) ?? projectCode;
  const poNumber = optionalString(baseline.poNumber);
  const build: ProgramBuildStatus['build'] = {
    id: `p2-frozen-demand:${baseline.baselineId}`,
    projectId,
    projectCode,
    projectName,
    p2PurchaseOrderId: optionalNumber(baseline.p2PurchaseOrderId),
    poNumber,
    programCode: projectCode,
    programName: projectName,
    buildName: poNumber ? `${projectName} - ${poNumber}` : projectName,
    buildType: 'p2_frozen_demand',
    status: 'RELEASED',
    priority: 50,
    targetShipDate: optionalString(
      baseline.targetShipDate ?? baseline.poExpectedDelivery
    ),
    customerName: optionalString(
      baseline.poCustomerName ?? baseline.projectCustomerName
    ),
    notes: `Read-through projection of released Frozen Production Demand revision ${toNumber(baseline.baselineRevision)}.`,
  };

  return buildP2ProductionMapProjection(
    build,
    String(baseline.baselineId),
    ((nodeResult as any).rows ?? nodeResult) as P2ProductionMapNodeInput[],
    ((dependencyResult as any).rows ??
      dependencyResult) as P2ProductionMapDependencyInput[]
  );
}

export async function getProgramBuildStatus(buildId?: string | null, filters: { projectId?: string | null } = {}): Promise<ProgramBuildStatus | null> {
  const builds = await getProgramBuilds(filters);
  const build = buildId ? builds.find((candidate) => candidate.id === buildId) : builds[0];
  if (!build) {
    return !buildId && filters.projectId
      ? getP2ProductionMapStatus(filters.projectId)
      : null;
  }
  const { pool } = await import('../../db');

  const [assemblyResult, dependencyResult] = await Promise.all([
    pool.query(
      `SELECT
         pa.id,
         pa.parent_assembly_id AS "parentAssemblyId",
         pa.assembly_code AS "assemblyCode",
         pa.assembly_name AS "assemblyName",
         pa.level,
         pa.sequence,
         pa.assembly_type AS "assemblyType",
         pa.part_number AS "partNumber",
         pa.required_quantity AS "requiredQuantity",
         pa.status,
         pa.target_ship_date AS "targetShipDate",
         pa.metadata,
         pal.id AS "linkId",
         pal.link_type AS "linkType",
         pal.manufacturing_queue_id AS "manufacturingQueueId",
         pal.production_work_order_id AS "productionWorkOrderId",
         pal.traveler_id AS "travelerId",
         pal.p2_serialized_item_id AS "p2SerializedItemId",
         pal.required_quantity AS "linkRequiredQuantity",
         mq.department AS "queueDepartment",
         mq.status AS "queueStatus",
         mq.quantity_completed AS "queueCompletedQuantity",
         mq.quantity_requested AS "queueRequiredQuantity",
         pwo.work_order_number AS "workOrderNumber",
         pwo.status AS "workOrderStatus",
         t.traveler_number AS "travelerNumber",
         t.status AS "travelerStatus",
         psi.serial_number AS "serialNumber",
         psi.barcode,
         psi.status AS "serializedItemStatus",
         psi.current_department AS "serializedItemDepartment"
       FROM program_assemblies pa
       LEFT JOIN program_assembly_links pal ON pal.assembly_id = pa.id
       LEFT JOIN manufacturing_queue mq ON mq.id = pal.manufacturing_queue_id
       LEFT JOIN production_work_orders pwo ON pwo.id = pal.production_work_order_id
       LEFT JOIN travelers t ON t.id = pal.traveler_id
       LEFT JOIN p2_serialized_items psi ON psi.id = pal.p2_serialized_item_id
       WHERE pa.program_build_id = $1
       ORDER BY pa.level ASC, pa.sequence ASC, pa.assembly_name ASC`,
      [build.id],
    ),
    pool.query(
      `SELECT
         assembly_id AS "assemblyId",
         depends_on_assembly_id AS "dependsOnAssemblyId",
         dependency_type AS "dependencyType",
         is_blocking AS "isBlocking",
         notes
       FROM program_assembly_dependencies
       WHERE assembly_id IN (SELECT id FROM program_assemblies WHERE program_build_id = $1)`,
      [build.id],
    ),
  ]);

  const rows = ((assemblyResult as any).rows ?? assemblyResult) as any[];
  const assembliesById = new Map<string, ProgramAssemblyRollupInput>();
  for (const row of rows) {
    if (!assembliesById.has(row.id)) {
      assembliesById.set(row.id, {
        id: row.id,
        parentAssemblyId: row.parentAssemblyId,
        assemblyCode: row.assemblyCode,
        assemblyName: row.assemblyName,
        level: toNumber(row.level),
        sequence: toNumber(row.sequence),
        assemblyType: row.assemblyType,
        partNumber: row.partNumber,
        status: row.status,
        requiredQuantity: toNumber(row.requiredQuantity, 1),
        targetShipDate: row.targetShipDate,
        metadata: row.metadata ?? {},
        links: [],
      });
    }

    if (row.linkId) {
      const linkStatus = row.travelerStatus ?? row.serializedItemStatus ?? row.workOrderStatus ?? row.queueStatus;
      const label = row.travelerNumber
        ?? row.workOrderNumber
        ?? row.barcode
        ?? (row.manufacturingQueueId ? `MQ-${row.manufacturingQueueId}` : row.linkType);
      assembliesById.get(row.id)!.links.push({
        id: row.linkId,
        linkType: row.linkType,
        manufacturingQueueId: row.manufacturingQueueId,
        productionWorkOrderId: row.productionWorkOrderId,
        travelerId: row.travelerId,
        p2SerializedItemId: row.p2SerializedItemId,
        label,
        department: row.serializedItemDepartment ?? row.queueDepartment,
        status: linkStatus,
        completedQuantity: toNumber(row.queueCompletedQuantity, isCompleteStatus(linkStatus) ? 1 : 0),
        requiredQuantity: toNumber(row.linkRequiredQuantity ?? row.queueRequiredQuantity, 1),
      });
    }
  }

  const dependencies = (((dependencyResult as any).rows ?? dependencyResult) as any[]).map((row) => ({
    assemblyId: row.assemblyId,
    dependsOnAssemblyId: row.dependsOnAssemblyId,
    dependencyType: row.dependencyType,
    isBlocking: row.isBlocking,
    notes: row.notes,
  }));

  return buildProgramStatus(build, [...assembliesById.values()], dependencies);
}
