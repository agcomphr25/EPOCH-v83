import { createHash, randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { pool } from '../../db';
import { areP2ManufacturedOutputWritesEnabled } from '../lib/featureFlags';

export type P2WorkOrderActor = {
  userId: number;
  employeeId: number | null;
  displayName: string;
  role: string;
};

type Row = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;
const clean = (value: unknown) => String(value ?? '').trim();
const jsonRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
const jsonArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is JsonRecord =>
          entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      )
    : [];
const checksum = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalizedPartNumber = (value: unknown) => clean(value).toUpperCase();

export class P2WorkOrderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const requireEmployee = (actor: P2WorkOrderActor): number => {
  if (!actor.employeeId)
    throw new P2WorkOrderError(
      'AUTHENTICATED_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
  return actor.employeeId;
};

const travelerRequirement = (snapshot: unknown) => {
  const decision = jsonRecord(snapshot);
  const requirement = clean(
    decision.traveler_requirement ?? decision.travelerRequirement
  );
  if (requirement === 'REQUIRED' || requirement === 'NOT_REQUIRED_APPROVED')
    return requirement;
  throw new P2WorkOrderError(
    'WAD_TRAVELER_AUTHORITY_MISSING',
    'Every manufactured demand node must retain an explicit released traveler requirement.'
  );
};

const routingOperations = (snapshot: unknown) => {
  const routing = jsonRecord(snapshot);
  const operations = jsonArray(routing.operations).map((operation, index) => ({
    sequence: Number(
      operation.step_number ?? operation.stepNumber ?? index + 1
    ),
    id: clean(operation.id ?? operation.operationId),
    departmentId: clean(operation.department_id ?? operation.departmentId),
    departmentCode: clean(
      operation.department_code ?? operation.departmentCode
    ),
    departmentName: clean(
      operation.department_name_snapshot ??
        operation.departmentNameSnapshot ??
        operation.department_name ??
        operation.departmentName
    ),
    operationName: clean(
      operation.operation_name ?? operation.operationName ?? 'Operation'
    ),
    snapshot: operation,
  }));
  const invalid = operations.filter(
    (operation) =>
      !Number.isSafeInteger(operation.sequence) ||
      operation.sequence <= 0 ||
      !operation.id ||
      !operation.departmentId ||
      !operation.departmentName
  );
  if (!operations.length || invalid.length)
    throw new P2WorkOrderError(
      'FROZEN_ROUTING_AUTHORITY_INVALID',
      'Every manufactured node must retain ordered routing operations with stable Department identities.',
      409,
      { invalidOperations: invalid }
    );
  return operations.sort((left, right) => left.sequence - right.sequence);
};

function nearestManufacturedParent(
  node: Row,
  nodesByIdentity: Map<string, Row>
): Row | null {
  let parentIdentity = clean(node.parent_node_identity);
  const visited = new Set<string>();
  while (parentIdentity) {
    if (visited.has(parentIdentity))
      throw new P2WorkOrderError(
        'FROZEN_DEMAND_PARENT_CYCLE',
        'The frozen demand parent chain contains a cycle.'
      );
    visited.add(parentIdentity);
    const parent = nodesByIdentity.get(parentIdentity);
    if (!parent)
      throw new P2WorkOrderError(
        'FROZEN_DEMAND_PARENT_MISSING',
        'The frozen demand parent identity is missing.',
        409,
        { parentIdentity }
      );
    if (parent.make_buy_disposition === 'MAKE') return parent;
    parentIdentity = clean(parent.parent_node_identity);
  }
  return null;
}

export async function materializeP2ManufacturingWorkOrders(
  projectId: string,
  baselineId: string,
  input: {
    expectedBaselineChecksum: string;
    idempotencyKey: string;
    signatureMeaning: string;
    frozenDemandNodeId?: string;
    priority?: 'LOW' | 'URGENT' | 'CRITICAL';
    dueDate?: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = requireEmployee(actor);
  const requestKey = input.idempotencyKey.trim();
  if (!requestKey)
    throw new P2WorkOrderError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'An idempotency key is required.',
      400
    );
  const requestHash = checksum({
    projectId,
    baselineId,
    expectedBaselineChecksum: input.expectedBaselineChecksum,
    requestKey,
    frozenDemandNodeId: input.frozenDemandNodeId ?? null,
    priority: input.priority ?? 'LOW',
    dueDate: input.dueDate ?? null,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `${projectId}:${baselineId}:p2-mwo-materialize`,
    ]);
    const baselineResult = await client.query(
      `SELECT b.*,p.workflow_version
       FROM p2_frozen_production_demand_baselines b
       JOIN projects p ON p.id=b.project_id
       WHERE b.id=$1 AND b.project_id=$2 FOR UPDATE OF b,p`,
      [baselineId, projectId]
    );
    if (baselineResult.rows.length !== 1)
      throw new P2WorkOrderError(
        'RELEASED_FROZEN_DEMAND_NOT_FOUND',
        'The Frozen Production Demand baseline was not found.',
        404
      );
    const baseline = baselineResult.rows[0];
    if (
      baseline.status !== 'RELEASED' ||
      baseline.workflow_version !== 'p2_v2' ||
      clean(baseline.baseline_checksum) !== input.expectedBaselineChecksum
    )
      throw new P2WorkOrderError(
        'FROZEN_DEMAND_AUTHORITY_STALE',
        'The exact released P2 Frozen Production Demand checksum is required.'
      );

    const releaseAuthorityResult = await client.query(
      `SELECT pl.id production_launch_id,pl.preview_digest production_launch_digest,
         release.id production_release_id,
         wad.id wad_authorization_id,wad.wad_work_order_id,
         pwo.project_id wad_work_order_project_id,
         pwo.work_order_number wad_work_order_number,
         pwo.part_number wad_work_order_part_number,
         pwo.quantity wad_work_order_quantity,
         pwo.status wad_work_order_status,
         pwo.wad_status wad_work_order_wad_status,
         EXISTS (
           SELECT 1 FROM project_production_launch_events launch_event
           WHERE launch_event.production_launch_id=pl.id
             AND launch_event.event_type='P2_WORK_ORDERS_PROVISIONED'
         ) legacy_work_orders_provisioned
       FROM project_production_launches pl
       JOIN project_production_releases release
         ON release.id=pl.production_release_id
        AND release.project_id=pl.project_id
        AND release.status='APPROVED'
       JOIN project_wad_authorizations wad
         ON wad.id=release.wad_authorization_id
        AND wad.id=pl.wad_authorization_id
        AND wad.project_id=pl.project_id
        AND wad.status='RELEASED'
       JOIN production_work_orders pwo
         ON pwo.id=wad.wad_work_order_id
        AND pwo.project_id=pl.project_id
        AND pwo.wad_status='APPROVED'
       WHERE pl.project_id=$1 AND pl.status='COMPLETE'
         AND wad.id=$2
       ORDER BY pl.launched_at DESC
       FOR UPDATE OF pl,release,wad,pwo`,
      [projectId, baseline.wad_authorization_id]
    );
    if (releaseAuthorityResult.rows.length !== 1)
      throw new P2WorkOrderError(
        'PRODUCTION_EXECUTION_AUTHORITY_NOT_RELEASED',
        'A matching completed Production Launch, approved Production Release, and released baseline WAD are required.'
      );
    const releaseAuthority = releaseAuthorityResult.rows[0];
    if (releaseAuthority.legacy_work_orders_provisioned)
      throw new P2WorkOrderError(
        'LEGACY_WORK_ORDER_PROVISIONING_RECONCILIATION_REQUIRED',
        'This launch already provisioned child work orders through the legacy path and must be reconciled before Frozen Production Demand queue materialization.',
        409,
        { productionLaunchId: releaseAuthority.production_launch_id }
      );

    const replayResult = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_events
       WHERE frozen_demand_baseline_id=$1 AND event_type='WORK_ORDERS_MATERIALIZED'
         AND request_key=$2`,
      [baselineId, requestKey]
    );
    const replayEvent = replayResult.rows[0] ?? null;
    if (replayEvent && replayEvent.request_hash !== requestHash)
      throw new P2WorkOrderError(
        'WORK_ORDER_MATERIALIZATION_IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used with different authority evidence.'
      );

    const nodeResult = await client.query(
      `SELECT * FROM p2_frozen_production_demand_nodes
       WHERE baseline_id=$1 ORDER BY depth,assembly_path_identity FOR SHARE`,
      [baselineId]
    );
    const nodes: Row[] = nodeResult.rows;
    const allManufactured = nodes.filter(
      (node) => node.make_buy_disposition === 'MAKE'
    );
    if (!allManufactured.length)
      throw new P2WorkOrderError(
        'MANUFACTURED_DEMAND_REQUIRED',
        'Released frozen demand contains no manufactured nodes.'
      );
    const rootNodes = allManufactured.filter(
      (node) => Number(node.depth) === 0
    );
    if (rootNodes.length !== 1)
      throw new P2WorkOrderError(
        'ROOT_MANUFACTURED_DEMAND_AMBIGUOUS',
        'Released frozen demand must contain exactly one manufactured root authority.',
        409,
        { rootNodeIds: rootNodes.map((node) => node.id) }
      );
    const nodesByIdentity = new Map(
      nodes.map((node) => [clean(node.node_identity), node])
    );
    const existing = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_authorities
       WHERE frozen_demand_baseline_id=$1`,
      [baselineId]
    );
    const existingNodeIds = new Set(
      existing.rows.map((authority) => clean(authority.frozen_demand_node_id))
    );
    const manufactured = input.frozenDemandNodeId
      ? allManufactured.filter(
          (node) =>
            clean(node.id) === input.frozenDemandNodeId &&
            Number(node.depth) > 0
        )
      : allManufactured.filter((node) => !existingNodeIds.has(clean(node.id)));
    const replaySatisfied = input.frozenDemandNodeId
      ? existingNodeIds.has(input.frozenDemandNodeId)
      : allManufactured.every((node) => existingNodeIds.has(clean(node.id)));
    if (replayEvent && replaySatisfied) {
      await client.query('COMMIT');
      return { replayed: true, event: replayEvent };
    }
    if (!manufactured.length)
      throw new P2WorkOrderError(
        'MANUFACTURED_DEMAND_NODE_NOT_FOUND',
        input.frozenDemandNodeId
          ? 'The selected frozen-demand node is not a manufactured child in this released parent-PO baseline.'
          : 'Every manufactured node in this released parent-PO baseline already has a work-order authority.',
        404
      );
    if (
      input.frozenDemandNodeId &&
      existing.rows.some(
        (authority) =>
          clean(authority.frozen_demand_node_id) === input.frozenDemandNodeId
      )
    )
      throw new P2WorkOrderError(
        'WORK_ORDER_ALREADY_MATERIALIZED',
        'The selected manufactured child already has a work order.'
      );

