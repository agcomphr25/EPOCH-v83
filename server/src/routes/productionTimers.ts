import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  productionPrograms, 
  productionProgramSteps, 
  productionProgramRuns, 
  productionProgramRunEvents,
  insertProductionProgramRunSchema,
} from '../../schema';
import { eq, and, desc, or, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth';

function calculateElapsedSeconds(startedAt: Date, events: Array<{ eventType: string; occurredAt: Date }>): number {
  let totalSeconds = 0;
  let lastResumeTime = startedAt;
  let isPaused = false;

  for (const event of events) {
    if (event.eventType === 'paused') {
      if (!isPaused) {
        totalSeconds += Math.floor((event.occurredAt.getTime() - lastResumeTime.getTime()) / 1000);
        isPaused = true;
      }
    } else if (event.eventType === 'resumed' || event.eventType === 'started') {
      lastResumeTime = event.occurredAt;
      isPaused = false;
    }
  }

  if (!isPaused) {
    totalSeconds += Math.floor((new Date().getTime() - lastResumeTime.getTime()) / 1000);
  }

  return totalSeconds;
}

const router = Router();

router.use(authenticateToken);

const startRunSchema = z.object({
  programId: z.string().uuid(),
  instanceName: z.string().optional(),
  sku: z.string().optional(),
});

router.post('/runs/start', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const parseResult = startRunSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { programId, instanceName, sku } = parseResult.data;

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, programId))
      .limit(1);

    if (!program) {
      return res.status(404).json({ error: 'Program not found' });
    }

    if (!program.isActive) {
      return res.status(400).json({ error: 'Program is not active' });
    }

    const [run] = await db.insert(productionProgramRuns).values({
      programId,
      startedByUserId: userId,
      instanceName: instanceName || null,
      sku: sku || null,
      status: 'running',
      currentStepIndex: 0,
      startedAt: new Date(),
      totalElapsedSeconds: 0,
    }).returning();

    await db.insert(productionProgramRunEvents).values({
      runId: run.id,
      eventType: 'started',
      stepIndex: 0,
      userId,
      occurredAt: new Date(),
    });

    console.log(`[ProductionTimer] Run started: ${run.id} for program ${program.name}`);

    return res.status(201).json(run);
  } catch (error) {
    console.error('[ProductionTimer] Error starting run:', error);
    return res.status(500).json({ error: 'Failed to start run' });
  }
});

router.post('/runs/:id/pause', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'running') {
      return res.status(400).json({ error: `Cannot pause run with status: ${run.status}` });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'paused', 
        updatedAt: new Date() 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'paused',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: new Date(),
    });

    console.log(`[ProductionTimer] Run paused: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error pausing run:', error);
    return res.status(500).json({ error: 'Failed to pause run' });
  }
});

router.post('/runs/:id/resume', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'paused' && run.status !== 'awaiting_next') {
      return res.status(400).json({ error: `Cannot resume run with status: ${run.status}` });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'running', 
        updatedAt: new Date() 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'resumed',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: new Date(),
    });

    console.log(`[ProductionTimer] Run resumed: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error resuming run:', error);
    return res.status(500).json({ error: 'Failed to resume run' });
  }
});

