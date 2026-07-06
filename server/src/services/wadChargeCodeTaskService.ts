import { pool } from '../../db';

type PendingWadChargeCodeRequest = {
  id: string;
  wadId: string | null;
  workOrderNumber: string | null;
  department: string;
  operation: string;
  budgetedHours: string | null;
};

let taskBackfillReady: Promise<void> | null = null;

function requestTaskMarker(requestId: string): string {
  return `WAD_CHARGE_CODE_REQUEST:${requestId}`;
}

function chargeCodeRequestLink(requestId: string, wadId: string): string {
  const params = new URLSearchParams({
    wadChargeCodeRequestId: requestId,
    wadId,
    autofill: '1',
  });
  return `/finance/charge-codes?${params.toString()}`;
}

function ensureTaskBackfillTables(): Promise<void> {
  if (!taskBackfillReady) {
    taskBackfillReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wad_charge_code_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          wad_id UUID REFERENCES production_work_orders(id) ON DELETE CASCADE,
          department TEXT NOT NULL,
          operation TEXT NOT NULL,
          labor_category TEXT,
          classification TEXT NOT NULL DEFAULT 'DIRECT',
          budgeted_hours NUMERIC,
          requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          requested_by_display_name TEXT NOT NULL DEFAULT 'Unknown',
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          status TEXT NOT NULL DEFAULT 'PENDING',
          assigned_charge_code_id INTEGER REFERENCES charge_codes(id) ON DELETE SET NULL,
          assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          assigned_at TIMESTAMPTZ,
          notes TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS wad_charge_code_requests_status_idx ON wad_charge_code_requests(status, requested_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS wad_charge_code_requests_wad_idx ON wad_charge_code_requests(wad_id)`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS wad_charge_code_requests_open_operation_idx
        ON wad_charge_code_requests(wad_id, department, operation)
        WHERE status = 'PENDING'
      `);
    })().catch((error) => {
      taskBackfillReady = null;
      throw error;
    });
  }
  return taskBackfillReady;
}

async function getPendingRequests(requestIds?: string[]): Promise<PendingWadChargeCodeRequest[]> {
  await ensureTaskBackfillTables();
  const params: unknown[] = [];
  let idFilter = '';
  if (requestIds && requestIds.length > 0) {
    params.push(requestIds);
    idFilter = `AND wccr.id = ANY($${params.length}::uuid[])`;
  }

  return pool.query(
    `SELECT
       wccr.id::text AS id,
       wccr.wad_id::text AS "wadId",
       pwo.work_order_number AS "workOrderNumber",
       wccr.department,
       wccr.operation,
       wccr.budgeted_hours::text AS "budgetedHours"
     FROM wad_charge_code_requests wccr
     LEFT JOIN production_work_orders pwo ON pwo.id = wccr.wad_id
     WHERE wccr.status = 'PENDING'
       ${idFilter}
     ORDER BY wccr.requested_at DESC`,
    params
  );
}

async function upsertGlennChargeCodeTaskForRequest(request: PendingWadChargeCodeRequest): Promise<void> {
  if (!request.wadId) return;

  const marker = requestTaskMarker(request.id);
  const link = chargeCodeRequestLink(request.id, request.wadId);
  const title = `Assign WAD charge code - ${request.workOrderNumber ?? 'WAD'} / ${request.operation}`;
  const description = [
    `A WAD charge code was requested for ${request.workOrderNumber ?? 'this WAD'}.`,
    `Department: ${request.department}`,
    `Operation: ${request.operation}`,
    request.budgetedHours ? `Budgeted hours: ${request.budgetedHours}` : null,
    `Open charge code engine: ${link}`,
  ].filter(Boolean).join('\n');
  const notes = `${marker}\n${link}`;
  const existing = await pool.query(
    `SELECT id
       FROM task_items
      WHERE notes LIKE $1
      ORDER BY id DESC
      LIMIT 1`,
    [`%${marker}%`]
  );

  if (existing.length > 0) {
    await pool.query(
      `UPDATE task_items
          SET title = $2,
              description = $3,
              category = 'WAD Charge Codes',
              priority = 'High',
              assigned_to = 'Glenn Jones',
              gj_status = FALSE,
              tm_status = FALSE,
              finished_status = FALSE,
              is_active = TRUE,
              updated_at = NOW()
        WHERE id = $1`,
      [existing[0].id, title, description]
    );
    return;
  }

  await pool.query(
    `INSERT INTO task_items (
       title, description, category, priority, assigned_to, created_by, notes
     )
     VALUES ($1, $2, 'WAD Charge Codes', 'High', 'Glenn Jones', 'WAD Charge Code Engine', $3)`,
    [title, description, notes]
  );
}

export async function upsertGlennChargeCodeTask(requestId: string): Promise<void> {
  const [request] = await getPendingRequests([requestId]);
  if (request) {
    await upsertGlennChargeCodeTaskForRequest(request);
  }
}

export async function upsertGlennChargeCodeTasksForPendingRequests(requestIds?: string[]): Promise<void> {
  const requests = await getPendingRequests(requestIds);
  for (const request of requests) {
    await upsertGlennChargeCodeTaskForRequest(request);
  }
}

export async function completeGlennChargeCodeTask(requestId: string, chargeCode: string, actorName: string): Promise<void> {
  const marker = requestTaskMarker(requestId);
  await pool.query(
    `UPDATE task_items
        SET finished_status = TRUE,
            finished_completed_by = $2,
            finished_completed_at = NOW(),
            notes = CONCAT(COALESCE(notes, ''), E'\nAssigned charge code: ', $3),
            updated_at = NOW()
      WHERE notes LIKE $1
        AND is_active = TRUE`,
    [`%${marker}%`, actorName, chargeCode]
  );
}
