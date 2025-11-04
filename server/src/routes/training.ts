import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { db } from '../../db';
import {
  trainingModules,
  trainingQuestions,
  trainingQuestionOptions,
  employeeTrainingRecords,
  employeeQuizAttempts,
  trainingMatrix,
  employees,
  users,
  p2PartCertifications,
  p2EmployeePartCertifications,
  p2PurchaseOrderItems,
  inventoryItems,
  insertTrainingModuleSchema,
  insertTrainingQuestionSchema,
  insertTrainingQuestionOptionSchema,
  insertEmployeeTrainingRecordSchema,
  insertEmployeeQuizAttemptSchema,
  insertTrainingMatrixSchema,
  insertP2PartCertificationSchema,
  insertP2EmployeePartCertificationSchema,
  type InsertTrainingModule,
  type InsertTrainingQuestion,
  type InsertTrainingQuestionOption,
  type InsertEmployeeTrainingRecord,
  type InsertEmployeeQuizAttempt,
  type InsertTrainingMatrix,
  type InsertP2PartCertification,
  type InsertP2EmployeePartCertification,
} from '../../schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  extractTrainingContent,
  extractTrainingMatrixData,
} from '../lib/azureDocumentIntelligence';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all training modules
router.get('/modules', async (req, res) => {
  try {
    const modules = await db
      .select()
      .from(trainingModules)
      .orderBy(desc(trainingModules.createdAt));
    res.json(modules);
  } catch (error: any) {
    console.error('Error fetching training modules:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training module with questions
router.get('/modules/:id', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);

    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));

    if (!module) {
      return res.status(404).json({ error: 'Training module not found' });
    }

    const questions = await db
      .select()
      .from(trainingQuestions)
      .where(eq(trainingQuestions.moduleId, moduleId))
      .orderBy(trainingQuestions.sortOrder);

    const questionsWithOptions = await Promise.all(
      questions.map(async (question) => {
        const options = await db
          .select()
          .from(trainingQuestionOptions)
          .where(eq(trainingQuestionOptions.questionId, question.id))
          .orderBy(trainingQuestionOptions.sortOrder);

        return { ...question, options };
      })
    );

    res.json({ ...module, questions: questionsWithOptions });
  } catch (error: any) {
    console.error('Error fetching training module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create training module
router.post('/modules', async (req, res) => {
  try {
    const validatedData = insertTrainingModuleSchema.parse(req.body);

    const [newModule] = await db
      .insert(trainingModules)
      .values(validatedData as InsertTrainingModule)
      .returning();

    res.status(201).json(newModule);
  } catch (error: any) {
    console.error('Error creating training module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update training module
router.patch('/modules/:id', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    const validatedData = insertTrainingModuleSchema.partial().parse(req.body);

    const [updatedModule] = await db
      .update(trainingModules)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(trainingModules.id, moduleId))
      .returning();

    if (!updatedModule) {
      return res.status(404).json({ error: 'Training module not found' });
    }

    res.json(updatedModule);
  } catch (error: any) {
    console.error('Error updating training module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete training module
router.delete('/modules/:id', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);

    // First get all question IDs for this module
    const questions = await db
      .select({ id: trainingQuestions.id })
      .from(trainingQuestions)
      .where(eq(trainingQuestions.moduleId, moduleId));

    const questionIds = questions.map((q) => q.id);

    // Delete options for these questions if there are any
    if (questionIds.length > 0) {
      await db
        .delete(trainingQuestionOptions)
        .where(eq(trainingQuestionOptions.questionId, questionIds[0]));
      for (let i = 1; i < questionIds.length; i++) {
        await db
          .delete(trainingQuestionOptions)
          .where(eq(trainingQuestionOptions.questionId, questionIds[i]));
      }
    }

    // Delete questions
    await db
      .delete(trainingQuestions)
      .where(eq(trainingQuestions.moduleId, moduleId));

    // Delete module
    await db.delete(trainingModules).where(eq(trainingModules.id, moduleId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting training module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import training content from PDF
router.post('/modules/import-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const createdBy = req.body.createdBy || 'system';

    const trainingContent = await extractTrainingContent(req.file.buffer);

    const [newModule] = await db
      .insert(trainingModules)
      .values({
        title: trainingContent.title,
        description: trainingContent.description,
        content: trainingContent.content,
        contentHtml: trainingContent.contentHtml,
        category: trainingContent.category,
        estimatedMinutes: trainingContent.estimatedMinutes,
        pdfSource: req.file.originalname,
        createdBy,
        isActive: true,
      })
      .returning();

    if (trainingContent.questions.length > 0) {
      for (let i = 0; i < trainingContent.questions.length; i++) {
        const q = trainingContent.questions[i];

        const [newQuestion] = await db
          .insert(trainingQuestions)
          .values({
            moduleId: newModule.id,
            questionText: q.questionText,
            questionType: q.questionType,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            sortOrder: i,
            isActive: true,
          })
          .returning();

        if (q.options && q.options.length > 0) {
          await db.insert(trainingQuestionOptions).values(
            q.options.map((opt, idx) => ({
              questionId: newQuestion.id,
              optionText: opt.optionText,
              isCorrect: opt.isCorrect,
              sortOrder: idx,
            }))
          );
        }
      }
    }

    res.status(201).json({
      module: newModule,
      questionsImported: trainingContent.questions.length,
    });
  } catch (error: any) {
    console.error('Error importing training PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add question to module
router.post('/questions', async (req, res) => {
  try {
    const validatedData = insertTrainingQuestionSchema.parse(req.body);

    const [newQuestion] = await db
      .insert(trainingQuestions)
      .values(validatedData as InsertTrainingQuestion)
      .returning();

    res.status(201).json(newQuestion);
  } catch (error: any) {
    console.error('Error creating question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update question
router.patch('/questions/:id', async (req, res) => {
  try {
    const questionId = parseInt(req.params.id);
    const validatedData = insertTrainingQuestionSchema
      .partial()
      .parse(req.body);

    const [updatedQuestion] = await db
      .update(trainingQuestions)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(trainingQuestions.id, questionId))
      .returning();

    if (!updatedQuestion) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json(updatedQuestion);
  } catch (error: any) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete question
router.delete('/questions/:id', async (req, res) => {
  try {
    const questionId = parseInt(req.params.id);

    await db
      .delete(trainingQuestionOptions)
      .where(eq(trainingQuestionOptions.questionId, questionId));
    await db
      .delete(trainingQuestions)
      .where(eq(trainingQuestions.id, questionId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add option to question
router.post('/question-options', async (req, res) => {
  try {
    const validatedData = insertTrainingQuestionOptionSchema.parse(req.body);

    const [newOption] = await db
      .insert(trainingQuestionOptions)
      .values(validatedData as InsertTrainingQuestionOption)
      .returning();

    res.status(201).json(newOption);
  } catch (error: any) {
    console.error('Error creating option:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee training records
router.get('/employee/:employeeId/records', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);

    const records = await db
      .select()
      .from(employeeTrainingRecords)
      .where(eq(employeeTrainingRecords.employeeId, employeeId))
      .orderBy(desc(employeeTrainingRecords.createdAt));

    res.json(records);
  } catch (error: any) {
    console.error('Error fetching employee training records:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create employee training record
router.post('/employee/records', async (req, res) => {
  try {
    const validatedData = insertEmployeeTrainingRecordSchema.parse(req.body);

    const [newRecord] = await db
      .insert(employeeTrainingRecords)
      .values(validatedData as InsertEmployeeTrainingRecord)
      .returning();

    res.status(201).json(newRecord);
  } catch (error: any) {
    console.error('Error creating training record:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update employee training record
router.patch('/employee/records/:id', async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const validatedData = insertEmployeeTrainingRecordSchema
      .partial()
      .parse(req.body);

    const [updatedRecord] = await db
      .update(employeeTrainingRecords)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(employeeTrainingRecords.id, recordId))
      .returning();

    if (!updatedRecord) {
      return res.status(404).json({ error: 'Training record not found' });
    }

    res.json(updatedRecord);
  } catch (error: any) {
    console.error('Error updating training record:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit quiz attempt
router.post('/quiz/submit', async (req, res) => {
  try {
    const validatedData = insertEmployeeQuizAttemptSchema.parse(req.body);

    const [newAttempt] = await db
      .insert(employeeQuizAttempts)
      .values(validatedData as InsertEmployeeQuizAttempt)
      .returning();

    res.status(201).json(newAttempt);
  } catch (error: any) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get quiz attempts for a training record
router.get('/quiz/attempts/:trainingRecordId', async (req, res) => {
  try {
    const trainingRecordId = parseInt(req.params.trainingRecordId);

    const attempts = await db
      .select()
      .from(employeeQuizAttempts)
      .where(eq(employeeQuizAttempts.trainingRecordId, trainingRecordId))
      .orderBy(desc(employeeQuizAttempts.createdAt));

    res.json(attempts);
  } catch (error: any) {
    console.error('Error fetching quiz attempts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete quiz and calculate score
router.post('/modules/:moduleId/complete', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    const { answers } = req.body;

    // Get session token from cookies or authorization header
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }

    // Validate session
    const pool = await import('../../db').then(m => m.pool);
    const sessionResult = await pool.query(
      'SELECT user_id, username FROM user_sessions WHERE session_token = $1 AND expires_at > NOW()',
      [sessionToken]
    );

    if (!sessionResult || sessionResult.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const session = sessionResult[0];
    const username = session.username;

    console.log('Quiz completion request:', {
      moduleId,
      username,
      answersCount: Object.keys(answers).length,
    });

    // Look up user by username from session
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Get employee name and details from employees table or user table
    let employeeName = user.username; // Default to username
    let employeeJobTitle: string | null = null;
    let employeeDepartment: string | null = null;
    let numericEmployeeId: number | null = null;

    if (user.employeeId) {
      // User has a linked employee record - use that
      const [employee] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, user.employeeId))
        .limit(1);
      
      if (employee) {
        employeeName = employee.name || employeeName;
        employeeJobTitle = employee.jobTitle;
        employeeDepartment = employee.department;
        numericEmployeeId = employee.id;
      }
    } else if (user.firstName || user.lastName) {
      // No employee record, but user has name fields
      const parts = [];
      if (user.firstName) parts.push(user.firstName);
      if (user.lastName) parts.push(user.lastName);
      if (parts.length > 0) {
        employeeName = parts.join(' ');
      }
    }

    console.log('User authenticated:', {
      username: user.username,
      employeeId: numericEmployeeId,
      employeeName,
      jobTitle: employeeJobTitle,
      department: employeeDepartment,
    });

    // Fetch module with questions and options
    const module = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId))
      .limit(1);

    console.log('Module found:', module.length > 0 ? module[0].title : 'none');

    if (!module || module.length === 0) {
      return res.status(404).json({ error: 'Training module not found' });
    }

    const questions = await db
      .select()
      .from(trainingQuestions)
      .where(eq(trainingQuestions.moduleId, moduleId))
      .orderBy(trainingQuestions.sortOrder);

    console.log('Questions fetched:', questions.length);

    const questionsWithOptions = await Promise.all(
      questions.map(async (question) => {
        const options = await db
          .select()
          .from(trainingQuestionOptions)
          .where(eq(trainingQuestionOptions.questionId, question.id))
          .orderBy(trainingQuestionOptions.sortOrder);

        return { ...question, options };
      })
    );

    // Calculate score
    let correctCount = 0;
    const totalQuestions = questionsWithOptions.length;

    questionsWithOptions.forEach((question) => {
      const userAnswer = answers[question.id];
      const correctOption = question.options.find((opt) => opt.isCorrect);

      if (correctOption && userAnswer === correctOption.optionText) {
        correctCount++;
      }
    });

    const scorePercentage =
      totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : 0;
    const passingScore = module[0].passingScore || 80;
    const passed = scorePercentage >= passingScore;

    console.log('Score calculation:', {
      correctCount,
      totalQuestions,
      scorePercentage,
      passingScore,
      passed,
    });

    // Update training matrix with completion data (always update, regardless of pass/fail)
    let matrixUpdated = false;
    let matrixUpdateError = null;
    
    try {
      const trainingName = module[0].title;
      const matrixStatus = passed ? 'COMPLETED' : 'IN_PROGRESS';

      console.log('📊 Updating Training Matrix:', {
        username: user.username,
        employeeId: numericEmployeeId,
        employeeName,
        jobTitle: employeeJobTitle,
        department: employeeDepartment,
        trainingName,
        score: scorePercentage,
        passed,
        status: matrixStatus
      });

      // Find existing training matrix entry
      const existingEntry = await db
        .select()
        .from(trainingMatrix)
        .where(
          and(
            numericEmployeeId !== null
              ? eq(trainingMatrix.employeeId, numericEmployeeId)
              : eq(trainingMatrix.employeeName, employeeName),
            eq(trainingMatrix.trainingName, trainingName)
          )
        )
        .limit(1);

      if (existingEntry && existingEntry.length > 0) {
        // Update existing entry with full employee details and score
        const updateData: any = {
          employeeId: numericEmployeeId,
          employeeName: employeeName,
          jobTitle: employeeJobTitle,
          department: employeeDepartment,
          lastScore: scorePercentage,
          updatedAt: new Date(),
        };
        
        // Only update lastCompleted and status if passed
        if (passed) {
          updateData.lastCompleted = new Date();
          updateData.status = 'COMPLETED';
        } else {
          updateData.status = 'IN_PROGRESS';
        }

        await db
          .update(trainingMatrix)
          .set(updateData)
          .where(eq(trainingMatrix.id, existingEntry[0].id));
        
        console.log(`✅ Training Matrix UPDATED - Entry ID: ${existingEntry[0].id}, Status: ${matrixStatus}`);
        matrixUpdated = true;
      } else {
        // Create new entry with full employee details
        const newEntryData: any = {
          employeeId: numericEmployeeId,
          employeeName: employeeName,
          jobTitle: employeeJobTitle,
          department: employeeDepartment,
          trainingName: trainingName,
          lastScore: scorePercentage,
          status: matrixStatus,
        };
        
        // Only set lastCompleted if passed
        if (passed) {
          newEntryData.lastCompleted = new Date();
        }

        const [newEntry] = await db.insert(trainingMatrix).values(newEntryData).returning();
        
        console.log(`✅ Training Matrix CREATED - Entry ID: ${newEntry.id}, Status: ${matrixStatus}`);
        matrixUpdated = true;
      }
    } catch (matrixError: any) {
      console.error('❌ ERROR updating Training Matrix:', matrixError);
      matrixUpdateError = matrixError.message;
      // Don't fail the entire request if matrix update fails
    }

    const results = {
      score: scorePercentage,
      correctCount,
      totalQuestions,
      passed,
      passingScore,
      username: user.username,
      employeeName,
      moduleId,
      moduleTitle: module[0].title,
      trainingMatrixUpdated: matrixUpdated,
      trainingMatrixError: matrixUpdateError,
    };

    res.json(results);
  } catch (error: any) {
    console.error('Error completing quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Training matrix endpoints
router.get('/matrix', async (req, res) => {
  try {
    const matrix = await db
      .select({
        id: trainingMatrix.id,
        employeeId: trainingMatrix.employeeId,
        employeeName: trainingMatrix.employeeName,
        jobTitle: trainingMatrix.jobTitle,
        department: trainingMatrix.department,
        trainingName: trainingMatrix.trainingName,
        requiredBy: trainingMatrix.requiredBy,
        frequency: trainingMatrix.frequency,
        lastCompleted: trainingMatrix.lastCompleted,
        lastScore: trainingMatrix.lastScore,
        nextDue: trainingMatrix.nextDue,
        status: trainingMatrix.status,
        documentationUrl: trainingMatrix.documentationUrl,
        notes: trainingMatrix.notes,
        isLegacy: trainingMatrix.isLegacy,
      })
      .from(trainingMatrix)
      .orderBy(trainingMatrix.employeeName, trainingMatrix.trainingName);

    res.json(matrix);
  } catch (error: any) {
    console.error('Error fetching training matrix:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/matrix', async (req, res) => {
  try {
    const validatedData = insertTrainingMatrixSchema.parse(req.body);

    const [newEntry] = await db
      .insert(trainingMatrix)
      .values(validatedData as InsertTrainingMatrix)
      .returning();

    res.status(201).json(newEntry);
  } catch (error: any) {
    console.error('Error creating training matrix entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update training matrix entry
router.patch('/matrix/:id', async (req, res) => {
  try {
    const matrixId = parseInt(req.params.id);
    const validatedData = insertTrainingMatrixSchema.partial().parse(req.body);

    const [updatedEntry] = await db
      .update(trainingMatrix)
      .set(validatedData)
      .where(eq(trainingMatrix.id, matrixId))
      .returning();

    if (!updatedEntry) {
      return res.status(404).json({ error: 'Training matrix entry not found' });
    }

    res.json(updatedEntry);
  } catch (error: any) {
    console.error('Error updating training matrix entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete single training matrix entry
router.delete('/matrix/:id', async (req, res) => {
  try {
    const matrixId = parseInt(req.params.id);

    const [deletedEntry] = await db
      .delete(trainingMatrix)
      .where(eq(trainingMatrix.id, matrixId))
      .returning();

    if (!deletedEntry) {
      return res.status(404).json({ error: 'Training matrix entry not found' });
    }

    res.json({ success: true, deletedEntry });
  } catch (error: any) {
    console.error('Error deleting training matrix entry:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import legacy training matrix from CSV
router.post('/matrix/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const lines = csvContent.split('\n').filter((line) => line.trim());

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const imported = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: any = {};

      headers.forEach((header, idx) => {
        row[header] = values[idx] || null;
      });

      const [entry] = await db
        .insert(trainingMatrix)
        .values({
          employeeName: row.employee_name || row.employee || null,
          jobTitle: row.job_title || row.title || null,
          department: row.department || null,
          trainingName: row.training_name || row.training || 'Unknown Training',
          requiredBy: row.required_by || row.requirement || null,
          frequency: row.frequency || null,
          lastCompleted: row.last_completed
            ? new Date(row.last_completed)
            : null,
          nextDue: row.next_due ? new Date(row.next_due) : null,
          status: (row.status?.toUpperCase() || 'PENDING') as any,
          documentationUrl: row.documentation_url || row.document_url || null,
          notes: row.notes || null,
          isLegacy: true,
        })
        .returning();

      imported.push(entry);
    }

    res.status(201).json({
      success: true,
      imported: imported.length,
      entries: imported,
    });
  } catch (error: any) {
    console.error('Error importing training matrix CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import training matrix from PDF
router.post('/matrix/import-pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const matrixData = await extractTrainingMatrixData(req.file.buffer);
    const imported = [];

    for (const entry of matrixData.entries) {
      const [newEntry] = await db
        .insert(trainingMatrix)
        .values({
          employeeName: entry.employeeName,
          jobTitle: entry.jobTitle,
          department: entry.department,
          trainingName: entry.trainingName,
          requiredBy: entry.requiredBy,
          frequency: entry.frequency,
          lastCompleted: entry.lastCompleted,
          nextDue: entry.nextDue,
          status: entry.status,
          documentationUrl: req.file.originalname,
          notes: entry.notes,
          isLegacy: false,
        })
        .returning();

      imported.push(newEntry);
    }

    res.status(201).json({
      success: true,
      imported: imported.length,
      entries: imported,
    });
  } catch (error: any) {
    console.error('Error importing training matrix PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Google Sheets Integration Routes

import {
  listGoogleSheets,
  getSpreadsheetData,
  parseTrainingMatrixFromSheet,
} from '../lib/googleSheets';

// List available Google Sheets
router.get('/google-sheets', async (req, res) => {
  try {
    console.log('📋 Fetching Google Sheets list...');
    const sheets = await listGoogleSheets();
    console.log(`✅ Found ${sheets.length} Google Sheets`);
    res.json(sheets);
  } catch (error: any) {
    console.error('❌ Error listing Google Sheets:', error);
    console.error('Error details:', error.stack);
    res
      .status(500)
      .json({ error: error.message || 'Failed to list Google Sheets' });
  }
});

// Preview Google Sheet data
router.get('/google-sheets/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;
    const { range } = req.query;

    const data = await getSpreadsheetData(id, range as string);
    res.json({ data });
  } catch (error: any) {
    console.error('Error previewing Google Sheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete all training matrix entries
router.delete('/matrix', async (req, res) => {
  try {
    const deleted = await db.delete(trainingMatrix);
    res.json({ success: true, message: 'All training matrix entries deleted' });
  } catch (error: any) {
    console.error('Error deleting training matrix:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import training matrix from Google Sheets
router.post('/import-from-sheets', async (req, res) => {
  try {
    const { spreadsheetId, range } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID is required' });
    }

    const matrixRows = await parseTrainingMatrixFromSheet(spreadsheetId, range);
    const imported = [];

    for (const row of matrixRows) {
      const { employeeName, ...trainings } = row;

      // Create a training entry for each training that has a date
      for (const [trainingName, completionDate] of Object.entries(trainings)) {
        if (completionDate && completionDate.trim() !== '') {
          // Parse the date - handle various formats
          let lastCompleted: Date | null = null;
          try {
            // Try to parse the date string
            const dateStr = completionDate.trim();
            // Handle formats like "5/7/2025(V)" or "1/19/2023"
            const cleanDate = dateStr.replace(/\([^)]*\)/g, '').trim();
            lastCompleted = new Date(cleanDate);

            // Check if date is valid
            if (isNaN(lastCompleted.getTime())) {
              lastCompleted = null;
            }
          } catch (e) {
            console.warn(
              `Could not parse date for ${employeeName} - ${trainingName}: ${completionDate}`
            );
          }

          const [newEntry] = await db
            .insert(trainingMatrix)
            .values({
              employeeName: employeeName,
              trainingName: trainingName,
              lastCompleted: lastCompleted,
              status: lastCompleted ? 'COMPLETED' : 'PENDING',
              notes: completionDate.includes('(')
                ? completionDate.match(/\(([^)]+)\)/)?.[1] || null
                : null,
              isLegacy: true,
            })
            .returning();

          imported.push(newEntry);
        }
      }
    }

    res.status(201).json({
      success: true,
      imported: imported.length,
      entries: imported,
    });
  } catch (error: any) {
    console.error('Error importing from Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sync quiz completions to training matrix (admin tool)
router.post('/sync-quiz-data', async (req, res) => {
  try {
    console.log('🔄 Starting sync of quiz completion data to training matrix...\n');

    // Get all quiz attempts with employee and module info
    const quizAttempts = await db
      .select({
        attemptId: employeeQuizAttempts.id,
        employeeId: employeeQuizAttempts.employeeId,
        moduleId: employeeQuizAttempts.moduleId,
        score: employeeQuizAttempts.score,
        passed: employeeQuizAttempts.passed,
        completedAt: employeeQuizAttempts.completedAt,
      })
      .from(employeeQuizAttempts)
      .orderBy(desc(employeeQuizAttempts.completedAt));

    console.log(`📊 Found ${quizAttempts.length} total quiz attempts`);

    if (quizAttempts.length === 0) {
      return res.json({
        success: true,
        message: 'No quiz attempts found to sync',
        synced: 0,
        skipped: 0,
        errors: 0,
        total: 0,
      });
    }

    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const details: any[] = [];

    for (const attempt of quizAttempts) {
      try {
        // Get employee details
        const [employee] = await db
          .select()
          .from(employees)
          .where(eq(employees.id, attempt.employeeId))
          .limit(1);

        if (!employee) {
          details.push({
            status: 'skipped',
            reason: `Employee ${attempt.employeeId} not found`,
          });
          skippedCount++;
          continue;
        }

        // Get module details
        const [module] = await db
          .select()
          .from(trainingModules)
          .where(eq(trainingModules.id, attempt.moduleId))
          .limit(1);

        if (!module) {
          details.push({
            status: 'skipped',
            reason: `Module ${attempt.moduleId} not found`,
          });
          skippedCount++;
          continue;
        }

        // Check if training matrix entry already exists
        const existingEntry = await db
          .select()
          .from(trainingMatrix)
          .where(
            and(
              eq(trainingMatrix.employeeId, employee.id),
              eq(trainingMatrix.trainingName, module.title)
            )
          )
          .limit(1);

        if (existingEntry && existingEntry.length > 0) {
          // Update if the new score is better or more recent
          const existing = existingEntry[0];
          const shouldUpdate =
            !existing.lastCompleted ||
            (attempt.completedAt &&
              new Date(attempt.completedAt) >
                new Date(existing.lastCompleted)) ||
            (attempt.score &&
              (!existing.lastScore || attempt.score > existing.lastScore));

          if (shouldUpdate && attempt.passed) {
            await db
              .update(trainingMatrix)
              .set({
                lastCompleted: attempt.completedAt,
                lastScore: attempt.score,
                status: 'COMPLETED',
                updatedAt: new Date(),
              })
              .where(eq(trainingMatrix.id, existing.id));

            details.push({
              status: 'updated',
              employee: employee.name,
              training: module.title,
              score: attempt.score,
            });
            syncedCount++;
          } else {
            details.push({
              status: 'skipped',
              employee: employee.name,
              training: module.title,
              reason: 'Already has better/recent data',
            });
            skippedCount++;
          }
        } else {
          // Create new training matrix entry
          await db.insert(trainingMatrix).values({
            employeeId: employee.id,
            employeeName: employee.name,
            jobTitle: employee.jobTitle,
            department: employee.department,
            trainingName: module.title,
            lastCompleted: attempt.passed ? attempt.completedAt : null,
            lastScore: attempt.score,
            status: attempt.passed ? 'COMPLETED' : 'IN_PROGRESS',
          });

          details.push({
            status: 'created',
            employee: employee.name,
            training: module.title,
            score: attempt.score,
            passed: attempt.passed,
          });
          syncedCount++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing attempt ${attempt.attemptId}:`, error);
        details.push({
          status: 'error',
          attemptId: attempt.attemptId,
          error: error.message,
        });
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: 'Quiz data sync completed',
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: quizAttempts.length,
      details,
    });
  } catch (error: any) {
    console.error('Error syncing quiz data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// P2 PART CERTIFICATIONS ROUTES
// ============================================

// Get all P2 part certifications
router.get('/p2-certifications', async (req, res) => {
  try {
    const certifications = await db
      .select()
      .from(p2PartCertifications)
      .orderBy(desc(p2PartCertifications.createdAt));
    res.json(certifications);
  } catch (error: any) {
    console.error('Error fetching P2 certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get inventory items for part number dropdown
router.get('/p2-certifications/part-numbers', async (req, res) => {
  try {
    const items = await db
      .select({
        partNumber: inventoryItems.agPartNumber,
        partName: inventoryItems.name,
      })
      .from(inventoryItems)
      .where(sql`${inventoryItems.agPartNumber} IS NOT NULL AND ${inventoryItems.agPartNumber} != ''`)
      .orderBy(inventoryItems.agPartNumber);
    res.json(items);
  } catch (error: any) {
    console.error('Error fetching part numbers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create P2 part certification requirement
router.post('/p2-certifications', async (req, res) => {
  try {
    const validatedData = insertP2PartCertificationSchema.parse(req.body);

    const [newCertification] = await db
      .insert(p2PartCertifications)
      .values(validatedData as InsertP2PartCertification)
      .returning();

    res.status(201).json(newCertification);
  } catch (error: any) {
    console.error('Error creating P2 certification:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update P2 part certification requirement
router.patch('/p2-certifications/:id', async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    const validatedData = insertP2PartCertificationSchema.partial().parse(req.body);

    const [updatedCertification] = await db
      .update(p2PartCertifications)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(p2PartCertifications.id, certId))
      .returning();

    if (!updatedCertification) {
      return res.status(404).json({ error: 'P2 certification not found' });
    }

    res.json(updatedCertification);
  } catch (error: any) {
    console.error('Error updating P2 certification:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete P2 part certification requirement
router.delete('/p2-certifications/:id', async (req, res) => {
  try {
    const certId = parseInt(req.params.id);

    const [deleted] = await db
      .delete(p2PartCertifications)
      .where(eq(p2PartCertifications.id, certId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'P2 certification not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting P2 certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// P2 EMPLOYEE PART CERTIFICATIONS ROUTES
// ============================================

// Get all employee certifications (optionally filter by part)
router.get('/p2-employee-certifications', async (req, res) => {
  try {
    const { partNumber } = req.query;

    let query = db.select().from(p2EmployeePartCertifications);

    if (partNumber) {
      query = query.where(eq(p2EmployeePartCertifications.partNumber, partNumber as string));
    }

    const certifications = await query.orderBy(desc(p2EmployeePartCertifications.createdAt));
    res.json(certifications);
  } catch (error: any) {
    console.error('Error fetching employee certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee certifications by employee ID
router.get('/p2-employee-certifications/employee/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);

    const certifications = await db
      .select()
      .from(p2EmployeePartCertifications)
      .where(eq(p2EmployeePartCertifications.employeeId, employeeId))
      .orderBy(desc(p2EmployeePartCertifications.createdAt));

    res.json(certifications);
  } catch (error: any) {
    console.error('Error fetching employee certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create employee part certification
router.post('/p2-employee-certifications', async (req, res) => {
  try {
    const validatedData = insertP2EmployeePartCertificationSchema.parse(req.body);

    // If all three checkboxes are true, set certified date
    const certifiedDate =
      validatedData.drawingKnowledge &&
      validatedData.specSheetUnderstanding &&
      validatedData.procedureCompletion
        ? new Date()
        : null;

    const [newCertification] = await db
      .insert(p2EmployeePartCertifications)
      .values({
        ...validatedData,
        certifiedDate,
      } as InsertP2EmployeePartCertification)
      .returning();

    res.status(201).json(newCertification);
  } catch (error: any) {
    console.error('Error creating employee certification:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update employee part certification
router.patch('/p2-employee-certifications/:id', async (req, res) => {
  try {
    const certId = parseInt(req.params.id);
    const validatedData = insertP2EmployeePartCertificationSchema.partial().parse(req.body);

    // Get existing record to check checkbox status
    const [existing] = await db
      .select()
      .from(p2EmployeePartCertifications)
      .where(eq(p2EmployeePartCertifications.id, certId));

    if (!existing) {
      return res.status(404).json({ error: 'Employee certification not found' });
    }

    // Determine final checkbox states
    const drawingKnowledge = validatedData.drawingKnowledge ?? existing.drawingKnowledge;
    const specSheetUnderstanding = validatedData.specSheetUnderstanding ?? existing.specSheetUnderstanding;
    const procedureCompletion = validatedData.procedureCompletion ?? existing.procedureCompletion;

    // If all three checkboxes are true, set certified date
    const certifiedDate =
      drawingKnowledge && specSheetUnderstanding && procedureCompletion
        ? (validatedData.certifiedDate ?? existing.certifiedDate ?? new Date())
        : null;

    const [updatedCertification] = await db
      .update(p2EmployeePartCertifications)
      .set({
        ...validatedData,
        certifiedDate,
        updatedAt: new Date(),
      })
      .where(eq(p2EmployeePartCertifications.id, certId))
      .returning();

    res.json(updatedCertification);
  } catch (error: any) {
    console.error('Error updating employee certification:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete employee part certification
router.delete('/p2-employee-certifications/:id', async (req, res) => {
  try {
    const certId = parseInt(req.params.id);

    const [deleted] = await db
      .delete(p2EmployeePartCertifications)
      .where(eq(p2EmployeePartCertifications.id, certId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Employee certification not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting employee certification:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
