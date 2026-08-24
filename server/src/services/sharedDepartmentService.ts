import { and, asc, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  inventoryDepartments,
} from '../../schema';
import { recordAuditEvent } from './auditLedgerService';

export type DepartmentActor = {
  id?: number | null;
  username?: string | null;
  role?: string | null;
};

export class SharedDepartmentError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

const normalized = (value: string) => value.trim().toLowerCase();
const actorName = (actor: DepartmentActor) =>
  String(actor.username ?? actor.id ?? '').trim() || 'unknown';

export async function listSharedDepartments(options?: {
  includeInactive?: boolean;
  routingOnly?: boolean;
}) {
  const predicates = [];
  if (!options?.includeInactive)
    predicates.push(eq(inventoryDepartments.isActive, true));
  if (options?.routingOnly)
    predicates.push(eq(inventoryDepartments.routingEnabled, true));
  return db
    .select()
    .from(inventoryDepartments)
    .where(predicates.length ? and(...predicates) : undefined)
    .orderBy(asc(inventoryDepartments.sortOrder), asc(inventoryDepartments.id));
}

async function assertUnique(
  tx: any,
  input: { name?: string; departmentCode?: string | null },
  excludeId?: number
) {
  if (input.name !== undefined) {
    const duplicate = await tx
      .select({ id: inventoryDepartments.id })
      .from(inventoryDepartments)
      .where(
        and(
          sql`lower(trim(${inventoryDepartments.name})) = ${normalized(input.name)}`,
          excludeId ? ne(inventoryDepartments.id, excludeId) : undefined
        )
      )
      .limit(1);
    if (duplicate.length)
      throw new SharedDepartmentError(
        'DEPARTMENT_NAME_DUPLICATE',
        'A department with the same normalized name already exists.',
        409
      );
  }
  if (input.departmentCode) {
    const duplicate = await tx
      .select({ id: inventoryDepartments.id })
      .from(inventoryDepartments)
      .where(
        and(
          sql`lower(${inventoryDepartments.departmentCode}) = ${normalized(input.departmentCode)}`,
          excludeId ? ne(inventoryDepartments.id, excludeId) : undefined
        )
      )
      .limit(1);
    if (duplicate.length)
      throw new SharedDepartmentError(
        'DEPARTMENT_CODE_DUPLICATE',
        'Department code already exists.',
        409
      );
  }
}

export async function createSharedDepartment(
  input: {
    name: string;
    departmentCode: string;
    routingEnabled?: boolean;
    productionEnabled?: boolean;
    schedulingEnabled?: boolean;
    sortOrder?: number;
  },
  actor: DepartmentActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1145394256)`);
    await assertUnique(tx, input);
    const [created] = await tx
      .insert(inventoryDepartments)
      .values({
        name: input.name.trim(),
        departmentCode: input.departmentCode.trim().toUpperCase(),
        routingEnabled: input.routingEnabled ?? true,
        productionEnabled: input.productionEnabled ?? true,
        schedulingEnabled: input.schedulingEnabled ?? true,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
        createdBy: actorName(actor),
        updatedBy: actorName(actor),
      })
      .returning();
    await recordAuditEvent(
      {
        eventType: 'SHARED_DEPARTMENT_CREATED',
        subjectType: 'inventory_department',
        subjectId: String(created.id),
        sourceService: 'sharedDepartmentService',
        actor,
        payload: {
          name: created.name,
          departmentCode: created.departmentCode,
        },
      },
      tx
    );
    return created;
  });
}

export async function updateSharedDepartment(
  id: number,
  input: {
    name?: string;
    departmentCode?: string;
    routingEnabled?: boolean;
    productionEnabled?: boolean;
    schedulingEnabled?: boolean;
    sortOrder?: number;
    isActive?: boolean;
  },
  actor: DepartmentActor
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1145394256)`);
    const [before] = await tx
      .select()
      .from(inventoryDepartments)
      .where(eq(inventoryDepartments.id, id))
      .limit(1);
    if (!before)
      throw new SharedDepartmentError('DEPARTMENT_NOT_FOUND', 'Department not found.', 404);
    if (
      before.departmentCode &&
      input.departmentCode &&
      normalized(before.departmentCode) !== normalized(input.departmentCode)
    )
      throw new SharedDepartmentError(
        'DEPARTMENT_CODE_IMMUTABLE',
        'An assigned department code is immutable.',
        409
      );
    await assertUnique(tx, input, id);
    const [updated] = await tx
      .update(inventoryDepartments)
      .set({
        ...input,
        name: input.name?.trim(),
        departmentCode: input.departmentCode?.trim().toUpperCase(),
        updatedBy: actorName(actor),
        updatedAt: new Date(),
      })
      .where(eq(inventoryDepartments.id, id))
      .returning();
    await recordAuditEvent(
      {
        eventType: 'SHARED_DEPARTMENT_UPDATED',
        subjectType: 'inventory_department',
        subjectId: String(id),
        sourceService: 'sharedDepartmentService',
        actor,
        payload: { before: before as any, after: updated as any },
      },
      tx
    );
    return updated;
  });
}

export async function deactivateUnreferencedDepartment(
  id: number,
  actor: DepartmentActor
) {
  return db.transaction(async (tx) => {
    const references = await tx
      .select({ id: inventoryDepartments.id })
      .from(inventoryDepartments)
      .where(
        and(
          eq(inventoryDepartments.id, id),
          or(
            sql`EXISTS (SELECT 1 FROM inventory_item_departments iid WHERE iid.department_id = ${id})`,
            sql`EXISTS (SELECT 1 FROM inventory_items ii WHERE ii.default_department_id = ${id})`,
            sql`EXISTS (SELECT 1 FROM routing_operations ro WHERE ro.department_id = ${id})`,
            sql`EXISTS (SELECT 1 FROM parts_requests pr WHERE pr.department_id = ${id})`,
            sql`EXISTS (SELECT 1 FROM receipts r WHERE r.department_id = ${id})`
          )
        )
      );
    if (references.length)
      throw new SharedDepartmentError(
        'DEPARTMENT_REFERENCED',
        'Referenced departments cannot be deleted or deactivated through this operation.',
        409
      );
    const [updated] = await tx
      .update(inventoryDepartments)
      .set({ isActive: false, updatedBy: actorName(actor), updatedAt: new Date() })
      .where(eq(inventoryDepartments.id, id))
      .returning();
    if (!updated)
      throw new SharedDepartmentError('DEPARTMENT_NOT_FOUND', 'Department not found.', 404);
    await recordAuditEvent(
      {
        eventType: 'SHARED_DEPARTMENT_DEACTIVATED',
        subjectType: 'inventory_department',
        subjectId: String(id),
        sourceService: 'sharedDepartmentService',
        actor,
        payload: { name: updated.name, departmentCode: updated.departmentCode },
      },
      tx
    );
    return updated;
  });
}
