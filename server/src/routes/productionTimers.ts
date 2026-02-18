import { Router, Request, Response } from 'express';
import { db, pool } from '../../db';
import { 
  productionPrograms, 
  productionProgramSteps, 
  productionProgramRuns, 
  productionProgramRunEvents,
  insertProductionProgramRunSchema,
  users,
} from '../../schema';
import { eq, and, desc, or, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { authenticateToken, optionalAuth } from '../../middleware/auth';
import { validateActionToken } from '../../middleware/actionToken';

function calculateElapsedSeconds(startedAt: Date, endTime?: Date): number {
  const end = endTime || new Date();
  return Math.floor((end.getTime() - startedAt.getTime()) / 1000);
}

const router = Router();

// Apply optional auth and action token validation to all routes
// This allows public access for viewing while supporting both session auth and inline action tokens
router.use(optionalAuth);
router.use(validateActionToken);

const startRunSchema = z.object({
  programId: z.string().uuid(),
  instanceName: z.string().optional(),
  sku: z.string().optional(),
  serialNumber: z.string().min(1, 'Serial # is required'),
  description: z.string().optional(),
  inventoryItemId: z.number().int().positive('Inventory Item is required').optional(),
  mandrelNumber: z.number().int().min(1).max(3),
  ovenNumber: z.number().int().min(1).max(2),
  ovenSlot: z.enum(['A', 'B']),
  badgeId: z.string().optional(),
  travelerId: z.string().optional(),
  travelerStepId: z.string().optional(),
  travelerTaskId: z.string().optional(),
  departmentName: z.string().optional(),
});

router.post('/runs/start', async (req: Request, res: Response) => {
  try {
    let userId = (req as any).user?.id;
    
    if (!userId && req.body?.badgeId) {
      const badgeVal = req.body.badgeId;
      const parsedId = parseInt(badgeVal, 10);
      if (!isNaN(parsedId)) {
        userId = parsedId;
      } else {
        const [userByBadge] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, badgeVal))
          .limit(1);
        if (userByBadge) {
          userId = userByBadge.id;
        }
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated. Provide login credentials or badgeId.' });
    }

    const parseResult = startRunSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { programId, instanceName, sku, serialNumber, inventoryItemId, mandrelNumber, ovenNumber, ovenSlot, travelerId, travelerStepId, travelerTaskId, departmentName } = parseResult.data;

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
      serialNumber,
      inventoryItemId: inventoryItemId || null,
      mandrelNumber,
      ovenNumber,
      ovenSlot,
      travelerId: travelerId || null,
      travelerStepId: travelerStepId || null,
      travelerTaskId: travelerTaskId || null,
      departmentName: departmentName || null,
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
  } catch (error: any) {
    console.error('[ProductionTimer] Error starting run:', error);
    return res.status(500).json({ error: 'Failed to start run', detail: error?.message || 'Unknown error' });
  }
});

