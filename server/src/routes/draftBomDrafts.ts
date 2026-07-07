import { Router, type Request, type Response } from 'express';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db';
import { draftBomDrafts, partsRequests, vendorPOItems, vendorPOs } from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';

const router = Router();

const defaultWorkspaceTabs = ['po-draft', 'parts-request', 'direct-labor', 'nrc', 'bom-wizard', 'assembly-tree'] as const;
type BuiltInWorkspaceTabId = typeof defaultWorkspaceTabs[number];
type WorkspaceTabId = BuiltInWorkspaceTabId | `custom:${string}`;

const draftPayloadSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).default('New Draft BOM'),
  revision: z.string().trim().min(1).default('Draft A'),
  project: z.string().default(''),
  projectId: z.string().nullable().optional(),
  projectCode: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectType: z.enum(['P2_PROJECT', 'R_AND_D']).nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  allowPublicEdit: z.boolean().default(false),
}).passthrough();

const procurementStatusLineSchema = z.object({
  lineId: z.string().trim().min(1),
  inventoryItemId: z.number().int().positive().nullable().optional(),
  agPartNumber: z.string().optional().nullable(),
  partNumber: z.string().optional().nullable(),
  supplierItemId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const procurementStatusRequestSchema = z.object({
  lines: z.array(procurementStatusLineSchema).max(500),
});

type BomStatus = 'Needs Review' | 'Needs Quote' | 'RFQ Sent' | 'On Order' | 'On Hand' | 'ETA / Inbound' | 'Hold';
type ProcurementStatusCandidate = {
  lineId: string;
  status: BomStatus;
  source: 'parts-request' | 'vendor-po';
  reference: string;
  rank: number;
};

type DraftBomActor = {
  userId: number | null;
  displayName: string;
  role?: string | null;
};

function isWorkspaceTabId(value: unknown): value is WorkspaceTabId {
  return (
    typeof value === 'string' &&
    (defaultWorkspaceTabs.includes(value as BuiltInWorkspaceTabId) || value.startsWith('custom:'))
  );
}

function normalizeWorkspaceTabs(value: unknown): WorkspaceTabId[] {
  const sourceTabs = Array.isArray(value) ? value.filter(isWorkspaceTabId) : defaultWorkspaceTabs;
  const nextTabs = [...sourceTabs];

  for (const tabId of defaultWorkspaceTabs) {
    if (nextTabs.includes(tabId)) continue;
    const defaultIndex = defaultWorkspaceTabs.indexOf(tabId);
    const previousVisibleDefault = defaultWorkspaceTabs
      .slice(0, defaultIndex)
      .reverse()
      .find((candidate) => nextTabs.includes(candidate));
    const insertIndex = previousVisibleDefault ? nextTabs.indexOf(previousVisibleDefault) + 1 : nextTabs.length;
    nextTabs.splice(insertIndex, 0, tabId);
  }

  return nextTabs.filter((tabId, index, allTabs) => allTabs.indexOf(tabId) === index);
}

function normalizeDraftData<T extends Record<string, unknown>>(data: T): T & { workspaceTabs: WorkspaceTabId[] } {
  return {
    ...data,
    workspaceTabs: normalizeWorkspaceTabs(data.workspaceTabs),
  };
}

function isAdminActor(actor: DraftBomActor) {
  const role = String(actor.role ?? '').toUpperCase();
  return role === 'ADMIN' || role === 'OWNER';
}

function canManageDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  return (!!actor.userId && row.createdByUserId === actor.userId) || isAdminActor(actor);
}

function canEditDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  return canManageDraft(row, actor) || (row.visibility === 'public' && row.allowPublicEdit);
}