    const authorityByNode = new Map<string, string>(
      existing.rows.map((authority) => [
        clean(authority.frozen_demand_node_id),
        clean(authority.id),
      ])
    );
    const workOrderIds: string[] = [];
    for (const node of manufactured) {
      const quantity = Number(node.required_gross_quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new P2WorkOrderError(
          'WHOLE_WORK_ORDER_QUANTITY_REQUIRED',
          'The existing Work Order domain requires a positive whole-unit manufactured quantity.',
          409,
          { assemblyPathIdentity: node.assembly_path_identity, quantity }
        );
      const item = jsonRecord(node.inventory_item_snapshot);
      const operations = routingOperations(node.routing_snapshot);
      const requirement = travelerRequirement(node.wad_decision_snapshot);
      const parent = nearestManufacturedParent(node, nodesByIdentity);
      const parentAuthorityId = parent
        ? authorityByNode.get(clean(parent.id))
        : null;
      if (parent && !parentAuthorityId)
        throw new P2WorkOrderError(
          'MANUFACTURED_PARENT_WORK_ORDER_REQUIRED',
          'Register the parent manufactured work-order authority before this child.',
          409,
          {
            parentNodeId: parent.id,
            parentAssemblyPathIdentity: parent.assembly_path_identity,
          }
        );
      const isRoot = Number(node.depth) === 0;
      const workOrderId = isRoot
        ? clean(releaseAuthority.wad_work_order_id)
        : randomUUID();
      const authorityId = randomUUID();
      const partNumber = clean(
        item.ag_part_number ?? item.partNumber ?? node.inventory_item_id
      );
      const description = clean(item.name ?? item.description ?? partNumber);
      const revision = clean(item.revision ?? item.revision_code);
      if (isRoot) {
        const rootMismatch =
          clean(releaseAuthority.wad_work_order_project_id) !== projectId ||
          normalizedPartNumber(releaseAuthority.wad_work_order_part_number) !==
            normalizedPartNumber(partNumber) ||
          Number(releaseAuthority.wad_work_order_quantity) !== quantity ||
          Number(baseline.project_quantity) !== quantity ||
          clean(releaseAuthority.wad_work_order_status) !== 'RELEASED';
        if (rootMismatch)
          throw new P2WorkOrderError(
            'WAD_ROOT_WORK_ORDER_MISMATCH',
            'The released WAD work order does not exactly match the frozen root project, part, and quantity.',
            409,
            {
              expected: {
                projectId,
                partNumber,
                quantity,
                status: 'RELEASED',
              },
              actual: {
                projectId: releaseAuthority.wad_work_order_project_id,
                partNumber: releaseAuthority.wad_work_order_part_number,
                quantity: releaseAuthority.wad_work_order_quantity,
                status: releaseAuthority.wad_work_order_status,
              },
            }
          );
        const conflictingRootAuthority = await client.query(
          `SELECT id,frozen_demand_baseline_id,frozen_demand_node_id
           FROM p2_manufacturing_work_order_authorities
           WHERE production_work_order_id=$1`,
          [workOrderId]
        );
        if (conflictingRootAuthority.rows.length)
          throw new P2WorkOrderError(
            'WAD_ROOT_AUTHORITY_CONFLICT',
            'The released WAD work order is already registered to a different P2 frozen-demand authority.',
            409,
            { authority: conflictingRootAuthority.rows[0] }
          );
      } else {
        const workOrderNumber = `P2-WO-${String(baseline.revision_number).padStart(3, '0')}-${clean(node.id).slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO production_work_orders
            (id,work_order_number,project_id,part_number,description,quantity,status,
             wad_status,assigned_department,queue_type,wizard_data,priority,due_date)
           VALUES ($1,$2,$3,$4,$5,$6,'PLANNED','DRAFT',$7,'P2_MANUFACTURING',$8::jsonb,$9,$10)`,
          [
            workOrderId,
            workOrderNumber,
            projectId,
            partNumber,
            description,
            quantity,
            operations[0].departmentName,
            JSON.stringify({
              source: 'P2_FROZEN_PRODUCTION_DEMAND',
              frozenDemandBaselineId: baselineId,
              frozenDemandNodeId: node.id,
              assemblyPathIdentity: node.assembly_path_identity,
              parentPoAuthorityInherited: true,
              parentManufacturedAuthorityId: parentAuthorityId,
            }),
            input.priority ?? 'LOW',
            input.dueDate ?? null,
          ]
        );
      }
      const authorityEvidence = {
        baselineChecksum: baseline.baseline_checksum,
        nodeChecksum: node.node_checksum,
        productionWorkOrderId: workOrderId,
        parentAuthorityId,
        rootWadAuthorizationId: isRoot
          ? releaseAuthority.wad_authorization_id
          : null,
        routingSnapshot: node.routing_snapshot,
        wadDecisionSnapshot: node.wad_decision_snapshot,
        traceabilitySnapshot: node.traceability_snapshot,
      };
      await client.query(
        `INSERT INTO p2_manufacturing_work_order_authorities
          (id,project_id,frozen_demand_baseline_id,frozen_demand_node_id,
           production_work_order_id,parent_authority_id,assembly_path_identity,
           inventory_item_id,part_number_snapshot,description_snapshot,
           part_revision_snapshot,required_quantity,current_department_id,
           current_department_name_snapshot,traveler_requirement,routing_snapshot,
           wad_decision_snapshot,traceability_snapshot,authority_checksum,
           materialized_by_user_id,materialized_by_employee_id,
           materialized_by_display_name,materialized_by_role,priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,''),$12,$13,$14,$15,
           $16::jsonb,$17::jsonb,$18::jsonb,$19,$20,$21,$22,$23,$24)`,
        [
          authorityId,
          projectId,
          baselineId,
          node.id,
          workOrderId,
          parentAuthorityId,
          node.assembly_path_identity,
          node.inventory_item_id,
          partNumber,
          description,
          revision,
          quantity,
          operations[0].departmentId,
          operations[0].departmentName,
          requirement,
          JSON.stringify(node.routing_snapshot),
          JSON.stringify(node.wad_decision_snapshot),
          JSON.stringify(node.traceability_snapshot),
          checksum(authorityEvidence),
          actor.userId,
          employeeId,
          actor.displayName,
          actor.role,
          input.priority ?? 'LOW',
        ]
      );
      for (const operation of operations) {
        await client.query(
          `INSERT INTO p2_manufacturing_work_order_operations
            (authority_id,operation_sequence,routing_operation_id,department_id,
             department_code_snapshot,department_name_snapshot,
             operation_name_snapshot,operation_snapshot,status)
           VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8::jsonb,$9)`,
          [
            authorityId,
            operation.sequence,
            operation.id,
            operation.departmentId,
            operation.departmentCode,
            operation.departmentName,
            operation.operationName,
            JSON.stringify(operation.snapshot),
            operation.sequence === operations[0].sequence ? 'READY' : 'PENDING',
          ]
        );
      }
      authorityByNode.set(clean(node.id), authorityId);
      workOrderIds.push(workOrderId);
    }

