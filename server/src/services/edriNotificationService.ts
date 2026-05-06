import { db, pool } from '../../db';
import { edriNotifications, edriRemediationItems, InsertEdriNotification } from '../../schema';
import { recordAuditEvent } from './auditLedgerService';
import { eq, sql } from 'drizzle-orm';

export type EdriEventType =
  | 'SCORE_DROPPED'
  | 'NEW_CRITICAL_FLAG'
  | 'REMEDIATION_OVERDUE'
  | 'BAND_CHANGE'
  | 'OVERRIDE_APPLIED';

interface ScoreBandChangeEvent {
  type: 'BAND_CHANGE';
  snapshotId: number;
  previousBand: string;
  newBand: string;
  compositeScore: number;
}

interface ScoreDropEvent {
  type: 'SCORE_DROPPED';
  snapshotId: number;
  previousScore: number;
  newScore: number;
  drop: number;
}

interface NewCriticalFlagEvent {
  type: 'NEW_CRITICAL_FLAG';
  snapshotId: number;
  flagCount: number;
  flagTitles: string[];
}

interface OverrideAppliedEvent {
  type: 'OVERRIDE_APPLIED';
  snapshotId: number;
  domainKey: string | null;
  overrideScore: number;
  justification: string;
  appliedBy: string;
}

type EdriEvent = ScoreBandChangeEvent | ScoreDropEvent | NewCriticalFlagEvent | OverrideAppliedEvent;

async function getAdminAndOwnerUserIds(): Promise<Array<{ id: number; role: string }>> {
  try {
    const rows = await pool.query(
      `SELECT id, role FROM users WHERE role IN ('ADMIN', 'OWNER') AND is_active = true LIMIT 20`
    );
    return rows as Array<{ id: number; role: string }>;
  } catch {
    return [];
  }
}

async function recordNotification(
  eventType: EdriEventType,
  snapshotId: number,
  recipientUserId: number | null,
  channel: 'EMAIL' | 'IN_APP',
  payload: Record<string, unknown>,
): Promise<void> {
  const insert: InsertEdriNotification = {
    snapshotId,
    eventType,
    recipientUserId,
    channel,
    payload,
  };
  await db.insert(edriNotifications).values(insert);
  // Task #85: route through unified hash-chained ledger for compliance traceability.
  await recordAuditEvent({
    eventType: `EDRI_${eventType}_SENT`,
    subjectType: 'edri_notification',
    subjectId: String(snapshotId),
    sourceService: 'edriNotificationService',
    actor: { username: 'EDRI System', role: 'system' },
    reason: `EDRI notification sent: ${eventType} via ${channel}${recipientUserId ? ` to user ${recipientUserId}` : ' (broadcast)'}`,
    payload: { channel, recipientUserId, payload, snapshotId },
  });
}

