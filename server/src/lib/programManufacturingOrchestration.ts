export type ProgramQueueLink = {
  id: string;
  linkType: string;
  manufacturingQueueId: number | null;
  productionWorkOrderId: string | null;
  travelerId: string | null;
  p2SerializedItemId: string | null;
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

export async function getProgramBuildStatus(buildId?: string | null, filters: { projectId?: string | null } = {}): Promise<ProgramBuildStatus | null> {
  const builds = await getProgramBuilds(filters);
  const build = buildId ? builds.find((candidate) => candidate.id === buildId) : builds[0];
  if (!build) return null;
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

  const assemblies = computeProgramAssemblyRollups([...assembliesById.values()], dependencies);
  const flatAssemblies = flattenAssemblies(assemblies);
  const blockers = flatAssemblies.filter((assembly) => assembly.computedStatus === 'BLOCKED');
  const criticalPath = [...flatAssemblies]
    .filter((assembly) => assembly.computedStatus !== 'COMPLETE')
    .sort((a, b) => b.blockedBy.length - a.blockedBy.length || a.completionPercent - b.completionPercent || a.sequence - b.sequence)
    .slice(0, 6);

  const totalQueueItems = flatAssemblies.reduce((sum, assembly) => sum + assembly.links.length, 0);
  const completedQueueItems = flatAssemblies.reduce(
    (sum, assembly) => sum + assembly.links.filter((link) => isCompleteStatus(link.status)).length,
    0,
  );
  const completionPercent = flatAssemblies.length > 0
    ? Math.round(flatAssemblies.reduce((sum, assembly) => sum + assembly.completionPercent, 0) / flatAssemblies.length)
    : 0;

  return {
    build,
    summary: {
      totalAssemblies: flatAssemblies.length,
      completeAssemblies: flatAssemblies.filter((assembly) => assembly.computedStatus === 'COMPLETE').length,
      blockedAssemblies: blockers.length,
      inProgressAssemblies: flatAssemblies.filter((assembly) => assembly.computedStatus === 'IN_PROGRESS').length,
      totalQueueItems,
      completedQueueItems,
      completionPercent,
      shipReady: flatAssemblies.length > 0 && blockers.length === 0 && flatAssemblies.every((assembly) => assembly.computedStatus === 'COMPLETE'),
      criticalPath,
    },
    assemblies,
    flatAssemblies,
    blockers,
    swimlanes: buildSwimlanes(flatAssemblies),
  };
}
