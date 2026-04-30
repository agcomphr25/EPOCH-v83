import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { db } from '../../db';
import {
  edriScoreSnapshots,
  edriDomainScores,
  edriRedFlags,
  edriRemediationItems,
  edriAdminOverrides,
  edriEvidencePackets,
  edriNotifications,
  InsertEdriAdminOverride,
} from '../../schema';
import { eq, desc, and, isNull, sql, SQL } from 'drizzle-orm';
import {
  computeEdriSnapshot,
  getLatestSnapshot,
  getSnapshotById,
  getSnapshotHistory,
  applyAdminOverride,
  computeFutureStateScore,
} from '../services/edriScoringService';
import { getRemediationQueue, assignRemediationItem, updateRemediationStatus } from '../services/edriRemediationService';
import { requestEvidencePacket, getEvidencePacketStatus, streamEvidencePacket } from '../services/edriEvidenceService';
import { triggerEdriNotifications, triggerOverrideNotification } from '../services/edriNotificationService';
import { auditService } from '../services/auditService';

const router = Router();
router.use(authenticateToken);

function requireEdriAccess(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id: number; role: string; username: string } }).user;
  if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
    res.status(403).json({ error: 'Access denied. EDRI dashboard requires ADMIN or OWNER role.' }); return;
  }
  next();
}

function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id: number; role: string; username: string } }).user;
  if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (user.role !== 'OWNER') { res.status(403).json({ error: 'Access denied. This action requires OWNER role.' }); return; }
  next();
}

function getUser(req: Request): { id: number; role: string; username: string } | undefined {
  return (req as Request & { user?: { id: number; role: string; username: string } }).user;
}

// NOTE: requireEdriAccess is applied per-route below.
// EMPLOYEE users are permitted to access /remediation and /notifications for their own items.

