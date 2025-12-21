import { Express, Request, Response } from 'express';
import { db } from '../../db';
import { processRunnerEvents } from '../../schema';
import { z } from 'zod';

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
}
