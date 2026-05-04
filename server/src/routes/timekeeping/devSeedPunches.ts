import { Router, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { db } from "../../../db";
import { punchLedger, laborAllocations, employees, chargeCodes } from "../../../schema";
import { eq, and, isNotNull } from "drizzle-orm";

const router = Router();

const SEED_MARKER = "SEED_DATA";

function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch((err) => {
    console.error("[dev/seed-punches]", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  });
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function startOfDayUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

router.post("/", h(async (req, res): Promise<void> => {
  const daysBack = Math.min(Math.max(parseInt(req.query.daysBack as string) || 14, 1), 90);
  const maxSessionsPerDay = Math.min(Math.max(parseInt(req.query.maxSessions as string) || 2, 1), 4);

  const activeEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.timekeeperPin)));

  if (activeEmployees.length === 0) {
    res.status(404).json({ error: "No active employees with a timekeeper PIN found." });
    return;
  }

  const activeChargeCodes = await db
    .select({ id: chargeCodes.id, code: chargeCodes.code })
    .from(chargeCodes)
    .where(eq(chargeCodes.active, true));

  if (activeChargeCodes.length === 0) {
    res.status(404).json({ error: "No active charge codes found." });
    return;
  }

  const now = new Date();
  const today = startOfDayUTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  let totalPunches = 0;
  let totalDays = 0;

  for (const emp of activeEmployees) {
    for (let d = daysBack; d >= 1; d--) {
      const dayStart = new Date(today.getTime() - d * 86_400_000);
      const dow = dayStart.getUTCDay();
      if (dow === 0 || dow === 6) continue;

      const sessionsToday = randomInt(1, maxSessionsPerDay);
      let dayMinuteCursor = 0;

      for (let s = 0; s < sessionsToday; s++) {
        const startHour = randomInt(6, 8);
        const startMinute = randomInt(0, 30);
        const baseStartMinutes = startHour * 60 + startMinute + dayMinuteCursor;

        const durationMinutes = randomInt(360, 600);

        const clockIn = addMinutes(dayStart, baseStartMinutes);
        const clockOut = addMinutes(dayStart, baseStartMinutes + durationMinutes);

        if (clockOut.getUTCDate() !== dayStart.getUTCDate()) break;

        const cc = activeChargeCodes[randomInt(0, activeChargeCodes.length - 1)];

        const [entry] = await db
          .insert(punchLedger)
          .values({
            employeeId: emp.id,
            clockIn,
            clockOut,
            source: "KIOSK",
            laborClass: "REGULAR",
            chargeCodeId: cc.id,
            chargeCode: cc.code,
            department: null,
            operation: SEED_MARKER,
            approvalStatus: "AUTO",
            isEdited: false,
            updatedAt: clockOut,
          })
          .returning();

        await db.insert(laborAllocations).values({
          punchLedgerId: entry.id,
          employeeId: emp.id,
          allocationStart: clockIn,
          allocationEnd: clockOut,
          chargeCodeId: cc.id,
          laborClass: "REGULAR",
          status: "CLOSED",
          source: SEED_MARKER,
          sequenceOrder: 1,
          isOverrun: false,
          isEdited: false,
        });

        totalPunches++;
        dayMinuteCursor = baseStartMinutes + durationMinutes + randomInt(30, 60);
      }
      totalDays++;
    }
  }

  res.json({
    ok: true,
    employeesSeeded: activeEmployees.length,
    daysPerEmployee: Math.ceil(totalDays / activeEmployees.length),
    totalPunchSessions: totalPunches,
    marker: SEED_MARKER,
    message: `Seeded ${totalPunches} punch sessions across ${activeEmployees.length} employees.`,
  });
}));

router.delete("/", h(async (_req, res): Promise<void> => {
  const deletedAllocations = await db
    .delete(laborAllocations)
    .where(eq(laborAllocations.source, SEED_MARKER))
    .returning({ id: laborAllocations.id });

  const deletedPunches = await db
    .delete(punchLedger)
    .where(eq(punchLedger.operation, SEED_MARKER))
    .returning({ id: punchLedger.id });

  res.json({
    ok: true,
    deletedPunchSessions: deletedPunches.length,
    deletedLaborAllocations: deletedAllocations.length,
    message: `Cleaned up ${deletedPunches.length} seeded punch sessions and ${deletedAllocations.length} labor allocations.`,
  });
}));

export default router;
