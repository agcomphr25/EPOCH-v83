import type { PoolClient } from 'pg';

import { pool } from '../../db';
import {
  compileFrozenProductionDemand,
  frozenDemandChecksum,
  type FrozenDemandSourceNode,
} from './p2FrozenProductionDemandCompiler';

export type FrozenDemandActor = {
  userId: number;
  employeeId: number | null;
  displayName: string;
  role: string;
};
export class FrozenDemandError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}
type Queryable = Pick<PoolClient, 'query'>;
type FrozenDemandContext = {
  projectId: string;
  configurationId: string;
  configurationChecksum: string;
  wadAuthorizationId: string;
  wadChecksum: string;
  project: Record<string, unknown>;
  customer: Record<string, unknown>;
  purchaseOrder: Record<string, unknown>;
};
const clean = (v: unknown) => String(v ?? '').trim();
const objectSnapshot = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function authoritativeSource(
  projectId: string,
  tx: Queryable
): Promise<{
  context: FrozenDemandContext;
  root: FrozenDemandSourceNode;
  quantity: string;
}> {
  const header = await tx.query(
    `SELECT c.*,p.project_code,p.project_name,p.customer_id,p.customer_name_snapshot,p.po_id,p.p2_po_item_id,
    poi.quantity project_quantity,poi.demand_line_identity,poi.customer_po_line,poi.customer_clin,po.po_number,
    w.id wad_authorization_id,w.inherited_requirements_snapshot,w.updated_at wad_updated_at
    FROM p2_project_controlled_configurations c JOIN projects p ON p.id=c.project_id
    JOIN p2_purchase_order_items poi ON poi.id=p.p2_po_item_id AND poi.po_id=p.po_id
    JOIN p2_purchase_orders po ON po.id=p.po_id
    JOIN project_wad_authorizations w ON w.project_id=p.id AND w.status='RELEASED'
    WHERE c.project_id=$1 AND c.status='RELEASED'`,
    [projectId]
  );
  if (header.rows.length !== 1)
    throw new FrozenDemandError(
      'AUTHORITATIVE_SOURCE_AMBIGUOUS',
      'Exactly one released project configuration, released WAD authorization, and controlled PO line are required.',
      409
    );
  const h = header.rows[0];
  const decisions = (
    await tx.query(
      `SELECT * FROM p2_wad_traveler_decisions WHERE wad_authorization_id=$1`,
      [h.wad_authorization_id]
    )
  ).rows;
  const decisionByKey = new Map(
    decisions.map((d) => [
      `${d.inventory_item_id}::${d.assembly_path_identity}`,
      d,
    ])
  );
  const build = async (
    itemId: number,
    path: string,
    makeBuy: 'MAKE' | 'BUY',
    qty: string,
    scrap: string,
    bomHint?: Record<string, unknown>,
    routingHint?: Record<string, unknown>,
    bomLine?: Record<string, unknown>
  ): Promise<FrozenDemandSourceNode> => {
    const itemResult = await tx.query(
      `SELECT i.id inventory_item_id,i.ag_part_number,i.name,p.* FROM inventory_items i
      JOIN inventory_item_traceability_policies p ON p.inventory_item_id=i.id AND p.status='RELEASED'
      WHERE i.id=$1`,
      [itemId]
    );
    if (itemResult.rows.length !== 1)
      return {
        inventoryItemId: itemId,
        partNumber: '',
        itemName: '',
        classification: '',
        makeBuy,
        unit: '',
        quantityPerParent: qty,
        scrapPercent: scrap,
        assemblyPath: path,
        children: [],
      };
    const item = itemResult.rows[0];
    let bom: Record<string, unknown> | null = bomHint ?? null;
    let routing: Record<string, unknown> | null = routingHint ?? null;
    const children: FrozenDemandSourceNode[] = [];
    if (makeBuy === 'MAKE') {
      if (!bom) {
        const b = await tx.query(
          `SELECT b.id,br.id revision_id,br.rev_code,br.content_checksum,br.effectivity FROM boms b JOIN bom_revisions br ON br.bom_id=b.id AND br.lifecycle_status='RELEASED' AND br.is_released=true WHERE b.parent_inventory_item_id=$1`,
          [itemId]
        );
        if (b.rows.length === 1) bom = b.rows[0];
      }
      if (!routing) {
        const r = await tx.query(
          `SELECT id,routing_revision,department_sequence,department_config FROM part_routings WHERE inventory_item_fk=$1 AND lifecycle_status='RELEASED' AND is_active=true`,
          [itemId]
        );
        if (r.rows.length === 1)
          routing = {
            id: r.rows[0].id,
            revision: String(r.rows[0].routing_revision),
            departmentSequence: r.rows[0].department_sequence,
            departmentConfig: r.rows[0].department_config,
          };
      }
      if (routing?.id) {
        const operations = (
          await tx.query(
            `SELECT ro.id,ro.step_number,ro.operation_name,ro.operation_type,ro.department_id,
             ro.department_name_snapshot,d.name department_name,d.department_code,d.is_active department_active
             FROM routing_operations ro LEFT JOIN inventory_departments d ON d.id=ro.department_id
             WHERE ro.part_routing_id=$1 ORDER BY ro.step_number,ro.id`,
            [routing.id]
          )
        ).rows;
        routing = {
          ...routing,
          operations,
          departmentSequence: operations.map((operation) =>
            operation.department_id
              ? {
                  departmentId: operation.department_id,
                  departmentCode: operation.department_code,
                  departmentNameSnapshot:
                    operation.department_name_snapshot ??
                    operation.department_name,
                  stepNumber: operation.step_number,
                  operationId: operation.id,
                  operationName: operation.operation_name,
                }
              : null
          ),
        };
      }
      if (bom?.revision_id) {
        const lines = await tx.query(
          `SELECT * FROM bom_lines WHERE revision_id=$1 ORDER BY operation_seq,id`,
          [bom.revision_id]
        );
        for (const line of lines.rows) {
          const childPath =
            clean(line.assembly_path_identity) || `${path}/${line.id}`;
          children.push(
            await build(
              line.child_inventory_item_id,
              childPath,
              line.make_buy_disposition,
              line.qty_per,
              line.scrap_pct,
              undefined,
              undefined,
              {
                id: line.id,
                parentBomRevisionId: bom.revision_id,
                quantityPerParent: line.qty_per,
                scrapPercent: line.scrap_pct,
                checksum: frozenDemandChecksum(line),
              }
            )
          );
        }
      }
    }
    const wad = decisionByKey.get(`${itemId}::${path}`);
    return {
      inventoryItemId: itemId,
      partNumber: item.ag_part_number,
      itemName: item.name,
      classification: item.item_classification,
      makeBuy,
      unit: item.unit_of_measure,
      quantityPerParent: qty,
      scrapPercent: scrap,
      assemblyPath: path,
      bom: bom
        ? {
            id: bom.id,
            revisionId: bom.revision_id,
            revision: bom.rev_code,
            checksum: bom.content_checksum,
            effectivity: bom.effectivity,
          }
        : null,
      bomLine: bomLine ?? null,
      routing,
      traceability: {
        id: item.id,
        revision: item.revision_number,
        type: item.policy_type,
        checksum: item.content_checksum,
        requirements: {
          outputSerializationRequired: item.output_serialization_required,
          lotScanRequired: item.lot_scan_required,
          batchScanRequired: item.batch_scan_required,
          quantityEntryRequired: item.quantity_entry_required,
        },
      },
      wadDecision: wad ?? null,
      inspection: wad?.inspection_requirements_snapshot ?? {},
      exceptionEvidence: wad
        ? {
            required: wad.exception_required,
            reason: wad.exception_reason,
            effectivity: wad.exception_effectivity,
            approvedBy: wad.exception_approved_by,
            approvedAt: wad.exception_approved_at,
          }
        : {},
      effectivity: objectSnapshot(bom?.effectivity),
      customerConfiguration: objectSnapshot(h.customer_configuration),
      children,
    };
  };
  const manufactured = (h.inherited_requirements_snapshot?.manufacturedItems ??
    []) as Array<Record<string, unknown>>;
  const rootWad = manufactured.find(
    (x) => Number(x.inventory_item_id) === Number(h.inventory_item_id)
  );
  const rootPath =
    clean(rootWad?.assembly_path) || `root:${h.inventory_item_id}`;
  const root = await build(
    h.inventory_item_id,
    rootPath,
    'MAKE',
    '1',
    '0',
    {
      id: h.bom_id,
      revision_id: h.bom_revision_id,
      rev_code: h.bom_revision_snapshot,
      content_checksum: h.bom_checksum_snapshot,
      effectivity: h.effectivity,
    },
    {
      id: h.routing_id,
      revision: h.routing_revision_snapshot,
      ...objectSnapshot(h.routing_snapshot),
    }
  );
  return {
    context: {
      projectId,
      configurationId: h.id,
      configurationChecksum: h.content_checksum,
      wadAuthorizationId: h.wad_authorization_id,
      wadChecksum: frozenDemandChecksum({
        id: h.wad_authorization_id,
        updatedAt: h.wad_updated_at,
        decisions: decisions.map((d) => d.content_checksum).sort(),
      }),
      project: { id: projectId, code: h.project_code, name: h.project_name },
      customer: { id: h.customer_id, name: h.customer_name_snapshot },
      purchaseOrder: {
        id: h.po_id,
        number: h.po_number,
        lineItemId: h.p2_po_item_id,
        demandLineIdentity: h.demand_line_identity,
        customerPoLine: h.customer_po_line,
        customerClin: h.customer_clin,
      },
    },
    root,
    quantity: String(h.project_quantity),
  };
}

