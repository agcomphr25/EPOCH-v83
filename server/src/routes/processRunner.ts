import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { processRunnerEvents, processRunLinks } from '../../schema';
import { z } from 'zod';
import { desc, eq, sql, and } from 'drizzle-orm';

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

export function registerProcessRunnerRoutes(app: Express) {
  app.post('/api/integrations/process-runner/events', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const providedToken = authHeader?.replace('Bearer ', '');
      
      if (PROCESS_RUNNER_TOKEN && providedToken !== PROCESS_RUNNER_TOKEN) {
        console.warn('[ProcessRunner] Unauthorized event submission attempt');
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
}