router.get('/runs/active', async (req: Request, res: Response) => {
  try {
    const travelerStepId = String(req.query.travelerStepId || '');
    if (!travelerStepId) {
      return res.status(400).json({ error: 'travelerStepId is required' });
    }

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(
        and(
          eq(productionProgramRuns.travelerStepId, travelerStepId),
          or(
            eq(productionProgramRuns.status, 'running'),
            eq(productionProgramRuns.status, 'paused')
          )
        )
      )
      .orderBy(desc(productionProgramRuns.startedAt))
      .limit(1);

    let program = null;
    if (run) {
      const [prog] = await db
        .select({ id: productionPrograms.id, name: productionPrograms.name })
        .from(productionPrograms)
        .where(eq(productionPrograms.id, run.programId))
        .limit(1);
      program = prog || null;
    }

    return res.json({ run: run ?? null, program });
  } catch (error: any) {
    console.error('[ProductionTimer] Error fetching active run:', error);
    return res.status(500).json({ error: 'Failed to fetch active run' });
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

    const now = new Date();
    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'paused', 
        lastPausedAt: now,
        updatedAt: now 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'paused',
      stepIndex: run.currentStepIndex,
      userId,
      occurredAt: now,
    });

    console.log(`[ProductionTimer] Run paused: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error pausing run:', error);
    return res.status(500).json({ error: 'Failed to pause run' });
  }
});

router.post('/runs/:id/step-timeout', async (req: Request, res: Response) => {
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

    if (run.status !== 'running') {
      return res.status(400).json({ error: `Cannot timeout run with status: ${run.status}` });
    }

    const now = new Date();
    const [updated] = await db
      .update(productionProgramRuns)
      .set({ 
        status: 'awaiting_next', 
        lastPausedAt: now,
        updatedAt: now 
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    await db.insert(productionProgramRunEvents).values({
      runId: id,
      eventType: 'step_timeout',
      stepIndex: run.currentStepIndex,
      occurredAt: now,
    });

    console.log(`[ProductionTimer] Step timed out, awaiting next: ${id}`);

    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error on step timeout:', error);
    return res.status(500).json({ error: 'Failed to handle step timeout' });
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
      const completedAt = new Date();
      const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, completedAt);

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

    const completedAt = new Date();
    const totalElapsedSeconds = calculateElapsedSeconds(run.startedAt, completedAt);

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

function calculateCumulativePauseSeconds(events: any[]): number {
  let totalPauseSeconds = 0;
  let lastPauseTime: Date | null = null;

  for (const event of events) {
    if (event.eventType === 'paused') {
      lastPauseTime = new Date(event.occurredAt);
    } else if (event.eventType === 'resumed' && lastPauseTime) {
      const resumeTime = new Date(event.occurredAt);
      totalPauseSeconds += Math.floor((resumeTime.getTime() - lastPauseTime.getTime()) / 1000);
      lastPauseTime = null;
    }
  }

  // If still paused, add time from last pause to now
  if (lastPauseTime) {
    totalPauseSeconds += Math.floor((Date.now() - lastPauseTime.getTime()) / 1000);
  }

  return totalPauseSeconds;
}

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const runsResult = await pool.query(
      `SELECT * FROM production_program_runs ORDER BY started_at DESC LIMIT 100`
    );
    const runs = runsResult || [];

    const runsWithDetails = await Promise.all(runs.map(async (run: any) => {
      const events = await pool.query(
        `SELECT * FROM production_program_run_events WHERE run_id = $1 ORDER BY occurred_at`,
        [run.id]
      ) || [];

      const programs = await pool.query(
        `SELECT * FROM production_programs WHERE id = $1 LIMIT 1`,
        [run.program_id]
      ) || [];
      const program = programs[0] || null;

      const steps = await pool.query(
        `SELECT * FROM production_program_steps WHERE program_id = $1 ORDER BY step_index`,
        [run.program_id]
      ) || [];

      const mappedEvents = events.map((e: any) => ({
        id: e.id,
        runId: e.run_id,
        eventType: e.event_type,
        stepIndex: e.step_index,
        userId: e.user_id,
        occurredAt: e.occurred_at,
      }));

      const cumulativePauseSeconds = calculateCumulativePauseSeconds(mappedEvents);

      return {
        id: run.id,
        programId: run.program_id,
        startedByUserId: run.started_by_user_id,
        instanceName: run.instance_name,
        sku: run.sku,
        serialNumber: run.serial_number,
        inventoryItemId: run.inventory_item_id,
        mandrelNumber: run.mandrel_number,
        ovenNumber: run.oven_number,
        ovenSlot: run.oven_slot,
        status: run.status,
        currentStepIndex: run.current_step_index,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        lastPausedAt: run.last_paused_at,
        totalElapsedSeconds: run.total_elapsed_seconds,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        program: program ? {
          id: program.id,
          name: program.name,
          description: program.description,
        } : null,
        steps: steps.map((s: any) => ({
          id: s.id,
          programId: s.program_id,
          stepIndex: s.step_index,
          stepName: s.step_name,
          durationSeconds: s.duration_seconds,
        })),
        cumulativePauseSeconds,
      };
    }));

    return res.json(runsWithDetails);
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
        serialNumber: productionProgramRuns.serialNumber,
        inventoryItemId: productionProgramRuns.inventoryItemId,
        mandrelNumber: productionProgramRuns.mandrelNumber,
        ovenNumber: productionProgramRuns.ovenNumber,
        ovenSlot: productionProgramRuns.ovenSlot,
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

router.patch('/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { instanceName, sku, serialNumber, mandrelNumber, ovenNumber, ovenSlot } = req.body;

    const [run] = await db
      .select()
      .from(productionProgramRuns)
      .where(eq(productionProgramRuns.id, id))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const [updated] = await db
      .update(productionProgramRuns)
      .set({
        instanceName: instanceName !== undefined ? instanceName : run.instanceName,
        sku: sku !== undefined ? sku : run.sku,
        serialNumber: serialNumber !== undefined ? serialNumber : run.serialNumber,
        mandrelNumber: mandrelNumber !== undefined ? mandrelNumber : run.mandrelNumber,
        ovenNumber: ovenNumber !== undefined ? ovenNumber : run.ovenNumber,
        ovenSlot: ovenSlot !== undefined ? ovenSlot : run.ovenSlot,
        updatedAt: new Date(),
      })
      .where(eq(productionProgramRuns.id, id))
      .returning();

    console.log(`[ProductionTimer] Run updated: ${id}`);
    return res.json(updated);
  } catch (error) {
    console.error('[ProductionTimer] Error updating run:', error);
    return res.status(500).json({ error: 'Failed to update run' });
  }
});

router.delete('/runs/:id', async (req: Request, res: Response) => {
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

    await db.delete(productionProgramRunEvents).where(eq(productionProgramRunEvents.runId, id));
    await db.delete(productionProgramRuns).where(eq(productionProgramRuns.id, id));

    console.log(`[ProductionTimer] Run deleted: ${id}`);
    return res.json({ success: true, message: 'Run deleted successfully' });
  } catch (error) {
    console.error('[ProductionTimer] Error deleting run:', error);
    return res.status(500).json({ error: 'Failed to delete run' });
  }
});

router.get('/programs', async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    
    const programs = includeInactive
      ? await db.select().from(productionPrograms).orderBy(productionPrograms.name)
      : await db.select().from(productionPrograms).where(eq(productionPrograms.isActive, true)).orderBy(productionPrograms.name);

    const programsWithSteps = await Promise.all(
      programs.map(async (program) => {
        const steps = await db
          .select()
          .from(productionProgramSteps)
          .where(eq(productionProgramSteps.programId, program.id))
          .orderBy(productionProgramSteps.stepIndex);
        return { ...program, steps };
      })
    );

    return res.json(programsWithSteps);
  } catch (error) {
    console.error('[ProductionTimer] Error fetching programs:', error);
    return res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

const createProgramSchema = z.object({
  name: z.string().min(1, 'Program name is required'),
  description: z.string().optional(),
  programType: z.enum(['single', 'multi']),
  steps: z.array(z.object({
    stepName: z.string().min(1),
    durationMinutes: z.number().positive('Duration must be greater than 0'),
  })).min(1, 'At least one step is required'),
});

router.post('/programs', async (req: Request, res: Response) => {
  try {
    const parseResult = createProgramSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { name, description, programType, steps } = parseResult.data;

    if (programType === 'multi' && steps.length < 2) {
      return res.status(400).json({ error: 'Multi-step programs must have at least 2 steps' });
    }

    const [program] = await db.insert(productionPrograms).values({
      name,
      description: description || null,
      isActive: true,
    }).returning();

    const stepsToInsert = steps.map((step, index) => ({
      programId: program.id,
      stepIndex: index,
      stepName: step.stepName,
      durationSeconds: Math.round(step.durationMinutes * 60),
    }));

    await db.insert(productionProgramSteps).values(stepsToInsert);

    const insertedSteps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, program.id))
      .orderBy(productionProgramSteps.stepIndex);

    console.log(`[ProductionTimer] Program created: ${program.id} - ${name}`);

    return res.status(201).json({ ...program, steps: insertedSteps });
  } catch (error) {
    console.error('[ProductionTimer] Error creating program:', error);
    return res.status(500).json({ error: 'Failed to create program' });
  }
});

router.put('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parseResult = createProgramSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
    }

    const { name, description, programType, steps } = parseResult.data;

    if (programType === 'multi' && steps.length < 2) {
      return res.status(400).json({ error: 'Multi-step programs must have at least 2 steps' });
    }

    const [existing] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const [program] = await db.update(productionPrograms)
      .set({
        name,
        description: description || null,
        updatedAt: new Date(),
      })
      .where(eq(productionPrograms.id, id))
      .returning();

    await db.delete(productionProgramSteps).where(eq(productionProgramSteps.programId, id));

    const stepsToInsert = steps.map((step, index) => ({
      programId: id,
      stepIndex: index,
      stepName: step.stepName,
      durationSeconds: Math.round(step.durationMinutes * 60),
    }));

    await db.insert(productionProgramSteps).values(stepsToInsert);

    const updatedSteps = await db
      .select()
      .from(productionProgramSteps)
      .where(eq(productionProgramSteps.programId, id))
      .orderBy(productionProgramSteps.stepIndex);

    console.log(`[ProductionTimer] Program updated: ${id} - ${name}`);

    return res.json({ ...program, steps: updatedSteps });
  } catch (error) {
    console.error('[ProductionTimer] Error updating program:', error);
    return res.status(500).json({ error: 'Failed to update program' });
  }
});

router.delete('/programs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(productionPrograms)
      .where(eq(productionPrograms.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const [updated] = await db.update(productionPrograms)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(productionPrograms.id, id))
      .returning();

    console.log(`[ProductionTimer] Program deactivated: ${id}`);

    return res.json({ message: 'Program deactivated', program: updated });
  } catch (error) {
    console.error('[ProductionTimer] Error deleting program:', error);
    return res.status(500).json({ error: 'Failed to delete program' });
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
