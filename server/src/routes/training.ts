import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  trainingModules, 
  trainingQuizQuestions, 
  trainingQuizAnswers, 
  trainingCompletions,
  insertTrainingModuleSchema,
  insertTrainingQuizQuestionSchema,
  insertTrainingQuizAnswerSchema,
  insertTrainingCompletionSchema
} from '../../schema';
import { eq, desc, and } from 'drizzle-orm';

const router = Router();

// Get all training modules (admin gets all, regular users get active only)
router.get('/modules', async (req: Request, res: Response) => {
  try {
    const isAdmin = req.query.admin === 'true';
    
    let query = db.select().from(trainingModules);
    
    if (!isAdmin) {
      query = query.where(eq(trainingModules.isActive, true)) as any;
    }
    
    const modules = await query.orderBy(desc(trainingModules.createdAt));
    res.json(modules);
  } catch (error) {
    console.error('Get training modules error:', error);
    res.status(500).json({ error: 'Failed to fetch training modules' });
  }
});

// Get specific training module with questions and answers
router.get('/modules/:id', async (req: Request, res: Response) => {
  try {
    const moduleId = parseInt(req.params.id);
    
    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    const questions = await db
      .select()
      .from(trainingQuizQuestions)
      .where(and(
        eq(trainingQuizQuestions.moduleId, moduleId),
        eq(trainingQuizQuestions.isActive, true)
      ))
      .orderBy(trainingQuizQuestions.sortOrder);
    
    // Get answers for each question
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await db
          .select()
          .from(trainingQuizAnswers)
          .where(eq(trainingQuizAnswers.questionId, question.id))
          .orderBy(trainingQuizAnswers.sortOrder);
        
        return {
          ...question,
          answers
        };
      })
    );
    
    res.json({
      ...module,
      questions: questionsWithAnswers
    });
  } catch (error) {
    console.error('Get training module error:', error);
    res.status(500).json({ error: 'Failed to fetch training module' });
  }
});

// Submit quiz and get certification
router.post('/modules/:id/complete', async (req: Request, res: Response) => {
  try {
    const moduleId = parseInt(req.params.id);
    const { employeeId, employeeName, answers: userAnswers } = req.body;
    
    console.log('Training completion submission:', { moduleId, employeeId, employeeName, answersCount: Object.keys(userAnswers || {}).length });
    
    // Get module details
    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    // Get all questions
    const questions = await db
      .select()
      .from(trainingQuizQuestions)
      .where(and(
        eq(trainingQuizQuestions.moduleId, moduleId),
        eq(trainingQuizQuestions.isActive, true)
      ));
    
    // Calculate score
    let correctAnswers = 0;
    const totalQuestions = questions.length;
    
    for (const question of questions) {
      const userAnswer = userAnswers[question.id];
      if (userAnswer && userAnswer === question.correctAnswer) {
        correctAnswers++;
      }
    }
    
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    const passed = score >= (module.passingScore || 80);
    
    // Record completion - bypass Zod validation and insert directly
    const [completion] = await db
      .insert(trainingCompletions)
      .values({
        moduleId,
        employeeId: String(employeeId), // Ensure string type
        employeeName: String(employeeName),
        score,
        passed,
        answers: userAnswers, // JSONB handles objects automatically
        certificateIssued: passed,
      })
      .returning();
    
    console.log('Training completion recorded:', completion.id);
    
    res.json({
      ...completion,
      totalQuestions,
      correctAnswers,
      passingScore: module.passingScore || 80,
      moduleTitle: module.title
    });
  } catch (error: any) {
    console.error('Submit training completion error:', error);
    res.status(500).json({ error: 'Failed to submit training completion', details: error.message });
  }
});

// Get employee's training completions
router.get('/completions/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.employeeId;
    
    const completions = await db
      .select()
      .from(trainingCompletions)
      .where(eq(trainingCompletions.employeeId, employeeId))
      .orderBy(desc(trainingCompletions.completedAt));
    
    res.json(completions);
  } catch (error) {
    console.error('Get training completions error:', error);
    res.status(500).json({ error: 'Failed to fetch training completions' });
  }
});

// Get all training completions (admin)
router.get('/completions', async (req: Request, res: Response) => {
  try {
    const completions = await db
      .select()
      .from(trainingCompletions)
      .orderBy(desc(trainingCompletions.completedAt));
    
    res.json(completions);
  } catch (error) {
    console.error('Get all training completions error:', error);
    res.status(500).json({ error: 'Failed to fetch training completions' });
  }
});

// Create training module (admin)
router.post('/modules', async (req: Request, res: Response) => {
  try {
    const moduleData = insertTrainingModuleSchema.parse(req.body);
    const [module] = await db
      .insert(trainingModules)
      .values(moduleData)
      .returning();
    
    res.status(201).json(module);
  } catch (error) {
    console.error('Create training module error:', error);
    res.status(500).json({ error: 'Failed to create training module' });
  }
});