router.post('/runs/:id/advance', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'stopped') {
      return res.status(400).json({ error: `Cannot advance run with status: ${run.status}` });
    }

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, run.programId))
      .orderBy(productionProgramSteps.stepIndex);

    const totalSteps = steps.length;
    const nextStepIndex = run.currentStepIndex + 1;

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'step_complete',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: new Date(),
    });

    if (nextStepIndex >= totalSteps) {
      const events = await db
        .select()
        .from(productionProgramRunEvents)
        .where(eq(productionProgramRunEvents.runId, id))
        .orderBy(productionProgramRunEvents.occurredAt);

      const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, events);
      const completedAt = new Date();

      const [updated] = await db
        .update(productionProgramRuns)
        .set({ 
          status: 'completed',
          completedAt,
          totalElapsedSeconds,
          updatedAt: new Date(),
        })
        .where(eq(productionProgramRuns.id, id))
        .returning();

      await db.insert(productionProgramRunEvents).values({
        runId: id,
        eventType: 'program_completed',
        stepIndex: run.currentStepIndex,
        userId,
        occurredAt: completedAt,
      });

      console.log(`[ProductionTimer] Run completed: ${id}, elapsed: ${totalElapsedSeconds}s`);

      return res.json({ ...updated, message: 'Run completed' });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        currentStepIndex: nextStepIndex,
        status: 'running',
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'advanced',
      stepIndex: nextStepIndex,
      userId,
      occurredAt: new Date(),
    });

    console.log(`[ProductionTimer] Run advanced to step ${nextStepIndex}: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error advancing run:', error);
    return res.status(500).json({ error: 'Failed to advance run' });
  }
});

router.post('/runs/:id/stop', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'stopped') {
      return res.status(400).json({ error: `Run already ${run.status}` });
    }

    const events = await db
      .select()
      .from(productionProgramRunEvents)
      .where(eq(productionProgramRunEvents.runId, id))
      .orderBy(productionProgramRunEvents.occurredAt);

    const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, events);
    const completedAt = new Date();

    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'stopped',
        completedAt,
        totalElapsedSeconds,
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'stopped',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: completedAt,
    });

    console.log(`[ProductionTimer] Run stopped: ${id}, elapsed: ${totalElapsedSeconds}s`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error stopping run:', error);
    return res.status(500).json({ error: 'Failed to stop run' });
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const runs = await db
      .select()
      .from(productionProgramRuns)
      .orderBy(desc(productionProgramRuns.startedAt))
      .limit(100);

    return res.json(runs);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching runs:', error);
    return res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

router.get('/runs/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const runs = await db
      .select({
        id: productionProgramRuns.id,
        programId: productionProgramRuns.programId,
        instanceName: productionProgramRuns.instanceName,
        sku: productionProgramRuns.sku,
        status: productionProgramRuns.status,
        startedAt: productionProgramRuns.startedAt,
        completedAt: productionProgramRuns.completedAt,
        totalElapsedSeconds: productionProgramRuns.totalElapsedSeconds,
        programName: productionPrograms.name,
      })
      .from(productionProgramRuns)
      .leftJoin(productionPrograms, eq(productionProgramRuns.programId, productionPrograms.id))
      .where(
        or(
          eq(productionProgramRuns.status, 'completed'),
          eq(productionProgramRuns.status, 'stopped')
        )
      )
      .orderBy(desc(productionProgramRuns.completedAt))
      .limit(limit);

    return res.json(runs);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching history:', error);
    return res.status(500).json({ error: 'Failed to fetch run history' });
  }
});

router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const events = await db
      .select()
      .from(productionProgramRunEvents)
      .where(eq(productionProgramRunEvents.runId, id))
      .orderBy(productionProgramRunEvents.occurredAt);

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, run.programId))
      .limit(1);

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, run.programId))
      .orderBy(productionProgramSteps.stepIndex);

    return res.json({
      ...run,
      program,
      steps,
      events,
    });
  } catch (error) {
    console.error('[ProductionTimer] Error fetching run:', error);
    return res.status(500).json({ error: 'Failed to fetch run' });
  }
});

router.get('/programs', async (req: Request, res: Response) => {
  try {
    const programs = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.isActive, true))
      .orderBy(productionPrograms.name);

    return res.json(programs);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching programs:', error);
    return res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

router.get('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [program] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!program) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const steps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, id))
      .orderBy(productionProgramSteps.stepIndex);

    return res.json({ ...program, steps });
  } catch (error) {
    console.error('[ProductionTimer] Error fetching program:', error);
    return res.status(500).json({ error: 'Failed to fetch program' });
  }
});

export default router;
