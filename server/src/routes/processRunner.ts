import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { processRunnerEvents } from '../../schema';

const router = Router();

/**
 * POST /api/integrations/process-runner/events
 * 
 * Minimal ingestion endpoint for process-run events from external Timer app.
 * Safe, ignorable, and non-disruptive.
 * 
 * Expected payload:
 * - source: "process_runner"
 * - programRunId: string
 * - programName: string
 * - eventType: "program_started" | "step_advanced" | "program_completed"
 * - timestamp: ISO string
 * - stepIndex: number (optional)
 * - totalElapsedMinutes: number (optional)
 * - metadata: JSON (optional)
 */
router.post('/events', async (req: Request, res: Response) => {
  try {
    // Light token-based authentication
    const authHeader = req.headers['x-process-runner-token'] || req.headers['authorization'];
    const expectedToken = process.env.PROCESS_RUNNER_TOKEN;
    
    // If token is configured, validate it
    if (expectedToken && authHeader !== expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      console.log('[ProcessRunner] Unauthorized request - invalid token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;

    // Light validation - just check we have something
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Extract known fields, store everything
    const {
      source = 'process_runner',
      programRunId,
      programName,
      eventType,
      timestamp,
      stepIndex,
      totalElapsedMinutes,
      metadata,
      ...rest
    } = payload;

    // Parse timestamp if provided
    let eventTimestamp: Date | null = null;
    if (timestamp) {
      try {
        eventTimestamp = new Date(timestamp);
        if (isNaN(eventTimestamp.getTime())) {
          eventTimestamp = null;
        }
      } catch {
        eventTimestamp = null;
      }
    }

    // Insert event - store raw payload for future use
    await db.insert(processRunnerEvents).values({
      source: String(source),
      programRunId: programRunId ? String(programRunId) : null,
      programName: programName ? String(programName) : null,
      eventType: eventType ? String(eventType) : null,
      eventTimestamp,
      stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
      totalElapsedMinutes: typeof totalElapsedMinutes === 'number' ? totalElapsedMinutes : null,
      metadata: metadata || null,
      rawPayload: payload,
    });

    console.log(`[ProcessRunner] Event received: ${eventType || 'unknown'} for ${programName || 'unknown program'}`);

    return res.status(200).json({ success: true, message: 'Event received' });
  } catch (error) {
    console.error('[ProcessRunner] Error processing event:', error);
    // Don't crash - return 500 but keep server running
    return res.status(500).json({ error: 'Failed to process event' });
  }
});

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', service: 'process-runner-integration' });
});

export default router;