// Create quiz question (admin)
router.post('/questions', async (req: Request, res: Response) => {
  try {
    const questionData = insertTrainingQuizQuestionSchema.parse(req.body);
    const [question] = await db
      .insert(trainingQuizQuestions)
      .values(questionData)
      .returning();
    
    res.status(201).json(question);
  } catch (error) {
    console.error('Create quiz question error:', error);
    res.status(500).json({ error: 'Failed to create quiz question' });
  }
});

// Create quiz answer (admin)
router.post('/answers', async (req: Request, res: Response) => {
  try {
    const answerData = insertTrainingQuizAnswerSchema.parse(req.body);
    const [answer] = await db
      .insert(trainingQuizAnswers)
      .values(answerData)
      .returning();
    
    res.status(201).json(answer);
  } catch (error) {
    console.error('Create quiz answer error:', error);
    res.status(500).json({ error: 'Failed to create quiz answer' });
  }
});

// Update training module (admin)
router.patch('/modules/:id', async (req: Request, res: Response) => {
  try {
    const moduleId = parseInt(req.params.id);
    const moduleData = insertTrainingModuleSchema.parse(req.body);
    
    const [updatedModule] = await db
      .update(trainingModules)
      .set({ ...moduleData, updatedAt: new Date() })
      .where(eq(trainingModules.id, moduleId))
      .returning();
    
    if (!updatedModule) {
      return res.status(404).json({ error: 'Module not found' });
    }
    
    res.json(updatedModule);
  } catch (error) {
    console.error('Update training module error:', error);
    res.status(500).json({ error: 'Failed to update training module' });
  }
});

// Update quiz question (admin)
router.patch('/questions/:id', async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
    const questionData = insertTrainingQuizQuestionSchema.parse(req.body);
    
    const [updatedQuestion] = await db
      .update(trainingQuizQuestions)
      .set(questionData)
      .where(eq(trainingQuizQuestions.id, questionId))
      .returning();
    
    if (!updatedQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json(updatedQuestion);
  } catch (error) {
    console.error('Update quiz question error:', error);
    res.status(500).json({ error: 'Failed to update quiz question' });
  }
});

// Update quiz answer (admin)
router.patch('/answers/:id', async (req: Request, res: Response) => {
  try {
    const answerId = parseInt(req.params.id);
    const answerData = insertTrainingQuizAnswerSchema.parse(req.body);
    
    const [updatedAnswer] = await db
      .update(trainingQuizAnswers)
      .set(answerData)
      .where(eq(trainingQuizAnswers.id, answerId))
      .returning();
    
    if (!updatedAnswer) {
      return res.status(404).json({ error: 'Answer not found' });
    }
    
    res.json(updatedAnswer);
  } catch (error) {
    console.error('Update quiz answer error:', error);
    res.status(500).json({ error: 'Failed to update quiz answer' });
  }
});

// Delete training module (admin)
router.delete('/modules/:id', async (req: Request, res: Response) => {
  try {
    const moduleId = parseInt(req.params.id);
    
    // Delete related questions and answers first
    const questions = await db
      .select()
      .from(trainingQuizQuestions)
      .where(eq(trainingQuizQuestions.moduleId, moduleId));
    
    for (const question of questions) {
      await db
        .delete(trainingQuizAnswers)
        .where(eq(trainingQuizAnswers.questionId, question.id));
    }
    
    await db
      .delete(trainingQuizQuestions)
      .where(eq(trainingQuizQuestions.moduleId, moduleId));
    
    await db
      .delete(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    res.json({ success: true, message: 'Module and related data deleted' });
  } catch (error) {
    console.error('Delete training module error:', error);
    res.status(500).json({ error: 'Failed to delete training module' });
  }
});

// Delete quiz question (admin)
router.delete('/questions/:id', async (req: Request, res: Response) => {
  try {
    const questionId = parseInt(req.params.id);
    
    // Delete related answers first
    await db
      .delete(trainingQuizAnswers)
      .where(eq(trainingQuizAnswers.questionId, questionId));
    
    await db
      .delete(trainingQuizQuestions)
      .where(eq(trainingQuizQuestions.id, questionId));
    
    res.json({ success: true, message: 'Question and related answers deleted' });
  } catch (error) {
    console.error('Delete quiz question error:', error);
    res.status(500).json({ error: 'Failed to delete quiz question' });
  }
});

// Delete quiz answer (admin)
router.delete('/answers/:id', async (req: Request, res: Response) => {
  try {
    const answerId = parseInt(req.params.id);
    
    await db
      .delete(trainingQuizAnswers)
      .where(eq(trainingQuizAnswers.id, answerId));
    
    res.json({ success: true, message: 'Answer deleted' });
  } catch (error) {
    console.error('Delete quiz answer error:', error);
    res.status(500).json({ error: 'Failed to delete quiz answer' });
  }
});

export default router;
