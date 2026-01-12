import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  dailySessions,
  dailyTaskBlocks,
  trainees,
  roleTasks,
  tasks,
  workInstructions,
  criticalPoints,
  quizQuestions,
  dailyQuizzes,
  dailyQuizAnswers,
  facilityTopics
} from "../db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export const trainingRouter = Router();

/**
 * Helpers
 */
function toMidnightISO(dateStr: string) {
  // expect YYYY-MM-DD from UI
  // store as ISO midnight local-ish; for MVP keep as UTC midnight
  return new Date(dateStr + "T00:00:00.000Z");
}

/**
 * 1) Start a daily session
 * - Inputs: traineeId, trainerName, date (YYYY-MM-DD), facilityTopicCode? (optional)
 * - Creates daily_sessions
 * - Creates daily_task_blocks based on roleTasks for trainee.roleId (required tasks)
 */
const StartSession = z.object({
  traineeId: z.string().uuid(),
  trainerName: z.string().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  facilityTopicCode: z.string().optional()
});

trainingRouter.post("/sessions/start", async (req, res) => {
  const parsed = StartSession.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { traineeId, trainerName, date, facilityTopicCode } = parsed.data;

  const [t] = await db.select().from(trainees).where(eq(trainees.id, traineeId));
  if (!t) return res.status(404).json({ error: "Trainee not found" });
  if (!t.roleId) return res.status(400).json({ error: "Trainee has no role assigned" });

  // Find facility topic if provided
  let facilityTopicId: string | null = null;
  if (facilityTopicCode) {
    const [topic] = await db
      .select()
      .from(facilityTopics)
      .where(eq(facilityTopics.code, facilityTopicCode));
    facilityTopicId = topic?.id ?? null;
  }

  // Create session
  const [session] = await db
    .insert(dailySessions)
    .values({
      traineeId,
      trainerName,
      sessionDate: toMidnightISO(date),
      facilityTopicId
    })
    .returning();

  // Pull required tasks for that role
  const roleTaskRows = await db
    .select()
    .from(roleTasks)
    .where(and(eq(roleTasks.roleId, t.roleId), eq(roleTasks.required, true)))
    .orderBy(roleTasks.sortOrder);

  const taskIds = roleTaskRows.map(r => r.taskId);

  // Create task blocks for today
  if (taskIds.length > 0) {
    await db.insert(dailyTaskBlocks).values(
      taskIds.map(taskId => ({
        sessionId: session.id,
        taskId
      }))
    );
  }

  // Optional: store facility topic code in session later (schema add)
  // For MVP we just return it in response for quiz generation.
  res.json({ sessionId: session.id, facilityTopicCode: facilityTopicCode ?? null });
});

/**
 * 2a) List all sessions
 */
trainingRouter.get("/sessions", async (_req, res) => {
  const rows = await db.select().from(dailySessions);
  res.json(rows);
});

/**
 * 2b) Get session details (for UI + print)
 */
trainingRouter.get("/sessions/:id", async (req, res) => {
  const sessionId = req.params.id;

  const [session] = await db.select().from(dailySessions).where(eq(dailySessions.id, sessionId));
  if (!session) return res.status(404).json({ error: "Session not found" });

  const [trainee] = await db.select().from(trainees).where(eq(trainees.id, session.traineeId));

  const blocks = await db
    .select({
      id: dailyTaskBlocks.id,
      taskId: dailyTaskBlocks.taskId,
      step1: dailyTaskBlocks.step1,
      step2: dailyTaskBlocks.step2,
      step3: dailyTaskBlocks.step3,
      step4: dailyTaskBlocks.step4,
      strength: dailyTaskBlocks.strength,
      opportunity: dailyTaskBlocks.opportunity,
      action: dailyTaskBlocks.action,
      notes: dailyTaskBlocks.notes,
      taskName: tasks.name,
      departmentId: tasks.departmentId,
      workInstructionId: tasks.workInstructionId,
      wiCode: workInstructions.wiCode,
      wiTitle: workInstructions.title,
      wiBody: workInstructions.body,
      wiRevision: workInstructions.revision
    })
    .from(dailyTaskBlocks)
    .innerJoin(tasks, eq(tasks.id, dailyTaskBlocks.taskId))
    .leftJoin(workInstructions, eq(workInstructions.id, tasks.workInstructionId))
    .where(eq(dailyTaskBlocks.sessionId, sessionId));

  // Attach critical points per block
  const wiIds = blocks.map(b => b.workInstructionId).filter(Boolean) as string[];
  const cps = wiIds.length
    ? await db.select().from(criticalPoints).where(inArray(criticalPoints.workInstructionId, wiIds))
    : [];

  const cpsByWi = new Map<string, typeof cps>();
  for (const cp of cps) {
    const arr = cpsByWi.get(cp.workInstructionId) ?? [];
    arr.push(cp);
    cpsByWi.set(cp.workInstructionId, arr);
  }

  res.json({
    session,
    trainee,
    blocks: blocks.map(b => ({
      ...b,
      criticalPoints: b.workInstructionId ? (cpsByWi.get(b.workInstructionId) ?? []) : []
    }))
  });
});

