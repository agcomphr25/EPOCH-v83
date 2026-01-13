import { Router } from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { db } from "../db";
import { workInstructions, criticalPoints, quizQuestions, wiImportJobs, facilityTopics, facilityTopicImportJobs } from "../db/schema";
import { eq } from "drizzle-orm";
import { extractCriticalPointsFromText, generateQuizFromCriticalPoints, generateQuizFromFacilityTopic } from "../services/ai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/work-instructions/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { wiCode, title, revision } = req.body;
    if (!wiCode || !title) {
      return res.status(400).json({ error: "wiCode and title are required" });
    }

    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    const extractedText = pdfData.text;

    const [wi] = await db
      .insert(workInstructions)
      .values({ wiCode, title, body: extractedText, revision: revision || "A" })
      .returning();

    const [job] = await db
      .insert(wiImportJobs)
      .values({
        wiId: wi.id,
        originalFilename: req.file.originalname,
        extractedText,
        status: "processing",
      })
      .returning();

    processImportJob(job.id, wi.id, wi.title, extractedText);

    res.json({ wiId: wi.id, jobId: job.id, status: "processing", message: "PDF imported, AI analysis started" });
  } catch (error: any) {
    console.error("Import error:", error);
    res.status(500).json({ error: error.message || "Import failed" });
  }
});

async function processImportJob(jobId: string, wiId: string, wiTitle: string, text: string) {
  try {
    const extractedPoints = await extractCriticalPointsFromText(wiTitle, text);

    for (const point of extractedPoints) {
      await db.insert(criticalPoints).values({
        workInstructionId: wiId,
        label: point.label,
        detail: point.detail,
        severity: point.severity,
      });
    }

    const allPoints = await db
      .select()
      .from(criticalPoints)
      .where(eq(criticalPoints.workInstructionId, wiId));

    const questions = await generateQuizFromCriticalPoints(wiTitle, allPoints.map(p => ({ label: p.label, detail: p.detail || "", severity: p.severity })));

    for (const q of questions) {
      await db.insert(quizQuestions).values({
        workInstructionId: wiId,
        question: q.question,
        type: q.type,
        meta: { choices: q.choices || [], answer: q.answer },
        active: true,
      });
    }

    await db
      .update(wiImportJobs)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(wiImportJobs.id, jobId));
  } catch (error: any) {
    console.error("AI processing error:", error);
    await db
      .update(wiImportJobs)
      .set({ status: "failed", error: error.message })
      .where(eq(wiImportJobs.id, jobId));
  }
}

router.get("/work-instructions/import/:jobId", async (req, res) => {
  const [job] = await db
    .select()
    .from(wiImportJobs)
    .where(eq(wiImportJobs.id, req.params.jobId));

  if (!job) {
    return res.status(404).json({ error: "Import job not found" });
  }

  let pointsCount = 0;
  let questionsCount = 0;
  if (job.wiId) {
    const points = await db.select().from(criticalPoints).where(eq(criticalPoints.workInstructionId, job.wiId));
    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.workInstructionId, job.wiId));
    pointsCount = points.length;
    questionsCount = questions.length;
  }

  res.json({
    id: job.id,
    status: job.status,
    error: job.error,
    wiId: job.wiId,
    originalFilename: job.originalFilename,
    criticalPointsGenerated: pointsCount,
    quizQuestionsGenerated: questionsCount,
    createdAt: job.createdAt,
    processedAt: job.processedAt,
  });
});

router.post("/work-instructions/:wiId/generate-quiz", async (req, res) => {
  try {
    const { wiId } = req.params;

    const [wi] = await db.select().from(workInstructions).where(eq(workInstructions.id, wiId));
    if (!wi) {
      return res.status(404).json({ error: "Work instruction not found" });
    }

    const points = await db
      .select()
      .from(criticalPoints)
      .where(eq(criticalPoints.workInstructionId, wiId));

    if (points.length === 0) {
      return res.status(400).json({ error: "No critical points found for this work instruction" });
    }

    const questions = await generateQuizFromCriticalPoints(wi.title, points.map(p => ({ label: p.label, detail: p.detail || "", severity: p.severity })));

    const inserted = [];
    for (const q of questions) {
      const [row] = await db.insert(quizQuestions).values({
        workInstructionId: wiId,
        question: q.question,
        type: q.type,
        meta: { choices: q.choices || [], answer: q.answer },
        active: true,
      }).returning();
      inserted.push(row);
    }

    res.json({ generated: inserted.length, questions: inserted });
  } catch (error: any) {
    console.error("Quiz generation error:", error);
    res.status(500).json({ error: error.message || "Quiz generation failed" });
  }
});

// Facility Topic Import Routes

