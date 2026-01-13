import { Router } from "express";
import { db } from "../db";
import {
  trainingPlans,
  trainingPlanDays,
  trainingPlanDayTasks,
  trainingPlanDayTopics,
  traineeTopicKnowledge,
  dailySessions,
  dailyTaskBlocks,
  trainees,
  tasks,
  facilityTopics
} from "../db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const STEP_FOCUS = [
  "Step 1: Trainer Does / Trainer Explains",
  "Step 2: Trainer Does / Trainee Explains",
  "Step 3: Trainee Does / Trainer Coaches",
  "Step 4: Trainee Does / Trainer Observes"
];

// Get all training plans
router.get("/", async (req, res) => {
  const plans = await db.select().from(trainingPlans).orderBy(trainingPlans.createdAt);
  res.json(plans);
});

// Get training plan with full details
router.get("/:id", async (req, res) => {
  const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, req.params.id));
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const days = await db.select().from(trainingPlanDays).where(eq(trainingPlanDays.planId, plan.id)).orderBy(trainingPlanDays.dayNumber);
  
  const daysWithDetails = await Promise.all(days.map(async (day) => {
    const dayTasks = await db.select().from(trainingPlanDayTasks).where(eq(trainingPlanDayTasks.planDayId, day.id)).orderBy(trainingPlanDayTasks.sortOrder);
    const dayTopics = await db.select().from(trainingPlanDayTopics).where(eq(trainingPlanDayTopics.planDayId, day.id));
    
    // Get task details
    const tasksWithDetails = await Promise.all(dayTasks.map(async (dt) => {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, dt.taskId));
      return { ...dt, task };
    }));
    
    // Get topic details
    const topicsWithDetails = await Promise.all(dayTopics.map(async (dt) => {
      const [topic] = await db.select().from(facilityTopics).where(eq(facilityTopics.id, dt.facilityTopicId));
      return { ...dt, topic };
    }));
    
    // Check if session exists for this day
    const sessions = await db.select().from(dailySessions).where(eq(dailySessions.planDayId, day.id));
    
    return { ...day, tasks: tasksWithDetails, topics: topicsWithDetails, session: sessions[0] || null };
  }));

  // Get trainee details
  const [trainee] = await db.select().from(trainees).where(eq(trainees.id, plan.traineeId));

  res.json({ ...plan, trainee, days: daysWithDetails });
});

// Create a new training plan
router.post("/", async (req, res) => {
  try {
    const { traineeId, trainerName, title, startDate, notes, taskIds, topicConfigs } = req.body;
    
    if (!traineeId || !trainerName || !title) {
      return res.status(400).json({ error: "traineeId, trainerName, and title are required" });
    }

    // Create the plan
    const [plan] = await db.insert(trainingPlans).values({
      traineeId,
      trainerName,
      title,
      startDate: startDate ? new Date(startDate) : null,
      notes,
      status: "draft"
    }).returning();

    // Create 4 days with step focus
    const dayPromises = STEP_FOCUS.map(async (stepFocus, i) => {
      const [day] = await db.insert(trainingPlanDays).values({
        planId: plan.id,
        dayNumber: i + 1,
        stepFocus,
        status: "pending"
      }).returning();
      return day;
    });
    const days = await Promise.all(dayPromises);

    // Add tasks to all days (same task trained progressively over 4 days)
    if (taskIds && taskIds.length > 0) {
      for (const day of days) {
        for (let i = 0; i < taskIds.length; i++) {
          await db.insert(trainingPlanDayTasks).values({
            planDayId: day.id,
            taskId: taskIds[i],
            sortOrder: i
          });
        }
      }
    }

    // Add topic configs to appropriate days
    if (topicConfigs && topicConfigs.length > 0) {
      for (const config of topicConfigs) {
        // Get trainee's current knowledge level for baseline
        const existing = await db.select().from(traineeTopicKnowledge)
          .where(and(
            eq(traineeTopicKnowledge.traineeId, traineeId),
            eq(traineeTopicKnowledge.topicId, config.topicId)
          ));
        const baselineLevel = existing[0]?.currentLevel || "none";
        
        // Add to specified days or all days
        const targetDays = config.days ? days.filter(d => config.days.includes(d.dayNumber)) : days;
        for (const day of targetDays) {
          await db.insert(trainingPlanDayTopics).values({
            planDayId: day.id,
            facilityTopicId: config.topicId,
            baselineLevel,
            targetLevel: config.targetLevel || "basic",
            emphasisNotes: config.emphasisNotes
          });
        }
      }
    }

    res.json(plan);
  } catch (error: any) {
    console.error("Error creating plan:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update plan status
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["draft", "scheduled", "in_progress", "completed", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const updates: any = { status };
  if (status === "completed") {
    updates.completedAt = new Date();
  }

  const [plan] = await db.update(trainingPlans)
    .set(updates)
    .where(eq(trainingPlans.id, req.params.id))
    .returning();
  res.json(plan);
});

// Start a plan day (create session from plan)
router.post("/:id/days/:dayNumber/start", async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    
    // Get plan and day
    const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, id));
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const [day] = await db.select().from(trainingPlanDays)
      .where(and(eq(trainingPlanDays.planId, id), eq(trainingPlanDays.dayNumber, parseInt(dayNumber))));
    if (!day) return res.status(404).json({ error: "Day not found" });

    // Check if session already exists
    const existingSessions = await db.select().from(dailySessions).where(eq(dailySessions.planDayId, day.id));
    if (existingSessions.length > 0) {
      return res.json({ session: existingSessions[0], message: "Session already exists" });
    }

    // Get day topics (use first one for session)
    const dayTopics = await db.select().from(trainingPlanDayTopics).where(eq(trainingPlanDayTopics.planDayId, day.id));
    const facilityTopicId = dayTopics[0]?.facilityTopicId || null;

    // Create session
    const [session] = await db.insert(dailySessions).values({
      traineeId: plan.traineeId,
      trainerName: plan.trainerName,
      sessionDate: new Date(),
      facilityTopicId,
      planDayId: day.id
    }).returning();

    // Get day tasks and create task blocks
    const dayTasks = await db.select().from(trainingPlanDayTasks)
      .where(eq(trainingPlanDayTasks.planDayId, day.id))
      .orderBy(trainingPlanDayTasks.sortOrder);

    for (const dt of dayTasks) {
      // Pre-check the appropriate step based on day number
      const stepFlags: any = { step1: false, step2: false, step3: false, step4: false };
      
      await db.insert(dailyTaskBlocks).values({
        sessionId: session.id,
        taskId: dt.taskId,
        ...stepFlags
      });
    }

    // Update plan and day status
    if (plan.status === "draft" || plan.status === "scheduled") {
      await db.update(trainingPlans).set({ status: "in_progress" }).where(eq(trainingPlans.id, id));
    }
    await db.update(trainingPlanDays).set({ status: "in_progress" }).where(eq(trainingPlanDays.id, day.id));

    res.json({ session, day });
  } catch (error: any) {
    console.error("Error starting day:", error);
    res.status(500).json({ error: error.message });
  }
});

