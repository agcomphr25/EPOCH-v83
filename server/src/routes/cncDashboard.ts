import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import { getFileStorageProviderForObjectPath } from '../services/fileStorageProvider';
import {
  insertCncScheduleSettingsSchema,
  insertCncMachineSchema,
  insertCncJobSchema,
  insertCncJobOperationSchema,
  insertCncProgramSchema,
  insertCncToolListSchema,
  insertCncSetupPhotoSchema,
  insertCncQcCheckpointSchema,
  insertCncQcResultSchema,
  insertCncTimeLogSchema,
  insertMachinedPartRoutingSchema,
  insertMachinedPartRoutingOpSchema,
} from '../../schema';

const router = Router();

// ── Work order search (against authoritative all_orders / travelers) ───────────

router.get('/search-work-orders', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 1) { return res.json([]); }

    const result = await pool.query(
      `SELECT DISTINCT order_id AS "workOrderId",
              COALESCE(customer_po, '') AS "customerPo",
              COALESCE(model_id, '') AS "model"
       FROM all_orders
       WHERE order_id ILIKE $1 OR customer_po ILIKE $1
       ORDER BY order_id
       LIMIT 20`,
      [`%${q}%`],
    );
    res.json(Array.isArray(result) ? result : result.rows ?? []);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

// ── Jobs ─────────────────────────────────────────────────────────────────────

