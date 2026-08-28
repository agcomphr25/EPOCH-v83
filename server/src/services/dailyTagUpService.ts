import { pool } from '../../db';

type Row = Record<string, any>;

export type DailyTagUpFilters = {
  projectId?: string;
  customer?: string;
  customerPo?: string;
  department?: string;
  source?: 'manufacturing' | 'purchasing' | 'both';
  status?: string;
  search?: string;
  attentionDays?: number | null;
  problemsOnly?: boolean;
};

const number = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => text(value).toUpperCase();
const completeStatuses = new Set(['COMPLETE', 'COMPLETED', 'CLOSED']);

export function workOrderReadiness(row: Row) {
  const status = upper(row.status);
  if (completeStatuses.has(status)) return { state: 'COMPLETE', reason: null };
  if (status === 'IN_PROGRESS') return { state: 'IN PROGRESS', reason: null };
  if (status === 'BLOCKED' || status === 'HOLD') {
    return { state: 'BLOCKED', reason: text(row.hold_reason) || 'Work order is on hold' };
  }
  if (number(row.child_blocker_count) > 0) {
    return { state: 'NOT READY — WAITING ON UPSTREAM', reason: `${row.child_blocker_count} upstream requirement(s) incomplete` };
  }
  if (number(row.material_blocker_count) > 0) {
    return { state: 'BLOCKED', reason: `${row.material_blocker_count} material requirement(s) unsatisfied` };
  }
  if (row.traveler_requirement === 'REQUIRED' && !row.traveler_id) {
    return { state: 'BLOCKED', reason: 'Required traveler has not been provisioned' };
  }
  if (status === 'READY') return { state: 'READY', reason: null };
  return { state: 'NEEDED / NOT STARTED', reason: null };
}

export function matchesStatus(row: Row, requested?: string) {
  if (!requested || requested === 'all') return true;
  const readiness = upper(row.readiness?.state);
  const status = upper(row.status);
  if (requested === 'needed') return !completeStatuses.has(status);
  if (requested === 'ready') return readiness === 'READY';
  if (requested === 'in_progress') return status === 'IN_PROGRESS';
  if (requested === 'blocked') return readiness.includes('BLOCKED') || readiness.includes('NOT READY');
  if (requested === 'complete') return completeStatuses.has(status);
  return true;
}

function inAttentionWindow(dueDate: string | null, days?: number | null) {
  if (days == null || !dueDate) return true;
  const due = new Date(`${dueDate}T23:59:59`);
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return due <= limit;
}