// Complete a plan day and update knowledge
router.post("/:id/days/:dayNumber/complete", async (req, res) => {
  try {
    const { id, dayNumber } = req.params;
    
    const [day] = await db.select().from(trainingPlanDays)
      .where(and(eq(trainingPlanDays.planId, id), eq(trainingPlanDays.dayNumber, parseInt(dayNumber))));
    if (!day) return res.status(404).json({ error: "Day not found" });

    const [plan] = await db.select().from(trainingPlans).where(eq(trainingPlans.id, id));
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Mark day completed
    await db.update(trainingPlanDays)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(trainingPlanDays.id, day.id));

    // If this is day 4, update trainee knowledge levels
    if (parseInt(dayNumber) === 4) {
      const dayTopics = await db.select().from(trainingPlanDayTopics)
        .where(eq(trainingPlanDayTopics.planDayId, day.id));

      for (const dt of dayTopics) {
        // Check if knowledge record exists
        const existing = await db.select().from(traineeTopicKnowledge)
          .where(and(
            eq(traineeTopicKnowledge.traineeId, plan.traineeId),
            eq(traineeTopicKnowledge.topicId, dt.facilityTopicId)
          ));

        if (existing.length > 0) {
          await db.update(traineeTopicKnowledge)
            .set({
              currentLevel: dt.targetLevel,
              assessedAt: new Date(),
              sourcePlanDayId: day.id,
              updatedAt: new Date()
            })
            .where(eq(traineeTopicKnowledge.id, existing[0].id));
        } else {
          await db.insert(traineeTopicKnowledge).values({
            traineeId: plan.traineeId,
            topicId: dt.facilityTopicId,
            currentLevel: dt.targetLevel,
            assessedAt: new Date(),
            sourcePlanDayId: day.id
          });
        }
      }

      // Check if all days completed
      const allDays = await db.select().from(trainingPlanDays).where(eq(trainingPlanDays.planId, id));
      const allCompleted = allDays.every(d => d.status === "completed");
      if (allCompleted) {
        await db.update(trainingPlans)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(trainingPlans.id, id));
      }
    }

    res.json({ success: true, day });
  } catch (error: any) {
    console.error("Error completing day:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainee's current knowledge levels
router.get("/trainee/:traineeId/knowledge", async (req, res) => {
  const knowledge = await db.select()
    .from(traineeTopicKnowledge)
    .where(eq(traineeTopicKnowledge.traineeId, req.params.traineeId));
  
  // Get topic details
  const withTopics = await Promise.all(knowledge.map(async (k) => {
    const [topic] = await db.select().from(facilityTopics).where(eq(facilityTopics.id, k.topicId));
    return { ...k, topic };
  }));

  res.json(withTopics);
});

// Delete a training plan
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  
  // Get all days
  const days = await db.select().from(trainingPlanDays).where(eq(trainingPlanDays.planId, id));
  
  // Delete in order: tasks, topics, days, then plan
  for (const day of days) {
    await db.delete(trainingPlanDayTasks).where(eq(trainingPlanDayTasks.planDayId, day.id));
    await db.delete(trainingPlanDayTopics).where(eq(trainingPlanDayTopics.planDayId, day.id));
  }
  await db.delete(trainingPlanDays).where(eq(trainingPlanDays.planId, id));
  await db.delete(trainingPlans).where(eq(trainingPlans.id, id));
  
  res.json({ success: true });
});

export default router;