export async function previewFrozenProductionDemand(
  projectId: string,
  tx: Queryable = pool as unknown as Queryable
) {
  const source = await authoritativeSource(projectId, tx);
  return {
    ...source.context,
    projectQuantity: source.quantity,
    ...compileFrozenProductionDemand(source.root, source.quantity),
  };
}
export async function listFrozenProductionDemand(projectId: string) {
  const baselines = (
    await pool.query(
      `SELECT * FROM p2_frozen_production_demand_baselines WHERE project_id=$1 ORDER BY revision_number DESC`,
      [projectId]
    )
  ).rows;
  return { baselines };
}
export async function frozenProductionDemandDetail(
  projectId: string,
  id: string
) {
  const baseline = (
    await pool.query(
      `SELECT * FROM p2_frozen_production_demand_baselines WHERE id=$1 AND project_id=$2`,
      [id, projectId]
    )
  ).rows[0];
  if (!baseline)
    throw new FrozenDemandError(
      'BASELINE_NOT_FOUND',
      'Frozen demand baseline was not found.',
      404
    );
  const nodes = (
    await pool.query(
      `SELECT n.*,a.id materialized_authority_id,
              a.production_work_order_id,a.status work_order_status,
              pwo.work_order_number
         FROM p2_frozen_production_demand_nodes n
         LEFT JOIN p2_manufacturing_work_order_authorities a
           ON a.frozen_demand_node_id=n.id
         LEFT JOIN production_work_orders pwo ON pwo.id=a.production_work_order_id
        WHERE n.baseline_id=$1 ORDER BY n.depth,n.assembly_path_identity`,
      [id]
    )
  ).rows;
  const events = (
    await pool.query(
      `SELECT * FROM p2_frozen_production_demand_events WHERE baseline_id=$1 ORDER BY created_at`,
      [id]
    )
  ).rows;
  return { baseline, nodes, events };
}
async function event(
  tx: Queryable,
  id: string,
  type: string,
  actor: FrozenDemandActor,
  from: string | null,
  to: string | null,
  evidence: unknown,
  signature?: string,
  reason?: string
) {
  await tx.query(
    `INSERT INTO p2_frozen_production_demand_events(baseline_id,event_type,from_status,to_status,actor_user_id,actor_employee_id,actor_display_name,actor_role,signature_meaning,reason,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [
      id,
      type,
      from,
      to,
      actor.userId,
      actor.employeeId,
      actor.displayName,
      actor.role,
      signature ?? null,
      reason ?? null,
      JSON.stringify(evidence),
    ]
  );
}
function requireEmployee(actor: FrozenDemandActor) {
  if (!actor.employeeId)
    throw new FrozenDemandError(
      'ACTOR_EMPLOYEE_REQUIRED',
      'An authenticated employee identity is required.',
      403
    );
}
export async function createFrozenProductionDemandDraft(
  projectId: string,
  actor: FrozenDemandActor,
  supersessionReason?: string
) {
  requireEmployee(actor);
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `p2-frozen-demand:${projectId}`,
    ]);
    const preview = await previewFrozenProductionDemand(projectId, tx);
    if (preview.blockers.length || !preview.checksum)
      throw new FrozenDemandError(
        'DEMAND_NOT_READY',
        'Frozen demand preview is blocked.',
        409,
        { blockers: preview.blockers }
      );
    const existing = (
      await tx.query(
        `SELECT * FROM p2_frozen_production_demand_baselines WHERE project_id=$1 AND status IN ('DRAFT','VALIDATED') ORDER BY revision_number DESC LIMIT 1 FOR UPDATE`,
        [projectId]
      )
    ).rows[0];
    if (existing) {
      if (existing.preview_checksum === preview.checksum) {
        await tx.query('COMMIT');
        return existing;
      }
      throw new FrozenDemandError(
        'DRAFT_CONFLICT',
        'A materially different draft already exists; cancel it before regenerating.',
        409
      );
    }
    const released = (
      await tx.query(
        `SELECT * FROM p2_frozen_production_demand_baselines WHERE project_id=$1 AND status='RELEASED' FOR UPDATE`,
        [projectId]
      )
    ).rows[0];
    if (released && !clean(supersessionReason))
      throw new FrozenDemandError(
        'SUPERSESSION_REASON_REQUIRED',
        'A reason is required to revise released frozen demand.',
        409
      );
    const saved = (
      await tx.query(
        `INSERT INTO p2_frozen_production_demand_baselines(project_id,project_configuration_id,wad_authorization_id,revision_number,root_inventory_item_id,project_quantity,project_snapshot,customer_snapshot,purchase_order_snapshot,configuration_checksum,wad_checksum,preview_checksum,blockers_snapshot,created_by,created_by_employee_id,created_by_display_name,created_by_role,supersedes_baseline_id,supersession_reason)
      SELECT $1,$2,$3,COALESCE(MAX(revision_number),0)+1,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,'[]'::jsonb,$12,$13,$14,$15,$16,$17 FROM p2_frozen_production_demand_baselines WHERE project_id=$1 RETURNING *`,
        [
          projectId,
          preview.configurationId,
          preview.wadAuthorizationId,
          preview.nodes[0].inventoryItemId,
          preview.projectQuantity,
          JSON.stringify(preview.project),
          JSON.stringify(preview.customer),
          JSON.stringify(preview.purchaseOrder),
          preview.configurationChecksum,
          preview.wadChecksum,
          preview.checksum,
          actor.userId,
          actor.employeeId,
          actor.displayName,
          actor.role,
          released?.id ?? null,
          clean(supersessionReason) || null,
        ]
      )
    ).rows[0];
    for (const n of preview.nodes)
      await tx.query(
        `INSERT INTO p2_frozen_production_demand_nodes(baseline_id,node_identity,parent_node_identity,assembly_path_identity,depth,inventory_item_id,inventory_item_snapshot,item_classification,make_buy_disposition,required_gross_quantity,unit_of_measure,quantity_per_parent,scrap_percent,bom_id,bom_revision_id,bom_line_id,bom_snapshot,routing_id,routing_snapshot,traceability_policy_id,traceability_policy_revision,traceability_snapshot,wad_decision_id,wad_decision_snapshot,inspection_requirements_snapshot,exception_evidence_snapshot,effectivity_snapshot,customer_configuration_snapshot,node_checksum)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::jsonb,$20,$21,$22::jsonb,$23,$24::jsonb,$25::jsonb,$26::jsonb,$27::jsonb,$28::jsonb,$29)`,
        [
          saved.id,
          n.nodeIdentity,
          n.parentNodeIdentity,
          n.assemblyPath,
          n.depth,
          n.inventoryItemId,
          JSON.stringify({ partNumber: n.partNumber, name: n.itemName }),
          n.classification,
          n.makeBuy,
          n.requiredGrossQuantity,
          n.unit,
          n.quantityPerParent,
          n.scrapPercent,
          n.bom?.id ?? null,
          n.bom?.revisionId ?? null,
          n.bomLine?.id ?? null,
          JSON.stringify({
            assemblyBom: n.bom ?? {},
            parentLine: n.bomLine ?? {},
          }),
          n.routing?.id ?? null,
          JSON.stringify(n.routing ?? {}),
          n.traceability?.id,
          n.traceability?.revision,
          JSON.stringify(n.traceability),
          n.wadDecision?.id ?? null,
          JSON.stringify(n.wadDecision ?? {}),
          JSON.stringify(n.inspection ?? {}),
          JSON.stringify(n.exceptionEvidence ?? {}),
          JSON.stringify(n.effectivity ?? {}),
          JSON.stringify(n.customerConfiguration ?? {}),
          n.nodeChecksum,
        ]
      );
    await event(tx, saved.id, 'DRAFT_CREATED', actor, null, 'DRAFT', {
      previewChecksum: preview.checksum,
      nodeCount: preview.nodes.length,
    });
    await tx.query('COMMIT');
    return saved;
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
}
export async function validateFrozenProductionDemand(
  projectId: string,
  id: string,
  version: number,
  actor: FrozenDemandActor
) {
  requireEmployee(actor);
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `p2-frozen-demand:${projectId}`,
    ]);
    const preview = await previewFrozenProductionDemand(projectId, tx);
    const result = await tx.query(
      `UPDATE p2_frozen_production_demand_baselines SET status='VALIDATED',validated_by=$4,validated_by_employee_id=$5,validated_by_display_name=$6,validated_at=now(),concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1 AND project_id=$2 AND status='DRAFT' AND concurrency_version=$3 AND preview_checksum=$7 RETURNING *`,
      [
        id,
        projectId,
        version,
        actor.userId,
        actor.employeeId,
        actor.displayName,
        preview.checksum,
      ]
    );
    if (!result.rows[0])
      throw new FrozenDemandError(
        'STALE_OR_PREVIEW_MISMATCH',
        'Draft is stale or its authoritative preview changed.',
        409,
        { blockers: preview.blockers }
      );
    await event(tx, id, 'VALIDATED', actor, 'DRAFT', 'VALIDATED', {
      previewChecksum: result.rows[0].preview_checksum,
    });
    await tx.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
export async function releaseFrozenProductionDemand(
  projectId: string,
  id: string,
  version: number,
  signature: string,
  actor: FrozenDemandActor
) {
  requireEmployee(actor);
  if (!clean(signature))
    throw new FrozenDemandError(
      'SIGNATURE_REQUIRED',
      'Release signature meaning is required.'
    );
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `p2-frozen-demand:${projectId}`,
    ]);
    const baseline = (
      await tx.query(
        `SELECT * FROM p2_frozen_production_demand_baselines WHERE id=$1 AND project_id=$2 FOR UPDATE`,
        [id, projectId]
      )
    ).rows[0];
    if (
      baseline?.status === 'RELEASED' &&
      baseline.released_by_employee_id === actor.employeeId &&
      baseline.release_signature_meaning === clean(signature)
    ) {
      await tx.query('COMMIT');
      return baseline;
    }
    if (
      !baseline ||
      baseline.status !== 'VALIDATED' ||
      baseline.concurrency_version !== version
    )
      throw new FrozenDemandError(
        'STALE_BASELINE',
        'Validated baseline is stale or unavailable.',
        409
      );
    if (
      actor.employeeId === baseline.created_by_employee_id ||
      actor.employeeId === baseline.validated_by_employee_id
    )
      throw new FrozenDemandError(
        'INDEPENDENT_RELEASE_REQUIRED',
        'Release requires an employee independent of draft creation and validation.',
        409
      );
    const preview = await previewFrozenProductionDemand(projectId, tx);
    if (
      preview.blockers.length ||
      preview.checksum !== baseline.preview_checksum
    )
      throw new FrozenDemandError(
        'PREVIEW_RELEASE_MISMATCH',
        'Authoritative demand changed after preview; create a new draft.',
        409,
        { blockers: preview.blockers, previewChecksum: preview.checksum }
      );
    if (baseline.supersedes_baseline_id) {
      await tx.query(
        `UPDATE p2_frozen_production_demand_baselines SET status='SUPERSEDED',superseded_by_baseline_id=$2,supersession_reason=$3,updated_at=now() WHERE id=$1 AND status='RELEASED'`,
        [baseline.supersedes_baseline_id, id, baseline.supersession_reason]
      );
      await event(
        tx,
        baseline.supersedes_baseline_id,
        'SUPERSEDED',
        actor,
        'RELEASED',
        'SUPERSEDED',
        { supersededByBaselineId: id },
        signature,
        baseline.supersession_reason
      );
    }
    const result = (
      await tx.query(
        `UPDATE p2_frozen_production_demand_baselines SET status='RELEASED',baseline_checksum=$4,released_by=$5,released_by_employee_id=$6,released_by_display_name=$7,release_signature_meaning=$8,released_at=now(),concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1 AND project_id=$2 AND concurrency_version=$3 RETURNING *`,
        [
          id,
          projectId,
          version,
          preview.checksum,
          actor.userId,
          actor.employeeId,
          actor.displayName,
          signature,
        ]
      )
    ).rows[0];
    await event(
      tx,
      id,
      'RELEASED',
      actor,
      'VALIDATED',
      'RELEASED',
      { baselineChecksum: preview.checksum },
      signature
    );
    await tx.query('COMMIT');
    return result;
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
}
export async function cancelFrozenProductionDemand(
  projectId: string,
  id: string,
  version: number,
  reason: string,
  actor: FrozenDemandActor
) {
  requireEmployee(actor);
  if (!clean(reason))
    throw new FrozenDemandError(
      'REASON_REQUIRED',
      'Cancellation reason is required.'
    );
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    const result = await tx.query(
      `UPDATE p2_frozen_production_demand_baselines SET status='CANCELLED',concurrency_version=concurrency_version+1,updated_at=now() WHERE id=$1 AND project_id=$2 AND status IN ('DRAFT','VALIDATED') AND concurrency_version=$3 RETURNING *`,
      [id, projectId, version]
    );
    if (!result.rows[0])
      throw new FrozenDemandError(
        'STALE_BASELINE',
        'Baseline is stale or cannot be cancelled.',
        409
      );
    await event(
      tx,
      id,
      'CANCELLED',
      actor,
      null,
      'CANCELLED',
      {},
      undefined,
      reason
    );
    await tx.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
