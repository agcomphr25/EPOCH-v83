import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  inventoryItemGroups,
  inventoryItems,
  supplierScopes,
  vendorPOItems,
  vendors,
} from '../../schema';
import { auditService, type AuditActor } from './auditService';

export type ApprovalStage = { stage: number; capability: string; description: string };

export function getSection6ApprovalStages(amount: number): ApprovalStage[] {
  if (amount > 5000) {
    return [
      {
        stage: 1,
        capability: 'purchasing.approve_requisition_manager',
        description: 'Manager review required for requisitions over $5,000',
      },
      {
        stage: 2,
        capability: 'purchasing.approve_requisition_executive',
        description: 'Executive approval required for requisitions over $5,000',
      },
    ];
  }

  if (amount > 500) {
    return [{
      stage: 1,
      capability: 'purchasing.approve_requisition_manager',
      description: 'Manager approval required for requisitions over $500',
    }];
  }

  return [{
    stage: 1,
    capability: 'purchasing.approve_requisition_buyer',
    description: 'Buyer approval required for requisitions under $500',
  }];
}

export async function emitProcurementLedgerEvent(input: {
  action: string;
  entityId: string | number;
  actor?: AuditActor;
  reason?: string | null;
  meta?: Record<string, unknown>;
}) {
  return auditService.logEvent({
    entityType: 'vendor',
    entityId: String(input.entityId),
    action: input.action,
    actor: input.actor,
    reason: input.reason ?? undefined,
    meta: input.meta ?? {},
  });
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

type VendorApprovalFields = {
  approved?: boolean | null;
  approvalLevel?: string | null;
  approvalExpiration?: string | Date | null;
  isActive?: boolean | null;
};

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function hasCurrentVendorMasterApproval(vendor: VendorApprovalFields | null | undefined): boolean {
  if (!vendor || vendor.isActive === false) return false;
  if (vendor.approved === true) return true;

  const approvalLevel = String(vendor.approvalLevel ?? '').trim();
  if (!approvalLevel || !vendor.approvalExpiration) return false;

  const expiration = new Date(vendor.approvalExpiration);
  return Number.isFinite(expiration.getTime()) && expiration >= startOfToday();
}

function patternMatches(value: string, pattern: string | null): boolean {
  if (!pattern) return true;
  const normalizedValue = normalize(value);
  const normalizedPattern = normalize(pattern);
  if (!normalizedPattern) return true;
  if (normalizedPattern.includes('*')) {
    const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i').test(normalizedValue);
  }
  return normalizedValue.includes(normalizedPattern);
}

function scopeMatchesLine(scope: typeof supplierScopes.$inferSelect, line: typeof vendorPOItems.$inferSelect, productionLine: string | null): boolean {
  const lineProduction = normalize(productionLine);
  const scopeProduction = normalize(scope.productionLine);
  if (scopeProduction && scopeProduction !== 'all' && scopeProduction !== lineProduction) return false;

  const category = normalize(scope.materialCategory);
  if (category) {
    const searchable = `${line.agPartNumber ?? ''} ${line.description ?? ''} ${line.vendorUnit ?? ''} ${line.purchaseUnit ?? ''}`;
    if (!normalize(searchable).includes(category)) return false;
  }

  const candidatePart = String(line.agPartNumber ?? line.description ?? '');
  return patternMatches(candidatePart, scope.partNumberPattern);
}

type LegacyVendorScope = {
  groups?: unknown;
  items?: unknown;
};

function parseLegacyVendorScope(value: unknown): { groupIds: number[]; itemIds: number[]; hasUnstructuredScope: boolean } {
  const raw = String(value ?? '').trim();
  if (!raw) return { groupIds: [], itemIds: [], hasUnstructuredScope: false };

  try {
    const parsed = JSON.parse(raw) as LegacyVendorScope;
    const groupIds = Array.isArray(parsed.groups)
      ? parsed.groups.map(Number).filter(Number.isInteger)
      : [];
    const itemIds = Array.isArray(parsed.items)
      ? parsed.items.map(Number).filter(Number.isInteger)
      : [];
    return { groupIds, itemIds, hasUnstructuredScope: groupIds.length > 0 || itemIds.length > 0 };
  } catch {
    return { groupIds: [], itemIds: [], hasUnstructuredScope: true };
  }
}

async function getLegacyScopeBlockers(
  vendor: typeof vendors.$inferSelect,
  lines: Array<typeof vendorPOItems.$inferSelect>,
): Promise<string[] | null> {
  const legacyScope = parseLegacyVendorScope(vendor.scope);
  if (!legacyScope.hasUnstructuredScope) return null;

  if (legacyScope.itemIds.length === 0 && legacyScope.groupIds.length === 0) {
    return [];
  }

  const linePartNumbers = [...new Set(lines.map((line) => line.agPartNumber).filter((value): value is string => !!value))];
  if (linePartNumbers.length === 0) {
    return lines.map((line) => `Line ${line.lineNumber} has no AG part number to validate against vendor scope`);
  }

  const scopedItems = await db
    .select({
      id: inventoryItems.id,
      agPartNumber: inventoryItems.agPartNumber,
    })
    .from(inventoryItems)
    .where(inArray(inventoryItems.agPartNumber, linePartNumbers));

  const itemIdsByPart = new Map(scopedItems.map((item) => [item.agPartNumber, item.id]));
  const groupMemberships = legacyScope.groupIds.length > 0 && scopedItems.length > 0
    ? await db
      .select({
        itemId: inventoryItemGroups.itemId,
        groupId: inventoryItemGroups.groupId,
      })
      .from(inventoryItemGroups)
      .where(inArray(inventoryItemGroups.itemId, scopedItems.map((item) => item.id)))
    : [];

  const selectedItemIds = new Set(legacyScope.itemIds);
  const selectedGroupIds = new Set(legacyScope.groupIds);
  const groupsByItemId = new Map<number, Set<number>>();
  for (const membership of groupMemberships) {
    const itemGroups = groupsByItemId.get(membership.itemId) ?? new Set<number>();
    itemGroups.add(membership.groupId);
    groupsByItemId.set(membership.itemId, itemGroups);
  }

  const blockers: string[] = [];
  for (const line of lines) {
    const itemId = line.agPartNumber ? itemIdsByPart.get(line.agPartNumber) : undefined;
    const itemSelected = itemId !== undefined && selectedItemIds.has(itemId);
    const groupSelected = itemId !== undefined && [...(groupsByItemId.get(itemId) ?? [])].some((groupId) => selectedGroupIds.has(groupId));
    if (!itemSelected && !groupSelected) {
      blockers.push(`Line ${line.lineNumber} is outside the vendor's approved supplier scope`);
    }
  }

  return blockers;
}

export async function getVendorQualificationBlockers(vendorPoId: number, vendorId: number, productionLine: string | null): Promise<string[]> {
  const blockers: string[] = [];
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);

  if (!vendor) return ['Vendor record not found'];
  if (vendor.isActive === false) blockers.push('Vendor is inactive');
  if (!hasCurrentVendorMasterApproval(vendor)) blockers.push('Vendor is not approved');
  if (vendor.approvalExpiration && new Date(vendor.approvalExpiration) < new Date()) {
    blockers.push(`Vendor approval expired on ${vendor.approvalExpiration}`);
  }
  const lines = await db.select().from(vendorPOItems).where(eq(vendorPOItems.vendorPoId, vendorPoId));

  const scopes = await db.select().from(supplierScopes).where(and(
    eq(supplierScopes.vendorId, vendorId),
    eq(supplierScopes.status, 'active'),
    or(
      sql`${supplierScopes.expiresAt} IS NULL`,
      sql`${supplierScopes.expiresAt} >= CURRENT_DATE`,
    ),
  ));
  if (lines.length === 0) {
    blockers.push('PO has no line items to validate against supplier scope');
  } else if (scopes.length === 0) {
    const legacyScopeBlockers = await getLegacyScopeBlockers(vendor, lines);
    if (legacyScopeBlockers === null) {
      blockers.push('Vendor has no active approved supplier scope');
    } else {
      blockers.push(...legacyScopeBlockers);
    }
  } else if (scopes.length > 0) {
    for (const line of lines) {
      if (!scopes.some((scope) => scopeMatchesLine(scope, line, productionLine))) {
        blockers.push(`Line ${line.lineNumber} is outside the vendor's approved supplier scope`);
      }
    }
  }

  return blockers;
}
