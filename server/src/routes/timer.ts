import { Router } from "express";
import { db } from "../../db";
import { programRuns, programs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticateToken } from "../../middleware/auth";

const router = Router();

// Apply authentication to all timer routes
router.use(authenticateToken);

// List active/paused/completed runs
router.get("/runs", async (req, res) => {
  const runs = await db.select().from(programRuns);
  res.json(runs);
});

// Start run
router.post("/start", async (req, res) => {
  const { programId, instanceName, sku, notes } = req.body;
  const [program] = await db.select().from(programs).where(eq(programs.id, programId));
  if (!program) {
    return res.status(404).json({ error: "Program not found" });
  }
  const [run] = await db.insert(programRuns).values({
    programId,
    programName: program.name,
    steps: program.steps,
    instanceName,
    sku,
    notes
  }).returning();
  res.json(run);
});

// Advance step
router.post("/advance/:id", async (req, res) => {
  const id = req.params.id;
  const [run] = await db.select().from(programRuns).where(eq(programRuns.id, id));
  if (!run) {
    return res.status(404).json({ error: "Run not found" });
  }
  const next = run.currentStepIndex + 1;
  await db.update(programRuns).set({ currentStepIndex: next }).where(eq(programRuns.id, id));
  res.json({ ...run, currentStepIndex: next });
});

// Pause
router.post("/pause/:id", async (req, res) => {
  await db.update(programRuns).set({ status: "paused" }).where(eq(programRuns.id, req.params.id));
  res.json({ ok: true });
});

// Resume
router.post("/resume/:id", async (req, res) => {
  await db.update(programRuns).set({ status: "running" }).where(eq(programRuns.id, req.params.id));
  res.json({ ok: true });
});

// Stop
router.post("/stop/:id", async (req, res) => {
  await db.update(programRuns).set({ status: "completed", completedAt: new Date() })
    .where(eq(programRuns.id, req.params.id));
  res.json({ ok: true });
});

export default router;