    const materializedNodeIds = new Set(
      manufactured.map((node) => clean(node.id))
    );
    for (const node of nodes) {
      const parent = nearestManufacturedParent(node, nodesByIdentity);
      if (
        !parent ||
        (!materializedNodeIds.has(clean(parent.id)) &&
          !materializedNodeIds.has(clean(node.id)))
      )
        continue;
      const successorId = authorityByNode.get(clean(parent.id));
      if (!successorId) continue;
      if (node.make_buy_disposition === 'MAKE') {
        const predecessorId = authorityByNode.get(clean(node.id));
        if (!predecessorId) continue;
        const traceability = jsonRecord(node.traceability_snapshot);
        const requirements = jsonRecord(traceability.requirements);
        const requiresAcceptance = Boolean(
          requirements.outputSerializationRequired ??
          requirements.lotScanRequired ??
          requirements.batchScanRequired
        );
        await client.query(
          `INSERT INTO p2_manufacturing_work_order_dependencies
            (project_id,predecessor_authority_id,successor_authority_id,
             dependency_type,required_quantity)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (predecessor_authority_id,successor_authority_id,dependency_type) DO NOTHING`,
          [
            projectId,
            predecessorId,
            successorId,
            requiresAcceptance ? 'ACCEPT' : 'COMPLETE',
            node.required_gross_quantity,
          ]
        );
      } else {
        const item = jsonRecord(node.inventory_item_snapshot);
        await client.query(
          `INSERT INTO p2_manufacturing_work_order_material_requirements
            (project_id,successor_authority_id,frozen_demand_node_id,
             inventory_item_id,assembly_path_identity,part_number_snapshot,
             required_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (successor_authority_id,frozen_demand_node_id) DO NOTHING`,
          [
            projectId,
            successorId,
            node.id,
            node.inventory_item_id,
            node.assembly_path_identity,
            clean(
              item.ag_part_number ?? item.partNumber ?? node.inventory_item_id
            ),
            node.required_gross_quantity,
          ]
        );
      }
    }

