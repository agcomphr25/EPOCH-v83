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

// Get all training modules
router.get('/modules', async (req: Request, res: Response) => {
  try {
    const modules = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.isActive, true))
      .orderBy(desc(trainingModules.createdAt));
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

export default router;
