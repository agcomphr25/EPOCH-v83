import { type Request, Response } from 'express';
import { pool } from '../../db';

const SLOTS_TARGET = 7;

const DEPT_LABEL_MAP: Record<string, string> = {
  'Mold Prep': 'PREP',
  'Layup': 'LAYUP',
  'Cello Wrap': 'WRAP',
  'Oven/Cure': 'OVEN',
  'Quality Control': 'QC',
  'Final QC': 'FINAL QC',
};

function getNYDate(date?: string): { dateStr: string; isToday: boolean } {
  const nyNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const todayStr = `${nyNow.getFullYear()}-${String(nyNow.getMonth() + 1).padStart(2, '0')}-${String(nyNow.getDate()).padStart(2, '0')}`;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { dateStr: date, isToday: date === todayStr };
  }
  return { dateStr: todayStr, isToday: true };
}

function computeDisplayLabel(currentDept: string | null): string {
  if (!currentDept) return 'IN PROCESS';
  return DEPT_LABEL_MAP[currentDept] ?? 'IN PROCESS';
}

const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'VOIDED', 'VOID']);

function computeStatus(travelerStatus: string, steps: any[]): string {
  if (CANCELLED_STATUSES.has((travelerStatus ?? '').toUpperCase())) return 'CANCELLED';

  if ((travelerStatus ?? '').toUpperCase() === 'BLOCKED') return 'BLOCKED';

  const hasBlockedStep = steps.some(
    (s) => (s.status ?? '').toUpperCase() === 'BLOCKED' || (s.blocked_reason && s.blocked_reason.trim())
  );
  if (hasBlockedStep) return 'BLOCKED';

  const hasHoldStep = steps.some(
    (s) => (s.status ?? '').toUpperCase() === 'ON_HOLD' || (s.status ?? '').toUpperCase() === 'HOLD'
  );
  if (hasHoldStep) return 'HOLD';

  const ovenStep = steps.find(
    (s) => s.department_name === 'Oven/Cure' && s.started_at
  );
  if (ovenStep) return 'GREEN';

  return 'IN_PROCESS';
}