// POST /api/edri/compute — Trigger score recomputation
router.post('/compute', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    // Run the DCAA forensic scan first so dcaa_audit_findings is current before scoring.
    // This ensures EDRI reflects real violations rather than a stale (or empty) findings table.
    try {
      const { runForensicScan } = await import('../services/dcaaForensicEngine');
      const scanSummary = await runForensicScan();
      console.log(`[EDRI /compute] Forensic pre-scan: ${scanSummary.newFindings} new findings, ${scanSummary.violationsClosed} auto-resolved`);
    } catch (scanErr) {
      console.warn('[EDRI /compute] Forensic pre-scan failed (continuing with score computation):', scanErr instanceof Error ? scanErr.message : scanErr);
    }

    // Get previous snapshot for comparison (notifications)
    const prevSnapshots = await db.select().from(edriScoreSnapshots)
      .orderBy(desc(edriScoreSnapshots.computedAt)).limit(1);
    const previousSnapshot = prevSnapshots[0] ?? null;

    const result = await computeEdriSnapshot(user?.id, user?.username);

    // Fire notifications asynchronously
    const criticalFlags = result.redFlags.filter(f => f.severity === 'CRITICAL' && f.isActive === true);
    triggerEdriNotifications(
      { id: result.snapshot.id, compositeScore: result.snapshot.compositeScore ?? '0', scoringBand: result.snapshot.scoringBand ?? '' },
      previousSnapshot ? { id: previousSnapshot.id, compositeScore: previousSnapshot.compositeScore ?? '0', scoringBand: previousSnapshot.scoringBand ?? '' } : null,
      criticalFlags.length,
      criticalFlags.map(f => f.title),
    ).catch(err => console.error('EDRI notification error:', err));

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-snapshot-${result.snapshot.id}`,
      action: 'EDRI_SCORE_COMPUTED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: {
        resource_type: 'EDRI',
        compositeScore: result.snapshot.compositeScore,
        scoringBand: result.snapshot.scoringBand,
        redFlagCount: result.redFlags.length,
      },
    }).catch(() => {});

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute EDRI snapshot';
    console.error('EDRI compute error:', err);
    res.status(500).json({ error: message });
  }
});

// POST /api/edri/recompute — alias for /compute (explicit manual refresh)
router.post('/recompute', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    try {
      const { runForensicScan } = await import('../services/dcaaForensicEngine');
      const scanSummary = await runForensicScan();
      console.log(`[EDRI /recompute] Forensic pre-scan: ${scanSummary.newFindings} new findings, ${scanSummary.violationsClosed} auto-resolved`);
    } catch (scanErr) {
      console.warn('[EDRI /recompute] Forensic pre-scan failed (continuing with score computation):', scanErr instanceof Error ? scanErr.message : scanErr);
    }

    const prevSnapshots = await db.select().from(edriScoreSnapshots)
      .orderBy(desc(edriScoreSnapshots.computedAt)).limit(1);
    const previousSnapshot = prevSnapshots[0] ?? null;

    const result = await computeEdriSnapshot(user?.id, user?.username);

    const criticalFlags = result.redFlags.filter(f => f.severity === 'CRITICAL' && f.isActive === true);
    triggerEdriNotifications(
      { id: result.snapshot.id, compositeScore: result.snapshot.compositeScore ?? '0', scoringBand: result.snapshot.scoringBand ?? '' },
      previousSnapshot ? { id: previousSnapshot.id, compositeScore: previousSnapshot.compositeScore ?? '0', scoringBand: previousSnapshot.scoringBand ?? '' } : null,
      criticalFlags.length,
      criticalFlags.map(f => f.title),
    ).catch(err => console.error('EDRI notification error:', err));

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-snapshot-${result.snapshot.id}`,
      action: 'EDRI_SCORE_COMPUTED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: {
        resource_type: 'EDRI',
        trigger: 'manual_refresh',
        compositeScore: result.snapshot.compositeScore,
        scoringBand: result.snapshot.scoringBand,
        redFlagCount: result.redFlags.length,
      },
    }).catch(() => {});

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to recompute EDRI snapshot';
    console.error('EDRI recompute error:', err);
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/snapshot/latest
router.get('/snapshot/latest', requireEdriAccess, async (_req: Request, res: Response) => {
  try {
    const result = await getLatestSnapshot();
    if (!result) { res.json(null); return; }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch snapshot';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/snapshot/history
router.get('/snapshot/history', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const snapshots = await getSnapshotHistory(limit, offset);
    res.json(snapshots);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch history';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/snapshot/:id — snapshot detail with all children
router.get('/snapshot/:id', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid snapshot ID' }); return; }
    const result = await getSnapshotById(id);
    if (!result) { res.status(404).json({ error: 'Snapshot not found' }); return; }
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch snapshot';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/red-flags — active flags with filters
router.get('/red-flags', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const { domainKey, severity, isActive, snapshotId } = req.query as Record<string, string>;
    const conditions: SQL[] = [];

    if (domainKey) conditions.push(eq(edriRedFlags.domainKey, domainKey));
    if (severity) conditions.push(eq(edriRedFlags.severity, severity));
    if (isActive !== undefined) conditions.push(eq(edriRedFlags.isActive, isActive === 'true'));

    if (snapshotId) {
      conditions.push(eq(edriRedFlags.snapshotId, parseInt(snapshotId)));
    } else {
      // Default to the latest snapshot so each unique flag only appears once
      conditions.push(
        sql`${edriRedFlags.snapshotId} = (SELECT MAX(id) FROM edri_score_snapshots)`
      );
    }

    const query = db.select().from(edriRedFlags).orderBy(desc(edriRedFlags.detectedAt));
    const results = await query.where(and(...conditions));
    res.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch red flags';
    res.status(500).json({ error: message });
  }
});

// PATCH /api/edri/red-flags/:id/resolve
router.patch('/red-flags/:id/resolve', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = parseInt(req.params.id);
    const { resolutionNote } = req.body as { resolutionNote?: string };

    if (!resolutionNote) { res.status(400).json({ error: 'resolutionNote is required' }); return; }

    const result = await db.update(edriRedFlags).set({
      isActive: false,
      resolvedAt: new Date(),
      resolvedByUserId: user?.id ?? null,
      resolvedByDisplayName: user?.username ?? null,
      resolutionNote,
    }).where(eq(edriRedFlags.id, id)).returning();

    if (result.length === 0) { res.status(404).json({ error: 'Red flag not found' }); return; }

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-redflag-${id}`,
      action: 'EDRI_RED_FLAG_RESOLVED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { resource_type: 'EDRI', flagId: id, resolutionNote },
    }).catch(() => {});

    res.json(result[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve flag';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/remediation — queue with filters
// ADMIN/OWNER: full queue; EMPLOYEE: own assigned items only; all other roles: 403
router.get('/remediation', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (user.role !== 'ADMIN' && user.role !== 'OWNER' && user.role !== 'EMPLOYEE') {
      res.status(403).json({ error: 'Access denied.' }); return;
    }

    const { domainKey, priority, status, snapshotId, assignedToUserId } = req.query as Record<string, string>;

    const filters: {
      domainKey?: string;
      priority?: string;
      status?: string;
      snapshotId?: number;
      assignedToUserId?: number;
      unassigned?: boolean;
    } = {};

    if (domainKey) filters.domainKey = domainKey;
    if (priority) filters.priority = priority;
    if (status) filters.status = status;
    if (snapshotId) filters.snapshotId = parseInt(snapshotId);

    // EMPLOYEE: enforce own-items-only filter (no ability to scope wider)
    if (user.role === 'EMPLOYEE') {
      filters.assignedToUserId = user.id;
    } else {
      // ADMIN/OWNER: allow assignee filter from query
      if (assignedToUserId === 'unassigned') {
        filters.unassigned = true;
      } else if (assignedToUserId && !isNaN(parseInt(assignedToUserId))) {
        filters.assignedToUserId = parseInt(assignedToUserId);
      }
    }

    const items = await getRemediationQueue(filters);
    res.json(items);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch remediation queue';
    res.status(500).json({ error: message });
  }
});

// PATCH /api/edri/remediation/:id — assign (ADMIN/OWNER only); status update (OWNER for WAIVE, EMPLOYEE own items only)
router.patch('/remediation/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = parseInt(req.params.id);
    const { action, status, note, assignToUserId, assignToDisplayName, dueDate, waiverJustification } = req.body as {
      action: string;
      status?: string;
      note?: string;
      assignToUserId?: number;
      assignToDisplayName?: string;
      dueDate?: string;
      waiverJustification?: string;
    };

    if (action === 'assign') {
      if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') { res.status(403).json({ error: 'Access denied. Only ADMIN or OWNER can assign remediation items.' }); return; }
      const result = await assignRemediationItem(id, assignToUserId!, assignToDisplayName!, dueDate ?? null);
      if (!result) { res.status(404).json({ error: 'Item not found' }); return; }

      await auditService.logEvent({
        entityType: 'edri_snapshot',
        entityId: `edri-remediation-${id}`,
        action: 'EDRI_REMEDIATION_ASSIGNED',
        actor: { id: user?.id, username: user?.username, role: user?.role },
        meta: { resource_type: 'EDRI', itemId: id, assignedTo: assignToDisplayName, dueDate },
      }).catch(() => {});

      res.json(result); return;
    }

    if (action === 'status') {
      if (status === 'WAIVED' && user?.role !== 'OWNER') {
        res.status(403).json({ error: 'Only OWNER can waive remediation items' }); return;
      }
      // EMPLOYEE: may only update status on items assigned to them (own items, prevent IDOR)
      // All other non-ADMIN/OWNER roles: 403 (no status update permission)
      if (user?.role === 'EMPLOYEE') {
        const items = await db.select({ assignedToUserId: edriRemediationItems.assignedToUserId })
          .from(edriRemediationItems)
          .where(eq(edriRemediationItems.id, id))
          .limit(1);
        const item = items[0];
        if (!item) { res.status(404).json({ error: 'Item not found' }); return; }
        if (item.assignedToUserId !== user?.id) {
          res.status(403).json({ error: 'Access denied. You can only update remediation items assigned to you.' }); return;
        }
      } else if (user?.role !== 'ADMIN' && user?.role !== 'OWNER') {
        // All other non-ADMIN/OWNER/EMPLOYEE roles: deny status updates entirely
        res.status(403).json({ error: 'Access denied. Remediation status updates require ADMIN, OWNER, or assigned EMPLOYEE role.' }); return;
      }
      const result = await updateRemediationStatus(
        id, status!, note ?? null, user?.id!, user?.username!, waiverJustification,
      );
      if (!result) { res.status(404).json({ error: 'Item not found' }); return; }

      await auditService.logEvent({
        entityType: 'edri_snapshot',
        entityId: `edri-remediation-${id}`,
        action: 'EDRI_REMEDIATION_STATUS_CHANGED',
        actor: { id: user?.id, username: user?.username, role: user?.role },
        meta: { resource_type: 'EDRI', itemId: id, newStatus: status, note },
      }).catch(() => {});

      res.json(result); return;
    }

    res.status(400).json({ error: 'Invalid action. Use "assign" or "status".' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update remediation item';
    res.status(500).json({ error: message });
  }
});

// POST /api/edri/override — admin score override (OWNER only)
router.post('/override', requireOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { snapshotId: bodySnapshotId, domainKey, overrideScore, justification } = req.body as {
      snapshotId?: number;
      domainKey?: string;
      overrideScore?: number;
      justification?: string;
    };

    if (overrideScore == null || !justification) {
      res.status(400).json({ error: 'overrideScore and justification are required' }); return;
    }

    // Use provided snapshotId or fall back to latest snapshot
    let resolvedSnapshotId = bodySnapshotId;
    if (!resolvedSnapshotId) {
      const latest = await getLatestSnapshot();
      if (!latest) { res.status(404).json({ error: 'No EDRI snapshot found — run compute first' }); return; }
      resolvedSnapshotId = latest.snapshot.id;
    }
    const snapshotId = resolvedSnapshotId;

    await applyAdminOverride(snapshotId, domainKey ?? null, Number(overrideScore), justification, user!.id, user!.username);

    // Fetch current snapshot for band context
    const currentSnap = await getLatestSnapshot().catch(() => null);
    const compositeScore = currentSnap ? Number(currentSnap.snapshot.compositeScore) : Number(overrideScore);
    const scoringBand = currentSnap?.snapshot.scoringBand ?? 'UNKNOWN';

    // Fire dedicated OVERRIDE_APPLIED notification with full context
    await triggerOverrideNotification(
      snapshotId,
      domainKey ?? null,
      Number(overrideScore),
      justification,
      user!.username ?? `user-${user!.id}`,
      compositeScore,
      scoringBand,
    ).catch(() => {});

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-snapshot-${snapshotId}`,
      action: 'EDRI_ADMIN_OVERRIDE_APPLIED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { resource_type: 'EDRI', snapshotId, domainKey, overrideScore, justification },
    }).catch(() => {});

    res.json({ success: true, message: 'Override applied successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to apply override';
    res.status(500).json({ error: message });
  }
});

// POST /api/edri/evidence/generate
router.post('/evidence/generate', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { snapshotId, domainKey } = req.body as { snapshotId?: number; domainKey?: string };
    if (!snapshotId) { res.status(400).json({ error: 'snapshotId is required' }); return; }

    const packetId = await requestEvidencePacket(
      snapshotId,
      domainKey ?? null,
      user?.id ?? 0,
      user?.username ?? 'System',
    );

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-evidence-${packetId}`,
      action: 'EDRI_EVIDENCE_PACKET_REQUESTED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { resource_type: 'EDRI', snapshotId, domainKey },
    }).catch(() => {});

    res.json({ packetId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start evidence generation';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/evidence/:packetId — poll status
router.get('/evidence/:packetId', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const packetId = parseInt(req.params.packetId);
    const packet = await getEvidencePacketStatus(packetId);
    if (!packet) { res.status(404).json({ error: 'Evidence packet not found' }); return; }
    res.json(packet);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch evidence packet';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/evidence/:packetId/download — download ZIP from object storage
router.get('/evidence/:packetId/download', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const packetId = parseInt(req.params.packetId);

    await auditService.logEvent({
      entityType: 'edri_snapshot',
      entityId: `edri-evidence-${packetId}`,
      action: 'EDRI_EVIDENCE_PACKET_DOWNLOADED',
      actor: { id: user?.id, username: user?.username, role: user?.role },
      meta: { resource_type: 'EDRI', packetId },
    }).catch(() => {});

    const streamed = await streamEvidencePacket(packetId, res);
    if (!streamed && !res.headersSent) {
      res.status(404).json({ error: 'Evidence packet not ready or not found' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to download evidence packet';
    if (!res.headersSent) res.status(500).json({ error: message });
  }
});

// GET /api/edri/overrides — list all admin overrides
router.get('/overrides', requireEdriAccess, async (_req: Request, res: Response) => {
  try {
    const overrides = await db.select().from(edriAdminOverrides)
      .orderBy(desc(edriAdminOverrides.createdAt));
    res.json(overrides);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch overrides';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/notifications — recent EDRI notifications (any authenticated user sees their own)
router.get('/notifications', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const limit = parseInt(req.query.limit as string) || 20;

    const notifications = await db.select().from(edriNotifications)
      .where(eq(edriNotifications.recipientUserId, user?.id ?? 0))
      .orderBy(desc(edriNotifications.sentAt))
      .limit(limit);

    res.json(notifications);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
    res.status(500).json({ error: message });
  }
});

// Parse an interval in hours from a cron expression of the form "M */N * * *" or "M H * * *".
// Returns null if the expression cannot be parsed into a simple repeating-hours interval.
function parseIntervalHoursFromCron(expr: string): number | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const hourField = parts[1];
  // */N — step syntax (every N hours)
  const stepMatch = hourField.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const n = parseInt(stepMatch[1], 10);
    return n > 0 && n <= 24 ? n : null;
  }
  // Single fixed hour (runs once per day)
  const fixedMatch = hourField.match(/^(\d+)$/);
  if (fixedMatch) return 24;
  return null;
}

// GET /api/edri/schedule — returns auto-refresh schedule metadata
router.get('/schedule', requireEdriAccess, async (_req: Request, res: Response) => {
  try {
    const scheduleExpression = process.env.EDRI_CRON_SCHEDULE ?? '0 */4 * * *';
    const parsedIntervalHours = parseIntervalHoursFromCron(scheduleExpression);
    const INTERVAL_HOURS = parsedIntervalHours ?? 4; // fallback to 4 if expression is non-standard
    const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;
    const GRACE_MS = 5 * 60 * 1000; // 5 minute grace window

    // Get the most recent snapshot timestamp
    const rows = await db.select({ computedAt: edriScoreSnapshots.computedAt })
      .from(edriScoreSnapshots)
      .orderBy(desc(edriScoreSnapshots.computedAt))
      .limit(1);
    const lastComputedAt: Date | null = rows[0]?.computedAt ?? null;

    // Compute next fire time: first multiple of INTERVAL_MS strictly after lastComputedAt
    const baseMs = lastComputedAt ? lastComputedAt.getTime() : Date.now();
    const nextRefreshAt = new Date(Math.ceil((baseMs + 1) / INTERVAL_MS) * INTERVAL_MS);
    const now = Date.now();
    const isBehindSchedule = now > nextRefreshAt.getTime() + GRACE_MS;
    const msUntilNext = Math.max(0, nextRefreshAt.getTime() - now);

    res.json({
      scheduleExpression,
      intervalHours: INTERVAL_HOURS,
      lastComputedAt: lastComputedAt ? lastComputedAt.toISOString() : null,
      nextRefreshAt: nextRefreshAt.toISOString(),
      msUntilNext,
      isBehindSchedule,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch schedule metadata';
    res.status(500).json({ error: message });
  }
});

// GET /api/edri/future-state/:snapshotId
router.get('/future-state/:snapshotId', requireEdriAccess, async (req: Request, res: Response) => {
  try {
    const snapshotId = parseInt(req.params.snapshotId);
    const futureScore = await computeFutureStateScore(snapshotId);
    res.json({ futureStateScore: futureScore });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute future state';
    res.status(500).json({ error: message });
  }
});

export default router;
