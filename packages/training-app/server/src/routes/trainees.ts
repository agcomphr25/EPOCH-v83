import { Router } from "express";
import { db } from "../db";
import { trainees } from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const traineesRouter = Router();

const TraineeCreate = z.object({
  name: z.string().min(2),
  roleId: z.string().uuid().optional().nullable()
});

traineesRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(trainees);
  res.json(rows);
});

traineesRouter.post("/", async (req, res) => {
  const parsed = TraineeCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(trainees)
    .values({ name: parsed.data.name, roleId: parsed.data.roleId ?? null })
    .returning();

  res.json(row);
});

traineesRouter.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const parsed = TraineeCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(trainees)
    .set({ name: parsed.data.name, roleId: parsed.data.roleId ?? null })
    .where(eq(trainees.id, id))
    .returning();

  res.json(row);
});

traineesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  await db.delete(trainees).where(eq(trainees.id, id));
  res.json({ ok: true });
});
