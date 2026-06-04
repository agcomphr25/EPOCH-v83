/**
 * Material Traceability Service — Task #147 (Phase 3)
 *
 * Read-only chain reconstruction over inventory_transaction_ledger joined to
 * business entities (lots, travelers, WADs, charge codes, projects, NCRs).
 *
 * The service NEVER writes to the ledger. The single authorized writer remains
 * `materialIssueService` and `inventoryTransactionLedgerService.recordInventoryLedgerEntry`.
 *
 * Pure helpers (mapTransactionToStep, buildBranchesAndEdges, exportChainCsv,
 * verifyChainNodes, deriveSourceLink) are exported separately so they can be
 * unit-tested without touching the database.
 */

import crypto from 'crypto';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import {
  chargeCodes,
  cuttingFabricInventory,
  employees,
  inventoryItems,
  inventoryTransactionLedger,
  materialLots,
  nonconformanceRecords,
  p2SerializedItems,
  p2SerializedItemTraceability,
  productionWorkOrders,
  projects,
  travelers,
  travelerSteps,
  users,
  type InventoryTransactionLedger,
} from '../../schema';
import { verifyInventoryLedgerHashesByIds } from './inventoryTransactionLedgerService';
import { resolveTravelerBarcode } from '../helpers/travelerBarcodeResolver';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type TraceabilitySearchKey =
  | 'lotIcn'
  | 'rollNumber'
  | 'serializedItemNumber'
  | 'travelerNumber'
  | 'workOrder'
  | 'chargeCode'
  | 'project'
  | 'operatorBadge'
  | 'ncrId'
  | 'barcode';

export const TRACEABILITY_SEARCH_KEYS: readonly TraceabilitySearchKey[] = [
  'lotIcn',
  'rollNumber',
  'serializedItemNumber',
  'travelerNumber',
  'workOrder',
  'chargeCode',
  'project',
  'operatorBadge',
  'ncrId',
  'barcode',
] as const;

export interface TraceabilitySearchInput {
  key: TraceabilitySearchKey;
  value: string;
}

export type NarrativeStep =
  | 'RECEIVED'
  | 'PUT_AWAY'
  | 'TRANSFERRED'
  | 'RESERVED'
  | 'UNRESERVED'
  | 'ISSUED'
  | 'CONSUMED'
  | 'STATUS_CHANGED'
  | 'QUARANTINED'
  | 'RELEASED'
  | 'SCRAPPED'
  | 'ADJUSTED'
  | 'COUNT_ADJUSTED'
  | 'SPLIT'
  | 'MERGED'
  | 'EXPIRED'
  | 'RETURNED'
  | 'REVERSED';

export interface SourceLink {
  module: string;
  recordId: string | null;
  href: string | null; // null when no front-end deep link is known
  label: string;
}

export interface TraceabilityNode {
  id: string;
  transactionNumber: string;
  step: NarrativeStep;
  transactionType: string;
  occurredAt: string;
  agPartNumber: string;
  partName: string | null;
  lotId: string | null;
  lotIcn: string | null;
  locationId: string | null;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  unitOfMeasure: string;
  statusBefore: string | null;
  statusAfter: string | null;
  performedByDisplayName: string;
  performedByUserId: number | null;
  approvedByUserId: number | null;
  approvedByDisplayName: string | null;
  approvalId: string | null;
  digitalSignatureId: string | null;
  travelerId: string | null;
  travelerNumber: string | null;
  travelerStepId: string | null;
  travelerStepName: string | null;
  productionWorkOrderId: string | null;
  workOrderNumber: string | null;
  chargeCodeId: number | null;
  chargeCode: string | null;
  projectId: string | null;
  projectName: string | null;
  reasonCode: string | null;
  notes: string | null;
  sourceModule: string;
  sourceRecordId: string | null;
  sourceLink: SourceLink;
  ledgerLink: string;
  eventHash: string;
  reversedTransactionId: string | null;
  metadata: Record<string, unknown> | null;
  branchKey: string;
}

export interface TraceabilityEdge {
  from: string;
  to: string;
  kind: 'lineage' | 'reversal';
}

export interface TraceabilityBranch {
  key: string;
  label: string;
  rootIds: string[];
  nodeIds: string[];
}

export interface TraceabilityGenealogyStage {
  stage:
    | 'raw_material_lot'
    | 'kit'
    | 'traveler'
    | 'assembly'
    | 'serial_number'
    | 'shipment';
  label: string;
  evidenceIds: string[];
  occurredAt: string | null;
  status: string | null;
}

export interface ResolvedTarget {
  label: string;
  detail?: string;
  matchedEntities: Array<{ kind: string; id: string; label: string; href: string | null }>;
  /**
   * True when the search anchor (e.g. traveler number) could not be matched
   * to any underlying entity. Distinguishes "no such traveler" from "the
   * traveler exists but has no ledger events yet". Consumers should surface
   * different empty-state messaging based on this flag.
   */
  notFound?: boolean;
}

export interface TraceabilityChain {
  query: TraceabilitySearchInput;
  resolved: ResolvedTarget;
  nodes: TraceabilityNode[];
  edges: TraceabilityEdge[];
  branches: TraceabilityBranch[];
  genealogy: TraceabilityGenealogyStage[];
  travelerCaptures: TravelerMaterialCapture[];
  expiringMaterials: ExpiringMaterial[];
  ncrs: Array<{
    id: number;
    rmaNumber: string | null;
    issueCause: string;
    disposition: string;
    status: string | null;
    dispositionDate: string;
    href: string;
  }>;
  generatedAt: string;
}

export interface TravelerMaterialCapture {
  id: string;
  source: 'p2_serialized_item_traceability' | 'p2_work_tasks.traceability_data';
  serializedItemId: string;
  serialNumber: string;
  barcode: string;
  travelerBarcode: string | null;
  poNumber: string;
  partNumber: string;
  partName: string;
  status: string;
  currentDepartment: string;
  department: string;
  travelerId: string | null;
  travelerNumber: string | null;
  travelerStatus: string | null;
  workOrderNumber: string | null;
  projectName: string | null;
  inventoryPartNumber: string | null;
  traceabilityType: string;
  traceabilityLabel: string;
  traceabilityValue: string;
  recordedBy: string;
  recordedAt: string;
  materialIcn: string | null;
  materialRollNumber: string | null;
  materialExpirationDate: string | null;
  materialStatus: string | null;
  materialLocation: string | null;
  href: string;
}