function toClientDraft(row: typeof draftBomDrafts.$inferSelect, actor: DraftBomActor) {
  const data = normalizeDraftData(row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : {});
  const canManageAccess = canManageDraft(row, actor);
  return {
    ...data,
    id: row.id,
    name: row.name,
    revision: row.revision,
    project: row.project,
    projectId: row.projectId,
    projectCode: row.projectCode,
    projectName: row.projectName,
    projectType: row.projectType,
    visibility: row.visibility,
    allowPublicEdit: row.allowPublicEdit,
    updatedAt: row.updatedAt?.toISOString?.() ?? data.updatedAt,
    createdAt: row.createdAt?.toISOString?.() ?? data.createdAt,
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName,
    updatedByDisplayName: row.updatedByDisplayName,
    canEdit: canEditDraft(row, actor),
    canManageAccess,
  };
}

async function userSnapshot(req: Request) {
  const user = (req as any).user;
  if (!user) return { userId: null, displayName: 'unknown', role: null };
  if (!user.id) {
    return {
      userId: null,
      displayName: user.username ?? user.displayName ?? 'unknown',
      role: user.role ?? null,
    };
  }
  return resolveUserSnapshot(user.id)
    .then((snapshot) => ({
      ...snapshot,
      role: user.role ?? null,
    }))
    .catch(() => ({
      userId: user.id ?? null,
      displayName: user.username ?? user.displayName ?? 'unknown',
      role: user.role ?? null,
    }));
}

function normalizedLookupValue(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function uniqueNonBlank(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)));
}

function procurementStatusRank(status: BomStatus) {
  if (status === 'On Hand') return 4;
  if (status === 'ETA / Inbound') return 3;
  if (status === 'On Order') return 2;
  if (status === 'RFQ Sent') return 1;
  return 0;
}

function statusFromPartsRequest(row: {
  status: string;
  quantity: number;
  qtyOrdered: number | null;
  qtyReceived: number | null;
  vendorPoId: number | null;
}): BomStatus | null {
  const status = row.status.toUpperCase();
  const orderedQty = Number(row.qtyOrdered ?? 0);
  const receivedQty = Number(row.qtyReceived ?? 0);
  const requiredQty = Number(row.quantity ?? 0);

  if (['RECEIVED', 'DELIVERED_TO_DEPT'].includes(status) || (requiredQty > 0 && receivedQty >= requiredQty)) {
    return 'On Hand';
  }
  if (status === 'RECEIVED_PARTIAL' || (receivedQty > 0 && (!requiredQty || receivedQty < requiredQty))) {
    return 'ETA / Inbound';
  }
  if (['ORDERED', 'ORDERED_PARTIAL'].includes(status) || orderedQty > 0 || row.vendorPoId) {
    return 'On Order';
  }
  if (status === 'RFQ_SENT') return 'RFQ Sent';

  return null;
}

function statusFromVendorPo(row: {
  poStatus: string | null;
  quantity: number;
  receivedQuantity: number | null;
}): BomStatus | null {
  const status = String(row.poStatus ?? '').trim();
  const orderedQty = Number(row.quantity ?? 0);
  const receivedQty = Number(row.receivedQuantity ?? 0);

  if (status === 'Fully Received' || (orderedQty > 0 && receivedQty >= orderedQty)) return 'On Hand';
  if (status === 'Partially Received' || (receivedQty > 0 && (!orderedQty || receivedQty < orderedQty))) return 'ETA / Inbound';
  if (status === 'Sent') return 'On Order';
  if (status === 'RFQ Sent' || status === 'Quote Received') return 'RFQ Sent';

  return null;
}

function bestCandidate(
  current: ProcurementStatusCandidate | undefined,
  next: Omit<ProcurementStatusCandidate, 'rank'>,
) {
  const candidate = { ...next, rank: procurementStatusRank(next.status) };
  if (!current || candidate.rank > current.rank) return candidate;
  return current;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const actor = await userSnapshot(req);
    const rows = await db
      .select()
      .from(draftBomDrafts)
      .where(
        isAdminActor(actor)
          ? sql`TRUE`
          : sql`${draftBomDrafts.visibility} = 'public' OR ${draftBomDrafts.createdByUserId} = ${actor.userId}`
      )
      .orderBy(desc(draftBomDrafts.updatedAt));
    res.json(rows.map((row) => toClientDraft(row, actor)));
  } catch (error) {
    console.error('List Draft Builder drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch Draft Builder drafts' });
  }
});

