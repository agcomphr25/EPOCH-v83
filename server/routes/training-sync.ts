import type { Express } from "express";
import { db } from "../db";
import { trainingModules, trainingQuizQuestions, trainingQuizAnswers, users } from "../schema";
import { eq } from "drizzle-orm";
import { authenticateToken, requireRole } from "../middleware/auth";
import multer from "multer";
import Papa from "papaparse";
import { questionsData, answersData } from "../data/training-sync-data";

const upload = multer({ storage: multer.memoryStorage() });

export function registerTrainingSyncRoutes(app: Express) {
  
  // Admin-only endpoint to sync training data to production (allows ADMIN or specific employees)
  app.post("/api/admin/sync-training-data", authenticateToken, async (req, res) => {
    // Allow ADMIN role or specific users (glennj, tasham)
    if (req.user?.role !== 'ADMIN' && 
        req.user?.username !== 'glennj' && 
        req.user?.username !== 'tasham') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    try {
      console.log('🔄 Starting training data sync...');
      
      // Training Modules Data
      const modulesData = [
        {
          id: 2,
          title: 'Preservation & Foreign Object Debris (FOD) Training',
          description: 'Comprehensive training on preservation techniques and FOD prevention to ensure product quality and prevent contamination.',
          pdfUrl: '/attached_assets/preservation-training.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 3,
          title: 'Chemical Handling, Storage, & Disposal',
          description: 'Comprehensive training on safe chemical handling procedures, proper storage requirements, and disposal protocols to ensure employee safety and environmental compliance.',
          pdfUrl: '/attached_assets/Leader Training Topic Chemical Handling_1759351634113.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 4,
          title: 'Fire Safety Training',
          description: 'Essential fire safety training for composite manufacturing environments. Learn to recognize fire hazards, implement prevention measures, respond to emergencies, and follow proper evacuation procedures.',
          pdfUrl: '/attached_assets/Pasted--Fire-Safety-Training-AG-Composites-Training-Objective-To-ensure-all-AG-Composites-employees-un-1759351941754_1759351941754.txt',
          passingScore: 80,
          isActive: true
        },
        {
          id: 5,
          title: 'ITAR Compliance Training',
          description: 'Annual International Traffic in Arms Regulations (ITAR) training covering export control regulations, employee responsibilities, technical data safeguarding, and compliance requirements for defense-related products.',
          pdfUrl: '/attached_assets/Annual ITAR Training.docx - Google Docs_1759352442796.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 6,
          title: 'AS9100 Employee Orientation Training',
          description: 'Quality management system orientation for aviation, space, and defense manufacturing. Learn about AG Composites quality policy, objectives, document management, and your role in maintaining quality standards.',
          pdfUrl: '/attached_assets/AS9100 Employee Training_1759352917898.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 7,
          title: 'Counterfeit Materials Prevention Training',
          description: 'Learn to identify, prevent, and respond to counterfeit materials in the supply chain. Covers avoidance strategies, detection red flags, mitigation procedures, and AG Composites supplier requirements to protect product integrity and safety.',
          pdfUrl: '/attached_assets/Counterfeit Prevention Training_1759353475520.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 8,
          title: 'Ethics in Aerospace Quality Systems',
          description: 'Essential ethical behavior training for aerospace manufacturing. Learn about falsification consequences, handling non-conforming materials, counterfeit prevention, employee/supplier responsibilities, and whistleblower protections.',
          pdfUrl: '/attached_assets/Ethics - Google Docs_1759353564278.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 9,
          title: 'Leader Training: Nonconforming Items',
          description: 'Essential training for leaders on managing nonconforming items. Learn the three categories (scrap, returns, counterfeit), proper handling procedures, red tagging requirements, and disposition authorization protocols.',
          pdfUrl: '/attached_assets/Leader Training Topic_ Nonconforming Items_1759353723875.pdf',
          passingScore: 80,
          isActive: true
        },
        {
          id: 10,
          title: 'Leader Training: Shut Down Procedures',
          description: 'Essential daily shut down procedures for facility leaders. Covers proper closing procedures for CNC, Gunsmith, Plugging & Layup, Paint departments, and general facility tasks including security, lighting, equipment shutdown, and lock-up protocols.',
          pdfUrl: '/attached_assets/Leader Training Shut Down Procedures_1759353935946.pdf',
          passingScore: 80,
          isActive: true
        }
      ];

      // Insert modules
      let modulesInserted = 0;
      for (const module of modulesData) {
        try {
          await db.insert(trainingModules).values(module).onConflictDoNothing();
          modulesInserted++;
        } catch (error) {
          console.error(`Error inserting module ${module.id}:`, error);
        }
      }

      console.log(`✅ Inserted ${modulesInserted} training modules`);

      // Insert questions
      let questionsInserted = 0;
      for (const question of questionsData) {
        try {
          await db.insert(trainingQuizQuestions).values(question).onConflictDoNothing();
          questionsInserted++;
        } catch (error) {
          console.error(`Error inserting question ${question.id}:`, error);
        }
      }

      console.log(`✅ Inserted ${questionsInserted} quiz questions`);

      // Insert answers
      let answersInserted = 0;
      for (const answer of answersData) {
        try {
          await db.insert(trainingQuizAnswers).values(answer).onConflictDoNothing();
          answersInserted++;
        } catch (error) {
          console.error(`Error inserting answer ${answer.id}:`, error);
        }
      }

      console.log(`✅ Inserted ${answersInserted} quiz answers`);

      res.json({
        success: true,
        message: 'Training data sync completed',
        modulesInserted,
        questionsInserted,
        answersInserted
      });

    } catch (error: any) {
      console.error('❌ Error syncing training data:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Check sync status (allows ADMIN or specific users)
  app.get("/api/admin/training-sync-status", authenticateToken, async (req, res) => {
    // Allow ADMIN role or specific users (glennj, tasham)
    if (req.user?.role !== 'ADMIN' && 
        req.user?.username !== 'glennj' && 
        req.user?.username !== 'tasham') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    try {
      const modules = await db.select().from(trainingModules);
      const questions = await db.select().from(trainingQuizQuestions);
      
      res.json({
        moduleCount: modules.length,
        questionCount: questions.length,
        modules: modules.map(m => ({ id: m.id, title: m.title }))
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Quick fix endpoint to update tasham to ADMIN role (run once in production)
  app.post("/api/admin/fix-admin-role", authenticateToken, async (req, res) => {
    try {
      // Only allow glennj to run this (who should already be ADMIN)
      if (req.user?.username !== 'glennj' && req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only glennj can run this fix' });
      }

      await db.update(users).set({ role: 'ADMIN' }).where(eq(users.username, 'tasham'));
      
      res.json({
        success: true,
        message: 'tasham role updated to ADMIN'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // CSV Export endpoint - Direct file downloads to bypass Vite
  app.get("/api/admin/export-training-modules-csv", authenticateToken, async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.username !== 'glennj' && req.user?.username !== 'tasham') {
      return res.status(403).send('Forbidden');
    }

    try {
      const modules = await db.select().from(trainingModules);
      let csv = 'id,title,description,pdfUrl,passingScore,isActive\n';
      for (const module of modules) {
        const title = (module.title || '').replace(/"/g, '""');
        const description = (module.description || '').replace(/"/g, '""');
        const pdfUrl = (module.pdfUrl || '').replace(/"/g, '""');
        csv += `${module.id},"${title}","${description}","${pdfUrl}",${module.passingScore || 80},${module.isActive !== false}\n`;
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=training-modules.csv');
      res.send(csv);
    } catch (error: any) {
      console.error('CSV export error:', error);
      res.status(500).send('Export failed');
    }
  });

  app.get("/api/admin/export-training-questions-csv", authenticateToken, async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.username !== 'glennj' && req.user?.username !== 'tasham') {
      return res.status(403).send('Forbidden');
    }

    try {
      const questions = await db.select().from(trainingQuizQuestions);
      let csv = 'id,moduleId,question,questionType,correctAnswer,explanation,sortOrder,isActive\n';
      for (const question of questions) {
        const questionText = (question.question || '').replace(/"/g, '""');
        const questionType = (question.questionType || 'multiple_choice').replace(/"/g, '""');
        const correctAnswer = (question.correctAnswer || '').replace(/"/g, '""');
        const explanation = (question.explanation || '').replace(/"/g, '""');
        csv += `${question.id},${question.moduleId},"${questionText}","${questionType}","${correctAnswer}","${explanation}",${question.sortOrder || 0},${question.isActive !== false}\n`;
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=training-questions.csv');
      res.send(csv);
    } catch (error: any) {
      console.error('CSV export error:', error);
      res.status(500).send('Export failed');
    }
  });

  app.get("/api/admin/export-training-answers-csv", authenticateToken, async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.username !== 'glennj' && req.user?.username !== 'tasham') {
      return res.status(403).send('Forbidden');
    }

    try {
      const answers = await db.select().from(trainingQuizAnswers);
      let csv = 'id,questionId,answerText,isCorrect,sortOrder\n';
      for (const answer of answers) {
        const answerText = (answer.answerText || '').replace(/"/g, '""');
        csv += `${answer.id},${answer.questionId},"${answerText}",${answer.isCorrect !== false},${answer.sortOrder || 0}\n`;
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=training-answers.csv');
      res.send(csv);
    } catch (error: any) {
      console.error('CSV export error:', error);
      res.status(500).send('Export failed');
    }
  });

  // CSV Import endpoint
  app.post("/api/admin/import-training-csv", authenticateToken, upload.fields([
    { name: 'modules', maxCount: 1 },
    { name: 'questions', maxCount: 1 },
    { name: 'answers', maxCount: 1 }
  ]), async (req, res) => {
    // Allow ADMIN role or specific users (glennj, tasham)
    if (req.user?.role !== 'ADMIN' && 
        req.user?.username !== 'glennj' && 
        req.user?.username !== 'tasham') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files.modules || !files.questions || !files.answers) {
        return res.status(400).json({ error: 'Missing CSV files' });
      }

      let modulesInserted = 0;
      let questionsInserted = 0;
      let answersInserted = 0;

      // Parse and import modules
      const modulesCSV = files.modules[0].buffer.toString('utf-8');
      const modulesParsed = Papa.parse(modulesCSV, { header: true, skipEmptyLines: true });
      
      for (const row of modulesParsed.data as any[]) {
        await db.insert(trainingModules).values({
          id: parseInt(row.id),
          title: row.title,
          description: row.description,
          pdfUrl: row.pdfUrl || null,
          passingScore: parseInt(row.passingScore) || 80,
          isActive: row.isActive === 'true',
        }).onConflictDoUpdate({
          target: trainingModules.id,
          set: {
            title: row.title,
            description: row.description,
            pdfUrl: row.pdfUrl || null,
            passingScore: parseInt(row.passingScore) || 80,
            isActive: row.isActive === 'true',
          }
        });
        modulesInserted++;
      }

      // Parse and import questions
      const questionsCSV = files.questions[0].buffer.toString('utf-8');
      const questionsParsed = Papa.parse(questionsCSV, { header: true, skipEmptyLines: true });
      
      for (const row of questionsParsed.data as any[]) {
        await db.insert(trainingQuizQuestions).values({
          id: parseInt(row.id),
          moduleId: parseInt(row.moduleId),
          question: row.question,
          questionType: row.questionType || 'multiple_choice',
          correctAnswer: row.correctAnswer,
          explanation: row.explanation || null,
          sortOrder: parseInt(row.sortOrder) || 0,
          isActive: row.isActive === 'true',
        }).onConflictDoUpdate({
          target: trainingQuizQuestions.id,
          set: {
            moduleId: parseInt(row.moduleId),
            question: row.question,
            questionType: row.questionType || 'multiple_choice',
            correctAnswer: row.correctAnswer,
            explanation: row.explanation || null,
            sortOrder: parseInt(row.sortOrder) || 0,
            isActive: row.isActive === 'true',
          }
        });
        questionsInserted++;
      }

      // Parse and import answers
      const answersCSV = files.answers[0].buffer.toString('utf-8');
      const answersParsed = Papa.parse(answersCSV, { header: true, skipEmptyLines: true });
      
      for (const row of answersParsed.data as any[]) {
        await db.insert(trainingQuizAnswers).values({
          id: parseInt(row.id),
          questionId: parseInt(row.questionId),
          answerText: row.answerText,
          isCorrect: row.isCorrect === 'true',
          sortOrder: parseInt(row.sortOrder) || 0,
        }).onConflictDoUpdate({
          target: trainingQuizAnswers.id,
          set: {
            questionId: parseInt(row.questionId),
            answerText: row.answerText,
            isCorrect: row.isCorrect === 'true',
            sortOrder: parseInt(row.sortOrder) || 0,
          }
        });
        answersInserted++;
      }

      res.json({
        success: true,
        modulesInserted,
        questionsInserted,
        answersInserted
      });

    } catch (error: any) {
      console.error('CSV import error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}
