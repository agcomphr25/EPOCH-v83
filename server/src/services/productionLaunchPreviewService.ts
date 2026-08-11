import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2ProductionLaunchPreviewEnabled } from '../lib/featureFlags';
import { ProjectProductionPlanningError } from './projectProductionPlanningService';
import {
  addDemandIdentities,
  demandPlanningChecksum as checksum,
} from './p2DemandPlanningDeterminism';
import {
  resolveProductionLaunchPreview,
  type PreviewBomCandidate,
  type PreviewBomLine,
  type PreviewInventoryItem,
  type PreviewRoutingCandidate,
  type ProductionLaunchPreviewSource,
} from './productionLaunchPreviewResolver';

type Row = Record<string, unknown>;
type Executor = Pick<typeof db, 'execute'>;
const rows = <T extends Row>(value: unknown): T[] =>
  Array.isArray(value)
    ? (value as T[])
    : ((value as { rows?: T[] } | null)?.rows ?? []);

const textArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(String)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

function flatten(
  nodes: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return nodes.flatMap((node) => [
    node,
    ...flatten((node.children as Array<Record<string, unknown>>) ?? []),
  ]);
}

function sourceFor(
  projectId: string,
  tx: Executor
): ProductionLaunchPreviewSource {
  const inventoryCache = new Map<string, PreviewInventoryItem[]>();
  const bomCache = new Map<string, PreviewBomCandidate[]>();
  const lineCache = new Map<string, PreviewBomLine[]>();
  const routingCache = new Map<string, PreviewRoutingCandidate[]>();
  let prepared = false;
  const key = (value: unknown) =>
    String(value ?? '')
      .trim()
      .toUpperCase();
  return {
    async prepare(roots, effectiveAt) {
      const rootPartNumbers = roots.map((root) => root.partNumber.trim());
      const reachable = rows(
        await tx.execute(sql`
          WITH RECURSIVE graph(part_number,path,depth) AS (
            SELECT root.part_number,ARRAY[upper(trim(root.part_number))],0
            FROM unnest(${rootPartNumbers}::text[]) root(part_number)
            UNION
            SELECT bl.child_part_ag_number,
              graph.path||upper(trim(bl.child_part_ag_number)),graph.depth+1
            FROM graph
            JOIN boms b ON upper(trim(b.parent_part_ag_number))=upper(trim(graph.part_number))
            JOIN bom_revisions br ON br.bom_id=b.id
              AND br.is_released=true
              AND (br.effective_from IS NULL OR br.effective_from<=${effectiveAt})
              AND (br.effective_to IS NULL OR br.effective_to>${effectiveAt})
            JOIN bom_lines bl ON bl.revision_id=br.id
            WHERE graph.depth<50
              AND NOT upper(trim(bl.child_part_ag_number))=ANY(graph.path)
          ) SELECT DISTINCT part_number FROM graph ORDER BY part_number`)
      ).map((entry) => String(entry.part_number));
      const partList = sql.join(
        reachable.map((part) => sql`${part}`),
        sql`, `
      );
      if (!reachable.length) {
        prepared = true;
        return;
      }
      const [inventoryRows, bomRows, lineRows, routingRows] = await Promise.all(
        [
          tx.execute(sql`
          SELECT ii.id,ii.ag_part_number,ii.name,ii.description,
            ii.item_type::text,ii.type,ii.manufactured_category::text,
            ii.manufacturing_level::text,ii.usage_unit,
            classification.classification planning_classification,
            classification.revision_number classification_revision,
            classification.source_revision classification_source_revision,
            classification.part_configuration_revision,
            classification.candidate_count classification_candidate_count,
            CASE WHEN lot_totals.lot_count > 0 THEN
              LEAST(COALESCE(balance.quantity_available,0),lot_totals.usable_quantity)
              ELSE COALESCE(balance.quantity_available,0) END available_quantity,
            COALESCE(balance.quantity_allocated,0) allocated_quantity,
            ii.vendor_id,ii.order_url
          FROM inventory_items ii
          LEFT JOIN LATERAL (
            SELECT SUM(ib.quantity_available) quantity_available,
              SUM(ib.quantity_allocated) quantity_allocated
            FROM inventory_balances ib
            WHERE upper(trim(ib.ag_part_number))=upper(trim(ii.ag_part_number))
          ) balance ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*) lot_count,COALESCE(SUM(CASE WHEN ml.status='ACCEPTED'
              AND (ml.expiration_date IS NULL OR ml.expiration_date>=${effectiveAt}::date)
              THEN ml.remaining_qty ELSE 0 END),0) usable_quantity
            FROM material_lots ml WHERE ml.inventory_item_id=ii.id
          ) lot_totals ON true
          LEFT JOIN LATERAL (
            SELECT count(*)::int candidate_count,
              CASE WHEN count(*)=1 THEN max(c.classification) END classification,
              CASE WHEN count(*)=1 THEN max(c.revision_number) END revision_number,
              CASE WHEN count(*)=1 THEN max(c.source_revision) END source_revision,
              CASE WHEN count(*)=1 THEN max(c.part_configuration_revision) END part_configuration_revision
            FROM p2_part_planning_classifications c
            WHERE c.inventory_item_id=ii.id AND c.status='RELEASED'
              AND (c.effective_from IS NULL OR c.effective_from<=${effectiveAt})
              AND (c.effective_to IS NULL OR c.effective_to>${effectiveAt})
          ) classification ON true
          WHERE ii.is_active IS DISTINCT FROM false
            AND ii.ag_part_number IN (${partList}) ORDER BY ii.id`),
          tx.execute(sql`
          SELECT b.parent_part_ag_number,b.id bom_id,br.id revision_id,br.rev_code,
            b.is_active,br.is_released,
            ((br.effective_from IS NULL OR br.effective_from<=${effectiveAt})
              AND (br.effective_to IS NULL OR br.effective_to>${effectiveAt})) is_effective
          FROM boms b JOIN bom_revisions br ON br.bom_id=b.id
          WHERE b.parent_part_ag_number IN (${partList}) ORDER BY b.code,br.rev_code,br.id`),
          tx.execute(sql`
          SELECT bl.id,bl.revision_id,bl.child_part_ag_number,bl.qty_per
          FROM bom_lines bl JOIN bom_revisions br ON br.id=bl.revision_id
          JOIN boms b ON b.id=br.bom_id WHERE b.parent_part_ag_number IN (${partList})
          ORDER BY bl.revision_id,bl.operation_seq,bl.id`),
          tx.execute(sql`
          WITH candidates AS (
            SELECT ppi.part_number,pr.id,ppi.routing_revision,pr.is_active,
              ARRAY(SELECT ro.department_name FROM routing_operations ro
                WHERE ro.part_routing_id=pr.id ORDER BY ro.step_number,ro.id) department_sequence,
              pct.approval_status,1 precedence
            FROM project_production_plans pp
            JOIN project_production_plan_items ppi ON ppi.production_plan_id=pp.id
            JOIN part_routings pr ON pr.id=ppi.routing_id
            LEFT JOIN production_control_templates pct ON pct.id=pr.created_from_template_id
            WHERE pp.project_id=${projectId} AND pp.status='RELEASED' AND ppi.part_number IN (${partList})
            UNION ALL
            SELECT pr.part_number,pr.id,pr.routing_revision,pr.is_active,
              ARRAY(SELECT ro.department_name FROM routing_operations ro
                WHERE ro.part_routing_id=pr.id ORDER BY ro.step_number,ro.id),
              pct.approval_status,3 precedence
            FROM part_routings pr
            LEFT JOIN production_control_templates pct ON pct.id=pr.created_from_template_id
            WHERE pr.part_number IN (${partList}) AND (pr.project_id=${projectId} OR pr.project_id IS NULL)
          ) SELECT * FROM candidates ORDER BY part_number,precedence,routing_revision DESC,id`),
        ]
      );
      for (const entry of rows(inventoryRows)) {
        const mapped: PreviewInventoryItem = {
          id: Number(entry.id),
          partNumber: String(entry.ag_part_number),
          description:
            String(entry.description ?? entry.name ?? '').trim() || null,
          itemType: String(entry.item_type ?? entry.type ?? '').trim() || null,
          planningClassification:
            (String(
              entry.planning_classification ?? ''
            ).trim() as PreviewInventoryItem['planningClassification']) || null,
          classificationRevision:
            entry.classification_revision == null
              ? null
              : Number(entry.classification_revision),
          classificationSourceRevision:
            String(entry.classification_source_revision ?? '').trim() || null,
          partConfigurationRevision:
            String(entry.part_configuration_revision ?? '').trim() || null,
          classificationCandidateCount: Number(
            entry.classification_candidate_count ?? 0
          ),
          manufacturedCategory:
            String(entry.manufactured_category ?? '').trim() || null,
          manufacturingLevel:
            String(entry.manufacturing_level ?? '').trim() || null,
          unitOfMeasure: String(entry.usage_unit ?? '').trim() || null,
          availableQuantity: Number(entry.available_quantity ?? 0),
          allocatedQuantity: Number(entry.allocated_quantity ?? 0),
          vendorId: entry.vendor_id == null ? null : Number(entry.vendor_id),
          orderUrl: String(entry.order_url ?? '').trim() || null,
        };
        inventoryCache.set(key(mapped.partNumber), [
          ...(inventoryCache.get(key(mapped.partNumber)) ?? []),
          mapped,
        ]);
      }
      for (const entry of rows(bomRows)) {
        const mapped: PreviewBomCandidate = {
          bomId: String(entry.bom_id),
          revisionId: String(entry.revision_id),
          revision: String(entry.rev_code),
          isActive: entry.is_active === true,
          isReleased: entry.is_released === true,
          isEffective: entry.is_effective === true,
        };
        const part = key(entry.parent_part_ag_number);
        bomCache.set(part, [...(bomCache.get(part) ?? []), mapped]);
      }
      for (const entry of rows(lineRows)) {
        const mapped: PreviewBomLine = {
          id: String(entry.id),
          childPartNumber: String(entry.child_part_ag_number),
          quantityPerParent: Number(entry.qty_per),
        };
        const revision = String(entry.revision_id);
        lineCache.set(revision, [...(lineCache.get(revision) ?? []), mapped]);
      }
      for (const entry of rows(routingRows)) {
        const mapped: PreviewRoutingCandidate = {
          id: String(entry.id),
          revision: String(entry.routing_revision ?? ''),
          isActive: entry.is_active === true,
          releaseStatus: String(entry.approval_status ?? '').trim() || null,
          departmentSequence: textArray(entry.department_sequence),
          precedence: Number(entry.precedence) === 1 ? 1 : 3,
        };
        const part = key(entry.part_number);
        routingCache.set(part, [...(routingCache.get(part) ?? []), mapped]);
      }
      prepared = true;
    },
    async findInventory(partNumber, inventoryItemId, effectiveAt) {
      if (prepared) {
        const matches = inventoryCache.get(key(partNumber)) ?? [];
        return inventoryItemId == null
          ? matches
          : matches.filter((entry) => entry.id === inventoryItemId);
      }
      const result = rows(
        await tx.execute(sql`
        SELECT ii.id,ii.ag_part_number,ii.name,ii.description,
          ii.item_type::text,ii.type,ii.manufactured_category::text,
          ii.manufacturing_level::text,ii.usage_unit,
          classification.classification planning_classification,
          classification.revision_number classification_revision,
          classification.source_revision classification_source_revision,
          classification.part_configuration_revision,
          classification.candidate_count classification_candidate_count,
          CASE
            WHEN lot_totals.lot_count > 0 THEN
              LEAST(COALESCE(balance.quantity_available,0),lot_totals.usable_quantity)
            ELSE COALESCE(balance.quantity_available,0)
          END available_quantity,
          COALESCE(balance.quantity_allocated,0) allocated_quantity,
          ii.vendor_id,ii.order_url
        FROM inventory_items ii
        LEFT JOIN LATERAL (
          SELECT SUM(ib.quantity_available) quantity_available,
            SUM(ib.quantity_allocated) quantity_allocated
          FROM inventory_balances ib
          WHERE upper(trim(ib.ag_part_number))=upper(trim(ii.ag_part_number))
        ) balance ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) lot_count,
            COALESCE(SUM(CASE
              WHEN ml.status='ACCEPTED'
                AND (ml.expiration_date IS NULL OR ml.expiration_date>=CURRENT_DATE)
              THEN ml.remaining_qty ELSE 0 END),0) usable_quantity
          FROM material_lots ml WHERE ml.inventory_item_id=ii.id
        ) lot_totals ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int candidate_count,
            CASE WHEN count(*)=1 THEN max(c.classification) END classification,
            CASE WHEN count(*)=1 THEN max(c.revision_number) END revision_number,
            CASE WHEN count(*)=1 THEN max(c.source_revision) END source_revision,
            CASE WHEN count(*)=1 THEN max(c.part_configuration_revision) END part_configuration_revision
          FROM p2_part_planning_classifications c
          WHERE c.inventory_item_id=ii.id AND c.status='RELEASED'
            AND (c.effective_from IS NULL OR c.effective_from<=${effectiveAt})
            AND (c.effective_to IS NULL OR c.effective_to>${effectiveAt})
        ) classification ON true
        WHERE ii.is_active IS DISTINCT FROM false
          AND (${inventoryItemId}::int IS NULL OR ii.id=${inventoryItemId})
          AND (${inventoryItemId}::int IS NOT NULL OR upper(trim(ii.ag_part_number))=upper(trim(${partNumber})))
        ORDER BY ii.id`)
      );
      return result.map(
        (entry): PreviewInventoryItem => ({
          id: Number(entry.id),
          partNumber: String(entry.ag_part_number),
          description:
            String(entry.description ?? entry.name ?? '').trim() || null,
          itemType: String(entry.item_type ?? entry.type ?? '').trim() || null,
          planningClassification:
            (String(
              entry.planning_classification ?? ''
            ).trim() as PreviewInventoryItem['planningClassification']) || null,
          classificationRevision:
            entry.classification_revision == null
              ? null
              : Number(entry.classification_revision),
          classificationSourceRevision:
            String(entry.classification_source_revision ?? '').trim() || null,
          partConfigurationRevision:
            String(entry.part_configuration_revision ?? '').trim() || null,
          classificationCandidateCount: Number(
            entry.classification_candidate_count ?? 0
          ),
          manufacturedCategory:
            String(entry.manufactured_category ?? '').trim() || null,
          manufacturingLevel:
            String(entry.manufacturing_level ?? '').trim() || null,
          unitOfMeasure: String(entry.usage_unit ?? '').trim() || null,
          availableQuantity: Number(entry.available_quantity ?? 0),
          allocatedQuantity: Number(entry.allocated_quantity ?? 0),
          vendorId: entry.vendor_id == null ? null : Number(entry.vendor_id),
          orderUrl: String(entry.order_url ?? '').trim() || null,
        })
      );
    },

    async findBoms(partNumber, effectiveAt) {
      if (prepared) return bomCache.get(key(partNumber)) ?? [];
      const result = rows(
        await tx.execute(sql`
        SELECT b.id bom_id,br.id revision_id,br.rev_code,
          b.is_active,
          br.is_released,
          ((br.effective_from IS NULL OR br.effective_from<=${effectiveAt})
            AND (br.effective_to IS NULL OR br.effective_to>${effectiveAt})) is_effective
        FROM boms b
        JOIN bom_revisions br ON br.bom_id=b.id
        WHERE upper(trim(b.parent_part_ag_number))=upper(trim(${partNumber}))
        ORDER BY b.code,br.rev_code,br.id`)
      );
      return result.map(
        (entry): PreviewBomCandidate => ({
          bomId: String(entry.bom_id),
          revisionId: String(entry.revision_id),
          revision: String(entry.rev_code),
          isActive: entry.is_active === true,
          isReleased: entry.is_released === true,
          isEffective: entry.is_effective === true,
        })
      );
    },

    async getBomLines(revisionId) {
      if (prepared) return lineCache.get(revisionId) ?? [];
      const result = rows(
        await tx.execute(sql`
        SELECT id,child_part_ag_number,qty_per
        FROM bom_lines WHERE revision_id=${revisionId}
        ORDER BY operation_seq,id`)
      );
      return result.map(
        (entry): PreviewBomLine => ({
          id: String(entry.id),
          childPartNumber: String(entry.child_part_ag_number),
          quantityPerParent: Number(entry.qty_per),
        })
      );
    },

    async findRoutings(partNumber) {
      if (prepared) return routingCache.get(key(partNumber)) ?? [];
      const frozen = rows(
        await tx.execute(sql`
        SELECT DISTINCT ppi.routing_id id,ppi.routing_revision,
          pr.is_active,
          ARRAY(SELECT ro.department_name FROM routing_operations ro
            WHERE ro.part_routing_id=pr.id ORDER BY ro.step_number,ro.id) department_sequence,
          pct.approval_status
        FROM project_production_plans pp
        JOIN project_production_plan_items ppi ON ppi.production_plan_id=pp.id
        JOIN part_routings pr ON pr.id=ppi.routing_id
        LEFT JOIN production_control_templates pct ON pct.id=pr.created_from_template_id
        WHERE pp.project_id=${projectId} AND pp.status='RELEASED'
          AND upper(trim(ppi.part_number))=upper(trim(${partNumber}))
          AND ppi.routing_id IS NOT NULL`)
      );
      const live = frozen.length
        ? []
        : rows(
            await tx.execute(sql`
        SELECT pr.id,pr.routing_revision,pr.is_active,
          ARRAY(SELECT ro.department_name FROM routing_operations ro
            WHERE ro.part_routing_id=pr.id ORDER BY ro.step_number,ro.id) department_sequence,
          pct.approval_status
        FROM part_routings pr
        LEFT JOIN production_control_templates pct ON pct.id=pr.created_from_template_id
        WHERE upper(trim(pr.part_number))=upper(trim(${partNumber}))
          AND (pr.project_id=${projectId} OR pr.project_id IS NULL)
        ORDER BY (pr.project_id=${projectId}) DESC,pr.routing_revision DESC,pr.id`)
          );
      return [
        ...frozen.map((entry) => ({ entry, precedence: 1 as const })),
        ...live.map((entry) => ({ entry, precedence: 3 as const })),
      ].map(
        ({ entry, precedence }): PreviewRoutingCandidate => ({
          id: String(entry.id),
          revision: String(entry.routing_revision ?? ''),
          isActive: entry.is_active === true,
          releaseStatus: String(entry.approval_status ?? '').trim() || null,
          departmentSequence: textArray(entry.department_sequence),
          precedence,
        })
      );
    },
  };
}

