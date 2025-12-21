import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { processRunnerEvents, processRunLinks, trustedTimerIntegrations, donnaProcessObservations, donnaObservationDismissals } from '../../schema';
import { z } from 'zod';
import { desc, eq, sql, and, isNull, gt, lt, ne } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash, timingSafeEqual } from 'crypto';

// Legacy token support (can be removed once tenant-based auth is fully deployed)
const PROCESS_RUNNER_TOKEN = process.env.PROCESS_RUNNER_TOKEN;

const eventPayloadSchema = z.object({
  source: z.string().default('process_runner'),
  programRunId: z.union([z.string(), z.number()]).transform(v => String(v)),
  programName: z.string(),
  eventType: z.enum(['program_started', 'step_advanced', 'program_completed']),
  timestamp: z.string(),
  stepIndex: z.number().optional(),
  totalElapsedMinutes: z.number().optional(),
  metadata: z.record(z.any()).optional(),
}).passthrough();

// Hash an integration key for storage/comparison
function hashIntegrationKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Constant-time comparison of hashed keys
function safeCompareHashes(hash1: string, hash2: string): boolean {
  try {
    const buf1 = Buffer.from(hash1, 'hex');
    const buf2 = Buffer.from(hash2, 'hex');
    if (buf1.length !== buf2.length) return false;
    return timingSafeEqual(buf1, buf2);
  } catch {
    return false;
  }
}

// Validate tenant integration key
async function validateTenantAuth(authHeader: string | undefined, tenantId: string | undefined): Promise<{ valid: boolean; tenantId?: string }> {
  // Extract bearer token
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return { valid: false };
  }

  // If no tenantId provided, can't validate tenant-scoped auth
  if (!tenantId) {
    return { valid: false };
  }

  try {
    // Look up the tenant's integration
    const [integration] = await db
      .select()
      .from(trustedTimerIntegrations)
      .where(and(
        eq(trustedTimerIntegrations.tenantId, tenantId),
        isNull(trustedTimerIntegrations.revokedAt)
      ))
      .limit(1);

    if (!integration) {
      return { valid: false };
    }

    // Hash the provided token and compare
    const providedHash = hashIntegrationKey(token);
    if (!safeCompareHashes(providedHash, integration.integrationKeyHash)) {
      return { valid: false };
    }

    return { valid: true, tenantId };
  } catch (error) {
    console.error('[ProcessRunner] Auth validation error:', error);
    return { valid: false };
  }
}