export async function dailyThroughputBoardHandler(req: Request, res: Response): Promise<void> {
  try {
    const { dateStr, isToday } = getNYDate(req.query.date as string | undefined);

    const travelerRows = await pool.query(
      `SELECT
         ts.id            AS step_id,
         ts.traveler_id,
         ts.started_at    AS layup_started_at,
         t.traveler_number,
         t.part_number,
         t.part_name,
         t.status         AS traveler_status,
         t.serial_number,
         t.lot_number
       FROM traveler_steps ts
       JOIN travelers t ON t.id = ts.traveler_id
       WHERE ts.department_name = 'Layup'
         AND (ts.started_at AT TIME ZONE 'America/New_York')::date = $1::date
       ORDER BY ts.started_at ASC`,
      [dateStr]
    );

    const travelerIds = travelerRows.map((r: any) => r.traveler_id);

    const allStepsMap: Map<string, any[]> = new Map();
    const eventsMap: Map<string, any[]> = new Map();
    const activeOvenByTravelerId: Map<string, any> = new Map();
    const activeOvenByIdentifier: Map<string, any> = new Map();

    if (travelerIds.length > 0) {
      const placeholders = travelerIds.map((_: any, i: number) => `$${i + 1}`).join(', ');

      const stepsRows = await pool.query(
        `SELECT
           ts.id,
           ts.traveler_id,
           ts.department_name,
           ts.step_number,
           ts.status,
           ts.started_at,
           ts.completed_at,
           ts.blocked_at,
           ts.blocked_reason
         FROM traveler_steps ts
         WHERE ts.traveler_id IN (${placeholders})
         ORDER BY ts.traveler_id, ts.step_number ASC`,
        travelerIds
      );

      for (const row of stepsRows) {
        const list = allStepsMap.get(row.traveler_id) ?? [];
        list.push(row);
        allStepsMap.set(row.traveler_id, list);
      }

      const eventsRows = await pool.query(
        `SELECT * FROM (
           SELECT
             te.*,
             ROW_NUMBER() OVER (PARTITION BY te.traveler_id ORDER BY te.created_at DESC) AS rn
           FROM traveler_events te
           WHERE te.traveler_id IN (${placeholders})
         ) sub
         WHERE sub.rn <= 5
         ORDER BY sub.traveler_id, sub.created_at DESC`,
        travelerIds
      );

      for (const row of eventsRows) {
        const list = eventsMap.get(row.traveler_id) ?? [];
        list.push(row);
        eventsMap.set(row.traveler_id, list);
      }
    }

    const timerIdentifiers = Array.from(new Set(
      travelerRows
        .flatMap((r: any) => [r.traveler_number, r.serial_number, r.lot_number])
        .filter(Boolean)
        .map((value: any) => String(value))
    ));

    if (travelerIds.length > 0 || timerIdentifiers.length > 0) {
      const conditions: string[] = [];
      const params: any[] = [];

      if (travelerIds.length > 0) {
        const placeholders = travelerIds.map((_: any, i: number) => `$${params.length + i + 1}`).join(', ');
        params.push(...travelerIds);
        conditions.push(`ppr.traveler_id IN (${placeholders})`);
      }

      if (timerIdentifiers.length > 0) {
        const placeholders = timerIdentifiers.map((_: any, i: number) => `$${params.length + i + 1}`).join(', ');
        params.push(...timerIdentifiers);
        conditions.push(`ppr.serial_number IN (${placeholders})`);
      }

      const activeOvenRuns = await pool.query(
        `SELECT
           ppr.id,
           ppr.traveler_id,
           ppr.serial_number,
           ppr.oven_number,
           ppr.oven_slot,
           ppr.started_at,
           ppr.status,
           ppr.current_step_index,
           pp.name AS program_name
         FROM production_program_runs ppr
         LEFT JOIN production_programs pp ON pp.id = ppr.program_id
         WHERE ppr.status IN ('running', 'paused', 'awaiting_next')
           AND ppr.oven_number IS NOT NULL
           AND (${conditions.join(' OR ')})
         ORDER BY ppr.started_at DESC`,
        params
      );

      for (const run of activeOvenRuns) {
        if (run.traveler_id && !activeOvenByTravelerId.has(run.traveler_id)) {
          activeOvenByTravelerId.set(run.traveler_id, run);
        }
        if (run.serial_number && !activeOvenByIdentifier.has(run.serial_number)) {
          activeOvenByIdentifier.set(run.serial_number, run);
        }
      }
    }

    const filledSlots = travelerRows.map((row: any, index: number) => {
      const steps = allStepsMap.get(row.traveler_id) ?? [];
      const itemIdentifier = row.traveler_number ?? row.serial_number ?? row.lot_number ?? row.traveler_id;
      const activeOvenRun =
        activeOvenByTravelerId.get(row.traveler_id) ??
        activeOvenByIdentifier.get(String(row.serial_number ?? '')) ??
        activeOvenByIdentifier.get(String(row.lot_number ?? '')) ??
        activeOvenByIdentifier.get(String(row.traveler_number ?? '')) ??
        null;

      const ovenStep = steps.find((s: any) => s.department_name === 'Oven/Cure' && s.started_at);
      const isGreen = !!ovenStep;
      const greenAt = ovenStep?.started_at ?? null;

      const blockedStep = steps.find(
        (s: any) => (s.status ?? '').toUpperCase() === 'BLOCKED' || (s.blocked_reason && s.blocked_reason.trim())
      );
      const blockReason = blockedStep?.blocked_reason ?? null;

      const activeStep = steps
        .filter((s: any) => s.started_at && !s.completed_at)
        .sort((a: any, b: any) => b.step_number - a.step_number)[0] ?? null;

      const latestStep = [...steps].sort((a: any, b: any) => b.step_number - a.step_number)[0] ?? null;
      const currentDept =
        activeStep?.department_name ??
        latestStep?.department_name ??
        null;

      const status = computeStatus(row.traveler_status, steps);

      const displayLabel =
        status === 'GREEN'
          ? 'GREEN'
          : status === 'BLOCKED'
          ? 'BLOCKED'
          : status === 'CANCELLED'
          ? 'VOID'
          : status === 'HOLD'
          ? 'HOLD'
          : computeDisplayLabel(currentDept);

      const layupStartedAt = row.layup_started_at;
      const elapsedMs = layupStartedAt
        ? Date.now() - new Date(layupStartedAt).getTime()
        : null;

      const events = eventsMap.get(row.traveler_id) ?? [];

      const currentStep = activeStep ?? null;
      const currentStepStatus = currentStep?.status ?? null;
      const currentStepStartedAt = currentStep?.started_at ?? null;
      const currentStepCompletedAt = currentStep?.completed_at ?? null;

      return {
        slotNumber: index + 1,
        isEmpty: false,
        isOverflow: index >= SLOTS_TARGET,
        travelerId: row.traveler_id,
        itemIdentifier,
        travelerNumber: row.traveler_number,
        partNumber: row.part_number,
        partName: row.part_name,
        serialNumber: row.serial_number,
        lotNumber: row.lot_number,
        travelerStatus: row.traveler_status,
        status,
        displayLabel,
        isGreen,
        greenAt,
        blockReason,
        layupStartedAt,
        elapsedMs,
        currentDepartment: currentDept,
        currentStepStatus,
        currentStepStartedAt,
        currentStepCompletedAt,
        activeOvenRun: activeOvenRun ? {
          runId: activeOvenRun.id,
          programName: activeOvenRun.program_name,
          serialNumber: activeOvenRun.serial_number,
          ovenNumber: activeOvenRun.oven_number,
          ovenSlot: activeOvenRun.oven_slot,
          startedAt: activeOvenRun.started_at,
          status: activeOvenRun.status,
          currentStepIndex: activeOvenRun.current_step_index,
        } : null,
        detail: {
          travelerId: row.traveler_id,
          itemIdentifier,
          travelerNumber: row.traveler_number,
          partNumber: row.part_number,
          partName: row.part_name,
          serialNumber: row.serial_number,
          lotNumber: row.lot_number,
          currentDepartment: currentDept,
          layupStartedAt,
          ovenStartedAt: ovenStep?.started_at ?? null,
          elapsedMs,
          isGreen,
          blockReason,
          currentStepStatus,
          currentStepStartedAt,
          currentStepCompletedAt,
          activeOvenRun: activeOvenRun ? {
            runId: activeOvenRun.id,
            programName: activeOvenRun.program_name,
            serialNumber: activeOvenRun.serial_number,
            ovenNumber: activeOvenRun.oven_number,
            ovenSlot: activeOvenRun.oven_slot,
            startedAt: activeOvenRun.started_at,
            status: activeOvenRun.status,
            currentStepIndex: activeOvenRun.current_step_index,
          } : null,
          steps: steps.map((s: any) => ({
            id: s.id,
            departmentName: s.department_name,
            stepNumber: s.step_number,
            status: s.status,
            startedAt: s.started_at,
            completedAt: s.completed_at,
            blockedAt: s.blocked_at,
            blockedReason: s.blocked_reason,
          })),
          recentEvents: events.map((e: any) => ({
            id: e.id,
            action: e.action,
            actor: e.actor,
            actorName: e.actor_name,
            details: e.details,
            createdAt: e.created_at,
          })),
        },
      };
    });

    const padCount = Math.max(0, SLOTS_TARGET - filledSlots.length);
    const ghostSlots = Array.from({ length: padCount }, (_, i) => ({
      slotNumber: filledSlots.length + i + 1,
      isEmpty: true,
      isOverflow: false,
      status: 'NOT_STARTED',
      displayLabel: 'NOT_STARTED',
      isGreen: false,
      greenAt: null,
      blockReason: null,
      layupStartedAt: null,
      elapsedMs: null,
      currentDepartment: null,
      detail: { steps: [], recentEvents: [] },
    }));

    const allSlots = [...filledSlots, ...ghostSlots];

    const overflowCount = filledSlots.filter((s: any) => s.isOverflow).length;

    const targetSlots = filledSlots.filter((s: any) => !s.isOverflow);
    const goalSlot = targetSlots[SLOTS_TARGET - 1] ?? null;
    const goalIsGreen = goalSlot?.status === 'GREEN';

    const summary = {
      target: SLOTS_TARGET,
      started: targetSlots.length,
      green: goalIsGreen ? SLOTS_TARGET : targetSlots.filter((s: any) => s.status === 'GREEN').length,
      inProcess: targetSlots.filter((s: any) => s.status === 'IN_PROCESS').length,
      blocked: targetSlots.filter((s: any) => s.status === 'BLOCKED').length,
      cancelled: targetSlots.filter((s: any) => s.status === 'CANCELLED').length,
      notStarted: ghostSlots.length,
      overflowCount,
    };

    res.json({
      businessDate: dateStr,
      date: dateStr,
      isToday,
      targetSlots: SLOTS_TARGET,
      summary,
      slots: allSlots,
    });
  } catch (err: any) {
    console.error('[daily-throughput-board] Error:', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
}