/**
 * 3) Update a task block (steps + SOA)
 */
const PatchBlock = z.object({
  step1: z.boolean().optional(),
  step2: z.boolean().optional(),
  step3: z.boolean().optional(),
  step4: z.boolean().optional(),
  strength: z.string().optional().nullable(),
  opportunity: z.string().optional().nullable(),
  action: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

trainingRouter.patch("/task-blocks/:id", async (req, res) => {
  const blockId = req.params.id;
  const parsed = PatchBlock.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [updated] = await db
    .update(dailyTaskBlocks)
    .set(parsed.data as any)
    .where(eq(dailyTaskBlocks.id, blockId))
    .returning();

  res.json(updated);
});

/**
 * 4) Generate daily quiz
 * - Inputs: sessionId, facilityTopicCode
 * - Pull questions:
 *   a) from today's WIs critical points (tagged questions if exist)
 *   b) from facility topic bank
 * - For MVP: choose up to 10 questions total: 6 task-related, 4 facility
 */
const GenerateQuiz = z.object({
  facilityTopicCode: z.string().optional()
});

trainingRouter.post("/sessions/:id/quiz/generate", async (req, res) => {
  const sessionId = req.params.id;
  const parsed = GenerateQuiz.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [session] = await db.select().from(dailySessions).where(eq(dailySessions.id, sessionId));
  if (!session) return res.status(404).json({ error: "Session not found" });

  // get today blocks -> tasks -> wi ids
  const blocks = await db
    .select({ taskId: dailyTaskBlocks.taskId, wiId: tasks.workInstructionId })
    .from(dailyTaskBlocks)
    .innerJoin(tasks, eq(tasks.id, dailyTaskBlocks.taskId))
    .where(eq(dailyTaskBlocks.sessionId, sessionId));

  const wiIds = blocks.map(b => b.wiId).filter(Boolean) as string[];

  // facility topic
  let topicId: string | null = null;
  if (parsed.data.facilityTopicCode) {
    const [topic] = await db
      .select()
      .from(facilityTopics)
      .where(eq(facilityTopics.code, parsed.data.facilityTopicCode));
    topicId = topic?.id ?? null;
  }

  // Pull questions
  const taskQs = wiIds.length
    ? await db
        .select()
        .from(quizQuestions)
        .where(and(eq(quizQuestions.active, true), inArray(quizQuestions.workInstructionId, wiIds)))
        .limit(20)
    : [];

  const facilityQs = topicId
    ? await db
        .select()
        .from(quizQuestions)
        .where(and(eq(quizQuestions.active, true), eq(quizQuestions.topicId, topicId)))
        .limit(20)
    : [];

  // Shuffle function (Fisher-Yates algorithm)
  function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Randomized selection: shuffle pools, then pick subsets
  const shuffledTaskQs = shuffle(taskQs);
  const shuffledFacilityQs = shuffle(facilityQs);
  
  const pickedTaskQs = shuffledTaskQs.slice(0, 6);
  const pickedFacilityQs = shuffledFacilityQs.slice(0, 4);
  
  // Combine and shuffle final selection for varied question order
  const selected = shuffle([...pickedTaskQs, ...pickedFacilityQs]).slice(0, 10);

  // Create quiz record
  const [quiz] = await db
    .insert(dailyQuizzes)
    .values({ sessionId, score: 0, total: selected.length, passed: false })
    .returning();

  // Create answer placeholders
  if (selected.length > 0) {
    await db.insert(dailyQuizAnswers).values(
      selected.map(q => ({
        dailyQuizId: quiz.id,
        questionId: q.id,
        answer: null,
        correct: false
      }))
    );
  }

  // Return quiz + questions (without answers)
  res.json({
    quizId: quiz.id,
    total: selected.length,
    questions: selected.map(q => ({
      id: q.id,
      question: q.question,
      type: q.type,
      meta: q.meta
    }))
  });
});

/**
 * 5) Submit quiz answers and score
 */
const SubmitQuiz = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      answer: z.string().optional().nullable()
    })
  )
});