    const eventId = randomUUID();
    const eventRequestKey = replayEvent
      ? `system:root-authority-v2:${checksum(requestKey).slice(0, 32)}`
      : requestKey;
    await client.query(
      `INSERT INTO p2_manufacturing_work_order_events
        (id,authority_id,frozen_demand_baseline_id,event_type,request_key,request_hash,
         actor_user_id,actor_employee_id,actor_display_name,actor_role,
         signature_meaning,evidence)
       VALUES ($1,$2,$3,'WORK_ORDERS_MATERIALIZED',$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        eventId,
        manufactured.length === 1
          ? authorityByNode.get(clean(manufactured[0].id))
          : null,
        baselineId,
        eventRequestKey,
        requestHash,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        input.signatureMeaning.trim(),
        JSON.stringify({
          projectId,
          baselineId,
          baselineChecksum: baseline.baseline_checksum,
          productionLaunchId: releaseAuthority.production_launch_id,
          productionLaunchDigest: releaseAuthority.production_launch_digest,
          productionReleaseId: releaseAuthority.production_release_id,
          wadAuthorizationId: releaseAuthority.wad_authorization_id,
          releasedRootWorkOrderId: releaseAuthority.wad_work_order_id,
          recoveredFromEventId: replayEvent?.id ?? null,
          frozenDemandNodeIds: manufactured.map((node) => node.id),
          workOrderIds,
          createsTravelers: false,
          changesInventory: false,
        }),
      ]
    );
    await client.query('COMMIT');
    return { replayed: false, eventId, workOrderIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function evaluateP2WorkOrderReadiness(
  authorityId: string,
  tx: Pick<PoolClient, 'query'> = pool as unknown as Pick<PoolClient, 'query'>
) {
  const result = await tx.query(
    `SELECT a.*,pwo.work_order_number,pwo.description AS work_order_description,
      pwo.due_date,pwo.priority AS work_order_priority,p.project_code,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'dependencyId',d.id,'dependencyType',d.dependency_type,
        'predecessorAuthorityId',d.predecessor_authority_id,
        'childWorkOrderId',cp.production_work_order_id,
        'childWorkOrderNumber',cw.work_order_number,
        'childPartNumber',cp.part_number_snapshot,
        'requiredQuantity',d.required_quantity,
        'satisfiedQuantity',CASE WHEN d.dependency_type='ACCEPT' THEN cp.accepted_quantity ELSE cp.completed_quantity END,
        'shortageQuantity',GREATEST(d.required_quantity-(CASE WHEN d.dependency_type='ACCEPT' THEN cp.accepted_quantity ELSE cp.completed_quantity END),0),
        'department',cp.current_department_name_snapshot)
      ) FROM p2_manufacturing_work_order_dependencies d
      JOIN p2_manufacturing_work_order_authorities cp ON cp.id=d.predecessor_authority_id
      JOIN production_work_orders cw ON cw.id=cp.production_work_order_id
      WHERE d.successor_authority_id=a.id AND d.status='OPEN'
        AND (CASE WHEN d.dependency_type='ACCEPT' THEN cp.accepted_quantity ELSE cp.completed_quantity END)<d.required_quantity),'[]'::jsonb) child_blockers,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'materialRequirementId',m.id,'partNumber',m.part_number_snapshot,
        'requiredQuantity',m.required_quantity,
        'satisfiedQuantity',LEAST(m.accepted_quantity,m.issued_quantity),
        'shortageQuantity',GREATEST(m.required_quantity-LEAST(m.accepted_quantity,m.issued_quantity),0))
      ) FROM p2_manufacturing_work_order_material_requirements m
      WHERE m.successor_authority_id=a.id AND m.status='OPEN'
        AND LEAST(m.accepted_quantity,m.issued_quantity)<m.required_quantity),'[]'::jsonb) material_blockers,
      COALESCE((SELECT count(*) FROM p2_traveler_coverage_units u
        JOIN p2_traveler_provisioning_authorities pa ON pa.id=u.provisioning_authority_id
        WHERE u.work_order_authority_id=a.id AND pa.status='ACTIVE'),0)::int traveler_covered_quantity,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'travelerId',pa.traveler_id,'travelerType',pa.traveler_type,
        'coverageQuantity',pa.coverage_quantity,'outputIdentity',pa.output_identity,
        'barcodeValue',pa.barcode_value) ORDER BY pa.coverage_start_ordinal)
        FROM p2_traveler_provisioning_authorities pa
        WHERE pa.work_order_authority_id=a.id AND pa.status='ACTIVE'),'[]'::jsonb) traveler_coverage
     FROM p2_manufacturing_work_order_authorities a
     JOIN production_work_orders pwo ON pwo.id=a.production_work_order_id
     JOIN projects p ON p.id=a.project_id
     WHERE a.id=$1`,
    [authorityId]
  );
  if (result.rows.length !== 1)
    throw new P2WorkOrderError(
      'P2_WORK_ORDER_NOT_FOUND',
      'The P2 manufacturing work order was not found.',
      404
    );
  const row = result.rows[0];
  const childBlockers = Array.isArray(row.child_blockers)
    ? row.child_blockers
    : [];
  const materialBlockers = Array.isArray(row.material_blockers)
    ? row.material_blockers
    : [];
  let readiness = 'READY';
  if (row.status === 'COMPLETE') readiness = 'COMPLETE';
  else if (row.status === 'IN_PROGRESS') readiness = 'IN_PROGRESS';
  else if (row.status === 'HOLD') readiness = 'BLOCKED_HOLD';
  else if (childBlockers.length) readiness = 'BLOCKED_CHILD';
  else if (materialBlockers.length) readiness = 'BLOCKED_MATERIAL';
  else if (
    row.traveler_requirement === 'REQUIRED' &&
    Number(row.traveler_covered_quantity) !== Number(row.required_quantity)
  )
    readiness = 'BLOCKED_TRAVELER';
  return {
    authorityId: row.id,
    workOrderId: row.production_work_order_id,
    workOrderNumber: row.work_order_number,
    projectId: row.project_id,
    projectCode: row.project_code,
    partNumber: row.part_number_snapshot,
    description: row.work_order_description ?? row.description_snapshot,
    revision: row.part_revision_snapshot,
    requiredQuantity: row.required_quantity,
    completedQuantity: row.completed_quantity,
    acceptedQuantity: row.accepted_quantity,
    currentDepartmentId: row.current_department_id,
    currentDepartmentName: row.current_department_name_snapshot,
    dueDate: row.due_date,
    priority: row.work_order_priority ?? row.priority ?? 'LOW',
    travelerRequirement: row.traveler_requirement,
    travelerId: row.traveler_id,
    travelerCoveredQuantity: row.traveler_covered_quantity,
    travelerRemainingQuantity:
      Number(row.required_quantity) - Number(row.traveler_covered_quantity),
    travelerCoverage: row.traveler_coverage,
    parentAuthorityId: row.parent_authority_id,
    concurrencyVersion: row.concurrency_version,
    readiness,
    blockers: [...childBlockers, ...materialBlockers],
  };
}

export async function listP2WorkOrderQueue(
  departmentId?: string,
  projectId?: string
) {
  const allDepartments = !departmentId || departmentId === 'all';
  const rows = (
    await pool.query(
      `SELECT id FROM p2_manufacturing_work_order_authorities
       WHERE ($1::boolean OR current_department_id=$2)
         AND ($3::uuid IS NULL OR project_id=$3)
         AND status<>'CANCELLED'
       ORDER BY current_department_name_snapshot,
         CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'URGENT' THEN 2 ELSE 3 END,
         materialized_at,assembly_path_identity`,
      [allDepartments, allDepartments ? null : departmentId, projectId ?? null]
    )
  ).rows;
  return Promise.all(
    rows.map((row) => evaluateP2WorkOrderReadiness(String(row.id)))
  );
}

export async function updateP2WorkOrderManagement(
  authorityId: string,
  input: {
    expectedConcurrencyVersion: number;
    priority: 'LOW' | 'URGENT' | 'CRITICAL';
    dueDate?: string | null;
    description?: string;
    reason: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = requireEmployee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT a.*,pwo.description,pwo.due_date,pwo.priority AS work_order_priority
       FROM p2_manufacturing_work_order_authorities a
       JOIN production_work_orders pwo ON pwo.id=a.production_work_order_id
       WHERE a.id=$1 FOR UPDATE OF a,pwo`,
      [authorityId]
    );
    if (locked.rows.length !== 1)
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_NOT_FOUND',
        'The P2 manufacturing work order was not found.',
        404
      );
    const before = locked.rows[0];
    if (Number(before.concurrency_version) !== input.expectedConcurrencyVersion)
      throw new P2WorkOrderError(
        'STALE_WORK_ORDER',
        'The work order changed. Refresh before editing.'
      );
    if (['COMPLETE', 'CANCELLED'].includes(clean(before.status)))
      throw new P2WorkOrderError(
        'WORK_ORDER_EDIT_LOCKED',
        'Completed and cancelled work orders cannot be edited.',
        409
      );
    await client.query(
      `UPDATE production_work_orders
       SET priority=$2,due_date=$3,description=COALESCE($4,description),updated_at=now()
       WHERE id=$1`,
      [
        before.production_work_order_id,
        input.priority,
        input.dueDate ?? null,
        input.description?.trim() || null,
      ]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_authorities
       SET priority=$2,concurrency_version=concurrency_version+1,updated_at=now()
       WHERE id=$1`,
      [authorityId, input.priority]
    );
    await client.query(
      `INSERT INTO p2_manufacturing_work_order_events
        (authority_id,frozen_demand_baseline_id,event_type,actor_user_id,
         actor_employee_id,actor_display_name,actor_role,evidence)
       VALUES ($1,$2,'WORK_ORDER_MANAGEMENT_UPDATED',$3,$4,$5,$6,$7::jsonb)`,
      [
        authorityId,
        before.frozen_demand_baseline_id,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify({
          reason: input.reason.trim(),
          before: {
            priority: before.work_order_priority ?? before.priority,
            dueDate: before.due_date,
            description: before.description,
          },
          after: {
            priority: input.priority,
            dueDate: input.dueDate ?? null,
            description: input.description?.trim() || before.description,
          },
        }),
      ]
    );
    await client.query('COMMIT');
    return evaluateP2WorkOrderReadiness(authorityId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function startP2WorkOrder(
  authorityId: string,
  expectedConcurrencyVersion: number,
  actor: P2WorkOrderActor
) {
  const employeeId = requireEmployee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_authorities WHERE id=$1 FOR UPDATE`,
      [authorityId]
    );
    if (locked.rows.length !== 1)
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_NOT_FOUND',
        'The P2 manufacturing work order was not found.',
        404
      );
    const authority = locked.rows[0];
    if (Number(authority.concurrency_version) !== expectedConcurrencyVersion)
      throw new P2WorkOrderError(
        'STALE_WORK_ORDER',
        'The work order changed. Refresh before starting.'
      );
    const readiness = await evaluateP2WorkOrderReadiness(authorityId, client);
    if (readiness.readiness !== 'READY')
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_BLOCKED',
        'The work order is not ready to start.',
        409,
        { readiness }
      );
    await client.query(
      `UPDATE p2_manufacturing_work_order_authorities
       SET status='IN_PROGRESS',started_at=COALESCE(started_at,now()),
         concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1`,
      [authorityId]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_operations SET status='IN_PROGRESS',started_at=COALESCE(started_at,now())
       WHERE authority_id=$1 AND operation_sequence=$2`,
      [authorityId, authority.current_operation_sequence]
    );
    await client.query(
      `UPDATE production_work_orders SET status='IN_PROGRESS',updated_at=now() WHERE id=$1`,
      [authority.production_work_order_id]
    );
    await client.query(
      `INSERT INTO p2_manufacturing_work_order_events
        (authority_id,frozen_demand_baseline_id,event_type,actor_user_id,
         actor_employee_id,actor_display_name,actor_role,evidence)
       VALUES ($1,$2,'WORK_STARTED',$3,$4,$5,$6,$7::jsonb)`,
      [
        authorityId,
        authority.frozen_demand_baseline_id,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify({ readiness }),
      ]
    );
    await client.query('COMMIT');
    return evaluateP2WorkOrderReadiness(authorityId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeP2WorkOrderOperation(
  authorityId: string,
  expectedConcurrencyVersion: number,
  actor: P2WorkOrderActor
) {
  const employeeId = requireEmployee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const authorityResult = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_authorities WHERE id=$1 FOR UPDATE`,
      [authorityId]
    );
    if (authorityResult.rows.length !== 1)
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_NOT_FOUND',
        'The P2 manufacturing work order was not found.',
        404
      );
    const authority = authorityResult.rows[0];
    if (Number(authority.concurrency_version) !== expectedConcurrencyVersion)
      throw new P2WorkOrderError(
        'STALE_WORK_ORDER',
        'The work order changed. Refresh before completing the operation.'
      );
    if (authority.status !== 'IN_PROGRESS')
      throw new P2WorkOrderError(
        'WORK_ORDER_NOT_IN_PROGRESS',
        'Only an in-progress P2 work order operation may be completed.'
      );
    const currentResult = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_operations
       WHERE authority_id=$1 AND operation_sequence=$2 FOR UPDATE`,
      [authorityId, authority.current_operation_sequence]
    );
    if (
      currentResult.rows.length !== 1 ||
      currentResult.rows[0].status !== 'IN_PROGRESS'
    )
      throw new P2WorkOrderError(
        'CURRENT_OPERATION_NOT_IN_PROGRESS',
        'The authoritative current routing operation is not in progress.'
      );
    const current = currentResult.rows[0];
    const nextResult = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_operations
       WHERE authority_id=$1 AND operation_sequence>$2
       ORDER BY operation_sequence LIMIT 1 FOR UPDATE`,
      [authorityId, authority.current_operation_sequence]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_operations
       SET status='COMPLETE',completed_at=now() WHERE id=$1`,
      [current.id]
    );
    const next = nextResult.rows[0];
    if (next) {
      await client.query(
        `UPDATE p2_manufacturing_work_order_operations SET status='READY'
         WHERE id=$1`,
        [next.id]
      );
      await client.query(
        `UPDATE p2_manufacturing_work_order_authorities
         SET status='READY',current_operation_sequence=$2,current_department_id=$3,
           current_department_name_snapshot=$4,concurrency_version=concurrency_version+1,
           updated_at=now() WHERE id=$1`,
        [
          authorityId,
          next.operation_sequence,
          next.department_id,
          next.department_name_snapshot,
        ]
      );
      await client.query(
        `UPDATE production_work_orders SET status='READY',assigned_department=$2,
         updated_at=now() WHERE id=$1`,
        [authority.production_work_order_id, next.department_name_snapshot]
      );
    } else {
      await client.query(
        `UPDATE p2_manufacturing_work_order_authorities
         SET status='COMPLETE',completed_quantity=required_quantity,
           completed_at=now(),concurrency_version=concurrency_version+1,
           updated_at=now() WHERE id=$1`,
        [authorityId]
      );
      await client.query(
        `UPDATE production_work_orders SET status='COMPLETE',updated_at=now()
         WHERE id=$1`,
        [authority.production_work_order_id]
      );
      await client.query(
        `UPDATE p2_manufacturing_work_order_dependencies d
         SET satisfied_quantity=LEAST(d.required_quantity,a.required_quantity),
           status=CASE WHEN LEAST(d.required_quantity,a.required_quantity)>=d.required_quantity
             THEN 'SATISFIED' ELSE 'OPEN' END,
           satisfied_at=CASE WHEN LEAST(d.required_quantity,a.required_quantity)>=d.required_quantity
             THEN now() ELSE NULL END,updated_at=now()
         FROM p2_manufacturing_work_order_authorities a
         WHERE a.id=$1 AND d.predecessor_authority_id=a.id
           AND d.dependency_type='COMPLETE'`,
        [authorityId]
      );
    }
    await client.query(
      `INSERT INTO p2_manufacturing_work_order_events
        (authority_id,frozen_demand_baseline_id,event_type,actor_user_id,
         actor_employee_id,actor_display_name,actor_role,evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        authorityId,
        authority.frozen_demand_baseline_id,
        next
          ? 'OPERATION_COMPLETED_DEPARTMENT_ADVANCED'
          : 'WORK_ORDER_COMPLETED',
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        JSON.stringify({
          operationId: current.id,
          operationSequence: current.operation_sequence,
          nextOperationId: next?.id ?? null,
          nextDepartmentId: next?.department_id ?? null,
        }),
      ]
    );
    await client.query('COMMIT');
    return evaluateP2WorkOrderReadiness(authorityId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function acceptP2WorkOrderOutput(
  authorityId: string,
  input: {
    expectedConcurrencyVersion: number;
    acceptedQuantity: number;
    signatureMeaning: string;
  },
  actor: P2WorkOrderActor
) {
  const employeeId = requireEmployee(actor);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM p2_manufacturing_work_order_authorities WHERE id=$1 FOR UPDATE`,
      [authorityId]
    );
    if (result.rows.length !== 1)
      throw new P2WorkOrderError(
        'P2_WORK_ORDER_NOT_FOUND',
        'The P2 manufacturing work order was not found.',
        404
      );
    const authority = result.rows[0];
    if (
      Number(authority.concurrency_version) !== input.expectedConcurrencyVersion
    )
      throw new P2WorkOrderError(
        'STALE_WORK_ORDER',
        'The work order changed. Refresh before recording acceptance.'
      );
    if (authority.status !== 'COMPLETE')
      throw new P2WorkOrderError(
        'COMPLETED_OUTPUT_REQUIRED',
        'Quality acceptance requires completed manufactured output.'
      );
    if (
      !Number.isFinite(input.acceptedQuantity) ||
      input.acceptedQuantity < 0 ||
      input.acceptedQuantity > Number(authority.completed_quantity)
    )
      throw new P2WorkOrderError(
        'INVALID_ACCEPTED_QUANTITY',
        'Accepted quantity cannot exceed controlled completed quantity.',
        400
      );
    if (areP2ManufacturedOutputWritesEnabled()) {
      const releasedOutput = await client.query(
        `SELECT COALESCE(SUM(output_quantity),0) released_quantity
         FROM p2_manufactured_output_authorities
         WHERE work_order_authority_id=$1 AND status='RELEASED'`,
        [authorityId]
      );
      if (
        Number(releasedOutput.rows[0].released_quantity) <
        input.acceptedQuantity
      )
        throw new P2WorkOrderError(
          'RELEASED_OUTPUT_GENEALOGY_REQUIRED',
          'Quality acceptance cannot exceed independently released output with immutable material Genealogy.'
        );
    }
    await client.query(
      `UPDATE p2_manufacturing_work_order_authorities
       SET accepted_quantity=$2,concurrency_version=concurrency_version+1,
         updated_at=now() WHERE id=$1`,
      [authorityId, input.acceptedQuantity]
    );
    await client.query(
      `UPDATE p2_manufacturing_work_order_dependencies
       SET satisfied_quantity=LEAST(required_quantity,$2),
         status=CASE WHEN LEAST(required_quantity,$2)>=required_quantity
           THEN 'SATISFIED' ELSE 'OPEN' END,
         satisfied_at=CASE WHEN LEAST(required_quantity,$2)>=required_quantity
           THEN now() ELSE NULL END,updated_at=now()
       WHERE predecessor_authority_id=$1 AND dependency_type='ACCEPT'`,
      [authorityId, input.acceptedQuantity]
    );
    await client.query(
      `INSERT INTO p2_manufacturing_work_order_events
        (authority_id,frozen_demand_baseline_id,event_type,actor_user_id,
         actor_employee_id,actor_display_name,actor_role,signature_meaning,evidence)
       VALUES ($1,$2,'OUTPUT_ACCEPTED',$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        authorityId,
        authority.frozen_demand_baseline_id,
        actor.userId,
        employeeId,
        actor.displayName,
        actor.role,
        input.signatureMeaning.trim(),
        JSON.stringify({ acceptedQuantity: input.acceptedQuantity }),
      ]
    );
    await client.query('COMMIT');
    return evaluateP2WorkOrderReadiness(authorityId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function assertTravelerP2WorkOrderReady(
  productionWorkOrderId: string
) {
  const authority = await pool.query(
    `SELECT id FROM p2_manufacturing_work_order_authorities
     WHERE production_work_order_id=$1`,
    [productionWorkOrderId]
  );
  if (!authority.rows.length) return null;
  const readiness = await evaluateP2WorkOrderReadiness(
    String(authority.rows[0].id)
  );
  if (!['READY', 'IN_PROGRESS'].includes(readiness.readiness))
    throw new P2WorkOrderError(
      'P2_WORK_ORDER_BLOCKED',
      'The traveler cannot start while its P2 work order is blocked.',
      409,
      { readiness }
    );
  return readiness;
}