export interface ExpiringMaterial {
  id: string;
  source: 'material_lots' | 'cutting_fabric_inventory';
  internalControlNumber: string | null;
  rollNumber: string | null;
  materialPartNumber: string | null;
  materialName: string | null;
  status: string | null;
  location: string | null;
  expirationDate: string;
  daysUntilExpiration: number;
  quantityRemaining: string | null;
  href: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

export function mapTransactionToStep(type: string): NarrativeStep {
  switch (type) {
    case 'RECEIVE':           return 'RECEIVED';
    case 'MOVE':              return 'PUT_AWAY';
    case 'TRANSFER':          return 'TRANSFERRED';
    case 'RESERVE':           return 'RESERVED';
    case 'UNRESERVE':         return 'UNRESERVED';
    case 'ISSUE':             return 'ISSUED';
    case 'CONSUME':           return 'CONSUMED';
    case 'STATUS_CHANGE':     return 'STATUS_CHANGED';
    case 'QUARANTINE':        return 'QUARANTINED';
    case 'RELEASE':           return 'RELEASED';
    case 'SCRAP':             return 'SCRAPPED';
    case 'ADJUST':            return 'ADJUSTED';
    case 'COUNT_ADJUSTMENT':  return 'COUNT_ADJUSTED';
    case 'SPLIT':             return 'SPLIT';
    case 'MERGE':             return 'MERGED';
    case 'EXPIRE':            return 'EXPIRED';
    case 'RETURN':            return 'RETURNED';
    case 'REVERSAL':          return 'REVERSED';
    default:                  return 'STATUS_CHANGED';
  }
}

/** Resolve a `source_module` + `source_record_id` to a front-end deep link. */
export function deriveSourceLink(
  sourceModule: string,
  sourceRecordId: string | null,
): SourceLink {
  const id = sourceRecordId ?? null;
  const mod = (sourceModule ?? '').toLowerCase();
  let href: string | null = null;
  let label = sourceModule;

  switch (mod) {
    case 'receiving':
    case 'receipt':
    case 'rcc':
      href = id ? `/inventory/receiving?receiptId=${encodeURIComponent(id)}` : '/inventory/receiving';
      label = 'Receiving record';
      break;
    case 'po':
    case 'purchase_order':
    case 'vendor_po':
      href = id ? `/vendor-po?poId=${encodeURIComponent(id)}` : '/vendor-po';
      label = 'Vendor PO';
      break;
    case 'material-issue':
    case 'material_issue':
    case 'parts-request':
    case 'parts_request':
      href = id ? `/inventory/parts-request?id=${encodeURIComponent(id)}` : '/inventory/parts-request';
      label = 'Material issue';
      break;
    case 'ncr':
    case 'nonconformance':
      href = '/nonconformance';
      label = id ? `NCR #${id}` : 'NCR';
      break;
    case 'kickback':
      href = '/kickback-tracking';
      label = 'Kickback';
      break;
    case 'wad':
    case 'work_order':
    case 'production_work_order':
      href = id ? `/manufacturing-queue?search=${encodeURIComponent(id)}` : '/manufacturing-queue';
      label = 'Work order / WAD';
      break;
    case 'traveler':
      href = id ? `/manufacturing-queue?search=${encodeURIComponent(id)}` : '/manufacturing-queue';
      label = 'Traveler';
      break;
    case 'packing-slip':
    case 'packing_slip':
    case 'p2_packing_slip':
      href = id ? `/p2/packing-slips?id=${encodeURIComponent(id)}` : '/p2/packing-slips';
      label = 'Packing slip';
      break;
    case 'scrap':
      href = '/finance/scrap-report';
      label = 'Scrap';
      break;
    case 'cycle_count':
    case 'count':
      href = '/inventory/scanner';
      label = 'Cycle count';
      break;
    default:
      href = null;
      label = sourceModule;
  }

  return { module: sourceModule, recordId: id, href, label };
}

export function buildBranchesAndEdges(
  nodes: TraceabilityNode[],
): { edges: TraceabilityEdge[]; branches: TraceabilityBranch[] } {
  const byBranch = new Map<string, TraceabilityNode[]>();
  for (const n of nodes) {
    const arr = byBranch.get(n.branchKey) ?? [];
    arr.push(n);
    byBranch.set(n.branchKey, arr);
  }

  const edges: TraceabilityEdge[] = [];
  const branches: TraceabilityBranch[] = [];
  const idsInChain = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, number>();

  for (const [key, list] of byBranch.entries()) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (let i = 1; i < list.length; i++) {
      edges.push({ from: list[i - 1].id, to: list[i].id, kind: 'lineage' });
      incoming.set(list[i].id, (incoming.get(list[i].id) ?? 0) + 1);
    }
    const first = list[0];
    const labelParts: string[] = [];
    if (first.lotIcn) labelParts.push(`Lot ${first.lotIcn}`);
    if (first.travelerNumber) labelParts.push(`Traveler ${first.travelerNumber}`);
    else if (first.workOrderNumber) labelParts.push(`WO ${first.workOrderNumber}`);
    if (!labelParts.length) labelParts.push(`Part ${first.agPartNumber}`);
    branches.push({
      key,
      label: labelParts.join(' · '),
      rootIds: [], // filled below
      nodeIds: list.map((n) => n.id),
    });
  }

  // Cross-branch lineage: REVERSAL → original
  for (const n of nodes) {
    if (n.reversedTransactionId && idsInChain.has(n.reversedTransactionId)) {
      edges.push({ from: n.reversedTransactionId, to: n.id, kind: 'reversal' });
      incoming.set(n.id, (incoming.get(n.id) ?? 0) + 1);
    }
  }

  // Roots per branch = nodes in that branch with zero incoming edges from anywhere in the chain.
  for (const b of branches) {
    b.rootIds = b.nodeIds.filter((id) => (incoming.get(id) ?? 0) === 0);
    if (b.rootIds.length === 0 && b.nodeIds.length > 0) {
      b.rootIds = [b.nodeIds[0]];
    }
  }

  return { edges, branches };
}

function mergeGenealogyStage(
  stages: Map<string, TraceabilityGenealogyStage>,
  stage: TraceabilityGenealogyStage['stage'],
  label: string | null | undefined,
  node: TraceabilityNode,
  status?: string | null,
): void {
  if (!label) return;
  const key = `${stage}:${label}`;
  const existing = stages.get(key);
  if (existing) {
    if (!existing.evidenceIds.includes(node.id)) existing.evidenceIds.push(node.id);
    if (!existing.occurredAt || node.occurredAt < existing.occurredAt) {
      existing.occurredAt = node.occurredAt;
    }
    if (!existing.status && status) existing.status = status;
    return;
  }
  stages.set(key, {
    stage,
    label,
    evidenceIds: [node.id],
    occurredAt: node.occurredAt,
    status: status ?? null,
  });
}

export function buildGenealogy(nodes: TraceabilityNode[]): TraceabilityGenealogyStage[] {
  const stages = new Map<string, TraceabilityGenealogyStage>();
  for (const n of nodes) {
    mergeGenealogyStage(stages, 'raw_material_lot', n.lotIcn, n, n.statusAfter ?? n.statusBefore);
    const metadata = n.metadata ?? {};
    const packetId =
      typeof metadata.packetId === 'string'
        ? metadata.packetId
        : typeof metadata.builtPacketId === 'string'
          ? metadata.builtPacketId
          : null;
    mergeGenealogyStage(stages, 'kit', packetId, n, n.transactionType);
    mergeGenealogyStage(stages, 'traveler', n.travelerNumber ?? n.travelerId, n, n.transactionType);
    const assembly =
      typeof metadata.assemblyId === 'string'
        ? metadata.assemblyId
        : typeof metadata.assemblyNumber === 'string'
          ? metadata.assemblyNumber
          : null;
    mergeGenealogyStage(stages, 'assembly', assembly, n, n.transactionType);
    const serial =
      typeof metadata.serialNumber === 'string'
        ? metadata.serialNumber
        : typeof metadata.finishedSerialNumber === 'string'
          ? metadata.finishedSerialNumber
          : null;
    mergeGenealogyStage(stages, 'serial_number', serial, n, n.transactionType);
    const sourceModule = n.sourceModule.toLowerCase();
    if (['packing-slip', 'packing_slip', 'p2_packing_slip', 'shipping', 'shipment'].includes(sourceModule)) {
      mergeGenealogyStage(stages, 'shipment', n.sourceRecordId ?? n.transactionNumber, n, n.transactionType);
    }
  }
  const order: Record<TraceabilityGenealogyStage['stage'], number> = {
    raw_material_lot: 1,
    kit: 2,
    traveler: 3,
    assembly: 4,
    serial_number: 5,
    shipment: 6,
  };
  return Array.from(stages.values()).sort((a, b) => {
    const byStage = order[a.stage] - order[b.stage];
    if (byStage !== 0) return byStage;
    return (a.occurredAt ?? '').localeCompare(b.occurredAt ?? '');
  });
}

