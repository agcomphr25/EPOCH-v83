import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  jsonb
} from "drizzle-orm/pg-core";

/**
 * Library tables
 */

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const workInstructions = pgTable("work_instructions", {
  id: uuid("id").defaultRandom().primaryKey(),
  wiCode: text("wi_code").notNull().unique(), // e.g. WI-CT-001
  title: text("title").notNull(),
  body: text("body"), // rich text later
  revision: text("revision").default("A").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  workInstructionId: uuid("work_instruction_id").references(() => workInstructions.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const criticalPoints = pgTable("critical_points", {
  id: uuid("id").defaultRandom().primaryKey(),
  workInstructionId: uuid("work_instruction_id")
    .notNull()
    .references(() => workInstructions.id),
  label: text("label").notNull(), // short name
  detail: text("detail"),         // what/why
  severity: text("severity").default("major").notNull(), // minor/major/critical
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const roleTasks = pgTable("role_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  sortOrder: integer("sort_order").default(0).notNull(),
  required: boolean("required").default(true).notNull()
});

/**
 * Facility Essentials modules & quiz bank
 */
export const facilityTopics = pgTable("facility_topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(), // PPE, FOD, ITAR, CHEM, FIRE, COUNTERFEIT
  title: text("title").notNull(),
  overview: text("overview"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").references(() => facilityTopics.id),
  taskId: uuid("task_id").references(() => tasks.id),
  workInstructionId: uuid("work_instruction_id").references(() => workInstructions.id),
  criticalPointId: uuid("critical_point_id").references(() => criticalPoints.id),

  question: text("question").notNull(),
  type: text("type").notNull(), // MCQ | TF | SHORT
  // store choices + answer as json for flexibility
  meta: jsonb("meta").default({}).notNull(), // {choices:[], answer:"A"} etc.
  active: boolean("active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull()
});

/**
 * Training execution (daily sheet + quiz)
 */
export const trainees = pgTable("trainees", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  roleId: uuid("role_id").references(() => roles.id),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dailySessions = pgTable("daily_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  traineeId: uuid("trainee_id").notNull().references(() => trainees.id),
  trainerName: text("trainer_name").notNull(),
  sessionDate: timestamp("session_date").notNull(),
  facilityTopicId: uuid("facility_topic_id").references(() => facilityTopics.id),
  planDayId: uuid("plan_day_id"), // Links to training plan day (FK added after table creation)
  traineeSignature: text("trainee_signature"),
  trainerSignature: text("trainer_signature"),
  signedAt: timestamp("signed_at"),
  competencyAttested: boolean("competency_attested").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dailyTaskBlocks = pgTable("daily_task_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => dailySessions.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),

  // 4-step method completion flags
  step1: boolean("step1").default(false).notNull(),
  step2: boolean("step2").default(false).notNull(),
  step3: boolean("step3").default(false).notNull(),
  step4: boolean("step4").default(false).notNull(),

  // SOA coaching
  strength: text("strength"),
  opportunity: text("opportunity"),
  action: text("action"),

  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dailyQuizzes = pgTable("daily_quizzes", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => dailySessions.id),
  score: integer("score").default(0).notNull(),
  total: integer("total").default(0).notNull(),
  passed: boolean("passed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const dailyQuizAnswers = pgTable("daily_quiz_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  dailyQuizId: uuid("daily_quiz_id").notNull().references(() => dailyQuizzes.id),
  questionId: uuid("question_id").notNull().references(() => quizQuestions.id),
  answer: text("answer"),
  correct: boolean("correct").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

/**
 * Work Instruction Import Jobs (PDF import + AI extraction)
 */
export const wiImportJobs = pgTable("wi_import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  wiId: uuid("wi_id").references(() => workInstructions.id),
  originalFilename: text("original_filename").notNull(),
  extractedText: text("extracted_text"),
  status: text("status").default("uploaded").notNull(), // uploaded | processing | completed | failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
});

/**
 * Facility Topic Import Jobs (document import + AI quiz generation)
 */
export const facilityTopicImportJobs = pgTable("facility_topic_import_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicId: uuid("topic_id").references(() => facilityTopics.id),
  originalFilename: text("original_filename").notNull(),
  extractedText: text("extracted_text"),
  status: text("status").default("uploaded").notNull(), // uploaded | processing | completed | failed
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
});

/**
 * 4-Day Training Plans
 * Knowledge levels: basic | intermediate | advanced
 * Plan status: draft | scheduled | in_progress | completed | cancelled
 */
export const trainingPlans = pgTable("training_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  traineeId: uuid("trainee_id").notNull().references(() => trainees.id),
  trainerName: text("trainer_name").notNull(),
  title: text("title").notNull(),
  startDate: timestamp("start_date"),
  status: text("status").default("draft").notNull(), // draft | scheduled | in_progress | completed | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at")
});

export const trainingPlanDays = pgTable("training_plan_days", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: uuid("plan_id").notNull().references(() => trainingPlans.id),
  dayNumber: integer("day_number").notNull(), // 1, 2, 3, or 4
  stepFocus: text("step_focus").notNull(), // Step 1: Trainer Does/Explains, etc.
  objectives: text("objectives"),
  status: text("status").default("pending").notNull(), // pending | in_progress | completed
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const trainingPlanDayTasks = pgTable("training_plan_day_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  planDayId: uuid("plan_day_id").notNull().references(() => trainingPlanDays.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  sortOrder: integer("sort_order").default(0).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const trainingPlanDayTopics = pgTable("training_plan_day_topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  planDayId: uuid("plan_day_id").notNull().references(() => trainingPlanDays.id),
  facilityTopicId: uuid("facility_topic_id").notNull().references(() => facilityTopics.id),
  baselineLevel: text("baseline_level").default("none").notNull(), // none | basic | intermediate | advanced
  targetLevel: text("target_level").default("basic").notNull(), // basic | intermediate | advanced
  emphasisNotes: text("emphasis_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const traineeTopicKnowledge = pgTable("trainee_topic_knowledge", {
  id: uuid("id").defaultRandom().primaryKey(),
  traineeId: uuid("trainee_id").notNull().references(() => trainees.id),
  topicId: uuid("topic_id").notNull().references(() => facilityTopics.id),
  currentLevel: text("current_level").default("none").notNull(), // none | basic | intermediate | advanced
  assessedAt: timestamp("assessed_at"),
  sourcePlanDayId: uuid("source_plan_day_id").references(() => trainingPlanDays.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