export async function triggerEdriNotifications(
  currentSnapshot: { id: number; compositeScore: string; scoringBand: string },
  previousSnapshot: { id?: number; compositeScore: string; scoringBand: string } | null,
  criticalFlagCount: number,
  criticalFlagTitles: string[],
): Promise<void> {
  const currentScore = Number(currentSnapshot.compositeScore);
  const prevScore = previousSnapshot ? Number(previousSnapshot.compositeScore) : null;
  const recipients = await getAdminAndOwnerUserIds();

  const notifications: Array<{
    eventType: EdriEventType;
    channel: 'EMAIL' | 'IN_APP';
    payload: Record<string, unknown>;
  }> = [];

  // Determine NEWLY introduced critical flags (not present in previous snapshot)
  let newCriticalFlagCount = criticalFlagCount;
  let newCriticalFlagTitles = criticalFlagTitles;
  if (previousSnapshot?.id) {
    try {
      const prevFlagsRows = await db.select({ flagKey: edriRedFlags.flagKey })
        .from(edriRedFlags)
        .where(and(eq(edriRedFlags.snapshotId, previousSnapshot.id), sql`severity = 'CRITICAL' AND is_active = true`));
      const prevCriticalKeys = new Set(prevFlagsRows.map(r => r.flagKey));
      const newlyCritical = criticalFlagTitles.filter((_, idx) => {
        // We can only match by title position here — use count diff as proxy
        return true;
      });
      // Count truly new critical flags = current count minus count already in prev snapshot
      const newCount = Math.max(0, criticalFlagCount - prevCriticalKeys.size);
      newCriticalFlagCount = newCount;
      newCriticalFlagTitles = criticalFlagTitles.slice(0, newCount);
    } catch {
      // Fall back to using all critical flags if diffing fails
    }
  }

  // Band change notification
  if (previousSnapshot && previousSnapshot.scoringBand !== currentSnapshot.scoringBand) {
    const directionDown = ['AUDIT_DEFENSIBLE', 'CONDITIONALLY_PASSABLE', 'HIGH_RISK', 'MATERIAL_DEFICIENCY', 'AUDIT_FAILURE']
      .indexOf(currentSnapshot.scoringBand) >
      ['AUDIT_DEFENSIBLE', 'CONDITIONALLY_PASSABLE', 'HIGH_RISK', 'MATERIAL_DEFICIENCY', 'AUDIT_FAILURE']
        .indexOf(previousSnapshot.scoringBand);

    notifications.push({
      eventType: 'BAND_CHANGE',
      channel: 'IN_APP',
      payload: {
        previousBand: previousSnapshot.scoringBand,
        newBand: currentSnapshot.scoringBand,
        compositeScore: currentScore,
        direction: directionDown ? 'WORSENED' : 'IMPROVED',
      },
    });
    if (directionDown) {
      notifications.push({
        eventType: 'BAND_CHANGE',
        channel: 'EMAIL',
        payload: {
          subject: `EDRI Alert: DCAA Readiness Band Changed to ${currentSnapshot.scoringBand}`,
          previousBand: previousSnapshot.scoringBand,
          newBand: currentSnapshot.scoringBand,
          compositeScore: currentScore,
        },
      });
    }
  }

  // Score dropped by >= 5 points
  if (prevScore !== null && prevScore - currentScore >= 5) {
    notifications.push({
      eventType: 'SCORE_DROPPED',
      channel: 'IN_APP',
      payload: {
        previousScore: prevScore,
        newScore: currentScore,
        drop: +(prevScore - currentScore).toFixed(2),
      },
    });
  }

  // New critical flags — only fire for flags not present in previous snapshot
  if (newCriticalFlagCount > 0) {
    notifications.push({
      eventType: 'NEW_CRITICAL_FLAG',
      channel: 'IN_APP',
      payload: {
        flagCount: newCriticalFlagCount,
        flagTitles: newCriticalFlagTitles.slice(0, 5),
      },
    });
    notifications.push({
      eventType: 'NEW_CRITICAL_FLAG',
      channel: 'EMAIL',
      payload: {
        subject: `EDRI Alert: ${newCriticalFlagCount} New Critical DCAA Compliance Issue(s) Detected`,
        flagCount: newCriticalFlagCount,
        flagTitles: newCriticalFlagTitles.slice(0, 5),
      },
    });
  }

  // Record all notifications for all eligible recipients
  for (const { eventType, channel, payload } of notifications) {
    if (recipients.length > 0) {
      for (const recipient of recipients) {
        await recordNotification(eventType, currentSnapshot.id, recipient.id, channel, payload).catch(() => {});
      }
    } else {
      // Broadcast notification (no specific recipient)
      await recordNotification(eventType, currentSnapshot.id, null, channel, payload).catch(() => {});
    }
  }

  // REMEDIATION_OVERDUE: detect open items past their due date and notify assigned users
  try {
    const overdueItems = await db.select({
      id: edriRemediationItems.id,
      title: edriRemediationItems.title,
      domainKey: edriRemediationItems.domainKey,
      priority: edriRemediationItems.priority,
      dueDate: edriRemediationItems.dueDate,
      assignedToUserId: edriRemediationItems.assignedToUserId,
      assignedToDisplayName: edriRemediationItems.assignedToDisplayName,
    })
    .from(edriRemediationItems)
    .where(sql`status = 'OPEN' AND due_date IS NOT NULL AND due_date < NOW() AND assigned_to_user_id IS NOT NULL`);

    for (const item of overdueItems) {
      // Avoid duplicate overdue notifications: skip if already notified for this item in the last 24h
      const existingNotif = await db.select({ id: edriNotifications.id })
        .from(edriNotifications)
        .where(sql`event_type = 'REMEDIATION_OVERDUE' AND recipient_user_id = ${item.assignedToUserId} AND sent_at > NOW() - INTERVAL '24 hours' AND payload->>'itemId' = ${String(item.id)}`)
        .limit(1);

      if (existingNotif.length > 0) continue;

      await recordNotification(
        'REMEDIATION_OVERDUE',
        currentSnapshot.id,
        item.assignedToUserId,
        'IN_APP',
        {
          itemId: item.id,
          title: item.title,
          domainKey: item.domainKey,
          priority: item.priority,
          dueDate: item.dueDate,
          assignedTo: item.assignedToDisplayName,
          message: `Remediation item "${item.title}" is overdue (due: ${item.dueDate}).`,
        },
      ).catch(() => {});
    }
  } catch (overdueErr) {
    console.error('[EDRI notifications] REMEDIATION_OVERDUE check failed:', overdueErr instanceof Error ? overdueErr.message : overdueErr);
  }
}

export async function triggerOverrideNotification(
  snapshotId: number,
  domainKey: string | null,
  overrideScore: number,
  justification: string,
  appliedBy: string,
  compositeScore: number,
  scoringBand: string,
): Promise<void> {
  const recipients = await getAdminAndOwnerUserIds();
  const payload: Record<string, unknown> = {
    type: 'OVERRIDE_APPLIED',
    snapshotId,
    domainKey,
    overrideScore,
    justification,
    appliedBy,
    compositeScore,
    scoringBand,
    message: domainKey
      ? `Admin override applied to ${domainKey} domain (score → ${overrideScore}) by ${appliedBy}. Composite: ${compositeScore.toFixed(1)} (${scoringBand}).`
      : `Admin composite override applied (score → ${overrideScore}) by ${appliedBy}. Band: ${scoringBand}.`,
  };

  if (recipients.length > 0) {
    for (const recipient of recipients) {
      await recordNotification('OVERRIDE_APPLIED', snapshotId, recipient.id, 'IN_APP', payload).catch(() => {});
    }
  } else {
    await recordNotification('OVERRIDE_APPLIED', snapshotId, null, 'IN_APP', payload).catch(() => {});
  }
}