router.get('/jobs', async (req, res) => {
  try {
    const jobs = await storage.getCncJobs();
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const job = await storage.getCncJobById(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs', async (req, res) => {
  try {
    const data = insertCncJobSchema.parse(req.body);
    // Stamp creator identity from authenticated user
    const enriched = {
      ...data,
      createdByUserId: req.user?.id ?? null,
      createdByDisplayName: req.user ? (req.user.username) : null,
    };
    const job = await storage.createCncJob(enriched);
    res.status(201).json(job);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/jobs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncJobSchema.partial().parse(req.body);
    const job = await storage.updateCncJob(id, data);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // ── Downstream completion trigger ──────────────────────────────────────
    // When CNC job is marked complete and has a linked traveler step, mark
    // THAT specific step COMPLETED (by ID, not by dept-name pattern) then
    // advance to the next NOT_STARTED step.
    if (data.status === 'complete' && job.linkedTravelerId) {
      try {
        const user = (req as any).user;
        const actor = user?.username ?? 'CNC System';

        // Use linkedTravelerStepId directly when available (precise);
        // fall back to dept-name match for legacy jobs without stepId.
        let completedStepNumber: number | null = null;

        if (job.linkedTravelerStepId) {
          // ── Precise path: complete the exact linked step ──────────────
          const stepResult = await pool.query(
            `UPDATE traveler_steps
             SET status = 'COMPLETED', completed_at = NOW(), completed_by = $1
             WHERE id = $2 AND status = 'IN_PROGRESS'
             RETURNING step_number`,
            [actor, job.linkedTravelerStepId],
          );
          const stepRows = Array.isArray(stepResult) ? stepResult : (stepResult.rows ?? []);
          if (stepRows.length > 0) {
            completedStepNumber = stepRows[0].step_number as number;
          }
        } else {
          // ── Legacy fallback: match by dept name LIKE '%cnc%' ──────────
          const stepResult = await pool.query(
            `UPDATE traveler_steps
             SET status = 'COMPLETED', completed_at = NOW(), completed_by = $1
             WHERE traveler_id = $2
               AND LOWER(department_name) LIKE '%cnc%'
               AND status = 'IN_PROGRESS'
             RETURNING step_number`,
            [actor, job.linkedTravelerId],
          );
          const stepRows = Array.isArray(stepResult) ? stepResult : (stepResult.rows ?? []);
          if (stepRows.length > 0) {
            completedStepNumber = stepRows[0].step_number as number;
          }
        }

        if (completedStepNumber !== null) {
          // Activate the next NOT_STARTED step (lowest step_number > completed)
          await pool.query(
            `UPDATE traveler_steps
             SET status = 'IN_PROGRESS', started_at = NOW(), started_by = $1
             WHERE traveler_id = $2
               AND step_number = (
                 SELECT MIN(step_number) FROM traveler_steps
                 WHERE traveler_id = $2
                   AND step_number > $3
                   AND status = 'NOT_STARTED'
               )`,
            [actor, job.linkedTravelerId, completedStepNumber],
          );

          // Log the traveler event
          await pool.query(
            `INSERT INTO traveler_events (traveler_id, actor, action, details, created_at)
             VALUES ($1, $2, 'STEP_COMPLETED', $3, NOW())`,
            [
              job.linkedTravelerId,
              actor,
              JSON.stringify({
                source: 'CNC Dashboard',
                cncJobId: job.id,
                linkedStepId: job.linkedTravelerStepId ?? null,
                completedAt: new Date(),
              }),
            ],
          );

          // Mark manufacturing_queue entry as COMPLETED if one exists
          await pool.query(
            `UPDATE manufacturing_queue
             SET status = 'COMPLETED', completed_at = NOW(), completed_by = $1
             WHERE source_type = 'cnc_job' AND source_id = $2 AND status != 'COMPLETED'`,
            [actor, String(job.id)],
          ).catch((e: any) => console.warn('[CNC] MQ update skipped:', e?.message));
        }
      } catch (travelerErr: any) {
        console.warn('[CNC] Failed to advance traveler on job complete:', travelerErr?.message);
      }
    }

    res.json(job);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncJob(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Operations ────────────────────────────────────────────────────────────────

router.get('/jobs/:jobId/operations', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const ops = await storage.getCncJobOperations(jobId);
    res.json(ops);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const op = await storage.getCncJobOperationById(id);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    res.json(op);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/operations', async (req, res) => {
  try {
    const data = insertCncJobOperationSchema.parse(req.body);
    const op = await storage.createCncJobOperation(data);
    res.status(201).json(op);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncJobOperationSchema.partial().parse(req.body);

    // ── Server-side QC enforcement ─────────────────────────────────────────
    // If attempting to mark operation as 'complete', verify all required
    // QC checkpoints have results recorded.
    if (data.status === 'complete') {
      const op = await storage.getCncJobOperationById(id);
      if (!op) return res.status(404).json({ error: 'Operation not found' });

      const checkpoints = await storage.getCncQcCheckpoints(op.id);
      const requiredCheckpoints = checkpoints.filter(cp => cp.required);

      if (requiredCheckpoints.length > 0) {
        const results = await storage.getCncQcResults(op.id);
        const completedIds = new Set(results.map(r => r.checkpointId));
        const missing = requiredCheckpoints.filter(cp => !completedIds.has(cp.id));

        if (missing.length > 0) {
          return res.status(422).json({
            error: `Cannot complete operation: ${missing.length} required QC checkpoint(s) are incomplete.`,
            missingCheckpoints: missing.map(cp => ({ id: cp.id, name: cp.name })),
          });
        }
      }

      // ── Prove-out enforcement ──────────────────────────────────────────────
      const programs = await storage.getCncPrograms(op.id);
      if (programs.some(p => p.proveOutRequired) && !op.proveoutCompleted) {
        return res.status(422).json({
          error: 'Cannot complete operation: prove-out must be completed first.',
        });
      }

      // Stamp sign-off identity
      data.signedOffByUserId = req.user?.id ?? undefined;
      data.signedOffByDisplayName = req.user ? req.user.username : undefined;
    }

    const op = await storage.updateCncJobOperation(id, data);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    res.json(op);
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException & { name?: string }).name === 'ZodError') {
      const zodErr = err as Error & { issues?: unknown[] };
      return res.status(400).json({ error: err.message, issues: zodErr.issues });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

// ── Explicit claim endpoint (stamps req.user — no sentinel strings) ──────────

router.post('/operations/:id/claim', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const op = await storage.getCncJobOperationById(id);
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    if (op.claimedByDisplayName) {
      return res.status(409).json({ error: `Operation already claimed by ${op.claimedByDisplayName}` });
    }
    const updated = await storage.updateCncJobOperation(id, {
      claimedByUserId: req.user?.id ?? undefined,
      claimedByDisplayName: req.user ? req.user.username : 'Unknown',
    });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

// ── Explicit unclaim endpoint ─────────────────────────────────────────────────

router.post('/operations/:id/unclaim', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCncJobOperation(id, {
      claimedByUserId: null,
      claimedByDisplayName: null,
    });
    if (!updated) return res.status(404).json({ error: 'Operation not found' });
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

router.delete('/operations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncJobOperation(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Programs ──────────────────────────────────────────────────────────────────

router.get('/operations/:operationId/programs', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const programs = await storage.getCncPrograms(operationId);
    res.json(programs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs', async (req, res) => {
  try {
    const data = insertCncProgramSchema.parse(req.body);
    const program = await storage.createCncProgram(data);
    res.status(201).json(program);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/programs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncProgramSchema.partial().parse(req.body);
    const program = await storage.updateCncProgram(id, data);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json(program);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/programs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncProgram(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/programs/:id/approve', requirePermission('travelers.sign_qc'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = (req as any).user;
    const displayName = user?.employeeId ? `${user.username} (${user.employeeId})` : user?.username ?? 'Unknown';
    const program = await storage.updateCncProgram(id, {
      approvedByUserId: user?.id ?? null,
      approvedByDisplayName: displayName,
      approvedAt: new Date() as any,
    });
    if (!program) return res.status(404).json({ error: 'Program not found' });
    res.json(program);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Time Logs ─────────────────────────────────────────────────────────────────

router.get('/operations/:operationId/time-logs', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const logs = await storage.getCncTimeLogs(operationId);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/time-log', async (req, res) => {
  try {
    const user = (req as any).user;
    const displayName = user?.employeeId ? `${user.username} (${user.employeeId})` : user?.username ?? 'Unknown';
    const data = insertCncTimeLogSchema.parse({
      ...req.body,
      createdByUserId: user?.id ?? null,
      createdByDisplayName: displayName,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date(),
    });
    const log = await storage.createCncTimeLog(data);
    res.status(201).json(log);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

// ── Tool Lists ────────────────────────────────────────────────────────────────

router.get('/operations/:operationId/tools', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const tools = await storage.getCncToolList(operationId);
    res.json(tools);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tools', async (req, res) => {
  try {
    const data = insertCncToolListSchema.parse(req.body);
    const tool = await storage.createCncToolListEntry(data);
    res.status(201).json(tool);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tools/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncToolListSchema.partial().parse(req.body);
    const tool = await storage.updateCncToolListEntry(id, data);
    if (!tool) return res.status(404).json({ error: 'Tool entry not found' });
    res.json(tool);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tools/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncToolListEntry(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Setup Photos ──────────────────────────────────────────────────────────────

router.get('/operations/:operationId/photos', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const photos = await storage.getCncSetupPhotos(operationId);
    res.json(photos);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/photos', async (req, res) => {
  try {
    const data = insertCncSetupPhotoSchema.parse(req.body);
    const enriched = {
      ...data,
      uploadedByUserId: req.user?.id ?? null,
      uploadedByDisplayName: req.user ? req.user.username : null,
    };
    const photo = await storage.createCncSetupPhoto(enriched);
    res.status(201).json(photo);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/photos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncSetupPhotoSchema.partial().parse(req.body);
    const photo = await storage.updateCncSetupPhoto(id, data);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json(photo);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/photos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Look up the photo to retrieve storageKey before deletion
    const photoRow = await pool.query(
      'SELECT storage_key FROM cnc_setup_photos WHERE id = $1',
      [id],
    );
    const storageKey: string | null = photoRow.rows[0]?.storage_key ?? null;

    // Attempt to remove from object storage if a key exists
    if (storageKey) {
      const normalizedPath = storageKey.startsWith('/') ? storageKey : `/${storageKey}`;
      try {
        await getFileStorageProviderForObjectPath(normalizedPath).deleteObject(normalizedPath);
      } catch (storageErr: unknown) {
        console.warn('[CNC] Failed to delete photo from object storage:', storageKey, storageErr);
      }
    }

    await storage.deleteCncSetupPhoto(id);
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
  }
});

// ── QC Checkpoints ────────────────────────────────────────────────────────────

router.get('/operations/:operationId/qc-checkpoints', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const checkpoints = await storage.getCncQcCheckpoints(operationId);
    res.json(checkpoints);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/qc-checkpoints', async (req, res) => {
  try {
    const data = insertCncQcCheckpointSchema.parse(req.body);
    const checkpoint = await storage.createCncQcCheckpoint(data);
    res.status(201).json(checkpoint);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/qc-checkpoints/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncQcCheckpointSchema.partial().parse(req.body);
    const checkpoint = await storage.updateCncQcCheckpoint(id, data);
    if (!checkpoint) return res.status(404).json({ error: 'Checkpoint not found' });
    res.json(checkpoint);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/qc-checkpoints/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncQcCheckpoint(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── QC Results ────────────────────────────────────────────────────────────────

router.get('/operations/:operationId/qc-results', async (req, res) => {
  try {
    const operationId = parseInt(req.params.operationId);
    const results = await storage.getCncQcResults(operationId);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/qc-results', async (req, res) => {
  try {
    const data = insertCncQcResultSchema.parse(req.body);
    const enriched = {
      ...data,
      recordedByUserId: req.user?.id ?? null,
      recordedByDisplayName: req.user ? req.user.username : null,
    };
    const result = await storage.createCncQcResult(enriched);
    res.status(201).json(result);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/qc-results/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncQcResultSchema.partial().parse(req.body);
    const result = await storage.updateCncQcResult(id, data);
    if (!result) return res.status(404).json({ error: 'QC result not found' });
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/qc-results/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncQcResult(id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Schedule Settings ─────────────────────────────────────────────────────────

router.get('/schedule-settings', async (req, res) => {
  try {
    const settings = await storage.getCncScheduleSettings();
    if (!settings) {
      return res.json({
        id: null, name: '4 Days x 10 Hours', scheduleType: 'FOUR_TEN',
        daysPerWeek: 4, hoursPerDay: 10, weeklyCapacityHours: 40, isDefault: true,
      });
    }
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/schedule-settings', async (req, res) => {
  try {
    const data = insertCncScheduleSettingsSchema.parse(req.body);
    const settings = await storage.upsertCncScheduleSettings(data);
    res.json(settings);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/schedule-settings', async (req, res) => {
  try {
    const data = insertCncScheduleSettingsSchema.partial().parse(req.body);
    const existing = await storage.getCncScheduleSettings();
    const merged = {
      name: existing?.name ?? '4 Days x 10 Hours',
      scheduleType: existing?.scheduleType ?? 'FOUR_TEN',
      daysPerWeek: existing?.daysPerWeek ?? 4,
      hoursPerDay: existing?.hoursPerDay ?? 10,
      weeklyCapacityHours: existing?.weeklyCapacityHours ?? 40,
      isDefault: true,
      ...data,
    };
    const settings = await storage.upsertCncScheduleSettings(merged);
    res.json(settings);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

// ── Machine Load ──────────────────────────────────────────────────────────────
// Returns per-machine load summary based on active/queued job operations

router.get('/machine-load', async (req, res) => {
  try {
    // Get default schedule settings
    const schedSettings = await storage.getCncScheduleSettings();
    const defaultDays = schedSettings?.daysPerWeek ?? 4;
    const defaultHours = schedSettings?.hoursPerDay ?? 10;
    const defaultCapacity = schedSettings?.weeklyCapacityHours ?? (defaultDays * defaultHours);

    // Get all active machines
    const machines = await storage.getCncMachines();
    const activeMachines = machines.filter(m => m.active);

    // Sum estimatedSetupMinutes + estimatedCycleMinutes from ops belonging to active/queued jobs
    // Group by the operation's machine field
    const loadResult = await pool.query(`
      SELECT
        COALESCE(ops.machine, j.machine, '(Unassigned)') AS machine_name,
        COALESCE(SUM(
          COALESCE(ops.estimated_setup_minutes, 0) + COALESCE(ops.estimated_cycle_minutes, 0)
        ), 0) AS total_minutes
      FROM cnc_jobs j
      JOIN cnc_job_operations ops ON ops.job_id = j.id
      WHERE j.status NOT IN ('complete', 'cancelled')
        AND ops.status NOT IN ('complete')
      GROUP BY COALESCE(ops.machine, j.machine, '(Unassigned)')
    `);
    const loadRows = Array.isArray(loadResult) ? loadResult : (loadResult as any).rows ?? [];
    const loadByMachine: Record<string, number> = {};
    for (const row of loadRows) {
      loadByMachine[row.machine_name] = parseFloat(row.total_minutes) / 60; // convert to hours
    }

    // Build per-machine summary
    const summary = activeMachines.map(m => {
      const effectiveDays = m.useDefaultSchedule ? defaultDays : (m.customDaysPerWeek ?? defaultDays);
      const effectiveHours = m.useDefaultSchedule ? defaultHours : (m.customHoursPerDay ?? defaultHours);
      const weeklyCapacityHours = m.useDefaultSchedule
        ? defaultCapacity
        : (m.customWeeklyCapacityHours ?? (effectiveDays * effectiveHours));
      const scheduledHours = loadByMachine[m.machineName] ?? 0;
      const remainingHours = weeklyCapacityHours - scheduledHours;
      const utilizationPct = weeklyCapacityHours > 0
        ? Math.round((scheduledHours / weeklyCapacityHours) * 100)
        : 0;
      return {
        machineId: m.id,
        machineName: m.machineName,
        machineType: m.machineType,
        axisCapabilities: m.axisCapabilities,
        weeklyCapacityHours,
        scheduledHours: Math.round(scheduledHours * 100) / 100,
        remainingHours: Math.round(remainingHours * 100) / 100,
        utilizationPct,
        overloaded: utilizationPct > 100,
        useDefaultSchedule: m.useDefaultSchedule,
        customDaysPerWeek: m.customDaysPerWeek,
        customHoursPerDay: m.customHoursPerDay,
      };
    });

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Machines ──────────────────────────────────────────────────────────────────

router.get('/machines', async (req, res) => {
  try {
    const machines = await storage.getCncMachines();
    res.json(machines);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/machines', async (req, res) => {
  try {
    const data = insertCncMachineSchema.parse(req.body);
    const machine = await storage.createCncMachine(data);
    res.status(201).json(machine);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/machines/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertCncMachineSchema.partial().parse(req.body);
    const machine = await storage.updateCncMachine(id, data);
    if (!machine) return res.status(404).json({ error: 'Machine not found' });
    res.json(machine);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/machines/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteCncMachine(id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Machine Utilization ───────────────────────────────────────────────────────
// Returns per-machine stats: jobs assigned, total estimated hours, active jobs

router.get('/machine-utilization', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(j.machine, '(Unassigned)') AS machine,
        COUNT(DISTINCT j.id)                AS total_jobs,
        COUNT(DISTINCT CASE WHEN j.status NOT IN ('complete', 'cancelled') THEN j.id END) AS active_jobs,
        COALESCE(SUM(CASE WHEN j.status NOT IN ('complete','cancelled') THEN j.estimated_hours ELSE 0 END), 0) AS pending_hours,
        COALESCE(SUM(j.estimated_hours), 0) AS total_hours
      FROM cnc_jobs j
      GROUP BY COALESCE(j.machine, '(Unassigned)')
      ORDER BY active_jobs DESC, total_jobs DESC
    `);
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    res.json(rows.map((r: any) => ({
      machine: r.machine,
      totalJobs: Number(r.total_jobs),
      activeJobs: Number(r.active_jobs),
      pendingHours: parseFloat(r.pending_hours),
      totalHours: parseFloat(r.total_hours),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Traveler Info for a CNC Job ───────────────────────────────────────────────

router.get('/jobs/:id/traveler-info', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const job = await storage.getCncJobById(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (!job.linkedTravelerId) return res.json(null);

    const result = await pool.query(
      `SELECT t.id, t.traveler_number AS "travelerNumber", t.status,
              t.part_name AS "partName", t.part_number AS "partNumber",
              t.work_order_id AS "workOrderId", t.quantity,
              s.id AS "currentStepId", s.department_name AS "currentStepDept",
              s.status AS "currentStepStatus", s.step_number AS "currentStepNumber"
       FROM travelers t
       LEFT JOIN traveler_steps s ON s.traveler_id = t.id AND s.status = 'IN_PROGRESS'
       WHERE t.id = $1
       LIMIT 1`,
      [job.linkedTravelerId],
    );
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    res.json(rows[0] ?? null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Missing-from-travelers report ────────────────────────────────────────────
// Returns traveler steps that are IN_PROGRESS + CNC dept with no linked CNC job.
// Safety net diagnostic — use before running sync.

router.get('/missing-from-travelers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ts.id        AS step_id,
        ts.traveler_id,
        ts.step_number,
        ts.department_name,
        ts.started_at,
        t.traveler_number,
        t.part_number,
        t.part_name,
        t.work_order_id,
        t.sales_order_id,
        t.quantity
      FROM traveler_steps ts
      JOIN travelers t ON t.id = ts.traveler_id
      WHERE LOWER(ts.department_name) LIKE '%cnc%'
        AND ts.status = 'IN_PROGRESS'
        AND NOT EXISTS (
          SELECT 1 FROM cnc_jobs j WHERE j.linked_traveler_step_id = ts.id
        )
      ORDER BY ts.started_at ASC
    `);
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    res.json({ count: rows.length, missing: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sync CNC jobs from active traveler CNC steps ──────────────────────────────
// Safety-net recovery tool: creates CNC jobs for IN_PROGRESS CNC steps that
// slipped through the real-time hook. Deduplication by linkedTravelerStepId.
// Pulls full data: dueDate + customerPo from all_orders, partName from traveler.

router.post('/sync-from-travelers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ts.id        AS step_id,
        ts.traveler_id,
        ts.step_number,
        ts.department_name,
        t.traveler_number,
        t.part_number,
        t.part_name,
        t.work_order_id,
        t.sales_order_id,
        t.quantity,
        ao.due_date      AS order_due_date,
        ao.customer_po   AS order_customer_po
      FROM traveler_steps ts
      JOIN travelers t ON t.id = ts.traveler_id
      LEFT JOIN all_orders ao ON ao.order_id = t.sales_order_id
      WHERE LOWER(ts.department_name) LIKE '%cnc%'
        AND ts.status = 'IN_PROGRESS'
        AND NOT EXISTS (
          SELECT 1 FROM cnc_jobs j WHERE j.linked_traveler_step_id = ts.id
        )
    `);

    const syncRows = Array.isArray(result) ? result : (result.rows ?? []);
    const created: { stepId: string; travelerId: string; jobId: number }[] = [];

    const { createManufacturingQueueEntryForCncJob } = await import('../lib/cncMq');

    for (const row of syncRows) {
      const dueDate = row.order_due_date
        ? new Date(row.order_due_date).toISOString().split('T')[0]
        : null;

      const job = await storage.createCncJob({
        workOrder: row.work_order_id ?? row.sales_order_id ?? 'AUTO',
        partNumber: row.part_number ?? 'UNKNOWN',
        partName: row.part_name ?? 'From Traveler',
        qty: row.quantity ?? 1,
        dueDate: dueDate ?? undefined,
        customerPo: row.order_customer_po ?? undefined,
        priority: 'medium',
        status: 'queued',
        linkedTravelerId: row.traveler_id,
        linkedTravelerStepId: row.step_id,
        createdByDisplayName: 'Traveler Sync',
      });
      await createManufacturingQueueEntryForCncJob(job);
      created.push({ stepId: row.step_id, travelerId: row.traveler_id, jobId: job.id });
    }

    res.json({ created: created.length, jobs: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Machined Part Routings ────────────────────────────────────────────────────

router.get('/machined-part-routings', async (req, res) => {
  try {
    const inventoryItemId = req.query.inventoryItemId as string | undefined;
    const routings = await storage.getMachinedPartRoutings(inventoryItemId);
    res.json(routings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/machined-part-routings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const routing = await storage.getMachinedPartRoutingById(id);
    if (!routing) return res.status(404).json({ error: 'Routing not found' });
    res.json(routing);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/machined-part-routings', async (req, res) => {
  try {
    const data = insertMachinedPartRoutingSchema.parse(req.body);
    if (!data.inventoryItemId || !data.inventoryItemId.trim()) {
      return res.status(400).json({ error: 'inventoryItemId is required and must not be empty' });
    }
    const enriched = {
      ...data,
      inventoryItemId: data.inventoryItemId.trim(),
      createdByDisplayName: req.user ? req.user.username : null,
    };
    const routing = await storage.createMachinedPartRouting(enriched);
    res.status(201).json(routing);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/machined-part-routings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertMachinedPartRoutingSchema.partial().parse(req.body);
    const routing = await storage.updateMachinedPartRouting(id, data);
    if (!routing) return res.status(404).json({ error: 'Routing not found' });
    res.json(routing);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/machined-part-routings/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteMachinedPartRouting(id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Machined Part Routing Operations ─────────────────────────────────────────

router.get('/machined-part-routings/:routingId/ops', async (req, res) => {
  try {
    const routingId = parseInt(req.params.routingId);
    const ops = await storage.getMachinedPartRoutingOps(routingId);
    res.json(ops);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/machined-part-routings/:routingId/ops', async (req, res) => {
  try {
    const routingId = parseInt(req.params.routingId);
    const data = insertMachinedPartRoutingOpSchema.parse({ ...req.body, routingId });
    const op = await storage.createMachinedPartRoutingOp(data);
    res.status(201).json(op);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/machined-part-routings/:routingId/ops/reorder', async (req, res) => {
  try {
    const routingId = parseInt(req.params.routingId);
    const updates = z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })).parse(req.body);
    const existingOps = await storage.getMachinedPartRoutingOps(routingId);
    const existingIds = new Set(existingOps.map(o => o.id));
    for (const { id } of updates) {
      if (!existingIds.has(id)) return res.status(403).json({ error: `Op ${id} does not belong to routing ${routingId}` });
    }
    await storage.reorderMachinedPartRoutingOps(updates);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/machined-part-routings/:routingId/ops/:id', async (req, res) => {
  try {
    const routingId = parseInt(req.params.routingId);
    const id = parseInt(req.params.id);
    const existing = await storage.getMachinedPartRoutingOpById(id);
    if (!existing) return res.status(404).json({ error: 'Op not found' });
    if (existing.routingId !== routingId) return res.status(403).json({ error: 'Op does not belong to this routing' });
    const { routingId: _ignored, ...rest } = req.body;
    const data = insertMachinedPartRoutingOpSchema.partial().parse(rest);
    const op = await storage.updateMachinedPartRoutingOp(id, data);
    res.json(op);
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/machined-part-routings/:routingId/ops/:id', async (req, res) => {
  try {
    const routingId = parseInt(req.params.routingId);
    const id = parseInt(req.params.id);
    const existing = await storage.getMachinedPartRoutingOpById(id);
    if (!existing) return res.status(404).json({ error: 'Op not found' });
    if (existing.routingId !== routingId) return res.status(403).json({ error: 'Op does not belong to this routing' });
    await storage.deleteMachinedPartRoutingOp(id);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