router.post('/procurement-status', async (req: Request, res: Response) => {
  try {
    const parsed = procurementStatusRequestSchema.parse(req.body);
    if (parsed.lines.length === 0) return res.json([]);

    const lineLookup = new Map<string, Set<string>>();
    for (const line of parsed.lines) {
      const keys = uniqueNonBlank([
        line.agPartNumber,
        line.partNumber,
        line.supplierItemId,
        line.description,
      ]).map(normalizedLookupValue);
      if (keys.length > 0) lineLookup.set(line.lineId, new Set(keys));
    }

    const agPartNumbers = uniqueNonBlank(parsed.lines.map((line) => line.agPartNumber));
    const partNumbers = uniqueNonBlank(parsed.lines.flatMap((line) => [line.partNumber, line.supplierItemId]));
    const descriptions = uniqueNonBlank(parsed.lines.map((line) => line.description));
    const result = new Map<string, ProcurementStatusCandidate>();

    const partsRequestConditions: SQL[] = [
      agPartNumbers.length ? inArray(partsRequests.agPartNumber, agPartNumbers) : null,
      partNumbers.length ? inArray(partsRequests.partNumber, partNumbers) : null,
      descriptions.length ? inArray(partsRequests.partName, descriptions) : null,
    ].filter((condition): condition is SQL => !!condition);

    if (partsRequestConditions.length > 0) {
      const rows = await db
        .select({
          id: partsRequests.id,
          agPartNumber: partsRequests.agPartNumber,
          partNumber: partsRequests.partNumber,
          partName: partsRequests.partName,
          status: partsRequests.status,
          quantity: partsRequests.quantity,
          qtyOrdered: partsRequests.qtyOrdered,
          qtyReceived: partsRequests.qtyReceived,
          vendorPoId: partsRequests.vendorPoId,
        })
        .from(partsRequests)
        .where(and(eq(partsRequests.isActive, true), or(...partsRequestConditions)));

      for (const row of rows) {
        const status = statusFromPartsRequest(row);
        if (!status) continue;
        const rowKeys = [
          row.agPartNumber,
          row.partNumber,
          row.partName,
        ].map(normalizedLookupValue).filter(Boolean);

        for (const [lineId, keys] of lineLookup.entries()) {
          if (!rowKeys.some((key) => keys.has(key))) continue;
          result.set(lineId, bestCandidate(result.get(lineId), {
            lineId,
            status,
            source: 'parts-request',
            reference: `parts request PR-${row.id}`,
          }));
        }
      }
    }

    const vendorPoConditions: SQL[] = [
      agPartNumbers.length ? inArray(vendorPOItems.agPartNumber, agPartNumbers) : null,
      descriptions.length ? inArray(vendorPOItems.description, descriptions) : null,
    ].filter((condition): condition is SQL => !!condition);

    if (vendorPoConditions.length > 0) {
      const rows = await db
        .select({
          id: vendorPOItems.id,
          agPartNumber: vendorPOItems.agPartNumber,
          description: vendorPOItems.description,
          quantity: vendorPOItems.quantity,
          receivedQuantity: vendorPOItems.receivedQuantity,
          poId: vendorPOs.id,
          poNumber: vendorPOs.poNumber,
          poStatus: vendorPOs.status,
        })
        .from(vendorPOItems)
        .innerJoin(vendorPOs, eq(vendorPOs.id, vendorPOItems.vendorPoId))
        .where(and(
          or(...vendorPoConditions),
          sql`${vendorPOs.status} <> 'Cancelled'`,
          eq(vendorPOs.isCurrentRevision, true),
        ));

      for (const row of rows) {
        const status = statusFromVendorPo(row);
        if (!status) continue;
        const rowKeys = [
          row.agPartNumber,
          row.description,
        ].map(normalizedLookupValue).filter(Boolean);

        for (const [lineId, keys] of lineLookup.entries()) {
          if (!rowKeys.some((key) => keys.has(key))) continue;
          result.set(lineId, bestCandidate(result.get(lineId), {
            lineId,
            status,
            source: 'vendor-po',
            reference: row.poNumber ? `vendor PO ${row.poNumber}` : `vendor PO #${row.poId}`,
          }));
        }
      }
    }

    res.json([...result.values()].map(({ rank, ...status }) => status));
  } catch (error) {
    console.error('Draft Builder procurement status lookup error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid procurement status request' });
    }
    res.status(500).json({ error: 'Failed to load Draft Builder procurement status' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = draftPayloadSchema.parse({ ...req.body, id: req.params.id });
    const snapshot = await userSnapshot(req);
    const now = new Date();
    const [existing] = await db.select().from(draftBomDrafts).where(eq(draftBomDrafts.id, parsed.id)).limit(1);

    if (existing && !canEditDraft(existing, snapshot)) {
      return res.status(403).json({ error: 'You can view this draft, but the creator has not allowed shared editing.' });
    }

    const canManageExisting = existing ? canManageDraft(existing, snapshot) : true;
    const visibility = canManageExisting ? parsed.visibility : existing?.visibility ?? 'public';
    const allowPublicEdit = canManageExisting ? parsed.allowPublicEdit : existing?.allowPublicEdit ?? false;
    const data = normalizeDraftData({
      ...parsed,
      visibility,
      allowPublicEdit,
    });

    const [row] = await db
      .insert(draftBomDrafts)
      .values({
        id: parsed.id,
        name: parsed.name,
        revision: parsed.revision,
        project: parsed.project ?? '',
        projectId: parsed.projectId ?? null,
        projectCode: parsed.projectCode ?? null,
        projectName: parsed.projectName ?? null,
        projectType: parsed.projectType ?? null,
        visibility,
        allowPublicEdit,
        data,
        createdByUserId: snapshot.userId ?? null,
        createdByDisplayName: snapshot.displayName ?? 'unknown',
        updatedByUserId: snapshot.userId ?? null,
        updatedByDisplayName: snapshot.displayName ?? 'unknown',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: draftBomDrafts.id,
        set: {
          name: parsed.name,
          revision: parsed.revision,
          project: parsed.project ?? '',
          projectId: parsed.projectId ?? null,
          projectCode: parsed.projectCode ?? null,
          projectName: parsed.projectName ?? null,
          projectType: parsed.projectType ?? null,
          visibility,
          allowPublicEdit,
          data,
          updatedByUserId: snapshot.userId ?? null,
          updatedByDisplayName: snapshot.displayName ?? 'unknown',
          updatedAt: now,
        },
      })
      .returning();

    res.json(toClientDraft(row, snapshot));
  } catch (error) {
    console.error('Save Draft Builder draft error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Invalid Draft Builder draft payload' });
    }
    res.status(500).json({ error: 'Failed to save Draft Builder draft' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const actor = await userSnapshot(req);
    const [existing] = await db.select().from(draftBomDrafts).where(eq(draftBomDrafts.id, id)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'Draft Builder draft not found' });
    }
    if (!canManageDraft(existing, actor)) {
      return res.status(403).json({ error: 'Only the draft creator can delete or manage this draft.' });
    }
    const [deleted] = await db
      .delete(draftBomDrafts)
      .where(eq(draftBomDrafts.id, id))
      .returning({ id: draftBomDrafts.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Draft Builder draft not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete Draft Builder draft error:', error);
    res.status(500).json({ error: 'Failed to delete Draft Builder draft' });
  }
});

export default router;