router.post("/facility-topics/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { code, title } = req.body;
    if (!code || !title) {
      return res.status(400).json({ error: "code and title are required" });
    }

    let extractedText = "";
    
    // Check if it's a PDF or text file
    if (req.file.mimetype === "application/pdf") {
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfData = await parser.getText();
      await parser.destroy();
      extractedText = pdfData.text;
    } else {
      // Treat as text file
      extractedText = req.file.buffer.toString("utf-8");
    }

    // Create topic if doesn't exist (don't update content until AI succeeds)
    const existing = await db.select().from(facilityTopics).where(eq(facilityTopics.code, code));
    let topic;
    
    if (existing.length > 0) {
      topic = existing[0];
    } else {
      [topic] = await db
        .insert(facilityTopics)
        .values({ code, title, overview: "" })
        .returning();
    }

    // Create import job with extracted text
    const [job] = await db
      .insert(facilityTopicImportJobs)
      .values({
        topicId: topic.id,
        originalFilename: req.file.originalname,
        extractedText,
        status: "processing",
      })
      .returning();

    // Process async - will update topic content only on success
    processFacilityTopicImportJob(job.id, topic.id, code, title, extractedText);

    res.json({ topicId: topic.id, jobId: job.id, status: "processing", message: "Document imported, AI quiz generation started" });
  } catch (error: any) {
    console.error("Facility topic import error:", error);
    res.status(500).json({ error: error.message || "Import failed" });
  }
});

async function processFacilityTopicImportJob(jobId: string, topicId: string, code: string, title: string, text: string) {
  try {
    const questions = await generateQuizFromFacilityTopic(code, title, text);

    // Deactivate existing quiz questions for this topic before inserting new ones
    await db
      .update(quizQuestions)
      .set({ active: false })
      .where(eq(quizQuestions.topicId, topicId));

    let insertedCount = 0;
    for (const q of questions) {
      await db.insert(quizQuestions).values({
        topicId: topicId,
        question: q.question,
        type: q.type,
        meta: { choices: q.choices || [], answer: q.answer, jobId },
        active: true,
      });
      insertedCount++;
    }

    // Only update topic content after successful quiz generation
    await db
      .update(facilityTopics)
      .set({ title, overview: text })
      .where(eq(facilityTopics.id, topicId));

    await db
      .update(facilityTopicImportJobs)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(facilityTopicImportJobs.id, jobId));
  } catch (error: any) {
    console.error("Facility topic AI processing error:", error);
    await db
      .update(facilityTopicImportJobs)
      .set({ status: "failed", error: error.message })
      .where(eq(facilityTopicImportJobs.id, jobId));
  }
}

router.get("/facility-topics/import/:jobId", async (req, res) => {
  const [job] = await db
    .select()
    .from(facilityTopicImportJobs)
    .where(eq(facilityTopicImportJobs.id, req.params.jobId));

  if (!job) {
    return res.status(404).json({ error: "Import job not found" });
  }

  let questionsCount = 0;
  if (job.topicId) {
    // Count questions specifically created by this job using the jobId stored in meta
    const questions = await db.select().from(quizQuestions).where(eq(quizQuestions.topicId, job.topicId));
    questionsCount = questions.filter((q: any) => q.meta?.jobId === job.id).length;
  }

  res.json({
    id: job.id,
    status: job.status,
    error: job.error,
    topicId: job.topicId,
    originalFilename: job.originalFilename,
    quizQuestionsGenerated: questionsCount,
    createdAt: job.createdAt,
    processedAt: job.processedAt,
  });
});

router.post("/facility-topics/:topicId/generate-quiz", async (req, res) => {
  try {
    const { topicId } = req.params;

    const [topic] = await db.select().from(facilityTopics).where(eq(facilityTopics.id, topicId));
    if (!topic) {
      return res.status(404).json({ error: "Facility topic not found" });
    }

    if (!topic.overview) {
      return res.status(400).json({ error: "No content found for this facility topic. Please import a document first." });
    }

    const questions = await generateQuizFromFacilityTopic(topic.code, topic.title, topic.overview);

    // Deactivate existing quiz questions before inserting new ones
    await db
      .update(quizQuestions)
      .set({ active: false })
      .where(eq(quizQuestions.topicId, topicId));

    const inserted = [];
    for (const q of questions) {
      const [row] = await db.insert(quizQuestions).values({
        topicId: topicId,
        question: q.question,
        type: q.type,
        meta: { choices: q.choices || [], answer: q.answer },
        active: true,
      }).returning();
      inserted.push(row);
    }

    res.json({ generated: inserted.length, questions: inserted });
  } catch (error: any) {
    console.error("Facility topic quiz generation error:", error);
    res.status(500).json({ error: error.message || "Quiz generation failed" });
  }
});

export default router;