/** Recompute the canonical event hash for a single ledger row (mirrors writer). */
export function recomputeEventHash(row: InventoryTransactionLedger): string {
  const payload = {
    transactionNumber: row.transactionNumber,
    transactionType: row.transactionType,
    inventoryItemId: row.inventoryItemId,
    agPartNumber: row.agPartNumber,
    lotId: row.lotId,
    locationId: row.locationId,
    quantityDelta: row.quantityDelta,
    quantityBefore: row.quantityBefore,
    quantityAfter: row.quantityAfter,
    unitOfMeasure: row.unitOfMeasure,
    statusBefore: row.statusBefore,
    statusAfter: row.statusAfter,
    performedByUserId: row.performedByUserId,
    performedByDisplayName: row.performedByDisplayName,
    sourceModule: row.sourceModule,
    sourceRecordId: row.sourceRecordId,
    reversedTransactionId: row.reversedTransactionId,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** Pure: verify a fixture array of ledger rows without any DB access. */
export function verifyChainNodes(rows: InventoryTransactionLedger[]): {
  checked: number;
  ok: boolean;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
} {
  const mismatches = rows
    .map((row) => {
      const expected = recomputeEventHash(row);
      return expected === row.eventHash
        ? null
        : {
            id: row.id,
            transactionNumber: row.transactionNumber,
            expectedHash: expected,
            actualHash: row.eventHash,
          };
    })
    .filter((m): m is { id: string; transactionNumber: string; expectedHash: string; actualHash: string } => m !== null);
  return { checked: rows.length, ok: mismatches.length === 0, mismatches };
}

// ─────────────────────────────────────────────────────────────────────
// Search resolution → ledger filter conditions
// ─────────────────────────────────────────────────────────────────────

interface ResolvedSearch {
  label: string;
  detail?: string;
  matchedEntities: Array<{ kind: string; id: string; label: string; href: string | null }>;
  ledgerCondition: SQL | undefined;
  notFound?: boolean;
}

async function resolveSearch(input: TraceabilitySearchInput): Promise<ResolvedSearch> {
  const value = input.value.trim();
  if (!value) {
    throw new Error('Search value is required');
  }

  switch (input.key) {
    case 'lotIcn': {
      const [lot] = await db
        .select()
        .from(materialLots)
        .where(sql`LOWER(${materialLots.internalControlNumber}) = LOWER(${value})`)
        .limit(1);
      if (!lot) {
        return { label: `Lot ICN: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      return {
        label: `Lot ${lot.internalControlNumber}`,
        detail: `${lot.materialName} (${lot.materialPartNumber}) — supplier ${lot.supplier}`,
        matchedEntities: [{
          kind: 'lot',
          id: lot.id,
          label: lot.internalControlNumber,
          href: `/inventory/scanner?lot=${encodeURIComponent(lot.internalControlNumber)}`,
        }],
        ledgerCondition: eq(inventoryTransactionLedger.lotId, lot.id),
      };
    }

    case 'rollNumber': {
      const [fabric] = await db
        .select()
        .from(cuttingFabricInventory)
        .where(
          or(
            sql`LOWER(COALESCE(${cuttingFabricInventory.rollNumber}, '')) = LOWER(${value})`,
            sql`LOWER(COALESCE(${cuttingFabricInventory.internalControlNumber}, '')) = LOWER(${value})`,
            sql`LOWER(COALESCE(${cuttingFabricInventory.lotNumber}, '')) = LOWER(${value})`,
            sql`LOWER(COALESCE(${cuttingFabricInventory.batchNumber}, '')) = LOWER(${value})`,
            sql`LOWER(COALESCE(${cuttingFabricInventory.barcode}, '')) = LOWER(${value})`,
          ),
        )
        .limit(1);
      if (!fabric) {
        return { label: `Roll #: ${value}`, matchedEntities: [], ledgerCondition: undefined, notFound: true };
      }
      return {
        label: `Roll ${fabric.rollNumber ?? value}`,
        detail: `${fabric.fabric ?? fabric.nickname ?? fabric.fabricPartNumber ?? 'Fabric'}${fabric.internalControlNumber ? ` - ICN ${fabric.internalControlNumber}` : ''}`,
        matchedEntities: [{
          kind: 'fabricRoll',
          id: fabric.id,
          label: fabric.rollNumber ?? fabric.internalControlNumber ?? value,
          href: fabric.internalControlNumber
            ? `/inventory/traceability?key=lotIcn&value=${encodeURIComponent(fabric.internalControlNumber)}`
            : null,
        }],
        ledgerCondition: undefined,
      };
    }

    case 'serializedItemNumber': {
      const [item] = await db
        .select()
        .from(p2SerializedItems)
        .where(
          or(
            sql`LOWER(${p2SerializedItems.serialNumber}) = LOWER(${value})`,
            sql`LOWER(${p2SerializedItems.barcode}) = LOWER(${value})`,
            sql`LOWER(COALESCE(${p2SerializedItems.travelerBarcode}, '')) = LOWER(${value})`,
          ),
        )
        .limit(1);
      if (!item) {
        return { label: `Serialized item: ${value}`, matchedEntities: [], ledgerCondition: undefined, notFound: true };
      }
      return {
        label: `Serialized item ${item.serialNumber}`,
        detail: `${item.partNumber} - ${item.partName} - ${item.currentDepartment} - ${item.status}`,
        matchedEntities: [{
          kind: 'serializedItem',
          id: item.id,
          label: item.serialNumber,
          href: `/p2-traveler-viewer?barcode=${encodeURIComponent(item.barcode)}`,
        }],
        ledgerCondition: undefined,
      };
    }

    case 'travelerNumber': {
      // Case-insensitive match on traveler_number; UUID match for direct id;
      // barcode-helper fallback for printable scan payloads (Task #183).
      let [trav] = await db
        .select()
        .from(travelers)
        .where(
          or(
            sql`LOWER(${travelers.travelerNumber}) = LOWER(${value})`,
            eq(travelers.id, value),
          ),
        )
        .limit(1);
      if (!trav) {
        const scan = await resolveTravelerBarcode(value);
        if (scan.ok) {
          const [byScan] = await db
            .select()
            .from(travelers)
            .where(eq(travelers.id, scan.context.travelerId))
            .limit(1);
          if (byScan) trav = byScan;
        }
      }
      if (!trav) {
        return {
          label: `Traveler: ${value}`,
          matchedEntities: [],
          ledgerCondition: sql`FALSE`,
          notFound: true,
        };
      }
      return {
        label: `Traveler ${trav.travelerNumber}`,
        detail: `${trav.partName ?? trav.partNumber ?? ''} — status ${trav.status}`,
        matchedEntities: [{
          kind: 'traveler',
          id: trav.id,
          label: trav.travelerNumber,
          href: `/manufacturing-queue?search=${encodeURIComponent(trav.travelerNumber)}`,
        }],
        ledgerCondition: eq(inventoryTransactionLedger.travelerId, trav.id),
      };
    }

    case 'workOrder': {
      const [wo] = await db
        .select()
        .from(productionWorkOrders)
        .where(or(eq(productionWorkOrders.workOrderNumber, value), eq(productionWorkOrders.id, value)))
        .limit(1);
      if (!wo) {
        return { label: `Work Order / WAD: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      return {
        label: `Work Order ${wo.workOrderNumber}`,
        detail: `${wo.partNumber} — qty ${wo.quantity} — wad ${wo.wadStatus}`,
        matchedEntities: [{
          kind: 'workOrder',
          id: wo.id,
          label: wo.workOrderNumber,
          href: `/manufacturing-queue?search=${encodeURIComponent(wo.workOrderNumber)}`,
        }],
        ledgerCondition: eq(inventoryTransactionLedger.productionWorkOrderId, wo.id),
      };
    }

    case 'chargeCode': {
      const [cc] = await db
        .select()
        .from(chargeCodes)
        .where(eq(chargeCodes.code, value))
        .limit(1);
      if (!cc) {
        return { label: `Charge Code: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      return {
        label: `Charge Code ${cc.code}`,
        detail: cc.description ?? cc.type,
        matchedEntities: [{
          kind: 'chargeCode',
          id: String(cc.id),
          label: cc.code,
          href: '/finance/charge-codes',
        }],
        ledgerCondition: eq(inventoryTransactionLedger.chargeCodeId, cc.id),
      };
    }

    case 'project': {
      const [proj] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, value))
        .limit(1);
      if (!proj) {
        return { label: `Project: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      const projName = proj.projectName ?? proj.projectCode ?? proj.id;
      return {
        label: `Project ${projName}`,
        detail: proj.description ?? undefined,
        matchedEntities: [{
          kind: 'project',
          id: proj.id,
          label: projName,
          href: `/projects/${encodeURIComponent(proj.id)}`,
        }],
        ledgerCondition: eq(inventoryTransactionLedger.projectId, proj.id),
      };
    }

    case 'operatorBadge': {
      const [emp] = await db
        .select()
        .from(employees)
        .where(or(eq(employees.badgeScanCode, value), eq(employees.employeeCode, value)))
        .limit(1);
      if (!emp) {
        return { label: `Operator badge: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      let userId: number | null = null;
      if (emp.email) {
        const [u] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, emp.email))
          .limit(1);
        userId = u?.id ?? null;
      }
      const cond: SQL | undefined = userId != null
        ? or(
            eq(inventoryTransactionLedger.performedByUserId, userId),
            eq(inventoryTransactionLedger.performedByDisplayName, emp.name),
          )
        : eq(inventoryTransactionLedger.performedByDisplayName, emp.name);
      return {
        label: `Operator ${emp.name}`,
        detail: emp.employeeCode ? `Badge ${value} — code ${emp.employeeCode}` : `Badge ${value}`,
        matchedEntities: [{
          kind: 'employee',
          id: String(emp.id),
          label: emp.name,
          href: `/employee?id=${emp.id}`,
        }],
        ledgerCondition: cond,
      };
    }

    case 'ncrId': {
      const numericId = Number(value);
      const ncrCondition: SQL = Number.isFinite(numericId)
        ? or(eq(nonconformanceRecords.id, numericId), eq(nonconformanceRecords.rmaNumber, value))!
        : eq(nonconformanceRecords.rmaNumber, value);
      const [ncr] = await db
        .select()
        .from(nonconformanceRecords)
        .where(ncrCondition)
        .limit(1);
      if (!ncr) {
        return { label: `NCR: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
      }
      return {
        label: `NCR #${ncr.id}${ncr.rmaNumber ? ` (${ncr.rmaNumber})` : ''}`,
        detail: `${ncr.disposition} — ${ncr.issueCause.slice(0, 80)}`,
        matchedEntities: [{
          kind: 'ncr',
          id: String(ncr.id),
          label: ncr.rmaNumber ?? `NCR-${ncr.id}`,
          href: '/nonconformance',
        }],
        ledgerCondition: and(
          eq(inventoryTransactionLedger.sourceModule, 'ncr'),
          eq(inventoryTransactionLedger.sourceRecordId, String(ncr.id)),
        ),
      };
    }

    case 'barcode': {
      const lotMatch = await db
        .select()
        .from(materialLots)
        .where(sql`${materialLots.barcodes}::jsonb @> ${JSON.stringify([value])}::jsonb`)
        .limit(1);
      const lot = lotMatch[0];
      if (lot) {
        return {
          label: `Barcode ${value} → Lot ${lot.internalControlNumber}`,
          detail: `${lot.materialName} (${lot.materialPartNumber})`,
          matchedEntities: [{
            kind: 'lot',
            id: lot.id,
            label: lot.internalControlNumber,
            href: `/inventory/scanner?lot=${encodeURIComponent(lot.internalControlNumber)}`,
          }],
          ledgerCondition: eq(inventoryTransactionLedger.lotId, lot.id),
        };
      }
      // Fall back to ag_part_number match (inventoryItems.barcode does not exist).
      const [item] = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.agPartNumber, value))
        .limit(1);
      if (item) {
        return {
          label: `Barcode ${value} → Part ${item.agPartNumber}`,
          detail: item.name,
          matchedEntities: [{
            kind: 'inventoryItem',
            id: String(item.id),
            label: item.agPartNumber,
            href: `/inventory/manager?part=${encodeURIComponent(item.agPartNumber)}`,
          }],
          ledgerCondition: eq(inventoryTransactionLedger.inventoryItemId, item.id),
        };
      }
      return { label: `Barcode: ${value}`, matchedEntities: [], ledgerCondition: sql`FALSE`, notFound: true };
    }

    default: {
      const exhaustive: never = input.key;
      throw new Error(`Unsupported search key: ${exhaustive}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Chain assembly
// ─────────────────────────────────────────────────────────────────────

const MAX_CHAIN_ROWS = 2000;

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

interface JoinDictionaries {
  lotById: Map<string, typeof materialLots.$inferSelect>;
  itemById: Map<number, typeof inventoryItems.$inferSelect>;
  travById: Map<string, typeof travelers.$inferSelect>;
  stepById: Map<string, typeof travelerSteps.$inferSelect>;
  woById: Map<string, typeof productionWorkOrders.$inferSelect>;
  ccById: Map<number, typeof chargeCodes.$inferSelect>;
  projById: Map<string, typeof projects.$inferSelect>;
}

async function loadJoinDictionaries(rows: InventoryTransactionLedger[]): Promise<JoinDictionaries> {
  const lotIds = Array.from(new Set(rows.map((r) => r.lotId).filter((v): v is string => !!v)));
  const itemIds = Array.from(new Set(rows.map((r) => r.inventoryItemId)));
  const travelerIds = Array.from(new Set(rows.map((r) => r.travelerId).filter((v): v is string => !!v)));
  const stepIds = Array.from(new Set(rows.map((r) => r.travelerStepId).filter((v): v is string => !!v)));
  const woIds = Array.from(new Set(rows.map((r) => r.productionWorkOrderId).filter((v): v is string => !!v)));
  const ccIds = Array.from(new Set(rows.map((r) => r.chargeCodeId).filter((v): v is number => v != null)));
  const projIds = Array.from(new Set(rows.map((r) => r.projectId).filter((v): v is string => !!v)));

  const [lots, items, travs, steps, wos, ccs, projs] = await Promise.all([
    lotIds.length ? db.select().from(materialLots).where(inArray(materialLots.id, lotIds)) : Promise.resolve([]),
    itemIds.length ? db.select().from(inventoryItems).where(inArray(inventoryItems.id, itemIds)) : Promise.resolve([]),
    travelerIds.length ? db.select().from(travelers).where(inArray(travelers.id, travelerIds)) : Promise.resolve([]),
    stepIds.length ? db.select().from(travelerSteps).where(inArray(travelerSteps.id, stepIds)) : Promise.resolve([]),
    woIds.length ? db.select().from(productionWorkOrders).where(inArray(productionWorkOrders.id, woIds)) : Promise.resolve([]),
    ccIds.length ? db.select().from(chargeCodes).where(inArray(chargeCodes.id, ccIds)) : Promise.resolve([]),
    projIds.length ? db.select().from(projects).where(inArray(projects.id, projIds)) : Promise.resolve([]),
  ]);

  return {
    lotById: new Map(lots.map((l) => [l.id, l])),
    itemById: new Map(items.map((i) => [i.id, i])),
    travById: new Map(travs.map((t) => [t.id, t])),
    stepById: new Map(steps.map((s) => [s.id, s])),
    woById: new Map(wos.map((w) => [w.id, w])),
    ccById: new Map(ccs.map((c) => [c.id, c])),
    projById: new Map(projs.map((p) => [p.id, p])),
  };
}

export function nodeFromLedgerRow(
  row: InventoryTransactionLedger,
  d: JoinDictionaries,
): TraceabilityNode {
  const lot = row.lotId ? d.lotById.get(row.lotId) : undefined;
  const item = d.itemById.get(row.inventoryItemId);
  const trav = row.travelerId ? d.travById.get(row.travelerId) : undefined;
  const step = row.travelerStepId ? d.stepById.get(row.travelerStepId) : undefined;
  const wo = row.productionWorkOrderId ? d.woById.get(row.productionWorkOrderId) : undefined;
  const cc = row.chargeCodeId ? d.ccById.get(row.chargeCodeId) : undefined;
  const proj = row.projectId ? d.projById.get(row.projectId) : undefined;

  const branchKey = [row.lotId ?? 'no-lot', row.travelerId ?? row.productionWorkOrderId ?? 'no-job']
    .join('::');

  return {
    id: row.id,
    transactionNumber: row.transactionNumber,
    step: mapTransactionToStep(row.transactionType),
    transactionType: row.transactionType,
    occurredAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : safeStr(row.createdAt),
    agPartNumber: row.agPartNumber,
    partName: item?.name ?? null,
    lotId: row.lotId ?? null,
    lotIcn: lot?.internalControlNumber ?? null,
    locationId: row.locationId ?? null,
    quantityDelta: safeStr(row.quantityDelta),
    quantityBefore: safeStr(row.quantityBefore),
    quantityAfter: safeStr(row.quantityAfter),
    unitOfMeasure: row.unitOfMeasure,
    statusBefore: row.statusBefore ?? null,
    statusAfter: row.statusAfter ?? null,
    performedByDisplayName: row.performedByDisplayName,
    performedByUserId: row.performedByUserId ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    approvedByDisplayName: row.approvedByDisplayName ?? null,
    approvalId: row.approvalId ?? null,
    digitalSignatureId: row.digitalSignatureId ?? null,
    travelerId: row.travelerId ?? null,
    travelerNumber: trav?.travelerNumber ?? null,
    travelerStepId: row.travelerStepId ?? null,
    travelerStepName: step ? `${step.stepNumber}. ${step.departmentName}` : null,
    productionWorkOrderId: row.productionWorkOrderId ?? null,
    workOrderNumber: wo?.workOrderNumber ?? null,
    chargeCodeId: row.chargeCodeId ?? null,
    chargeCode: cc?.code ?? null,
    projectId: row.projectId ?? null,
    projectName: proj?.projectName ?? proj?.projectCode ?? null,
    reasonCode: row.reasonCode ?? null,
    notes: row.notes ?? null,
    sourceModule: row.sourceModule,
    sourceRecordId: row.sourceRecordId ?? null,
    sourceLink: deriveSourceLink(row.sourceModule, row.sourceRecordId ?? null),
    ledgerLink: `/inventory/ledger?id=${encodeURIComponent(row.id)}`,
    eventHash: row.eventHash,
    reversedTransactionId: row.reversedTransactionId ?? null,
    metadata: row.metadata ?? null,
    branchKey,
  };
}

async function loadRelatedNcrs(
  rows: InventoryTransactionLedger[],
): Promise<TraceabilityChain['ncrs']> {
  const ncrIds = rows
    .filter((r) => r.sourceModule === 'ncr' && r.sourceRecordId)
    .map((r) => Number(r.sourceRecordId))
    .filter((n) => Number.isFinite(n));
  if (!ncrIds.length) return [];
  const recs = await db
    .select()
    .from(nonconformanceRecords)
    .where(inArray(nonconformanceRecords.id, Array.from(new Set(ncrIds))));
  return recs.map((r) => ({
    id: r.id,
    rmaNumber: r.rmaNumber,
    issueCause: r.issueCause,
    disposition: r.disposition,
    status: r.status,
    dispositionDate: safeStr(r.dispositionDate),
    href: '/nonconformance',
  }));
}

function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybeRows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

function normalizeDbDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function daysUntil(dateValue: unknown): number {
  const d = new Date(String(dateValue));
  if (Number.isNaN(d.getTime())) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

async function loadTravelerMaterialCaptures(input: TraceabilitySearchInput): Promise<TravelerMaterialCapture[]> {
  const value = input.value.trim();
  if (!value) return [];

  const directRows = await db
    .select({
      id: p2SerializedItemTraceability.id,
      serializedItemId: p2SerializedItems.id,
      serialNumber: p2SerializedItems.serialNumber,
      barcode: p2SerializedItems.barcode,
      travelerBarcode: p2SerializedItems.travelerBarcode,
      poNumber: p2SerializedItems.poNumber,
      partNumber: p2SerializedItems.partNumber,
      partName: p2SerializedItems.partName,
      status: p2SerializedItems.status,
      currentDepartment: p2SerializedItems.currentDepartment,
      department: p2SerializedItemTraceability.department,
      inventoryPartNumber: p2SerializedItemTraceability.inventoryPartNumber,
      traceabilityType: p2SerializedItemTraceability.traceabilityType,
      traceabilityLabel: p2SerializedItemTraceability.traceabilityLabel,
      traceabilityValue: p2SerializedItemTraceability.traceabilityValue,
      recordedBy: p2SerializedItemTraceability.recordedBy,
      recordedAt: p2SerializedItemTraceability.createdAt,
      travelerId: travelers.id,
      travelerNumber: travelers.travelerNumber,
      travelerStatus: travelers.status,
      workOrderNumber: productionWorkOrders.workOrderNumber,
      projectName: projects.projectName,
      materialLotIcn: materialLots.internalControlNumber,
      materialLotExpiration: materialLots.expirationDate,
      materialLotStatus: materialLots.status,
      materialLotLocation: materialLots.storageLocation,
      fabricIcn: cuttingFabricInventory.internalControlNumber,
      fabricRollNumber: cuttingFabricInventory.rollNumber,
      fabricExpiration: cuttingFabricInventory.expirationDate,
      fabricStatus: cuttingFabricInventory.status,
      fabricLocation: cuttingFabricInventory.location,
    })
    .from(p2SerializedItemTraceability)
    .innerJoin(p2SerializedItems, eq(p2SerializedItemTraceability.serializedItemId, p2SerializedItems.id))
    .leftJoin(travelers, eq(travelers.serialNumber, p2SerializedItems.serialNumber))
    .leftJoin(productionWorkOrders, eq(productionWorkOrders.id, travelers.productionWorkOrderId))
    .leftJoin(projects, eq(projects.id, travelers.projectId))
    .leftJoin(materialLots, eq(materialLots.internalControlNumber, p2SerializedItemTraceability.traceabilityValue))
    .leftJoin(
      cuttingFabricInventory,
      or(
        eq(cuttingFabricInventory.internalControlNumber, p2SerializedItemTraceability.traceabilityValue),
        eq(cuttingFabricInventory.rollNumber, p2SerializedItemTraceability.traceabilityValue),
        eq(cuttingFabricInventory.lotNumber, p2SerializedItemTraceability.traceabilityValue),
        eq(cuttingFabricInventory.batchNumber, p2SerializedItemTraceability.traceabilityValue),
        eq(cuttingFabricInventory.barcode, p2SerializedItemTraceability.traceabilityValue),
      ),
    )
    .where(
      or(
        sql`LOWER(${p2SerializedItemTraceability.traceabilityValue}) = LOWER(${value})`,
        sql`LOWER(COALESCE(${p2SerializedItemTraceability.inventoryPartNumber}, '')) = LOWER(${value})`,
        sql`LOWER(${p2SerializedItems.serialNumber}) = LOWER(${value})`,
        sql`LOWER(${p2SerializedItems.barcode}) = LOWER(${value})`,
        sql`LOWER(COALESCE(${p2SerializedItems.travelerBarcode}, '')) = LOWER(${value})`,
        sql`LOWER(COALESCE(${travelers.travelerNumber}, '')) = LOWER(${value})`,
        sql`LOWER(COALESCE(${materialLots.internalControlNumber}, '')) = LOWER(${value})`,
        sql`LOWER(COALESCE(${cuttingFabricInventory.internalControlNumber}, '')) = LOWER(${value})`,
        sql`LOWER(COALESCE(${cuttingFabricInventory.rollNumber}, '')) = LOWER(${value})`,
        sql`LOWER(COALESCE(${cuttingFabricInventory.barcode}, '')) = LOWER(${value})`,
      ),
    )
    .limit(200);

  type WorkTaskCaptureRow = {
    id: string;
    serialized_item_id: string;
    serial_number: string;
    barcode: string;
    traveler_barcode: string | null;
    po_number: string;
    part_number: string;
    part_name: string;
    status: string;
    current_department: string;
    department: string;
    inventory_part_number: string | null;
    traceability_type: string | null;
    traceability_label: string | null;
    traceability_value: string | null;
    recorded_by: string;
    recorded_at: Date | string;
    traveler_id: string | null;
    traveler_number: string | null;
    traveler_status: string | null;
    work_order_number: string | null;
    project_name: string | null;
    material_lot_icn: string | null;
    material_lot_expiration: Date | string | null;
    material_lot_status: string | null;
    material_lot_location: string | null;
    fabric_icn: string | null;
    fabric_roll_number: string | null;
    fabric_expiration: Date | string | null;
    fabric_status: string | null;
    fabric_location: string | null;
  };

  const workTaskResult = await db.execute(sql`
    SELECT
      concat(wt.id::text, ':', entry.ordinality::text) AS id,
      si.id::text AS serialized_item_id,
      si.serial_number,
      si.barcode,
      si.traveler_barcode,
      si.po_number,
      si.part_number,
      si.part_name,
      si.status,
      si.current_department,
      wt.department,
      NULLIF(COALESCE(entry.item->>'partNumber', entry.item->>'inventoryPartNumber'), '') AS inventory_part_number,
      NULLIF(COALESCE(entry.item->>'type', entry.item->>'traceabilityType'), '') AS traceability_type,
      NULLIF(COALESCE(entry.item->>'label', entry.item->>'traceabilityLabel'), '') AS traceability_label,
      NULLIF(COALESCE(entry.item->>'value', entry.item->>'traceabilityValue'), '') AS traceability_value,
      wt.employee_name AS recorded_by,
      COALESCE(wt.completed_at, wt.started_at, wt.created_at) AS recorded_at,
      tr.id::text AS traveler_id,
      tr.traveler_number,
      tr.status AS traveler_status,
      pwo.work_order_number,
      p.project_name,
      ml.internal_control_number AS material_lot_icn,
      ml.expiration_date AS material_lot_expiration,
      ml.status AS material_lot_status,
      ml.storage_location AS material_lot_location,
      cfi.internal_control_number AS fabric_icn,
      cfi.roll_number AS fabric_roll_number,
      cfi.expiration_date AS fabric_expiration,
      cfi.status AS fabric_status,
      cfi.location AS fabric_location
    FROM p2_work_tasks wt
    JOIN p2_serialized_items si ON si.id = wt.serialized_item_id
    LEFT JOIN travelers tr ON tr.serial_number = si.serial_number
    LEFT JOIN production_work_orders pwo ON pwo.id = tr.production_work_order_id
    LEFT JOIN projects p ON p.id = tr.project_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(wt.traceability_data, '[]'::jsonb)) WITH ORDINALITY AS entry(item, ordinality)
    LEFT JOIN material_lots ml ON lower(ml.internal_control_number) = lower(NULLIF(COALESCE(entry.item->>'value', entry.item->>'traceabilityValue'), ''))
    LEFT JOIN cutting_fabric_inventory cfi ON lower(COALESCE(entry.item->>'value', entry.item->>'traceabilityValue', '')) IN (
      lower(COALESCE(cfi.internal_control_number, '')),
      lower(COALESCE(cfi.roll_number, '')),
      lower(COALESCE(cfi.lot_number, '')),
      lower(COALESCE(cfi.batch_number, '')),
      lower(COALESCE(cfi.barcode, ''))
    )
    WHERE
      lower(COALESCE(entry.item->>'value', entry.item->>'traceabilityValue', '')) = lower(${value})
      OR lower(COALESCE(entry.item->>'partNumber', entry.item->>'inventoryPartNumber', '')) = lower(${value})
      OR lower(si.serial_number) = lower(${value})
      OR lower(si.barcode) = lower(${value})
      OR lower(COALESCE(si.traveler_barcode, '')) = lower(${value})
      OR lower(COALESCE(tr.traveler_number, '')) = lower(${value})
      OR lower(COALESCE(ml.internal_control_number, '')) = lower(${value})
      OR lower(COALESCE(cfi.internal_control_number, '')) = lower(${value})
      OR lower(COALESCE(cfi.roll_number, '')) = lower(${value})
      OR lower(COALESCE(cfi.barcode, '')) = lower(${value})
    LIMIT 200
  `);

  const workTaskRows = rowsFromExecute<WorkTaskCaptureRow>(workTaskResult);
  const captures = new Map<string, TravelerMaterialCapture>();

  for (const row of directRows) {
    const materialIcn = row.materialLotIcn ?? row.fabricIcn ?? null;
    const materialExpirationDate = normalizeDbDate(row.materialLotExpiration ?? row.fabricExpiration);
    captures.set(`direct:${row.id}`, {
      id: row.id,
      source: 'p2_serialized_item_traceability',
      serializedItemId: row.serializedItemId,
      serialNumber: row.serialNumber,
      barcode: row.barcode,
      travelerBarcode: row.travelerBarcode ?? null,
      poNumber: row.poNumber,
      partNumber: row.partNumber,
      partName: row.partName,
      status: row.status,
      currentDepartment: row.currentDepartment,
      department: row.department,
      travelerId: row.travelerId ?? null,
      travelerNumber: row.travelerNumber ?? null,
      travelerStatus: row.travelerStatus ?? null,
      workOrderNumber: row.workOrderNumber ?? null,
      projectName: row.projectName ?? null,
      inventoryPartNumber: row.inventoryPartNumber ?? null,
      traceabilityType: row.traceabilityType,
      traceabilityLabel: row.traceabilityLabel,
      traceabilityValue: row.traceabilityValue,
      recordedBy: row.recordedBy,
      recordedAt: normalizeDbDate(row.recordedAt) ?? '',
      materialIcn,
      materialRollNumber: row.fabricRollNumber ?? null,
      materialExpirationDate,
      materialStatus: row.materialLotStatus ?? row.fabricStatus ?? null,
      materialLocation: row.materialLotLocation ?? row.fabricLocation ?? null,
      href: `/p2-traveler-viewer?barcode=${encodeURIComponent(row.barcode)}`,
    });
  }

  for (const row of workTaskRows) {
    if (!row.traceability_value) continue;
    const materialIcn = row.material_lot_icn ?? row.fabric_icn ?? null;
    const materialExpirationDate = normalizeDbDate(row.material_lot_expiration ?? row.fabric_expiration);
    captures.set(`work:${row.id}`, {
      id: row.id,
      source: 'p2_work_tasks.traceability_data',
      serializedItemId: row.serialized_item_id,
      serialNumber: row.serial_number,
      barcode: row.barcode,
      travelerBarcode: row.traveler_barcode ?? null,
      poNumber: row.po_number,
      partNumber: row.part_number,
      partName: row.part_name,
      status: row.status,
      currentDepartment: row.current_department,
      department: row.department,
      travelerId: row.traveler_id ?? null,
      travelerNumber: row.traveler_number ?? null,
      travelerStatus: row.traveler_status ?? null,
      workOrderNumber: row.work_order_number ?? null,
      projectName: row.project_name ?? null,
      inventoryPartNumber: row.inventory_part_number ?? null,
      traceabilityType: row.traceability_type ?? 'material',
      traceabilityLabel: row.traceability_label ?? 'Material Traceability',
      traceabilityValue: row.traceability_value,
      recordedBy: row.recorded_by,
      recordedAt: normalizeDbDate(row.recorded_at) ?? '',
      materialIcn,
      materialRollNumber: row.fabric_roll_number ?? null,
      materialExpirationDate,
      materialStatus: row.material_lot_status ?? row.fabric_status ?? null,
      materialLocation: row.material_lot_location ?? row.fabric_location ?? null,
      href: `/p2-traveler-viewer?barcode=${encodeURIComponent(row.barcode)}`,
    });
  }

  return Array.from(captures.values()).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

async function loadExpiringMaterials(days = 30): Promise<ExpiringMaterial[]> {
  const result = await db.execute(sql`
    SELECT * FROM (
      SELECT
        ml.id::text AS id,
        'material_lots' AS source,
        ml.internal_control_number,
        NULL::text AS roll_number,
        ml.material_part_number,
        ml.material_name,
        ml.status,
        ml.storage_location AS location,
        ml.expiration_date,
        CEIL(EXTRACT(EPOCH FROM (ml.expiration_date::timestamp - CURRENT_DATE::timestamp)) / 86400)::int AS days_until_expiration,
        ml.remaining_qty::text AS quantity_remaining
      FROM material_lots ml
      WHERE ml.expiration_date IS NOT NULL
        AND ml.expiration_date >= CURRENT_DATE
        AND ml.expiration_date <= CURRENT_DATE + (${days}::int * INTERVAL '1 day')
        AND ml.remaining_qty::numeric > 0
        AND ml.status NOT IN ('CONSUMED', 'REJECTED', 'SCRAPPED')
      UNION ALL
      SELECT
        cfi.id::text AS id,
        'cutting_fabric_inventory' AS source,
        cfi.internal_control_number,
        cfi.roll_number,
        cfi.fabric_part_number AS material_part_number,
        COALESCE(cfi.fabric, cfi.nickname) AS material_name,
        cfi.status,
        cfi.location,
        cfi.expiration_date::timestamp AS expiration_date,
        CEIL(EXTRACT(EPOCH FROM (cfi.expiration_date::timestamp - CURRENT_DATE::timestamp)) / 86400)::int AS days_until_expiration,
        cfi.quantity_in_stock::text AS quantity_remaining
      FROM cutting_fabric_inventory cfi
      WHERE cfi.expiration_date IS NOT NULL
        AND cfi.expiration_date >= CURRENT_DATE
        AND cfi.expiration_date <= CURRENT_DATE + (${days}::int * INTERVAL '1 day')
        AND COALESCE(cfi.quantity_in_stock, 0) > 0
        AND COALESCE(cfi.status, 'active') != 'depleted'
    ) expiring
    ORDER BY expiring.expiration_date ASC, expiring.internal_control_number ASC NULLS LAST
    LIMIT 25
  `);

  return rowsFromExecute<{
    id: string;
    source: 'material_lots' | 'cutting_fabric_inventory';
    internal_control_number: string | null;
    roll_number: string | null;
    material_part_number: string | null;
    material_name: string | null;
    status: string | null;
    location: string | null;
    expiration_date: Date | string;
    days_until_expiration: number | null;
    quantity_remaining: string | null;
  }>(result).map((row) => ({
    id: row.id,
    source: row.source,
    internalControlNumber: row.internal_control_number,
    rollNumber: row.roll_number,
    materialPartNumber: row.material_part_number,
    materialName: row.material_name,
    status: row.status,
    location: row.location,
    expirationDate: normalizeDbDate(row.expiration_date) ?? String(row.expiration_date),
    daysUntilExpiration: row.days_until_expiration ?? daysUntil(row.expiration_date),
    quantityRemaining: row.quantity_remaining,
    href: row.internal_control_number
      ? `/inventory/traceability?key=lotIcn&value=${encodeURIComponent(row.internal_control_number)}`
      : null,
  }));
}

/**
 * Multi-hop graph expansion. Given a seed set of ledger rows, repeatedly fetch
 * additional ledger rows for any related lots / travelers / work-orders /
 * projects until no new rows appear or MAX_CHAIN_ROWS is hit.
 *
 * This turns a “direct anchor match” into a full narrative graph:
 *   lot   → all travelers/WOs that consumed the lot
 *   trv   → all lots issued to that traveler + reversals
 *   WO    → all travelers under it + lots consumed
 *   ncr   → ledger rows whose source_module='ncr'+source_record_id matches
 */
async function expandGraph(seed: InventoryTransactionLedger[]): Promise<InventoryTransactionLedger[]> {
  const seenIds = new Set(seed.map((r) => r.id));
  const accumulated: InventoryTransactionLedger[] = [...seed];
  const seenLots = new Set<string>();
  const seenTravs = new Set<string>();
  const seenWos = new Set<string>();
  const seenProjs = new Set<string>();
  const MAX_HOPS = 3;

  let frontier = seed;
  for (let hop = 0; hop < MAX_HOPS && accumulated.length < MAX_CHAIN_ROWS; hop++) {
    const newLots: string[] = [];
    const newTravs: string[] = [];
    const newWos: string[] = [];
    const newProjs: string[] = [];
    for (const r of frontier) {
      if (r.lotId && !seenLots.has(r.lotId)) { seenLots.add(r.lotId); newLots.push(r.lotId); }
      if (r.travelerId && !seenTravs.has(r.travelerId)) { seenTravs.add(r.travelerId); newTravs.push(r.travelerId); }
      if (r.productionWorkOrderId && !seenWos.has(r.productionWorkOrderId)) { seenWos.add(r.productionWorkOrderId); newWos.push(r.productionWorkOrderId); }
      if (r.projectId && !seenProjs.has(r.projectId)) { seenProjs.add(r.projectId); newProjs.push(r.projectId); }
    }
    if (!newLots.length && !newTravs.length && !newWos.length && !newProjs.length) break;

    const conds: SQL[] = [];
    if (newLots.length) conds.push(inArray(inventoryTransactionLedger.lotId, newLots));
    if (newTravs.length) conds.push(inArray(inventoryTransactionLedger.travelerId, newTravs));
    if (newWos.length) conds.push(inArray(inventoryTransactionLedger.productionWorkOrderId, newWos));
    if (newProjs.length) conds.push(inArray(inventoryTransactionLedger.projectId, newProjs));
    if (!conds.length) break;

    const remaining = MAX_CHAIN_ROWS - accumulated.length;
    if (remaining <= 0) break;

    const next = await db
      .select()
      .from(inventoryTransactionLedger)
      .where(or(...conds))
      .orderBy(inventoryTransactionLedger.createdAt)
      .limit(remaining);

    const fresh = next.filter((r) => !seenIds.has(r.id));
    if (!fresh.length) break;
    for (const r of fresh) seenIds.add(r.id);
    accumulated.push(...fresh);
    frontier = fresh;
  }

  // Stable order by occurredAt for downstream determinism.
  accumulated.sort((a, b) => {
    const at = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as unknown as string).getTime();
    const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as unknown as string).getTime();
    return at - bt;
  });
  return accumulated;
}

export async function buildTraceabilityChain(
  input: TraceabilitySearchInput,
): Promise<TraceabilityChain> {
  const resolved = await resolveSearch(input);

  let seed: InventoryTransactionLedger[] = [];
  if (resolved.ledgerCondition !== undefined) {
    seed = await db
      .select()
      .from(inventoryTransactionLedger)
      .where(resolved.ledgerCondition)
      .orderBy(inventoryTransactionLedger.createdAt)
      .limit(MAX_CHAIN_ROWS);
  }

  const rows = seed.length ? await expandGraph(seed) : seed;

  const dicts = await loadJoinDictionaries(rows);
  const nodes = rows.map((r) => nodeFromLedgerRow(r, dicts));
  const { edges, branches } = buildBranchesAndEdges(nodes);
  const genealogy = buildGenealogy(nodes);
  const [ncrs, travelerCaptures, expiringMaterials] = await Promise.all([
    loadRelatedNcrs(rows),
    loadTravelerMaterialCaptures(input),
    loadExpiringMaterials(),
  ]);

  return {
    query: input,
    resolved: {
      label: resolved.label,
      detail: resolved.detail,
      matchedEntities: resolved.matchedEntities,
      notFound: resolved.notFound,
    },
    nodes,
    edges,
    branches,
    genealogy,
    travelerCaptures,
    expiringMaterials,
    ncrs,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Chain integrity verification (DB-backed)
// ─────────────────────────────────────────────────────────────────────

export async function verifyChain(chain: TraceabilityChain): Promise<{
  checked: number;
  ok: boolean;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
  verifiedAt: string;
}> {
  return verifyChainByIds(chain.nodes.map((n) => n.id));
}

/** Verify a snapshot of ledger entry IDs (the displayed chain). */
export async function verifyChainByIds(ids: string[]): Promise<{
  checked: number;
  ok: boolean;
  mismatches: Array<{ id: string; transactionNumber: string; expectedHash: string; actualHash: string }>;
  verifiedAt: string;
}> {
  const result = await verifyInventoryLedgerHashesByIds(ids);
  return {
    checked: result.checked,
    ok: result.mismatches.length === 0,
    mismatches: result.mismatches,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Re-load a chain from a fixed set of ledger entry IDs (no graph expansion).
 * Used so /export and /verify can operate on the exact rendered snapshot.
 */
export async function buildChainFromEntryIds(
  ids: string[],
  query: TraceabilitySearchInput,
  resolvedLabel = 'Chain snapshot',
): Promise<TraceabilityChain> {
  const unique = Array.from(new Set(ids)).slice(0, MAX_CHAIN_ROWS);
  const rows = unique.length
    ? await db
        .select()
        .from(inventoryTransactionLedger)
        .where(inArray(inventoryTransactionLedger.id, unique))
        .orderBy(inventoryTransactionLedger.createdAt)
    : [];
  const dicts = await loadJoinDictionaries(rows);
  const nodes = rows.map((r) => nodeFromLedgerRow(r, dicts));
  const { edges, branches } = buildBranchesAndEdges(nodes);
  const genealogy = buildGenealogy(nodes);
  const ncrs = await loadRelatedNcrs(rows);
  return {
    query,
    resolved: { label: resolvedLabel, matchedEntities: [] },
    nodes,
    edges,
    branches,
    genealogy,
    travelerCaptures: [],
    expiringMaterials: [],
    ncrs,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// CSV export with SHA-256 manifest
// ─────────────────────────────────────────────────────────────────────

const CSV_COLUMNS: ReadonlyArray<{ header: string; pick: (n: TraceabilityNode) => unknown }> = [
  { header: 'occurred_at', pick: (n) => n.occurredAt },
  { header: 'transaction_number', pick: (n) => n.transactionNumber },
  { header: 'step', pick: (n) => n.step },
  { header: 'transaction_type', pick: (n) => n.transactionType },
  { header: 'ag_part_number', pick: (n) => n.agPartNumber },
  { header: 'part_name', pick: (n) => n.partName },
  { header: 'lot_icn', pick: (n) => n.lotIcn },
  { header: 'location_id', pick: (n) => n.locationId },
  { header: 'qty_delta', pick: (n) => n.quantityDelta },
  { header: 'qty_before', pick: (n) => n.quantityBefore },
  { header: 'qty_after', pick: (n) => n.quantityAfter },
  { header: 'uom', pick: (n) => n.unitOfMeasure },
  { header: 'status_before', pick: (n) => n.statusBefore },
  { header: 'status_after', pick: (n) => n.statusAfter },
  { header: 'operator', pick: (n) => n.performedByDisplayName },
  { header: 'approved_by', pick: (n) => n.approvedByDisplayName },
  { header: 'approval_id', pick: (n) => n.approvalId },
  { header: 'digital_signature_id', pick: (n) => n.digitalSignatureId },
  { header: 'traveler_number', pick: (n) => n.travelerNumber },
  { header: 'traveler_step', pick: (n) => n.travelerStepName },
  { header: 'work_order', pick: (n) => n.workOrderNumber },
  { header: 'charge_code', pick: (n) => n.chargeCode },
  { header: 'project', pick: (n) => n.projectName ?? n.projectId },
  { header: 'reason_code', pick: (n) => n.reasonCode },
  { header: 'notes', pick: (n) => n.notes },
  { header: 'source_module', pick: (n) => n.sourceModule },
  { header: 'source_record_id', pick: (n) => n.sourceRecordId },
  { header: 'event_hash', pick: (n) => n.eventHash },
];

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export interface TraceabilityExport {
  csv: string;
  manifest: {
    generatedAt: string;
    rowCount: number;
    sha256: string;
    signature: string;
    signatureAlgorithm: string;
    signatureKeyId: string;
    query: TraceabilitySearchInput;
    resolvedLabel: string;
    genealogy: TraceabilityGenealogyStage[];
    columns: string[];
  };
}

/** Marker prefix for the embedded manifest line (single line, RFC-4180 safe). */
export const TRACEABILITY_MANIFEST_PREFIX = '#EPOCH-MATERIAL-TRACE-MANIFEST:';

export function exportChainCsv(chain: TraceabilityChain): TraceabilityExport {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.map((c) => c.header).join(','));
  for (const n of chain.nodes) {
    lines.push(CSV_COLUMNS.map((c) => csvEscape(c.pick(n))).join(','));
  }
  const dataCsv = lines.join('\n') + '\n';
  const sha = crypto.createHash('sha256').update(dataCsv, 'utf8').digest('hex');
  const generatedAt = new Date().toISOString();
  const signaturePayload = JSON.stringify({
    generatedAt,
    rowCount: chain.nodes.length,
    sha256: sha,
    query: chain.query,
    resolvedLabel: chain.resolved.label,
    genealogy: chain.genealogy,
  });
  const signingKey = process.env.EPOCH_TRACE_EXPORT_SIGNING_KEY;
  const signature = signingKey
    ? crypto.createHmac('sha256', signingKey).update(signaturePayload, 'utf8').digest('hex')
    : crypto.createHash('sha256').update(signaturePayload, 'utf8').digest('hex');
  const manifest = {
    generatedAt,
    rowCount: chain.nodes.length,
    sha256: sha,
    signature,
    signatureAlgorithm: signingKey ? 'HMAC-SHA256' : 'SHA256-DEVELOPMENT-FALLBACK',
    signatureKeyId: process.env.EPOCH_TRACE_EXPORT_SIGNING_KEY_ID ?? (signingKey ? 'default' : 'not-configured'),
    query: chain.query,
    resolvedLabel: chain.resolved.label,
    genealogy: chain.genealogy,
    columns: CSV_COLUMNS.map((c) => c.header),
  };
  // Embed the manifest as the first line of the CSV payload. Recipients
  // verify the export by stripping the first line and rehashing the rest.
  const manifestLine = `${TRACEABILITY_MANIFEST_PREFIX} ${JSON.stringify(manifest)}\n`;
  return { csv: manifestLine + dataCsv, manifest };
}

// ─────────────────────────────────────────────────────────────────────
// PDF export with embedded SHA-256
// ─────────────────────────────────────────────────────────────────────

export async function exportChainPdf(chain: TraceabilityChain): Promise<{
  buffer: Buffer;
  sha256: string;
  signature: string;
  signatureAlgorithm: string;
  signatureKeyId: string;
  rowCount: number;
}> {
  const csvExport = exportChainCsv(chain);

  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  doc.fontSize(16).text('EPOCH v8 — Material Traceability Report', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#555').text(`Generated: ${chain.generatedAt}`);
  doc.text(`Query: ${chain.query.key} = ${chain.query.value}`);
  doc.text(`Resolved: ${chain.resolved.label}`);
  if (chain.resolved.detail) doc.text(`Detail: ${chain.resolved.detail}`);
  doc.text(`Rows: ${chain.nodes.length}    SHA-256: ${csvExport.manifest.sha256}`);
  doc.moveDown(0.5);
  doc.fillColor('#000');

  for (const branch of chain.branches) {
    doc.fontSize(12).fillColor('#1d4ed8').text(`Branch: ${branch.label}`);
    doc.fillColor('#000').fontSize(9);
    for (const id of branch.nodeIds) {
      const n = chain.nodes.find((x) => x.id === id);
      if (!n) continue;
      doc.text(
        `  ${n.occurredAt}  [${n.step}]  ${n.agPartNumber}  ` +
          `Δ ${n.quantityDelta} ${n.unitOfMeasure}  by ${n.performedByDisplayName}` +
          (n.approvedByDisplayName ? `  approved-by ${n.approvedByDisplayName}` : ''),
      );
      const sub: string[] = [];
      if (n.locationId) sub.push(`loc=${n.locationId}`);
      if (n.travelerNumber) sub.push(`trv=${n.travelerNumber}`);
      if (n.workOrderNumber) sub.push(`wo=${n.workOrderNumber}`);
      if (n.chargeCode) sub.push(`cc=${n.chargeCode}`);
      if (n.reasonCode) sub.push(`reason=${n.reasonCode}`);
      if (n.digitalSignatureId) sub.push(`sig=${n.digitalSignatureId.slice(0, 8)}…`);
      sub.push(`hash=${n.eventHash.slice(0, 12)}…`);
      doc.fillColor('#666').text(`     ${sub.join('  ')}`);
      if (n.notes) doc.text(`     note: ${n.notes}`);
      doc.fillColor('#000');
    }
    doc.moveDown(0.5);
  }

  if (chain.ncrs.length) {
    doc.addPage();
    doc.fontSize(14).text('Linked Nonconformance Records', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    for (const n of chain.ncrs) {
      doc.text(`NCR #${n.id}${n.rmaNumber ? ` (${n.rmaNumber})` : ''} — ${n.status ?? 'Open'}`);
      doc.fillColor('#666').text(`  Cause: ${n.issueCause}`);
      doc.text(`  Disposition: ${n.disposition} on ${n.dispositionDate}`);
      doc.fillColor('#000').moveDown(0.2);
    }
  }

  doc.end();

  const buffer: Buffer = await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return {
    buffer,
    sha256: csvExport.manifest.sha256,
    signature: csvExport.manifest.signature,
    signatureAlgorithm: csvExport.manifest.signatureAlgorithm,
    signatureKeyId: csvExport.manifest.signatureKeyId,
    rowCount: chain.nodes.length,
  };
}