/**
 * Sign session (competency attestation)
 */
const SignSession = z.object({
  traineeSignature: z.string().min(1),
  trainerSignature: z.string().min(1),
  competencyAttested: z.boolean().optional(),
  notes: z.string().optional().nullable()
});

trainingRouter.patch("/sessions/:id/sign", async (req, res) => {
  const sessionId = req.params.id;
  const parsed = SignSession.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [updated] = await db
    .update(dailySessions)
    .set({
      traineeSignature: parsed.data.traineeSignature,
      trainerSignature: parsed.data.trainerSignature,
      signedAt: new Date(),
      competencyAttested: parsed.data.competencyAttested ?? true,
      notes: parsed.data.notes ?? null
    })
    .where(eq(dailySessions.id, sessionId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Session not found" });
  res.json(updated);
});

trainingRouter.post("/quizzes/:id/submit", async (req, res) => {
  const dailyQuizId = req.params.id;
  const parsed = SubmitQuiz.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const [quiz] = await db.select().from(dailyQuizzes).where(eq(dailyQuizzes.id, dailyQuizId));
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  // Pull question data
  const qIds = parsed.data.answers.map(a => a.questionId);
  const questions = qIds.length
    ? await db.select().from(quizQuestions).where(inArray(quizQuestions.id, qIds))
    : [];

  const qById = new Map(questions.map(q => [q.id, q]));

  let score = 0;
  const updates = parsed.data.answers.map(a => {
    const q = qById.get(a.questionId);
    let correct = false;

    if (q) {
      const meta: any = q.meta ?? {};
      if (q.type === "MCQ") {
        const userAnswer = (a.answer ?? "").trim();
        const correctAnswer = String(meta.answer).trim();
        // Handle both formats: just the letter "B" or full choice "B. Answer text"
        // Extract letter from user answer if it starts with a letter followed by period/dot
        const userLetter = userAnswer.match(/^([A-Da-d])\.?\s/)?.[1]?.toUpperCase() || userAnswer;
        const correctLetter = correctAnswer.match(/^([A-Da-d])\.?\s/)?.[1]?.toUpperCase() || correctAnswer;
        correct = userLetter === correctLetter || userAnswer === correctAnswer;
      } else if (q.type === "TF") {
        correct = (a.answer ?? "").trim().toLowerCase() === String(meta.answer).trim().toLowerCase();
      } else {
        // SHORT: mark as not auto-correct for MVP
        correct = false;
      }
    }

    if (correct) score += 1;

    return { questionId: a.questionId, answer: a.answer ?? null, correct };
  });

  // Apply updates to dailyQuizAnswers
  for (const u of updates) {
    await db
      .update(dailyQuizAnswers)
      .set({ answer: u.answer, correct: u.correct })
      .where(and(eq(dailyQuizAnswers.dailyQuizId, dailyQuizId), eq(dailyQuizAnswers.questionId, u.questionId)));
  }

  const passed = quiz.total > 0 ? score / quiz.total >= 0.8 : false;

  const [updatedQuiz] = await db
    .update(dailyQuizzes)
    .set({ score, passed })
    .where(eq(dailyQuizzes.id, dailyQuizId))
    .returning();

  res.json({ quiz: updatedQuiz });
});
