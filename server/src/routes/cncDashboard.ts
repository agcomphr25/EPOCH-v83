import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';
import { getFileStorageProviderForObjectPath } from '../services/fileStorageProvider';
import {
  evaluateMaterialReadinessGate,
  evaluateTravelerStartGates,
  evaluateWadReleaseGate,
} from '../lib/travelerGates';
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

const batchStatusSchema = z.enum(['queued', 'assigned', 'in_progress', 'paused', 'hold', 'completed', 'cancelled']);

const createBatchSchema = z.object({
  workOrderId: z.string().uuid(),
  travelerStepId: z.string().min(1),
  operationId: z.number().int().positive().optional().nullable(),
  batchNumber: z.number().int().positive().optional(),
  batchQty: z.number().int().positive(),
  assignedMachineId: z.number().int().positive().optional().nullable(),
  assignedMachineName: z.string().trim().optional().nullable(),
  assignedEmployeeId: z.number().int().positive().optional().nullable(),
  assignedEmployeeDisplayName: z.string().trim().optional().nullable(),
  status: batchStatusSchema.optional().default('queued'),
  barcodeValue: z.string().trim().optional(),
  batchCode: z.string().trim().optional(),
  priority: z.string().trim().optional().default('medium'),
  dueDate: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bulkCreateBatchSchema = z.object({
  workOrderId: z.string().uuid(),
  travelerStepId: z.string().min(1),
  operationId: z.number().int().positive().optional().nullable(),
  batches: z.array(createBatchSchema.omit({ workOrderId: true, travelerStepId: true, operationId: true }).extend({
    operationId: z.number().int().positive().optional().nullable(),
  })).optional(),
  batchQtys: z.array(z.number().int().positive()).optional(),
  assignedMachineId: z.number().int().positive().optional().nullable(),
  assignedMachineName: z.string().trim().optional().nullable(),
  assignedEmployeeId: z.number().int().positive().optional().nullable(),
  assignedEmployeeDisplayName: z.string().trim().optional().nullable(),
  priority: z.string().trim().optional(),
  dueDate: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((data) => (data.batches?.length ?? 0) > 0 || (data.batchQtys?.length ?? 0) > 0, {
  message: 'Provide batches or batchQtys',
});

const assignBatchSchema = z.object({
  assignedMachineId: z.number().int().positive().optional().nullable(),
  assignedMachineName: z.string().trim().optional().nullable(),
  assignedEmployeeId: z.number().int().positive().optional().nullable(),
  assignedEmployeeDisplayName: z.string().trim().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const quantityUpdateSchema = z.object({
  qtyCompleted: z.number().int().min(0),
  qtyScrapped: z.number().int().min(0),
  notes: z.string().optional().nullable(),
});

const batchStationScanSchema = z.object({
  employeeBadge: z.string().trim().min(1),
  barcode: z.string().trim().min(1),
});

const batchStationActionSchema = z.object({
  employeeBadge: z.string().trim().min(1),
  action: z.enum(['start', 'pause', 'resume', 'complete', 'comment', 'hold']),
  qtyCompleted: z.number().int().min(0).optional(),
  qtyScrapped: z.number().int().min(0).optional(),
  comments: z.string().trim().optional().nullable(),
});

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.rows ?? []);
}

function actorDisplayName(req: any): string | null {
  if (!req.user) return null;
  return req.user.employeeId ? `${req.user.username} (${req.user.employeeId})` : req.user.username;
}

function workOrderBarcodeSegment(workOrderNumber: string): string {
  const digits = String(workOrderNumber ?? '').replace(/\D/g, '');
  return digits || String(workOrderNumber ?? '').replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'WO';
}

function buildBatchCode(workOrderNumber: string, stepNumber: number, batchNumber: number): string {
  return `OPB-${workOrderBarcodeSegment(workOrderNumber)}-${String(stepNumber).padStart(2, '0')}-${String(batchNumber).padStart(3, '0')}`;
}

const batchSelectSql = `
  SELECT
    b.id AS "id",
    b.work_order_id AS "workOrderId",
    pwo.work_order_number AS "workOrderNumber",
    COALESCE(t.part_number, pwo.part_number) AS "partNumber",
    COALESCE(t.part_name, pwo.description) AS "partName",
    b.traveler_step_id AS "travelerStepId",
    ts.step_number AS "travelerStepNumber",
    ts.department_name AS "travelerStepDepartment",
    t.id AS "travelerId",
    t.traveler_number AS "travelerNumber",
    b.operation_id AS "operationId",
    op.sequence AS "operationSequence",
    op.op_name AS "operationName",
    b.batch_code AS "batchCode",
    b.batch_number AS "batchNumber",
    b.batch_qty AS "batchQty",
    b.qty_completed AS "qtyCompleted",
    b.qty_scrapped AS "qtyScrapped",
    b.assigned_machine_id AS "assignedMachineId",
    b.assigned_machine_name AS "assignedMachineName",
    b.assigned_employee_id AS "assignedEmployeeId",
    b.assigned_employee_display_name AS "assignedEmployeeDisplayName",
    b.status AS "status",
    b.barcode_value AS "barcodeValue",
    b.priority AS "priority",
    b.due_date AS "dueDate",
    b.notes AS "notes",
    b.created_by_user_id AS "createdByUserId",
    b.created_by_display_name AS "createdByDisplayName",
    b.created_at AS "createdAt",
    b.updated_at AS "updatedAt"
  FROM cnc_operation_batches b
  JOIN production_work_orders pwo ON pwo.id = b.work_order_id
  JOIN traveler_steps ts ON ts.id = b.traveler_step_id
  JOIN travelers t ON t.id = ts.traveler_id
  LEFT JOIN cnc_job_operations op ON op.id = b.operation_id
`;

async function loadBatch(client: any, id: number) {
  const result = await client.query(`${batchSelectSql} WHERE b.id = $1`, [id]);
  return rowsOf(result)[0] ?? null;
}

async function loadBatchByBarcode(client: any, barcode: string) {
  const result = await client.query(
    `${batchSelectSql} WHERE b.barcode_value = $1 OR b.batch_code = $1`,
    [barcode],
  );
  return rowsOf(result)[0] ?? null;
}

async function resolveActiveEmployeeByBadge(client: any, badge: string) {
  const normalized = String(badge ?? '').trim().replace(/-/g, '');
  if (!normalized) return null;
  const result = await client.query(
    `SELECT id,
            name,
            employee_code AS "employeeCode",
            department,
            user_role AS "userRole",
            is_active AS "isActive",
            employment_status AS "employmentStatus"
     FROM employees
     WHERE REPLACE(COALESCE(badge_scan_code, ''), '-', '') = $1
        OR LOWER(employee_code) = LOWER($2)
     LIMIT 1`,
    [normalized, badge],
  );
  const employee = rowsOf(result)[0] ?? null;
  if (!employee) return null;
  const terminated = String(employee.employmentStatus ?? 'ACTIVE').toUpperCase() === 'TERMINATED';
  if (employee.isActive === false || terminated) {
    const err = new Error('Employee badge is inactive or terminated') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return employee;
}

function canViewFullTraveler(req: any): boolean {
  const role = String(req.user?.role ?? req.user?.userRole ?? '').toLowerCase();
  return ['admin', 'owner', 'manager', 'supervisor'].some((allowed) => role.includes(allowed));
}

function appendNote(existing: string | null | undefined, next: string | null | undefined): string | null {
  const cleanNext = String(next ?? '').trim();
  if (!cleanNext) return existing ?? null;
  return [existing, cleanNext].filter(Boolean).join('\n');
}

async function validateBatchStationAccess(client: any, batch: any, employee: any, options: { allowPaused?: boolean; allowHold?: boolean } = {}) {
  if (!batch) {
    const err = new Error('Operation batch barcode not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  if (batch.status === 'completed' || batch.status === 'cancelled' || (!options.allowHold && batch.status === 'hold')) {
    const err = new Error(`Batch ${batch.batchCode} is ${batch.status} and cannot be loaded for production`) as Error & { status?: number };
    err.status = 422;
    throw err;
  }
  if (!options.allowPaused && batch.status === 'paused') {
    const err = new Error(`Batch ${batch.batchCode} is paused. Resume it before recording production.`) as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  if (batch.assignedEmployeeId && Number(batch.assignedEmployeeId) !== Number(employee.id)) {
    const err = new Error(`Batch ${batch.batchCode} is assigned to ${batch.assignedEmployeeDisplayName ?? 'another technician'}`) as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const wadGate = await evaluateWadReleaseGate(batch.workOrderId);
  if (!wadGate.allowed) {
    const err = new Error(wadGate.reason ?? 'Work order is not released') as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  const materialGate = await evaluateMaterialReadinessGate(batch.travelerId);
  if (!materialGate.allowed) {
    const err = new Error(materialGate.reason ?? 'Material is not ready') as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  const startGate = await evaluateTravelerStartGates(batch.travelerId, batch.travelerStepId, {
    employeeId: Number(employee.id),
    employeeName: employee.name,
  });
  if (!startGate.allowed) {
    const err = new Error(startGate.reason ?? 'Employee is not authorized for this CNC step') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}

async function loadBatchStationPayload(client: any, batch: any, employee: any, req: any) {
  const remainingQty = Math.max(Number(batch.batchQty ?? 0) - Number(batch.qtyCompleted ?? 0) - Number(batch.qtyScrapped ?? 0), 0);
  const operationId = batch.operationId ? Number(batch.operationId) : null;
  const [operationResult, programsResult, toolsResult, photosResult, checkpointsResult] = await Promise.all([
    operationId
      ? client.query(
          `SELECT id, sequence, op_name AS "opName", op_description AS "opDescription",
                  nc_program_ref AS "ncProgramRef", fixture, work_ref_point AS "workRefPoint",
                  raw_stock_orientation AS "rawStockOrientation", datum_notes AS "datumNotes",
                  warmup_notes AS "warmupNotes", qc_plan AS "qcPlan"
           FROM cnc_job_operations WHERE id = $1`,
          [operationId],
        )
      : Promise.resolve({ rows: [] }),
    operationId
      ? client.query(
          `SELECT id, program_name AS "programName", program_number AS "programNumber", version,
                  machine, estimated_cycle_minutes AS "estimatedCycleMinutes", prove_out_required AS "proveOutRequired",
                  approved_by_display_name AS "approvedByDisplayName", approved_at AS "approvedAt", notes
           FROM cnc_programs WHERE operation_id = $1 ORDER BY id`,
          [operationId],
        )
      : Promise.resolve({ rows: [] }),
    operationId
      ? client.query(
          `SELECT id, tool_number AS "toolNumber", holder_position AS "holderPosition", tool_name AS "toolName",
                  diameter, offset_notes AS "offsetNotes", replacement_notes AS "replacementNotes", image_url AS "imageUrl"
           FROM cnc_tool_lists WHERE operation_id = $1 ORDER BY sort_order, id`,
          [operationId],
        )
      : Promise.resolve({ rows: [] }),
    operationId
      ? client.query(
          `SELECT id, category, url, caption, uploaded_by_display_name AS "uploadedByDisplayName", created_at AS "createdAt"
           FROM cnc_setup_photos WHERE operation_id = $1 ORDER BY created_at DESC`,
          [operationId],
        )
      : Promise.resolve({ rows: [] }),
    operationId
      ? client.query(
          `SELECT id, name, characteristic, nominal, tolerance, method, frequency, required,
                  photo_required AS "photoRequired", signature_required AS "signatureRequired"
           FROM cnc_qc_checkpoints WHERE operation_id = $1 ORDER BY sort_order, id`,
          [operationId],
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const operation = rowsOf(operationResult)[0] ?? null;
  return {
    type: 'cnc_operation_batch',
    canViewFullTraveler: canViewFullTraveler(req),
    employee: {
      id: employee.id,
      name: employee.name,
      employeeCode: employee.employeeCode,
    },
    batch: {
      ...batch,
      qtyRemaining: remainingQty,
    },
    workOrder: {
      id: batch.workOrderId,
      number: batch.workOrderNumber,
      partNumber: batch.partNumber,
      partName: batch.partName,
    },
    step: {
      id: batch.travelerStepId,
      travelerId: batch.travelerId,
      travelerNumber: batch.travelerNumber,
      stepNumber: batch.travelerStepNumber,
      department: batch.travelerStepDepartment,
    },
    operation,
    programs: rowsOf(programsResult),
    tools: rowsOf(toolsResult),
    setupPhotos: rowsOf(photosResult),
    inspectionRequirements: rowsOf(checkpointsResult),
  };
}

async function validateBatchContext(client: any, input: { workOrderId: string; travelerStepId: string; operationId?: number | null }) {
  const woResult = await client.query(
    `SELECT id, work_order_number, quantity FROM production_work_orders WHERE id = $1 FOR UPDATE`,
    [input.workOrderId],
  );
  const workOrder = rowsOf(woResult)[0];
  if (!workOrder) {
    const err = new Error('Work order not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  const stepResult = await client.query(
    `SELECT
       ts.id,
       ts.step_number,
       ts.department_name,
       t.id AS traveler_id,
       t.traveler_number,
       t.quantity AS traveler_quantity,
       t.production_work_order_id
     FROM traveler_steps ts
     JOIN travelers t ON t.id = ts.traveler_id
     WHERE ts.id = $1`,
    [input.travelerStepId],
  );
  const step = rowsOf(stepResult)[0];
  if (!step) {
    const err = new Error('Traveler step not found') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  if (step.production_work_order_id && step.production_work_order_id !== input.workOrderId) {
    const err = new Error('Traveler step does not belong to the selected work order') as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  if (input.operationId) {
    const opResult = await client.query(
      `SELECT op.id, j.linked_traveler_step_id
       FROM cnc_job_operations op
       JOIN cnc_jobs j ON j.id = op.job_id
       WHERE op.id = $1`,
      [input.operationId],
    );
    const op = rowsOf(opResult)[0];
    if (!op) {
      const err = new Error('CNC operation not found') as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (op.linked_traveler_step_id && op.linked_traveler_step_id !== input.travelerStepId) {
      const err = new Error('CNC operation is linked to a different traveler step') as Error & { status?: number };
      err.status = 422;
      throw err;
    }
  }

  const travelerQty = Number(step.traveler_quantity ?? workOrder.quantity ?? 0);
  const workOrderQty = Number(workOrder.quantity ?? 0);
  const availableLimit = Math.min(workOrderQty, travelerQty || workOrderQty);
  return { workOrder, step, availableLimit };
}

async function activeBatchQty(client: any, workOrderId: string, travelerStepId: string) {
  const result = await client.query(
    `SELECT COALESCE(SUM(batch_qty), 0)::int AS active_qty
     FROM cnc_operation_batches
     WHERE work_order_id = $1
       AND traveler_step_id = $2
       AND status <> 'cancelled'`,
    [workOrderId, travelerStepId],
  );
  return Number(rowsOf(result)[0]?.active_qty ?? 0);
}

async function nextBatchNumber(client: any, workOrderId: string, travelerStepId: string) {
  const result = await client.query(
    `SELECT COALESCE(MAX(batch_number), 0)::int + 1 AS next_batch_number
     FROM cnc_operation_batches
     WHERE work_order_id = $1 AND traveler_step_id = $2`,
    [workOrderId, travelerStepId],
  );
  return Number(rowsOf(result)[0]?.next_batch_number ?? 1);
}

async function insertBatch(client: any, req: any, context: any, input: z.infer<typeof createBatchSchema>, fallbackBatchNumber: number) {
  const batchNumber = input.batchNumber ?? fallbackBatchNumber;
  const generatedCode = buildBatchCode(context.workOrder.work_order_number, Number(context.step.step_number), batchNumber);
  const batchCode = input.batchCode || generatedCode;
  const barcodeValue = input.barcodeValue || batchCode;
  const result = await client.query(
    `INSERT INTO cnc_operation_batches (
       work_order_id, traveler_step_id, operation_id, batch_code, batch_number,
       batch_qty, qty_completed, qty_scrapped, assigned_machine_id, assigned_machine_name,
       assigned_employee_id, assigned_employee_display_name, status, barcode_value, priority,
       due_date, notes, created_by_user_id, created_by_display_name, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
     RETURNING id`,
    [
      input.workOrderId,
      input.travelerStepId,
      input.operationId ?? null,
      batchCode,
      batchNumber,
      input.batchQty,
      input.assignedMachineId ?? null,
      input.assignedMachineName ?? null,
      input.assignedEmployeeId ?? null,
      input.assignedEmployeeDisplayName ?? null,
      input.status ?? 'queued',
      barcodeValue,
      input.priority ?? 'medium',
      input.dueDate || null,
      input.notes ?? null,
      req.user?.id ?? null,
      actorDisplayName(req),
    ],
  );
  return loadBatch(client, Number(rowsOf(result)[0].id));
}

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

// Operation batches

router.get('/operation-batches', async (req, res) => {
  try {
    const clauses: string[] = [];
    const values: any[] = [];
    const addClause = (sqlText: string, value: any) => {
      values.push(value);
      clauses.push(sqlText.replace('?', `$${values.length}`));
    };

    if (typeof req.query.workOrderId === 'string' && req.query.workOrderId.trim()) {
      addClause('b.work_order_id = ?', req.query.workOrderId.trim());
    }
    if (typeof req.query.travelerStepId === 'string' && req.query.travelerStepId.trim()) {
      addClause('b.traveler_step_id = ?', req.query.travelerStepId.trim());
    }
    if (typeof req.query.operationId === 'string' && req.query.operationId.trim()) {
      addClause('b.operation_id = ?', Number(req.query.operationId));
    }
    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      addClause('b.status = ?', req.query.status.trim());
    }

    const result = await pool.query(
      `${batchSelectSql}
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY b.due_date NULLS LAST, b.priority DESC, b.batch_code`,
      values,
    );
    res.json(rowsOf(result));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/operation-batches/resolve/:barcode', async (req, res) => {
  try {
    const barcode = decodeURIComponent(req.params.barcode ?? '').trim();
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });
    const batch = await loadBatchByBarcode(pool, barcode);
    if (!batch) return res.status(404).json({ error: 'Operation batch barcode not found' });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/operation-batches/station/scan', async (req, res) => {
  try {
    const data = batchStationScanSchema.parse(req.body);
    const employee = await resolveActiveEmployeeByBadge(pool, data.employeeBadge);
    if (!employee) return res.status(404).json({ error: 'Employee badge not recognized' });
    const batch = await loadBatchByBarcode(pool, data.barcode);
    await validateBatchStationAccess(pool, batch, employee, { allowPaused: true });
    res.json(await loadBatchStationPayload(pool, batch, employee, req));
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(err?.status ?? 500).json({ error: err.message });
  }
});

router.post('/operation-batches/station/:id/action', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = batchStationActionSchema.parse(req.body);
    const employee = await resolveActiveEmployeeByBadge(pool, data.employeeBadge);
    if (!employee) return res.status(404).json({ error: 'Employee badge not recognized' });
    const batch = await loadBatch(pool, id);
    const allowPaused = data.action === 'resume' || data.action === 'comment';
    const allowHold = data.action === 'comment';
    await validateBatchStationAccess(pool, batch, employee, { allowPaused, allowHold });

    const comments = data.comments ? `[${new Date().toISOString()} ${employee.name}] ${data.comments}` : null;
    let status = batch.status;
    let qtyCompleted = Number(batch.qtyCompleted ?? 0);
    let qtyScrapped = Number(batch.qtyScrapped ?? 0);
    let notes = appendNote(batch.notes, comments);

    if (data.action === 'start') {
      status = 'in_progress';
      await pool.query(
        `UPDATE traveler_steps
         SET status = CASE WHEN status IN ('NOT_STARTED', 'PENDING') THEN 'IN_PROGRESS' ELSE status END,
             started_at = COALESCE(started_at, NOW()),
             started_by = COALESCE(started_by, $1)
         WHERE id = $2`,
        [employee.name, batch.travelerStepId],
      );
    } else if (data.action === 'pause') {
      status = 'paused';
    } else if (data.action === 'resume') {
      status = 'in_progress';
    } else if (data.action === 'hold') {
      status = 'hold';
      notes = appendNote(notes, comments ? null : `[${new Date().toISOString()} ${employee.name}] Problem/hold flagged`);
    } else if (data.action === 'complete') {
      qtyCompleted = data.qtyCompleted ?? qtyCompleted;
      qtyScrapped = data.qtyScrapped ?? qtyScrapped;
      if (qtyCompleted + qtyScrapped > Number(batch.batchQty)) {
        return res.status(422).json({
          error: 'Completed plus scrapped quantity cannot exceed batch quantity',
          batchQty: batch.batchQty,
          qtyCompleted,
          qtyScrapped,
        });
      }
      status = qtyCompleted + qtyScrapped >= Number(batch.batchQty) ? 'completed' : 'in_progress';
    }

    await pool.query(
      `UPDATE cnc_operation_batches
       SET status = $1,
           qty_completed = $2,
           qty_scrapped = $3,
           assigned_employee_id = COALESCE(assigned_employee_id, $4),
           assigned_employee_display_name = COALESCE(assigned_employee_display_name, $5),
           notes = $6,
           updated_at = NOW()
       WHERE id = $7`,
      [status, qtyCompleted, qtyScrapped, employee.id, employee.name, notes, id],
    );

    const updated = await loadBatch(pool, id);
    res.json(await loadBatchStationPayload(pool, updated, employee, req));
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(err?.status ?? 500).json({ error: err.message });
  }
});

router.get('/operation-batches/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const batch = await loadBatch(pool, id);
    if (!batch) return res.status(404).json({ error: 'Operation batch not found' });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/operation-batches', async (req, res) => {
  const client = await pool.connect();
  try {
    const data = createBatchSchema.parse(req.body);
    await client.query('BEGIN');
    const context = await validateBatchContext(client, data);
    const existingQty = await activeBatchQty(client, data.workOrderId, data.travelerStepId);
    if (existingQty + data.batchQty > context.availableLimit) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Active operation batch quantities exceed available work order/traveler step quantity',
        availableQty: Math.max(context.availableLimit - existingQty, 0),
        requestedQty: data.batchQty,
        limitQty: context.availableLimit,
      });
    }
    const batchNumber = data.batchNumber ?? await nextBatchNumber(client, data.workOrderId, data.travelerStepId);
    const batch = await insertBatch(client, req, context, data, batchNumber);
    await client.query('COMMIT');
    res.status(201).json(batch);
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    if (err?.code === '23505') return res.status(409).json({ error: 'Batch code or barcode already exists' });
    res.status(err?.status ?? 500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/operation-batches/bulk', async (req, res) => {
  const client = await pool.connect();
  try {
    const data = bulkCreateBatchSchema.parse(req.body);
    const requestedBatches: any[] = data.batches?.length
      ? data.batches
      : (data.batchQtys ?? []).map((batchQty) => ({ batchQty }));
    const batches = requestedBatches.map((batch) => createBatchSchema.parse({
      ...batch,
      workOrderId: data.workOrderId,
      travelerStepId: data.travelerStepId,
      operationId: batch.operationId ?? data.operationId ?? null,
      assignedMachineId: batch.assignedMachineId ?? data.assignedMachineId ?? null,
      assignedMachineName: batch.assignedMachineName ?? data.assignedMachineName ?? null,
      assignedEmployeeId: batch.assignedEmployeeId ?? data.assignedEmployeeId ?? null,
      assignedEmployeeDisplayName: batch.assignedEmployeeDisplayName ?? data.assignedEmployeeDisplayName ?? null,
      priority: batch.priority ?? data.priority ?? 'medium',
      dueDate: batch.dueDate ?? data.dueDate ?? null,
      notes: batch.notes ?? data.notes ?? null,
    }));
    const requestedQty = batches.reduce((sum, batch) => sum + batch.batchQty, 0);

    await client.query('BEGIN');
    const context = await validateBatchContext(client, data);
    for (const batch of batches) {
      if (batch.operationId && batch.operationId !== data.operationId) {
        await validateBatchContext(client, batch);
      }
    }
    const existingQty = await activeBatchQty(client, data.workOrderId, data.travelerStepId);
    if (existingQty + requestedQty > context.availableLimit) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'Active operation batch quantities exceed available work order/traveler step quantity',
        availableQty: Math.max(context.availableLimit - existingQty, 0),
        requestedQty,
        limitQty: context.availableLimit,
      });
    }

    let batchNumber = await nextBatchNumber(client, data.workOrderId, data.travelerStepId);
    const created: any[] = [];
    for (const batch of batches) {
      const effectiveBatchNumber = batch.batchNumber ?? batchNumber;
      created.push(await insertBatch(client, req, context, batch, effectiveBatchNumber));
      batchNumber = Math.max(batchNumber + 1, effectiveBatchNumber + 1);
    }
    await client.query('COMMIT');
    res.status(201).json({ count: created.length, batches: created });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    if (err?.code === '23505') return res.status(409).json({ error: 'Batch code or barcode already exists' });
    res.status(err?.status ?? 500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.patch('/operation-batches/:id/assign', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = assignBatchSchema.parse(req.body);
    const result = await pool.query(
      `UPDATE cnc_operation_batches
       SET assigned_machine_id = $1,
           assigned_machine_name = $2,
           assigned_employee_id = $3,
           assigned_employee_display_name = $4,
           status = CASE WHEN status = 'queued' THEN 'assigned' ELSE status END,
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id`,
      [
        data.assignedMachineId ?? null,
        data.assignedMachineName ?? null,
        data.assignedEmployeeId ?? null,
        data.assignedEmployeeDisplayName ?? null,
        data.notes ?? null,
        id,
      ],
    );
    if (rowsOf(result).length === 0) return res.status(404).json({ error: 'Operation batch not found' });
    res.json(await loadBatch(pool, id));
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/operation-batches/:id/hold', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
    const result = await pool.query(
      `UPDATE cnc_operation_batches
       SET status = 'hold', notes = COALESCE($1, notes), updated_at = NOW()
       WHERE id = $2 AND status <> 'cancelled'
       RETURNING id`,
      [notes, id],
    );
    if (rowsOf(result).length === 0) return res.status(404).json({ error: 'Active operation batch not found' });
    res.json(await loadBatch(pool, id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/operation-batches/:id/cancel', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;
    const result = await pool.query(
      `UPDATE cnc_operation_batches
       SET status = 'cancelled', notes = COALESCE($1, notes), updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [notes, id],
    );
    if (rowsOf(result).length === 0) return res.status(404).json({ error: 'Operation batch not found' });
    res.json(await loadBatch(pool, id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/operation-batches/:id/quantities', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = quantityUpdateSchema.parse(req.body);
    const existing = await loadBatch(pool, id);
    if (!existing) return res.status(404).json({ error: 'Operation batch not found' });
    if (existing.status === 'cancelled') return res.status(422).json({ error: 'Cancelled batches cannot be updated' });
    if (data.qtyCompleted + data.qtyScrapped > existing.batchQty) {
      return res.status(422).json({
        error: 'Completed plus scrapped quantity cannot exceed batch quantity',
        batchQty: existing.batchQty,
        qtyCompleted: data.qtyCompleted,
        qtyScrapped: data.qtyScrapped,
      });
    }
    const nextStatus = data.qtyCompleted + data.qtyScrapped === existing.batchQty ? 'completed' : existing.status;
    await pool.query(
      `UPDATE cnc_operation_batches
       SET qty_completed = $1,
           qty_scrapped = $2,
           status = $3,
           notes = COALESCE($4, notes),
           updated_at = NOW()
       WHERE id = $5`,
      [data.qtyCompleted, data.qtyScrapped, nextStatus, data.notes ?? null, id],
    );
    res.json(await loadBatch(pool, id));
  } catch (err: any) {
    if (err?.name === 'ZodError') return res.status(400).json({ error: err.message, issues: err.issues });
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
              t.work_order_id AS "workOrderId", t.production_work_order_id AS "productionWorkOrderId", t.quantity,
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