export function buildTree(nodes: Row[]) {
  const byIdentity = new Map<string, Row>();
  const roots: Row[] = [];
  for (const node of nodes) byIdentity.set(node.nodeIdentity, { ...node, children: [] });
  for (const node of Array.from(byIdentity.values())) {
    const parent = node.parentNodeIdentity ? byIdentity.get(node.parentNodeIdentity) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function getDailyTagUp(filters: DailyTagUpFilters = {}) {
  const projectResult = await pool.query(
    `SELECT p.id,p.project_code,p.project_name,p.status,p.target_ship_date,p.customer_name_snapshot,
       po.id po_id,po.po_number,po.customer_name,po.expected_delivery,
       b.id baseline_id,b.revision_number baseline_revision,b.project_quantity,b.baseline_checksum
     FROM projects p
     LEFT JOIN p2_purchase_orders po ON po.id=p.po_id
     LEFT JOIN p2_frozen_production_demand_baselines b ON b.project_id=p.id AND b.status='RELEASED'
     WHERE p.status IN ('active','on_hold','won')
     ORDER BY COALESCE(p.target_ship_date,po.expected_delivery) NULLS LAST,p.project_code`
  );
  const allProjects = projectResult.rows as Row[];
  const projectIds = allProjects.map((row) => row.id);
  if (!projectIds.length) return emptyResponse(filters);

  const [workOrderResult, nodeResult, supplyResult] = await Promise.all([
    pool.query(
      `SELECT a.id authority_id,a.project_id,a.parent_authority_id,a.assembly_path_identity,
         a.inventory_item_id,a.part_number_snapshot,a.description_snapshot,a.required_quantity,
         a.completed_quantity,a.accepted_quantity,a.status,a.current_department_id,
         a.current_department_name_snapshot,a.traveler_requirement,a.traveler_id,
         pwo.id work_order_id,pwo.work_order_number,pwo.due_date,
         t.traveler_number,
         (SELECT count(*) FROM p2_manufacturing_work_order_dependencies d
           JOIN p2_manufacturing_work_order_authorities child ON child.id=d.predecessor_authority_id
           WHERE d.successor_authority_id=a.id AND d.status='OPEN'
             AND (CASE WHEN d.dependency_type='ACCEPT' THEN child.accepted_quantity ELSE child.completed_quantity END)<d.required_quantity) child_blocker_count,
         (SELECT count(*) FROM p2_manufacturing_work_order_material_requirements m
           WHERE m.successor_authority_id=a.id AND m.status='OPEN'
             AND LEAST(m.accepted_quantity,m.issued_quantity)<m.required_quantity) material_blocker_count
       FROM p2_manufacturing_work_order_authorities a
       JOIN production_work_orders pwo ON pwo.id=a.production_work_order_id
       LEFT JOIN travelers t ON t.id=a.traveler_id
       WHERE a.project_id=ANY($1::uuid[])`,
      [projectIds]
    ),
    pool.query(
      `SELECT n.id,n.baseline_id,n.node_identity,n.parent_node_identity,n.assembly_path_identity,n.depth,
         n.inventory_item_id,n.inventory_item_snapshot,n.item_classification,n.make_buy_disposition,
         n.required_gross_quantity,n.unit_of_measure,n.quantity_per_parent,n.bom_id,n.bom_revision_id,
         n.routing_id,i.ag_part_number,i.name,i.lead_time_days,
         COALESCE(bal.on_hand,0) on_hand,COALESCE(bal.allocated,0) allocated,COALESCE(bal.available,0) available
       FROM p2_frozen_production_demand_nodes n
       JOIN p2_frozen_production_demand_baselines base ON base.id=n.baseline_id AND base.status='RELEASED'
       JOIN inventory_items i ON i.id=n.inventory_item_id
       LEFT JOIN LATERAL (SELECT SUM(quantity_on_hand) on_hand,SUM(quantity_allocated) allocated,SUM(quantity_available) available
         FROM inventory_balances WHERE ag_part_number=i.ag_part_number) bal ON true
       WHERE base.project_id=ANY($1::uuid[])
       ORDER BY n.depth,n.assembly_path_identity`,
      [projectIds]
    ),
    pool.query(
      `SELECT vpi.project_id,vpi.ag_part_number,SUM(GREATEST(vpi.quantity-COALESCE(vpi.received_quantity,0),0)) open_quantity,
         jsonb_agg(jsonb_build_object('vendorPoId',vp.id,'poNumber',vp.po_number,'status',vp.status,
           'supplier',v.name,'expectedReceipt',vp.expected_delivery_date,
           'openQuantity',GREATEST(vpi.quantity-COALESCE(vpi.received_quantity,0),0)) ORDER BY vp.expected_delivery_date NULLS LAST) supply
       FROM vendor_po_items vpi JOIN vendor_pos vp ON vp.id=vpi.vendor_po_id JOIN vendors v ON v.id=vp.vendor_id
       WHERE vpi.project_id=ANY($1::uuid[]) AND vpi.ag_part_number IS NOT NULL
         AND vp.status NOT IN ('Cancelled','Voided','Fully Received') AND vp.is_current_revision=true
       GROUP BY vpi.project_id,vpi.ag_part_number`,
      [projectIds]
    ),
  ]);

  const workOrdersByProject = new Map<string, Row[]>();
  for (const raw of workOrderResult.rows as Row[]) {
    const required = number(raw.required_quantity);
    const complete = number(raw.completed_quantity);
    const remaining = Math.max(required - complete, 0);
    const row = {
      authorityId: raw.authority_id,
      workOrderId: raw.work_order_id,
      workOrderNumber: raw.work_order_number,
      inventoryItemId: raw.inventory_item_id,
      partNumber: raw.part_number_snapshot,
      partName: raw.description_snapshot,
      required,
      complete,
      inProgress: upper(raw.status) === 'IN_PROGRESS' ? remaining : 0,
      needed: remaining,
      status: raw.status,
      departmentId: raw.current_department_id,
      department: raw.current_department_name_snapshot || 'Missing setup',
      readiness: workOrderReadiness(raw),
      dueDate: raw.due_date,
      travelerId: raw.traveler_id,
      travelerNumber: raw.traveler_number,
      travelerRequirement: raw.traveler_requirement,
      assemblyPathIdentity: raw.assembly_path_identity,
    };
    (workOrdersByProject.get(raw.project_id) ?? workOrdersByProject.set(raw.project_id, []).get(raw.project_id)!).push(row);
  }
  const supplies = new Map((supplyResult.rows as Row[]).map((row) => [`${row.project_id}:${row.ag_part_number}`, row]));
  const nodesByBaseline = new Map<string, Row[]>();
  for (const raw of nodeResult.rows as Row[]) {
    const supply = supplies.get(`${allProjects.find((p) => p.baseline_id === raw.baseline_id)?.id}:${raw.ag_part_number}`);
    const required = number(raw.required_gross_quantity);
    const available = number(raw.available);
    const node = {
      id: raw.id,
      nodeIdentity: raw.node_identity,
      parentNodeIdentity: raw.parent_node_identity,
      assemblyPathIdentity: raw.assembly_path_identity,
      depth: number(raw.depth),
      inventoryItemId: raw.inventory_item_id,
      partNumber: raw.ag_part_number,
      partName: raw.name,
      classification: raw.item_classification || 'Missing setup',
      source: raw.make_buy_disposition === 'MAKE' ? 'manufacturing' : 'purchasing',
      required,
      unitOfMeasure: raw.unit_of_measure,
      bomId: raw.bom_id,
      bomRevisionId: raw.bom_revision_id,
      routingId: raw.routing_id,
      onHand: number(raw.on_hand),
      allocated: number(raw.allocated),
      available,
      short: raw.make_buy_disposition === 'BUY' ? Math.max(required - available - number(supply?.open_quantity), 0) : 0,
      leadTimeDays: raw.lead_time_days == null ? null : number(raw.lead_time_days),
      supply: supply?.supply ?? [],
      supplyStatus: supply ? 'OPEN SUPPLY' : 'NO OPEN SUPPLY',
    };
    (nodesByBaseline.get(raw.baseline_id) ?? nodesByBaseline.set(raw.baseline_id, []).get(raw.baseline_id)!).push(node);
  }

  const search = upper(filters.search);
  const projects = allProjects.filter((project) => {
    if (filters.projectId && project.id !== filters.projectId) return false;
    if (filters.customer && upper(project.customer_name || project.customer_name_snapshot) !== upper(filters.customer)) return false;
    if (filters.customerPo && upper(project.po_number) !== upper(filters.customerPo)) return false;
    return true;
  }).map((project) => {
    let workOrders = filters.source === 'purchasing' ? [] : (workOrdersByProject.get(project.id) ?? []);
    workOrders = workOrders.filter((row) => {
      if (filters.department && row.department !== filters.department) return false;
      if (!matchesStatus(row, filters.status)) return false;
      if (!inAttentionWindow(row.dueDate || project.target_ship_date || project.expected_delivery, filters.attentionDays)) return false;
      if (filters.problemsOnly && !['BLOCKED', 'NOT READY'].some((value) => upper(row.readiness.state).includes(value))) return false;
      if (search && ![project.project_code, project.project_name, project.po_number, row.workOrderNumber, row.partNumber, row.partName, row.travelerNumber].some((value) => upper(value).includes(search))) return false;
      return true;
    });
    const departments = Array.from(new Set(workOrders.map((row) => row.department))).sort().map((department) => {
      const children = workOrders.filter((row) => row.department === department);
      return rollup(department, children);
    });
    let nodes: Row[] = (nodesByBaseline.get(project.baseline_id) ?? []).map((node): Row => ({
      ...node,
      risk: supplyRisk(node, project.target_ship_date || project.expected_delivery),
    }));
    if (filters.source && filters.source !== 'both') nodes = nodes.filter((node) => node.source === filters.source);
    const totals = rollup('project', workOrders);
    const purchasingShortages = nodes.filter((node) => node.source === 'purchasing' && node.short > 0).length;
    return {
      id: project.id,
      projectCode: project.project_code,
      projectName: project.project_name,
      customer: project.customer_name || project.customer_name_snapshot || 'Not linked',
      customerPoId: project.po_id,
      customerPo: project.po_number || 'Not linked',
      dueDate: project.target_ship_date || project.expected_delivery,
      baseline: project.baseline_id ? { id: project.baseline_id, revision: project.baseline_revision, checksum: project.baseline_checksum } : null,
      configurationStatus: project.baseline_id ? 'RELEASED FROZEN DEMAND' : 'NOT RELEASED',
      ...totals,
      purchasingShortages,
      departments,
      assemblyTree: buildTree(nodes),
      materials: nodes.filter((node) => node.source === 'purchasing'),
      issues: [
        ...workOrders.filter((row) => upper(row.readiness.state).includes('BLOCKED') || upper(row.readiness.state).includes('NOT READY')).map((row) => ({ type: 'WORK ORDER', message: row.readiness.reason, href: `/p2-work-orders/${row.authorityId}`, record: row.workOrderNumber })),
        ...nodes.filter((node) => node.source === 'purchasing' && node.short > 0).map((node) => ({ type: 'MATERIAL SHORTAGE', message: `${node.short} ${node.unitOfMeasure} short`, href: `/inventory/items/${node.inventoryItemId}`, record: node.partNumber })),
        ...(!project.baseline_id ? [{ type: 'CONFIGURATION', message: 'No released Frozen Production Demand baseline', href: `/projects/${project.id}`, record: project.project_code }] : []),
      ],
    };
  }).filter((project) => !search || project.workOrders.length > 0 || [project.projectCode, project.projectName, project.customerPo].some((value) => upper(value).includes(search)));

  const workOrders = projects.flatMap((project) => project.workOrders);
  return {
    generatedAt: new Date().toISOString(),
    authority: {
      project: 'projects.po_id → p2_purchase_orders',
      demandAndAssembly: 'released p2_frozen_production_demand_baselines/nodes',
      workOrders: 'p2_manufacturing_work_order_authorities → production_work_orders',
      readiness: 'authoritative work-order status, dependency/material satisfaction, and traveler coverage',
      inventory: 'inventory_balances',
      purchasing: 'project-linked vendor_po_items → current vendor_pos revisions',
    },
    filters: filterOptions(allProjects, workOrderResult.rows),
    summary: {
      activeProjects: projects.length,
      ...rollup('all', workOrders),
      dueWithinWindow: projects.filter((project) => inAttentionWindow(project.dueDate, filters.attentionDays)).length,
      purchasingShortages: projects.reduce((sum, project) => sum + project.purchasingShortages, 0),
    },
    projects,
  };
}

export function rollup(label: string, workOrders: Row[]) {
  return {
    label,
    required: workOrders.reduce((sum, row) => sum + number(row.required), 0),
    complete: workOrders.reduce((sum, row) => sum + number(row.complete), 0),
    inProgress: workOrders.reduce((sum, row) => sum + number(row.inProgress), 0),
    needed: workOrders.reduce((sum, row) => sum + number(row.needed), 0),
    blocked: workOrders.filter((row) => upper(row.readiness?.state).includes('BLOCKED') || upper(row.readiness?.state).includes('NOT READY')).length,
    nextDue: workOrders.map((row) => row.dueDate).filter(Boolean).sort()[0] ?? null,
    percentComplete: workOrders.reduce((sum, row) => sum + number(row.required), 0) > 0
      ? Math.round(workOrders.reduce((sum, row) => sum + number(row.complete), 0) / workOrders.reduce((sum, row) => sum + number(row.required), 0) * 100)
      : null,
    workOrders,
  };
}

function filterOptions(projects: Row[], workOrders: Row[]) {
  const unique = (values: unknown[]) => Array.from(new Set(values.map(text).filter(Boolean))).sort();
  return {
    projects: projects.map((row) => ({ id: row.id, label: `${row.project_code} — ${row.project_name}` })),
    customers: unique(projects.map((row) => row.customer_name || row.customer_name_snapshot)),
    customerPos: unique(projects.map((row) => row.po_number)),
    departments: unique(workOrders.map((row) => row.current_department_name_snapshot)),
  };
}

function supplyRisk(node: Row, requiredDate: string | null) {
  if (node.source !== 'purchasing') return null;
  if (node.short <= 0) return 'ON TRACK';
  if (node.leadTimeDays == null) return 'LEAD TIME NOT SET';
  const receipts = (Array.isArray(node.supply) ? node.supply : []).map((entry: Row) => entry.expectedReceipt).filter(Boolean).sort();
  if (!receipts.length) return 'BUY NOW';
  if (requiredDate && receipts[0] > requiredDate) return 'LATE';
  const requiredStart = requiredDate ? new Date(`${requiredDate}T12:00:00`) : null;
  if (requiredStart) requiredStart.setDate(requiredStart.getDate() - node.leadTimeDays);
  return requiredStart && requiredStart < new Date() ? 'AT RISK' : 'DUE SOON';
}

function emptyResponse(filters: DailyTagUpFilters) {
  return { generatedAt: new Date().toISOString(), authority: {}, filters: { projects: [], customers: [], customerPos: [], departments: [] }, summary: { activeProjects: 0, required: 0, complete: 0, inProgress: 0, needed: 0, blocked: 0, dueWithinWindow: 0, purchasingShortages: 0 }, projects: [], appliedFilters: filters };
}
