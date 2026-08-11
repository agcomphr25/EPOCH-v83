import { sql } from 'drizzle-orm';

import { db } from '../../db';
import { isP2V2ProductionLaunchPreviewEnabled } from '../lib/featureFlags';
import { ProjectProductionPlanningError } from './projectProductionPlanningService';
import {
  resolveProductionLaunchPreview,
  type PreviewBomCandidate,
  type PreviewBomLine,
  type PreviewInventoryItem,
  type PreviewRoutingCandidate,
  type ProductionLaunchPreviewSource,
} from './productionLaunchPreviewResolver';

type Row = Record<string, unknown>;
type Executor = typeof db;
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

function sourceFor(
  projectId: string,
  tx: Executor
): ProductionLaunchPreviewSource {
  return {
    async findInventory(partNumber, inventoryItemId) {
      const result = rows(
        await tx.execute(sql`
        SELECT ii.id,ii.ag_part_number,ii.name,ii.description,
          ii.item_type::text,ii.type,ii.manufactured_category::text,
          ii.manufacturing_level::text,ii.usage_unit,
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

export async function getProductionLaunchPreview(projectId: string) {
  if (!isP2V2ProductionLaunchPreviewEnabled())
    throw new ProjectProductionPlanningError(
      'P2_V2_PRODUCTION_LAUNCH_PREVIEW_DISABLED',
      'Recursive Production Launch preview is disabled pending Phase 1 validation.',
      503
    );

  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    const project = rows(
      await tx.execute(sql`
      SELECT id,project_code,workflow_version,po_id,current_stage
      FROM projects WHERE id=${projectId} FOR SHARE`)
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
      SELECT id,part_number,quantity,inventory_item_id,due_date
      FROM p2_purchase_order_items WHERE po_id=${poId} ORDER BY id`)
    );
    if (!rootRows.length)
      throw new ProjectProductionPlanningError(
        'PO_ITEMS_REQUIRED',
        'The linked P2 PO has no line items.',
        409
      );

    const preview = await resolveProductionLaunchPreview(
      rootRows.map((entry) => ({
        poItemId: Number(entry.id),
        partNumber: String(entry.part_number),
        quantity: Number(entry.quantity),
        inventoryItemId:
          entry.inventory_item_id == null
            ? null
            : Number(entry.inventory_item_id),
        requiredByDate: entry.due_date == null ? null : String(entry.due_date),
      })),
      sourceFor(projectId, tx as Executor)
    );
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
    };
  });
}
