import { db } from '../../db';
import {
  edriRemediationItems,
  EdriRemediationItem,
} from '../../schema';
import { eq, and, desc, or, isNull } from 'drizzle-orm';

export interface RemediationFilter {
  domainKey?: string;
  priority?: string;
  status?: string;
  assignedToUserId?: number;
  snapshotId?: number;
  unassigned?: boolean;
}

export async function getRemediationQueue(filters: RemediationFilter = {}): Promise<EdriRemediationItem[]> {
  const conditions: Parameters<typeof and>[0][] = [];

  if (filters.domainKey) conditions.push(eq(edriRemediationItems.domainKey, filters.domainKey));
  if (filters.priority) conditions.push(eq(edriRemediationItems.priority, filters.priority));
  if (filters.status) conditions.push(eq(edriRemediationItems.status, filters.status));
  if (filters.snapshotId) conditions.push(eq(edriRemediationItems.snapshotId, filters.snapshotId));
  if (filters.unassigned) {
    conditions.push(isNull(edriRemediationItems.assignedToUserId));
  } else if (filters.assignedToUserId != null) {
    conditions.push(eq(edriRemediationItems.assignedToUserId, filters.assignedToUserId));
  }

  const query = db.select().from(edriRemediationItems);
  const results = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(desc(edriRemediationItems.createdAt))
    : await query.orderBy(desc(edriRemediationItems.createdAt));

  return results;
}

export async function assignRemediationItem(
  itemId: number,
  userId: number,
  displayName: string,
  dueDate: string | null,
): Promise<EdriRemediationItem | null> {
  const result = await db
    .update(edriRemediationItems)
    .set({
      assignedToUserId: userId,
      assignedToDisplayName: displayName,
      dueDate: dueDate || null,
      updatedAt: new Date(),
    })
    .where(eq(edriRemediationItems.id, itemId))
    .returning();
  return result[0] ?? null;
}

export async function updateRemediationStatus(
  itemId: number,
  status: string,
  note: string | null,
  actorId: number,
  actorDisplayName: string,
  waiverJustification?: string,
): Promise<EdriRemediationItem | null> {
  const updateData: any = {
    status,
    statusChangedAt: new Date(),
    statusChangedByUserId: actorId,
    statusChangedByDisplayName: actorDisplayName,
    updatedAt: new Date(),
  };
  if (waiverJustification) {
    updateData.waiverJustification = waiverJustification;
  }
  const result = await db
    .update(edriRemediationItems)
    .set(updateData)
    .where(eq(edriRemediationItems.id, itemId))
    .returning();
  return result[0] ?? null;
}