export async function getProductionLaunchPreview(
  projectId: string,
  effectiveAt = new Date()
) {
  if (!isP2V2ProductionLaunchPreviewEnabled())
    throw new ProjectProductionPlanningError(
      'P2_V2_PRODUCTION_LAUNCH_PREVIEW_DISABLED',
      'Recursive Production Launch preview is disabled pending Phase 1 validation.',
      503
    );

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    return buildProductionLaunchPreview(projectId, effectiveAt, tx, 'SHARE');
  });
}

/** Rebuilds the authoritative preview inside a caller-owned transaction. */
export async function buildProductionLaunchPreview(
  projectId: string,
  effectiveAt: Date,
  tx: Executor,
  projectLock: 'SHARE' | 'UPDATE' = 'SHARE'
) {
  const authorityEffectiveAt = new Date(
    `${effectiveAt.toISOString().slice(0, 10)}T00:00:00.000Z`
  );
  const project = rows(
    await tx.execute(
      projectLock === 'UPDATE'
        ? sql`SELECT id,project_code,workflow_version,po_id,current_stage FROM projects WHERE id=${projectId} FOR UPDATE`
        : sql`SELECT id,project_code,workflow_version,po_id,current_stage FROM projects WHERE id=${projectId} FOR SHARE`
    )
  )[0];
  if (!project)
    throw new ProjectProductionPlanningError(
      'PROJECT_NOT_FOUND',
      'Project not found.',
      404
    );
  if (project.workflow_version !== 'p2_v2')
    throw new ProjectProductionPlanningError(
      'P2_V2_REQUIRED',
      'Production Launch preview applies only to p2_v2 projects.',
      409
    );
  const poId = Number(project.po_id);
  if (!Number.isInteger(poId))
    throw new ProjectProductionPlanningError(
      'CURRENT_PO_REQUIRED',
      'A linked P2 PO is required.',
      409
    );
  const rootRows = rows(
    await tx.execute(sql`
      SELECT poi.id,poi.part_number,poi.quantity original_quantity,
        (poi.quantity+COALESCE(SUM(e.quantity_delta),0))::numeric effective_quantity,
        poi.inventory_item_id,poi.due_date,poi.demand_line_identity,
        COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.effective_at,e.id)
          FILTER (WHERE e.id IS NOT NULL),'[]'::jsonb) customer_demand_events
      FROM p2_purchase_order_items poi
      LEFT JOIN p2_customer_demand_quantity_events e
        ON e.po_item_id=poi.id AND e.demand_line_identity=poi.demand_line_identity
      WHERE poi.po_id=${poId}
      GROUP BY poi.id ORDER BY poi.id`)
  );
  if (!rootRows.length)
    throw new ProjectProductionPlanningError(
      'PO_ITEMS_REQUIRED',
      'The linked P2 PO has no line items.',
      409
    );

  const preview = await resolveProductionLaunchPreview(
    rootRows.map((entry) => {
      const events = Array.isArray(entry.customer_demand_events)
        ? entry.customer_demand_events
        : [];
      const originalQuantity = Number(entry.original_quantity);
      const effectiveQuantity = Number(entry.effective_quantity);
      const snapshot = {
        demandLineIdentity: String(entry.demand_line_identity),
        originalQuantity,
        effectiveQuantity,
        events,
      };
      return {
        poItemId: Number(entry.id),
        partNumber: String(entry.part_number),
        quantity: effectiveQuantity,
        inventoryItemId:
          entry.inventory_item_id == null
            ? null
            : Number(entry.inventory_item_id),
        requiredByDate: entry.due_date == null ? null : String(entry.due_date),
        demandLineIdentity: String(entry.demand_line_identity),
        originalCustomerQuantity: originalQuantity,
        effectiveCustomerQuantity: effectiveQuantity,
        customerDemandEventDigest: createHash('sha256')
          .update(JSON.stringify(snapshot))
          .digest('hex'),
        customerDemandSnapshot: snapshot,
      };
    }),
    sourceFor(projectId, tx as Executor),
    authorityEffectiveAt
  );
  const identifiedNodes = addDemandIdentities(
    preview.nodes as unknown as Array<Record<string, unknown>>,
    { projectId, poId }
  );
  const demandLines = flatten(identifiedNodes);
  const totalFor = (classification: string) => {
    const matching = demandLines.filter(
      (line) => line.classification === classification
    );
    return {
      lineCount: matching.length,
      grossQuantity: matching.reduce(
        (sum, line) => sum + Number(line.extendedProjectQuantity ?? 0),
        0
      ),
    };
  };
  const totals = {
    manufactured: totalFor('MANUFACTURED'),
    purchased: totalFor('PURCHASED'),
    rawMaterial: totalFor('RAW_MATERIAL'),
    customerSupplied: totalFor('CUSTOMER_SUPPLIED'),
  };
  const sourceEvidence = {
    projectId,
    poId,
    effectiveAt: authorityEffectiveAt.toISOString(),
    roots: rootRows.map((entry) => ({
      poItemId: Number(entry.id),
      demandLineIdentity: String(entry.demand_line_identity),
      partNumber: String(entry.part_number),
      originalQuantity: Number(entry.original_quantity),
      effectiveQuantity: Number(entry.effective_quantity),
    })),
    selectedSources: demandLines.map((line) => ({
      demandIdentity: line.demandIdentity,
      inventoryItemId: line.inventoryItemId,
      partNumber: line.partNumber,
      partRevision: line.revision,
      classification: line.classification,
      bomRevisionId: line.bomRevisionId,
      routingId: line.routingId,
      routingRevision: line.routingRevision,
    })),
  };
  const sourceChecksum = checksum(sourceEvidence);
  const deterministicEvidence = {
    explosionVersion: 'P2_DEMAND_EXPLOSION_V1',
    sourceChecksum,
    nodes: identifiedNodes,
    blockers: preview.blockers,
    totals,
  };
  return {
    mode: 'PREVIEW_ONLY' as const,
    createsRecords: false,
    project: {
      id: String(project.id),
      code: String(project.project_code),
      poId,
      stage: String(project.current_stage ?? ''),
    },
    generatedAt: new Date().toISOString(),
    effectiveAt: authorityEffectiveAt.toISOString(),
    explosionVersion: 'P2_DEMAND_EXPLOSION_V1' as const,
    sourceChecksum,
    resultChecksum: checksum(deterministicEvidence),
    totals,
    authority: {
      bom: 'boms / bom_revisions / bom_lines',
      excludesDraftBomTables: true,
      routingPrecedence: [
        'released project production plan frozen routing',
        'BOM-line routing unavailable in the current schema',
        'live routing fallback blocks because revision effectivity cannot be proven',
      ],
    },
    inventoryNetting: {
      status: 'ESTIMATE' as const,
      policy:
        'Sum inventory_balances availability; when lots exist, cap it at accepted, unexpired remaining lot quantity.',
      excludedLotStatuses: [
        'QUARANTINE',
        'REJECTED',
        'EXPIRED',
        'HOLD',
        'LOCKED',
        'ISSUED',
        'CONSUMED',
        'SCRAPPED',
      ],
      createsAllocations: false,
    },
    limitations: [
      'Preview quantities are estimates and do not reserve or allocate inventory.',
      'The current BOM-line schema has no controlled routing reference.',
      'Live routing fallback is reported as a blocker until revision and effectivity can be proven.',
    ],
    ...preview,
    nodes: identifiedNodes,
  };
}
