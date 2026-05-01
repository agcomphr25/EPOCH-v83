/**
 * productionControlTemplateService.ts — centralized data-access service for production
 * control templates (WAD Step 6).
 *
 * All template CRUD and workflow transitions go through this service so that
 * route handlers remain thin and the business rules are testable in isolation.
 */

import { db } from '../../../db';
import {
  productionControlTemplates,
  users,
  insertProductionControlTemplateSchema,
  type ProductionControlTemplate,
  type InsertProductionControlTemplate,
} from '../../../schema';
import { eq, and, asc } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Roles that may approve templates
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_APPROVER_ROLES = ['ADMIN', 'OWNER', 'SUPERVISOR', 'MANAGER'] as const;

export type ListTemplatesFilter = {
  templateType?: string;
  approvalStatus?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

export async function listTemplates(
  filter: ListTemplatesFilter = {},
): Promise<ProductionControlTemplate[]> {
  let rows = await db
    .select()
    .from(productionControlTemplates)
    .orderBy(asc(productionControlTemplates.createdAt));

  if (filter.templateType) {
    rows = rows.filter((r) => r.templateType === filter.templateType);
  }
  if (filter.approvalStatus) {
    rows = rows.filter((r) => r.approvalStatus === filter.approvalStatus);
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get single
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplate(id: string): Promise<ProductionControlTemplate | undefined> {
  const [row] = await db
    .select()
    .from(productionControlTemplates)
    .where(eq(productionControlTemplates.id, id))
    .limit(1);
  return row ?? undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export async function createTemplate(
  rawData: unknown,
  ctx: { username: string; userId: number | null },
): Promise<{ template?: ProductionControlTemplate; error?: string }> {
  const parsed = insertProductionControlTemplateSchema.safeParse({
    ...(rawData as object),
    createdBy: ctx.username,
    createdByUserId: ctx.userId,
    approvalStatus: 'DRAFT',
  });

  if (!parsed.success) {
    return { error: `Validation failed: ${parsed.error.errors.map((e) => e.message).join(', ')}` };
  }

  const insertValues: InsertProductionControlTemplate = {
    name: parsed.data.name,
    templateType: parsed.data.templateType,
    routingType: parsed.data.routingType ?? null,
    version: parsed.data.version ?? 1,
    isActive: parsed.data.isActive ?? true,
    approvalStatus: 'DRAFT',
    data: parsed.data.data ?? null,
    fileUrl: parsed.data.fileUrl ?? null,
    createdBy: parsed.data.createdBy,
    createdByUserId: parsed.data.createdByUserId ?? null,
  };

  const [created] = await db.insert(productionControlTemplates).values(insertValues).returning();
  return { template: created };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update (DRAFT only for data fields)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateTemplate(
  id: string,
  body: Record<string, unknown>,
): Promise<{ template?: ProductionControlTemplate; error?: string; statusCode?: number }> {
  const existing = await getTemplate(id);
  if (!existing) return { error: 'Template not found', statusCode: 404 };

  const dataEditKeys = ['name', 'data', 'routingType', 'fileUrl'];
  const hasDataEdits = dataEditKeys.some((k) => k in body);
  if (hasDataEdits && existing.approvalStatus !== 'DRAFT') {
    return {
      error: 'Only DRAFT templates can have their data edited. Mark as OBSOLETE and create a new version.',
      statusCode: 400,
    };
  }

  const allowedUpdates: {
    name?: string;
    data?: unknown;
    routingType?: string | null;
    fileUrl?: string | null;
    isActive?: boolean;
  } = {};

  if (body.name !== undefined) allowedUpdates.name = String(body.name);
  if (body.data !== undefined) allowedUpdates.data = body.data;
  if (body.routingType !== undefined) allowedUpdates.routingType = (body.routingType as string | null) ?? null;
  if (body.fileUrl !== undefined) allowedUpdates.fileUrl = (body.fileUrl as string | null) ?? null;
  if (body.isActive !== undefined) allowedUpdates.isActive = Boolean(body.isActive);

  if (Object.keys(allowedUpdates).length === 0) {
    return { error: 'No valid fields to update', statusCode: 400 };
  }

  const [updated] = await db
    .update(productionControlTemplates)
    .set(allowedUpdates)
    .where(eq(productionControlTemplates.id, id))
    .returning();

  return { template: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Link file (objectPath from object storage)
// ─────────────────────────────────────────────────────────────────────────────

export async function linkFileToTemplate(
  id: string,
  objectPath: string,
): Promise<{ template?: ProductionControlTemplate; error?: string; statusCode?: number }> {
  const existing = await getTemplate(id);
  if (!existing) return { error: 'Template not found', statusCode: 404 };

  const [updated] = await db
    .update(productionControlTemplates)
    .set({ fileUrl: objectPath })
    .where(eq(productionControlTemplates.id, id))
    .returning();

  return { template: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Approve
// ─────────────────────────────────────────────────────────────────────────────

export type ApproveResult = {
  template?: ProductionControlTemplate;
  error?: string;
  statusCode?: number;
  meta?: Record<string, unknown>;
};

export async function approveTemplate(
  id: string,
  approverCtx: { userId: number | null; username: string; role: string },
): Promise<ApproveResult> {
  // Role guard
  if (!(TEMPLATE_APPROVER_ROLES as readonly string[]).includes(approverCtx.role)) {
    return {
      error: 'Only SUPERVISOR, MANAGER, ADMIN, or OWNER roles can approve templates.',
      statusCode: 403,
    };
  }

  const existing = await getTemplate(id);
  if (!existing) return { error: 'Template not found', statusCode: 404 };
  if (existing.approvalStatus === 'APPROVED') {
    return { error: 'Template is already approved', statusCode: 400 };
  }
  if (existing.approvalStatus === 'OBSOLETE') {
    return { error: 'Cannot approve an OBSOLETE template', statusCode: 400 };
  }

  // Different-person enforcement
  const sameById =
    approverCtx.userId != null &&
    existing.createdByUserId != null &&
    approverCtx.userId === existing.createdByUserId;
  const sameByName =
    !sameById &&
    approverCtx.username.toLowerCase() === existing.createdBy.toLowerCase();

  if (sameById || sameByName) {
    return {
      error: 'The approver must be a different person than the creator (four-eyes / segregation of duties).',
      statusCode: 403,
      meta: { createdBy: existing.createdBy },
    };
  }

  // Different-role enforcement
  if (existing.createdByUserId != null) {
    const [creatorUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, existing.createdByUserId))
      .limit(1);

    if (creatorUser && approverCtx.role === creatorUser.role) {
      return {
        error: `Approver must have a different role from the creator. Both hold the '${approverCtx.role}' role.`,
        statusCode: 403,
        meta: { createdBy: existing.createdBy, sharedRole: approverCtx.role },
      };
    }
  }

  const [updated] = await db
    .update(productionControlTemplates)
    .set({
      approvalStatus: 'APPROVED',
      approvedBy: approverCtx.username,
      approvedByUserId: approverCtx.userId ?? null,
      approvedAt: new Date(),
    })
    .where(eq(productionControlTemplates.id, id))
    .returning();

  return { template: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark Obsolete
// ─────────────────────────────────────────────────────────────────────────────

export async function obsoleteTemplate(
  id: string,
): Promise<{ template?: ProductionControlTemplate; error?: string; statusCode?: number }> {
  const existing = await getTemplate(id);
  if (!existing) return { error: 'Template not found', statusCode: 404 };
  if (existing.approvalStatus === 'OBSOLETE') {
    return { error: 'Template is already OBSOLETE', statusCode: 400 };
  }

  const obsoleteStatus: 'DRAFT' | 'APPROVED' | 'OBSOLETE' = 'OBSOLETE';
  const [updated] = await db
    .update(productionControlTemplates)
    .set({ approvalStatus: obsoleteStatus })
    .where(eq(productionControlTemplates.id, id))
    .returning();

  return { template: updated };
}