export function registerProcessRunnerRoutes(app: Express) {
  app.post('/api/integrations/process-runner/events', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const tenantId = req.headers['x-tenant-id'] as string | undefined;
      
      // Try tenant-scoped authentication first
      const tenantAuth = await validateTenantAuth(authHeader, tenantId);
      
      // Fall back to legacy token if tenant auth fails and legacy token is configured
      const legacyToken = authHeader?.replace('Bearer ', '');
      const legacyValid = PROCESS_RUNNER_TOKEN && legacyToken === PROCESS_RUNNER_TOKEN;
      
      if (!tenantAuth.valid && !legacyValid) {
        console.warn('[ProcessRunner] Unauthorized event submission attempt', { 
          hasTenantId: !!tenantId,
          hasAuthHeader: !!authHeader 
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parseResult = eventPayloadSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        console.warn('[ProcessRunner] Invalid payload:', parseResult.error.issues);
        return res.status(400).json({ 
          error: 'Invalid payload', 
          details: parseResult.error.issues 
        });
      }

      const payload = parseResult.data;

      await db.insert(processRunnerEvents).values({
        source: payload.source,
        programRunId: payload.programRunId,
        programName: payload.programName,
        eventType: payload.eventType,
        stepIndex: payload.stepIndex ?? null,
        totalElapsedMinutes: payload.totalElapsedMinutes ?? null,
        eventTimestamp: new Date(payload.timestamp),
        metadata: payload.metadata ?? null,
        rawPayload: req.body,
      });

      console.log(`[ProcessRunner] Event received: ${payload.eventType} for ${payload.programName} (run: ${payload.programRunId})`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[ProcessRunner] Error processing event:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/integrations/process-runner/health', (_req: Request, res: Response) => {
    return res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      tokenConfigured: !!PROCESS_RUNNER_TOKEN 
    });
  });

  // GET - List all process runs (grouped by programRunId)
  app.get('/api/integrations/process-runner/runs', async (_req: Request, res: Response) => {
    try {
      const runs = await db
        .select({
          programRunId: processRunnerEvents.programRunId,
          programName: processRunnerEvents.programName,
          source: processRunnerEvents.source,
          eventCount: sql<number>`count(*)::int`,
          startedAt: sql<Date>`min(${processRunnerEvents.eventTimestamp})`,
          completedAt: sql<Date>`max(case when ${processRunnerEvents.eventType} = 'program_completed' then ${processRunnerEvents.eventTimestamp} end)`,
          lastStepIndex: sql<number>`max(${processRunnerEvents.stepIndex})`,
          totalElapsedMinutes: sql<number>`max(${processRunnerEvents.totalElapsedMinutes})`,
          lastEventAt: sql<Date>`max(${processRunnerEvents.eventTimestamp})`,
        })
        .from(processRunnerEvents)
        .groupBy(processRunnerEvents.programRunId, processRunnerEvents.programName, processRunnerEvents.source)
        .orderBy(desc(sql`max(${processRunnerEvents.eventTimestamp})`));

      return res.json(runs);
    } catch (error) {
      console.error('[ProcessRunner] Error fetching runs:', error);
      return res.status(500).json({ error: 'Failed to fetch process runs' });
    }
  });

  // GET - Get events for a specific run
  app.get('/api/integrations/process-runner/runs/:programRunId', async (req: Request, res: Response) => {
    try {
      const { programRunId } = req.params;

      const events = await db
        .select()
        .from(processRunnerEvents)
        .where(eq(processRunnerEvents.programRunId, programRunId))
        .orderBy(processRunnerEvents.eventTimestamp);

      if (events.length === 0) {
        return res.status(404).json({ error: 'Run not found' });
      }

      const startEvent = events.find(e => e.eventType === 'program_started');
      const endEvent = events.find(e => e.eventType === 'program_completed');
      const stepEvents = events.filter(e => e.eventType === 'step_advanced');

      // Get links for this run
      const links = await db
        .select()
        .from(processRunLinks)
        .where(eq(processRunLinks.programRunId, programRunId));

      return res.json({
        programRunId,
        programName: events[0].programName,
        source: events[0].source,
        startedAt: startEvent?.eventTimestamp || events[0].eventTimestamp,
        completedAt: endEvent?.eventTimestamp || null,
        totalElapsedMinutes: endEvent?.totalElapsedMinutes || events[events.length - 1].totalElapsedMinutes,
        stepCount: stepEvents.length,
        lastStepIndex: Math.max(...events.map(e => e.stepIndex || 0)),
        events,
        links,
      });
    } catch (error) {
      console.error('[ProcessRunner] Error fetching run details:', error);
      return res.status(500).json({ error: 'Failed to fetch run details' });
    }
  });

  // === LINKING ENDPOINTS ===

  const linkSchema = z.object({
    programRunId: z.string(),
    entityType: z.enum(['order', 'job', 'work_center']),
    entityId: z.string(),
    entityLabel: z.string().optional(),
  });

  // POST - Create a link between a process run and an EPOCH entity
  app.post('/api/integrations/process-runner/links', async (req: Request, res: Response) => {
    try {
      const parseResult = linkSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: 'Invalid payload', 
          details: parseResult.error.issues 
        });
      }

      const { programRunId, entityType, entityId, entityLabel } = parseResult.data;
      const linkedBy = (req as any).user?.username || 'unknown';

      // Check if link already exists
      const existing = await db
        .select()
        .from(processRunLinks)
        .where(and(
          eq(processRunLinks.programRunId, programRunId),
          eq(processRunLinks.entityType, entityType),
          eq(processRunLinks.entityId, entityId)
        ));

      if (existing.length > 0) {
        return res.status(409).json({ error: 'Link already exists', existing: existing[0] });
      }

      const [link] = await db.insert(processRunLinks).values({
        programRunId,
        entityType,
        entityId,
        entityLabel: entityLabel || null,
        linkedBy,
      }).returning();

      console.log(`[ProcessRunner] Link created: ${programRunId} -> ${entityType}:${entityId}`);

      return res.status(201).json(link);
    } catch (error) {
      console.error('[ProcessRunner] Error creating link:', error);
      return res.status(500).json({ error: 'Failed to create link' });
    }
  });

  // DELETE - Remove a link
  app.delete('/api/integrations/process-runner/links/:linkId', async (req: Request, res: Response) => {
    try {
      const { linkId } = req.params;

      const deleted = await db
        .delete(processRunLinks)
        .where(eq(processRunLinks.id, linkId))
        .returning();

      if (deleted.length === 0) {
        return res.status(404).json({ error: 'Link not found' });
      }

      console.log(`[ProcessRunner] Link deleted: ${linkId}`);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[ProcessRunner] Error deleting link:', error);
      return res.status(500).json({ error: 'Failed to delete link' });
    }
  });

  // GET - Get all links for a specific run
  app.get('/api/integrations/process-runner/runs/:programRunId/links', async (req: Request, res: Response) => {
    try {
      const { programRunId } = req.params;

      const links = await db
        .select()
        .from(processRunLinks)
        .where(eq(processRunLinks.programRunId, programRunId));

      return res.json(links);
    } catch (error) {
      console.error('[ProcessRunner] Error fetching links:', error);
      return res.status(500).json({ error: 'Failed to fetch links' });
    }
  });

  // GET - Get all process runs linked to a specific entity
  app.get('/api/integrations/process-runner/entity-links/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.params;

      const links = await db
        .select()
        .from(processRunLinks)
        .where(and(
          eq(processRunLinks.entityType, entityType),
          eq(processRunLinks.entityId, entityId)
        ));

      return res.json(links);
    } catch (error) {
      console.error('[ProcessRunner] Error fetching entity links:', error);
      return res.status(500).json({ error: 'Failed to fetch entity links' });
    }
  });

  // === EXPORT ENDPOINTS ===

  // Helper to get enriched runs data for export
  async function getRunsForExport(limit: number = 500) {
    const runs = await db
      .select({
        programRunId: processRunnerEvents.programRunId,
        programName: processRunnerEvents.programName,
        source: processRunnerEvents.source,
        eventCount: sql<number>`count(*)::int`,
        startedAt: sql<Date>`min(${processRunnerEvents.eventTimestamp})`,
        completedAt: sql<Date>`max(case when ${processRunnerEvents.eventType} = 'program_completed' then ${processRunnerEvents.eventTimestamp} end)`,
        lastStepIndex: sql<number>`max(${processRunnerEvents.stepIndex})`,
        totalElapsedMinutes: sql<number>`max(${processRunnerEvents.totalElapsedMinutes})`,
        numberOfSteps: sql<number>`count(case when ${processRunnerEvents.eventType} = 'step_advanced' then 1 end)::int`,
      })
      .from(processRunnerEvents)
      .groupBy(processRunnerEvents.programRunId, processRunnerEvents.programName, processRunnerEvents.source)
      .orderBy(desc(sql`max(${processRunnerEvents.eventTimestamp})`))
      .limit(limit);

    // Fetch links for all runs
    const allLinks = await db.select().from(processRunLinks);
    const linksByRunId = new Map<string, typeof allLinks>();
    for (const link of allLinks) {
      if (!linksByRunId.has(link.programRunId)) {
        linksByRunId.set(link.programRunId, []);
      }
      linksByRunId.get(link.programRunId)!.push(link);
    }

    return runs.map(run => {
      const links = linksByRunId.get(run.programRunId) || [];
      const orderLinks = links.filter(l => l.entityType === 'order');
      const jobLinks = links.filter(l => l.entityType === 'job');
      const workCenterLinks = links.filter(l => l.entityType === 'work_center');

      return {
        ...run,
        linkedOrderIds: orderLinks.map(l => l.entityLabel || l.entityId).join('; '),
        linkedJobIds: jobLinks.map(l => l.entityLabel || l.entityId).join('; '),
        linkedWorkCenters: workCenterLinks.map(l => l.entityLabel || l.entityId).join('; '),
      };
    });
  }

  // CSV Export
  app.get('/api/integrations/process-runner/export/csv', async (_req: Request, res: Response) => {
    try {
      const runs = await getRunsForExport();

      const headers = [
        'Program Run ID',
        'Program Name',
        'Source',
        'Started At',
        'Completed At',
        'Total Elapsed (min)',
        'Number of Steps',
        'Linked Orders',
        'Linked Jobs',
        'Linked Work Centers',
      ];

      const formatDate = (d: Date | null) => d ? new Date(d).toISOString() : '';
      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = runs.map(run => [
        escapeCSV(run.programRunId),
        escapeCSV(run.programName),
        escapeCSV(run.source),
        escapeCSV(formatDate(run.startedAt)),
        escapeCSV(formatDate(run.completedAt)),
        escapeCSV(run.totalElapsedMinutes ?? ''),
        escapeCSV(run.numberOfSteps ?? 0),
        escapeCSV(run.linkedOrderIds),
        escapeCSV(run.linkedJobIds),
        escapeCSV(run.linkedWorkCenters),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="process-runs-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csvContent);
    } catch (error) {
      console.error('[ProcessRunner] Error exporting CSV:', error);
      return res.status(500).json({ error: 'Failed to export CSV' });
    }
  });

  // PDF Export
  app.get('/api/integrations/process-runner/export/pdf', async (_req: Request, res: Response) => {
    try {
      const runs = await getRunsForExport();

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const formatDate = (d: Date | null) => {
        if (!d) return '-';
        return new Date(d).toLocaleString('en-US', { 
          dateStyle: 'short', 
          timeStyle: 'short' 
        });
      };

      const formatDuration = (min: number | null) => {
        if (min === null || min === undefined) return '-';
        const hrs = Math.floor(min / 60);
        const mins = Math.round(min % 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
      };

      // Title page
      let page = pdfDoc.addPage([612, 792]); // Letter size
      let y = 750;
      const margin = 50;
      const lineHeight = 14;

      page.drawText('Process Runs Export', {
        x: margin,
        y,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= 25;

      page.drawText(`Generated: ${new Date().toLocaleString()}`, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 10;

      page.drawText(`Total Runs: ${runs.length}`, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 30;

      // Draw each run
      for (const run of runs) {
        // Check if we need a new page
        if (y < 120) {
          page = pdfDoc.addPage([612, 792]);
          y = 750;
        }

        // Run header
        page.drawText(run.programName, {
          x: margin,
          y,
          size: 12,
          font: boldFont,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;

        page.drawText(`Run ID: ${run.programRunId}`, {
          x: margin,
          y,
          size: 9,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= lineHeight;

        // Run details in two columns
        const col1 = margin;
        const col2 = 300;

        page.drawText(`Started: ${formatDate(run.startedAt)}`, { x: col1, y, size: 9, font });
        page.drawText(`Completed: ${formatDate(run.completedAt)}`, { x: col2, y, size: 9, font });
        y -= lineHeight;

        page.drawText(`Duration: ${formatDuration(run.totalElapsedMinutes)}`, { x: col1, y, size: 9, font });
        page.drawText(`Steps: ${run.numberOfSteps ?? 0}`, { x: col2, y, size: 9, font });
        y -= lineHeight;

        // Linked entities
        if (run.linkedOrderIds || run.linkedJobIds || run.linkedWorkCenters) {
          const linkedText = [
            run.linkedOrderIds ? `Orders: ${run.linkedOrderIds}` : '',
            run.linkedJobIds ? `Jobs: ${run.linkedJobIds}` : '',
            run.linkedWorkCenters ? `Work Centers: ${run.linkedWorkCenters}` : '',
          ].filter(Boolean).join(' | ');

          page.drawText(linkedText, {
            x: margin,
            y,
            size: 8,
            font,
            color: rgb(0.2, 0.4, 0.6),
          });
          y -= lineHeight;
        }

        // Separator line
        y -= 5;
        page.drawLine({
          start: { x: margin, y },
          end: { x: 562, y },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        y -= 15;
      }

      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="process-runs-${new Date().toISOString().split('T')[0]}.pdf"`);
      return res.send(Buffer.from(pdfBytes));
    } catch (error) {
      console.error('[ProcessRunner] Error exporting PDF:', error);
      return res.status(500).json({ error: 'Failed to export PDF' });
    }
  });

  // === TRUSTED INTEGRATIONS MANAGEMENT (Admin only) ===

  // POST - Create a new trusted integration (returns the plaintext key ONCE)
  app.post('/api/integrations/process-runner/trusted-integrations', async (req: Request, res: Response) => {
    try {
      const { tenantId, description } = req.body;

      if (!tenantId || typeof tenantId !== 'string') {
        return res.status(400).json({ error: 'tenantId is required' });
      }

      // Check if tenant already has an active integration
      const [existing] = await db
        .select()
        .from(trustedTimerIntegrations)
        .where(and(
          eq(trustedTimerIntegrations.tenantId, tenantId),
          isNull(trustedTimerIntegrations.revokedAt)
        ))
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: 'Tenant already has an active integration. Revoke it first.' });
      }

      // Generate a secure random key
      const { randomBytes } = await import('crypto');
      const plaintextKey = randomBytes(32).toString('hex'); // 64 character hex string
      const keyHash = hashIntegrationKey(plaintextKey);

      const [integration] = await db.insert(trustedTimerIntegrations).values({
        tenantId,
        integrationKeyHash: keyHash,
        description: description || null,
      }).returning();

      console.log(`[ProcessRunner] Created trusted integration for tenant: ${tenantId}`);

      // Return the plaintext key ONCE - it cannot be recovered
      return res.status(201).json({
        id: integration.id,
        tenantId: integration.tenantId,
        integrationKey: plaintextKey, // Only returned on creation
        description: integration.description,
        createdAt: integration.createdAt,
        warning: 'Save this integration key securely. It cannot be recovered.',
      });
    } catch (error) {
      console.error('[ProcessRunner] Error creating trusted integration:', error);
      return res.status(500).json({ error: 'Failed to create trusted integration' });
    }
  });

  // GET - List all trusted integrations (without keys)
  app.get('/api/integrations/process-runner/trusted-integrations', async (_req: Request, res: Response) => {
    try {
      const integrations = await db
        .select({
          id: trustedTimerIntegrations.id,
          tenantId: trustedTimerIntegrations.tenantId,
          description: trustedTimerIntegrations.description,
          createdAt: trustedTimerIntegrations.createdAt,
          revokedAt: trustedTimerIntegrations.revokedAt,
          isActive: sql<boolean>`${trustedTimerIntegrations.revokedAt} IS NULL`,
        })
        .from(trustedTimerIntegrations)
        .orderBy(desc(trustedTimerIntegrations.createdAt));

      return res.json(integrations);
    } catch (error) {
      console.error('[ProcessRunner] Error fetching trusted integrations:', error);
      return res.status(500).json({ error: 'Failed to fetch trusted integrations' });
    }
  });

  // DELETE - Revoke a trusted integration
  app.delete('/api/integrations/process-runner/trusted-integrations/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(trustedTimerIntegrations)
        .set({ revokedAt: new Date() })
        .where(eq(trustedTimerIntegrations.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      console.log(`[ProcessRunner] Revoked trusted integration: ${id} (tenant: ${updated.tenantId})`);

      return res.json({ success: true, revokedAt: updated.revokedAt });
    } catch (error) {
      console.error('[ProcessRunner] Error revoking trusted integration:', error);
      return res.status(500).json({ error: 'Failed to revoke trusted integration' });
    }
  });

  // === DONNA PROCESS OBSERVATIONS ===
  // Quiet, optional pattern detection - Donna only notices and suggests

  const BASELINE_RUN_COUNT = 7; // Number of runs for baseline
  const DEVIATION_THRESHOLD = 1.25; // 25% deviation triggers observation
  const COOLDOWN_HOURS = 48; // Hours before dismissed observation can reappear

  // Analyze process runs and generate observations
  async function analyzeProcessPatterns(programName?: string): Promise<void> {
    try {
      // Get completed runs grouped by program
      const completedRuns = await db
        .select({
          programName: processRunnerEvents.programName,
          programRunId: processRunnerEvents.programRunId,
          totalElapsedMinutes: sql<number>`max(${processRunnerEvents.totalElapsedMinutes})`,
          completedAt: sql<Date>`max(case when ${processRunnerEvents.eventType} = 'program_completed' then ${processRunnerEvents.eventTimestamp} end)`,
        })
        .from(processRunnerEvents)
        .where(programName ? eq(processRunnerEvents.programName, programName) : sql`1=1`)
        .groupBy(processRunnerEvents.programName, processRunnerEvents.programRunId)
        .having(sql`max(case when ${processRunnerEvents.eventType} = 'program_completed' then 1 else 0 end) = 1`)
        .orderBy(desc(sql`max(${processRunnerEvents.eventTimestamp})`));

      // Group runs by program
      type RunRecord = { programName: string; programRunId: string; totalElapsedMinutes: number; completedAt: Date };
      const runsByProgram = new Map<string, RunRecord[]>();
      for (const run of completedRuns) {
        if (!runsByProgram.has(run.programName)) {
          runsByProgram.set(run.programName, []);
        }
        runsByProgram.get(run.programName)!.push(run);
      }

      // Analyze each program
      const entries = Array.from(runsByProgram.entries());
      for (const [program, runs] of entries) {
        if (runs.length < BASELINE_RUN_COUNT + 2) continue; // Need enough data

        // Split into baseline (older) and recent (newer)
        const recentRuns = runs.slice(0, 3);
        const baselineRuns = runs.slice(3, 3 + BASELINE_RUN_COUNT);

        // Calculate baseline stats
        const baselineDurations = baselineRuns
          .map((r: RunRecord) => r.totalElapsedMinutes)
          .filter((d: number | null): d is number => d !== null && d > 0);
        
        if (baselineDurations.length < 3) continue;

        const baselineAvg = baselineDurations.reduce((a: number, b: number) => a + b, 0) / baselineDurations.length;
        const baselineMin = Math.min(...baselineDurations);
        const baselineMax = Math.max(...baselineDurations);

        // Calculate recent stats
        const recentDurations = recentRuns
          .map((r: RunRecord) => r.totalElapsedMinutes)
          .filter((d: number | null): d is number => d !== null && d > 0);
        
        if (recentDurations.length === 0) continue;

        const recentAvg = recentDurations.reduce((a: number, b: number) => a + b, 0) / recentDurations.length;

        // Check for duration deviation
        const observationKey = `duration_deviation:${program}`;
        
        if (recentAvg > baselineAvg * DEVIATION_THRESHOLD) {
          // Recent runs are significantly longer
          const message = `This program usually completes in ~${Math.round(baselineMin)}-${Math.round(baselineMax)} minutes, but the last ${recentDurations.length} runs averaged ${Math.round(recentAvg)} minutes.`;
          
          await upsertObservation({
            observationType: 'duration_deviation',
            programName: program,
            observationKey,
            message,
            baselineMinutes: baselineAvg,
            recentAvgMinutes: recentAvg,
            details: { baselineMin, baselineMax, recentCount: recentDurations.length },
          });
        } else if (recentAvg < baselineAvg * (1 / DEVIATION_THRESHOLD)) {
          // Recent runs are significantly shorter (could indicate skip or issue)
          const message = `This program has recently been completing faster than usual (~${Math.round(recentAvg)} min vs typical ${Math.round(baselineMin)}-${Math.round(baselineMax)} min).`;
          
          await upsertObservation({
            observationType: 'duration_deviation',
            programName: program,
            observationKey,
            message,
            baselineMinutes: baselineAvg,
            recentAvgMinutes: recentAvg,
            details: { baselineMin, baselineMax, recentCount: recentDurations.length },
          });
        } else {
          // Remove stale observation if pattern normalized
          await db.delete(donnaProcessObservations)
            .where(eq(donnaProcessObservations.observationKey, observationKey));
        }
      }
    } catch (error) {
      console.error('[Donna] Error analyzing process patterns:', error);
    }
  }

  // Upsert an observation (update if exists, insert if not)
  async function upsertObservation(obs: {
    observationType: string;
    programName: string;
    observationKey: string;
    message: string;
    baselineMinutes?: number;
    recentAvgMinutes?: number;
    details?: any;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [existing] = await db
      .select()
      .from(donnaProcessObservations)
      .where(eq(donnaProcessObservations.observationKey, obs.observationKey))
      .limit(1);

    if (existing) {
      await db.update(donnaProcessObservations)
        .set({
          message: obs.message,
          baselineMinutes: obs.baselineMinutes ?? null,
          recentAvgMinutes: obs.recentAvgMinutes ?? null,
          details: obs.details ?? null,
          expiresAt,
        })
        .where(eq(donnaProcessObservations.id, existing.id));
    } else {
      await db.insert(donnaProcessObservations).values({
        observationType: obs.observationType,
        programName: obs.programName,
        observationKey: obs.observationKey,
        message: obs.message,
        baselineMinutes: obs.baselineMinutes ?? null,
        recentAvgMinutes: obs.recentAvgMinutes ?? null,
        details: obs.details ?? null,
        expiresAt,
      });
    }
  }

  // GET - Donna observations for a specific program or all
  app.get('/api/donna/process-observations', async (req: Request, res: Response) => {
    try {
      const { programName } = req.query;
      const now = new Date();

      // Trigger analysis (lightweight, runs inline)
      await analyzeProcessPatterns(programName as string | undefined);

      // Get active dismissals
      const activeDismissals = await db
        .select({ observationKey: donnaObservationDismissals.observationKey })
        .from(donnaObservationDismissals)
        .where(gt(donnaObservationDismissals.cooldownUntil, now));

      const dismissedKeys = new Set(activeDismissals.map(d => d.observationKey));

      // Get observations
      let query = db
        .select()
        .from(donnaProcessObservations)
        .where(sql`(${donnaProcessObservations.expiresAt} IS NULL OR ${donnaProcessObservations.expiresAt} > ${now})`);

      const observations = await query.orderBy(desc(donnaProcessObservations.createdAt));

      // Filter by program if specified, and exclude dismissed
      const filtered = observations
        .filter(obs => !dismissedKeys.has(obs.observationKey))
        .filter(obs => !programName || obs.programName === programName);

      return res.json(filtered);
    } catch (error) {
      console.error('[Donna] Error fetching observations:', error);
      return res.status(500).json({ error: 'Failed to fetch observations' });
    }
  });

  // POST - Dismiss an observation
  app.post('/api/donna/process-observations/:id/dismiss', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const username = (req as any).user?.username || 'unknown';

      // Find the observation
      const [observation] = await db
        .select()
        .from(donnaProcessObservations)
        .where(eq(donnaProcessObservations.id, id))
        .limit(1);

      if (!observation) {
        return res.status(404).json({ error: 'Observation not found' });
      }

      // Create dismissal with cooldown
      const cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);

      await db.insert(donnaObservationDismissals).values({
        observationKey: observation.observationKey,
        dismissedBy: username,
        cooldownUntil,
      });

      console.log(`[Donna] Observation dismissed: ${observation.observationKey} by ${username}`);

      return res.json({ success: true, cooldownUntil });
    } catch (error) {
      console.error('[Donna] Error dismissing observation:', error);
      return res.status(500).json({ error: 'Failed to dismiss observation' });
    }
  });

  // GET - Donna observations for Process Runs page (contextual)
  app.get('/api/donna/process-observations/summary', async (_req: Request, res: Response) => {
    try {
      const now = new Date();

      // Get active dismissals
      const activeDismissals = await db
        .select({ observationKey: donnaObservationDismissals.observationKey })
        .from(donnaObservationDismissals)
        .where(gt(donnaObservationDismissals.cooldownUntil, now));

      const dismissedKeys = new Set(activeDismissals.map(d => d.observationKey));

      // Get active, non-dismissed observations
      const observations = await db
        .select()
        .from(donnaProcessObservations)
        .where(sql`(${donnaProcessObservations.expiresAt} IS NULL OR ${donnaProcessObservations.expiresAt} > ${now})`)
        .orderBy(desc(donnaProcessObservations.createdAt))
        .limit(5);

      const filtered = observations.filter(obs => !dismissedKeys.has(obs.observationKey));

      return res.json({
        count: filtered.length,
        observations: filtered,
      });
    } catch (error) {
      console.error('[Donna] Error fetching observation summary:', error);
      return res.status(500).json({ error: 'Failed to fetch observation summary' });
    }
  });
}
