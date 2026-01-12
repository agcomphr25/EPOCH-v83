import { Router } from "express";
import { db } from "../db";
import {
  departments,
  roles,
  tasks,
  workInstructions,
  criticalPoints,
  roleTasks,
  facilityTopics,
  quizQuestions
} from "../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const libraryRouter = Router();

// ─────────────────────────────────────────────
// DEPARTMENTS
// ─────────────────────────────────────────────
const DepartmentCreate = z.object({
  name: z.string().min(2)
});

libraryRouter.get("/departments", async (_req, res) => {
  const rows = await db.select().from(departments);
  res.json(rows);
});

libraryRouter.post("/departments", async (req, res) => {
  const parsed = DepartmentCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(departments)
    .values({ name: parsed.data.name })
    .returning();
  res.json(row);
});

libraryRouter.patch("/departments/:id", async (req, res) => {
  const parsed = DepartmentCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(departments)
    .set(parsed.data)
    .where(eq(departments.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Department not found" });
  res.json(row);
});

libraryRouter.delete("/departments/:id", async (req, res) => {
  await db.delete(departments).where(eq(departments.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// ROLES
// ─────────────────────────────────────────────
const RoleCreate = z.object({
  name: z.string().min(2),
  description: z.string().optional()
});

libraryRouter.get("/roles", async (_req, res) => {
  const rows = await db.select().from(roles);
  res.json(rows);
});

libraryRouter.post("/roles", async (req, res) => {
  const parsed = RoleCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(roles)
    .values({ name: parsed.data.name, description: parsed.data.description ?? null })
    .returning();
  res.json(row);
});

libraryRouter.patch("/roles/:id", async (req, res) => {
  const parsed = RoleCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(roles)
    .set(parsed.data)
    .where(eq(roles.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Role not found" });
  res.json(row);
});

libraryRouter.delete("/roles/:id", async (req, res) => {
  await db.delete(roles).where(eq(roles.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// WORK INSTRUCTIONS
// ─────────────────────────────────────────────
const WICreate = z.object({
  wiCode: z.string().min(1),
  title: z.string().min(2),
  body: z.string().optional(),
  revision: z.string().optional()
});

libraryRouter.get("/work-instructions", async (_req, res) => {
  const rows = await db.select().from(workInstructions);
  res.json(rows);
});

libraryRouter.post("/work-instructions", async (req, res) => {
  const parsed = WICreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(workInstructions)
    .values({
      wiCode: parsed.data.wiCode,
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      revision: parsed.data.revision ?? "A"
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/work-instructions/:id", async (req, res) => {
  const parsed = WICreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(workInstructions)
    .set(parsed.data)
    .where(eq(workInstructions.id, req.params.id))
    .returning();
  res.json(row);
});

libraryRouter.delete("/work-instructions/:id", async (req, res) => {
  await db.delete(workInstructions).where(eq(workInstructions.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────
const TaskCreate = z.object({
  name: z.string().min(2),
  departmentId: z.string().uuid().optional().nullable(),
  workInstructionId: z.string().uuid().optional().nullable()
});

libraryRouter.get("/tasks", async (_req, res) => {
  const rows = await db.select().from(tasks);
  res.json(rows);
});

libraryRouter.post("/tasks", async (req, res) => {
  const parsed = TaskCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(tasks)
    .values({
      name: parsed.data.name,
      departmentId: parsed.data.departmentId ?? null,
      workInstructionId: parsed.data.workInstructionId ?? null
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/tasks/:id", async (req, res) => {
  const parsed = TaskCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(tasks)
    .set(parsed.data)
    .where(eq(tasks.id, req.params.id))
    .returning();
  res.json(row);
});

libraryRouter.delete("/tasks/:id", async (req, res) => {
  await db.delete(tasks).where(eq(tasks.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// CRITICAL POINTS
// ─────────────────────────────────────────────
const CPCreate = z.object({
  workInstructionId: z.string().uuid(),
  label: z.string().min(1),
  detail: z.string().optional(),
  severity: z.enum(["minor", "major", "critical"]).optional()
});

libraryRouter.get("/critical-points", async (_req, res) => {
  const rows = await db.select().from(criticalPoints);
  res.json(rows);
});

libraryRouter.get("/critical-points/by-wi/:wiId", async (req, res) => {
  const rows = await db
    .select()
    .from(criticalPoints)
    .where(eq(criticalPoints.workInstructionId, req.params.wiId));
  res.json(rows);
});

libraryRouter.post("/critical-points", async (req, res) => {
  const parsed = CPCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(criticalPoints)
    .values({
      workInstructionId: parsed.data.workInstructionId,
      label: parsed.data.label,
      detail: parsed.data.detail ?? null,
      severity: parsed.data.severity ?? "major"
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/critical-points/:id", async (req, res) => {
  const parsed = CPCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(criticalPoints)
    .set(parsed.data)
    .where(eq(criticalPoints.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Critical point not found" });
  res.json(row);
});

libraryRouter.delete("/critical-points/:id", async (req, res) => {
  await db.delete(criticalPoints).where(eq(criticalPoints.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// ROLE-TASK ASSIGNMENTS
// ─────────────────────────────────────────────
const RoleTaskCreate = z.object({
  roleId: z.string().uuid(),
  taskId: z.string().uuid(),
  sortOrder: z.number().optional(),
  required: z.boolean().optional()
});

libraryRouter.get("/role-tasks", async (_req, res) => {
  const rows = await db.select().from(roleTasks);
  res.json(rows);
});

libraryRouter.get("/role-tasks/by-role/:roleId", async (req, res) => {
  const rows = await db
    .select()
    .from(roleTasks)
    .where(eq(roleTasks.roleId, req.params.roleId));
  res.json(rows);
});

libraryRouter.post("/role-tasks", async (req, res) => {
  const parsed = RoleTaskCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(roleTasks)
    .values({
      roleId: parsed.data.roleId,
      taskId: parsed.data.taskId,
      sortOrder: parsed.data.sortOrder ?? 0,
      required: parsed.data.required ?? true
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/role-tasks/:id", async (req, res) => {
  const parsed = RoleTaskCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(roleTasks)
    .set(parsed.data)
    .where(eq(roleTasks.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Role-task assignment not found" });
  res.json(row);
});

libraryRouter.delete("/role-tasks/:id", async (req, res) => {
  await db.delete(roleTasks).where(eq(roleTasks.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// FACILITY TOPICS
// ─────────────────────────────────────────────
const TopicCreate = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  overview: z.string().optional()
});

libraryRouter.get("/facility-topics", async (_req, res) => {
  const rows = await db.select().from(facilityTopics);
  res.json(rows);
});

libraryRouter.post("/facility-topics", async (req, res) => {
  const parsed = TopicCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(facilityTopics)
    .values({
      code: parsed.data.code,
      title: parsed.data.title,
      overview: parsed.data.overview ?? null
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/facility-topics/:id", async (req, res) => {
  const parsed = TopicCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(facilityTopics)
    .set(parsed.data)
    .where(eq(facilityTopics.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Facility topic not found" });
  res.json(row);
});

libraryRouter.delete("/facility-topics/:id", async (req, res) => {
  await db.delete(facilityTopics).where(eq(facilityTopics.id, req.params.id));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// QUIZ QUESTIONS
// ─────────────────────────────────────────────
const QuestionCreate = z.object({
  topicId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  workInstructionId: z.string().uuid().optional().nullable(),
  criticalPointId: z.string().uuid().optional().nullable(),
  question: z.string().min(5),
  type: z.enum(["MCQ", "TF", "SHORT"]),
  meta: z.object({
    choices: z.array(z.string()).optional(),
    answer: z.string().optional(),
    rubric: z.string().optional()
  }).optional()
});

libraryRouter.get("/quiz-questions", async (_req, res) => {
  const rows = await db.select().from(quizQuestions);
  res.json(rows);
});

libraryRouter.get("/quiz-questions/by-topic/:topicId", async (req, res) => {
  const rows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.topicId, req.params.topicId));
  res.json(rows);
});

libraryRouter.post("/quiz-questions", async (req, res) => {
  const parsed = QuestionCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .insert(quizQuestions)
    .values({
      topicId: parsed.data.topicId ?? null,
      taskId: parsed.data.taskId ?? null,
      workInstructionId: parsed.data.workInstructionId ?? null,
      criticalPointId: parsed.data.criticalPointId ?? null,
      question: parsed.data.question,
      type: parsed.data.type,
      meta: parsed.data.meta ?? {}
    })
    .returning();
  res.json(row);
});

libraryRouter.patch("/quiz-questions/:id", async (req, res) => {
  const parsed = QuestionCreate.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [row] = await db
    .update(quizQuestions)
    .set(parsed.data)
    .where(eq(quizQuestions.id, req.params.id))
    .returning();
  res.json(row);
});

libraryRouter.delete("/quiz-questions/:id", async (req, res) => {
  await db.delete(quizQuestions).where(eq(quizQuestions.id, req.params.id));
  res.json({ ok: true });
});
