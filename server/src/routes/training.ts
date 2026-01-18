import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
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
  capabilities,
  employeeCapabilities,
  trainingPrograms,
  trainingProgramTasks,
  trainingAssignments,
  trainingBuilderSessions,
  trainingBuilderTaskProgress,
  trainingProgramQuizRefs,
  trainingBuilderQuizzes,
  trainingBuilderQuizQuestions,
  trainingDailyQuizSelections,
  trainingBuilderQuizAttempts,
  trainingCertifications,
  insertTrainingModuleSchema,
  insertTrainingQuestionSchema,
  insertTrainingQuestionOptionSchema,
  insertEmployeeTrainingRecordSchema,
  insertEmployeeQuizAttemptSchema,
  insertTrainingMatrixSchema,
  insertP2PartCertificationSchema,
  insertP2EmployeePartCertificationSchema,
  insertTrainingProgramSchema,
  insertTrainingProgramTaskSchema,
  insertTrainingAssignmentSchema,
  insertTrainingBuilderSessionSchema,
  insertTrainingBuilderTaskProgressSchema,
  insertTrainingProgramQuizRefSchema,
  insertTrainingBuilderQuizSchema,
  insertTrainingBuilderQuizQuestionSchema,
  insertTrainingDailyQuizSelectionSchema,
  insertTrainingBuilderQuizAttemptSchema,
  insertTrainingCertificationSchema,
  type InsertTrainingModule,
  type InsertTrainingQuestion,
  type InsertTrainingQuestionOption,
  type InsertEmployeeTrainingRecord,
  type InsertEmployeeQuizAttempt,
  type InsertTrainingMatrix,
  type InsertP2PartCertification,
  type InsertP2EmployeePartCertification,
  type InsertTrainingProgram,
  type InsertTrainingProgramTask,
  type InsertTrainingAssignment,
  type InsertTrainingBuilderSession,
  type InsertTrainingBuilderTaskProgress,
  type InsertTrainingProgramQuizRef,
} from '../../schema';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  extractTrainingContent,
  extractTrainingMatrixData,
} from '../lib/azureDocumentIntelligence';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper function to grant P2 certification capability to employee
async function grantP2CertificationCapability(
  employeeId: number,
  partNumber: string,
  department: string
) {
  // Create capability name: P2_CERT_PARTNUMBER_DEPARTMENT
  const capabilityName = `P2_CERT_${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${department.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const displayName = `P2 Certification: ${partNumber} - ${department}`;
  
  // Find or create capability
  let [capability] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.name, capabilityName));
  
  if (!capability) {
    [capability] = await db
      .insert(capabilities)
      .values({
        name: capabilityName,
        displayName: displayName,
        category: 'P2_CERTIFICATION',
        description: `Certified to work on ${partNumber} in ${department} department`,
        isActive: true,
      })
      .returning();
  }
  
  // Grant capability to employee if not already granted
  const [existing] = await db
    .select()
    .from(employeeCapabilities)
    .where(
      and(
        eq(employeeCapabilities.employeeId, employeeId),
        eq(employeeCapabilities.capabilityId, capability.id)
      )
    );
  
  if (!existing) {
    await db
      .insert(employeeCapabilities)
      .values({
        employeeId,
        capabilityId: capability.id,
        grantedBy: 'system',
        isHardcoded: false,
        useHardcodedValue: true,
      });
  }
  
  return capability;
}

// Helper function to revoke P2 certification capability from employee
async function revokeP2CertificationCapability(
  employeeId: number,
  partNumber: string,
  department: string
) {
  const capabilityName = `P2_CERT_${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${department.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  const [capability] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.name, capabilityName));
  
  if (capability) {
    await db
      .delete(employeeCapabilities)
      .where(
        and(
          eq(employeeCapabilities.employeeId, employeeId),
          eq(employeeCapabilities.capabilityId, capability.id)
        )
      );
  }
}

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

    // Read the file from disk since we're using diskStorage
    const pdfBuffer = fs.readFileSync(req.file.path);
    const trainingContent = await extractTrainingContent(pdfBuffer);

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

// Get all training questions (for content library)
router.get('/questions', async (req, res) => {
  try {
    const allQuestions = await db
      .select()
      .from(trainingQuestions)
      .orderBy(trainingQuestions.moduleId, trainingQuestions.sortOrder);
    res.json(allQuestions);
  } catch (error: any) {
    console.error('Error fetching questions:', error);
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

    // Read the file from disk since we're using diskStorage
    const fileBuffer = fs.readFileSync(req.file.path);
    const csvContent = fileBuffer.toString('utf-8');
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

    // Read the file from disk since we're using diskStorage
    const pdfBuffer = fs.readFileSync(req.file.path);
    const matrixData = await extractTrainingMatrixData(pdfBuffer);
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

    let certifications;
    if (partNumber) {
      certifications = await db
        .select()
        .from(p2EmployeePartCertifications)
        .where(eq(p2EmployeePartCertifications.partNumber, partNumber as string))
        .orderBy(desc(p2EmployeePartCertifications.createdAt));
    } else {
      certifications = await db
        .select()
        .from(p2EmployeePartCertifications)
        .orderBy(desc(p2EmployeePartCertifications.createdAt));
    }

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

    // Grant P2 certification capability ONLY if all three checkboxes are true
    if (certifiedDate) {
      await grantP2CertificationCapability(
        validatedData.employeeId,
        validatedData.partNumber,
        validatedData.department
      );
    }

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

    // Determine if part number or department changed
    const partNumberChanged = validatedData.partNumber && validatedData.partNumber !== existing.partNumber;
    const departmentChanged = validatedData.department && validatedData.department !== existing.department;

    // Check if all checkboxes are now true
    const wasFullyCertified = existing.drawingKnowledge && existing.specSheetUnderstanding && existing.procedureCompletion;
    const isNowFullyCertified = drawingKnowledge && specSheetUnderstanding && procedureCompletion;

    // If all three checkboxes are true, set certified date
    const certifiedDate =
      isNowFullyCertified
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

    // Handle capability changes based on state transitions
    if (partNumberChanged || departmentChanged) {
      // Revoke old capability (if it existed)
      if (wasFullyCertified) {
        await revokeP2CertificationCapability(
          existing.employeeId,
          existing.partNumber,
          existing.department
        );
      }
      // Grant new capability (if fully certified)
      if (isNowFullyCertified) {
        await grantP2CertificationCapability(
          existing.employeeId,
          validatedData.partNumber || existing.partNumber,
          validatedData.department || existing.department
        );
      }
    } else {
      // Just checkbox state changed
      if (!wasFullyCertified && isNowFullyCertified) {
        // Grant capability when certification becomes complete
        await grantP2CertificationCapability(
          existing.employeeId,
          existing.partNumber,
          existing.department
        );
      } else if (wasFullyCertified && !isNowFullyCertified) {
        // Revoke capability when certification becomes incomplete
        await revokeP2CertificationCapability(
          existing.employeeId,
          existing.partNumber,
          existing.department
        );
      }
    }

    res.json(updatedCertification);
  } catch (error: any) {
    console.error('Error updating employee certification:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Migrate existing P2 certifications to capabilities (one-time migration endpoint)
router.post('/p2-employee-certifications/migrate-capabilities', async (req, res) => {
  try {
    console.log('🔄 Migrating existing P2 certifications to capabilities...');
    
    // Get all fully certified employees
    const certifications = await db
      .select()
      .from(p2EmployeePartCertifications)
      .where(
        and(
          eq(p2EmployeePartCertifications.drawingKnowledge, true),
          eq(p2EmployeePartCertifications.specSheetUnderstanding, true),
          eq(p2EmployeePartCertifications.procedureCompletion, true)
        )
      );
    
    console.log(`Found ${certifications.length} fully certified employees`);
    
    let granted = 0;
    let skipped = 0;
    
    for (const cert of certifications) {
      try {
        await grantP2CertificationCapability(
          cert.employeeId,
          cert.partNumber,
          cert.department
        );
        granted++;
        console.log(`✅ Granted capability: ${cert.employeeName} - ${cert.partNumber} - ${cert.department}`);
      } catch (error) {
        // Might already exist, which is fine
        skipped++;
        console.log(`⏭️  Skipped: ${cert.employeeName} - ${cert.partNumber} - ${cert.department}`);
      }
    }
    
    console.log(`✅ Migration complete! Granted: ${granted}, Skipped: ${skipped}`);
    res.json({ success: true, granted, skipped, total: certifications.length });
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete employee part certification
router.delete('/p2-employee-certifications/:id', async (req, res) => {
  try {
    const certId = parseInt(req.params.id);

    // Get certification data before deleting (to revoke capability)
    const [existing] = await db
      .select()
      .from(p2EmployeePartCertifications)
      .where(eq(p2EmployeePartCertifications.id, certId));

    if (!existing) {
      return res.status(404).json({ error: 'Employee certification not found' });
    }

    // Revoke P2 certification capability from the employee
    await revokeP2CertificationCapability(
      existing.employeeId,
      existing.partNumber,
      existing.department
    );

    // Delete the certification
    await db
      .delete(p2EmployeePartCertifications)
      .where(eq(p2EmployeePartCertifications.id, certId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting employee certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINING PROGRAMS (Training Builder Module)
// ============================================================================

// Get all training programs
router.get('/programs', async (req, res) => {
  try {
    const programs = await db
      .select()
      .from(trainingPrograms)
      .orderBy(desc(trainingPrograms.createdAt));
    res.json(programs);
  } catch (error: any) {
    console.error('Error fetching training programs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new training program
router.post('/programs', async (req, res) => {
  try {
    const parsed = insertTrainingProgramSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [program] = await db.insert(trainingPrograms).values(parsed.data).returning();
    res.status(201).json(program);
  } catch (error: any) {
    console.error('Error creating training program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training program with tasks
router.get('/programs/:id', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.id, programId));

    if (!program) {
      return res.status(404).json({ error: 'Training program not found' });
    }

    let tasks: any[] = [];
    try {
      tasks = await db
        .select()
        .from(trainingProgramTasks)
        .where(eq(trainingProgramTasks.programId, programId))
        .orderBy(trainingProgramTasks.sortOrder);
    } catch (taskErr) {
      console.log('No tasks found for program:', programId);
    }

    res.json({ ...program, tasks });
  } catch (error: any) {
    console.error('Error fetching training program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a training program
router.patch('/programs/:id', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const [updated] = await db
      .update(trainingPrograms)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(trainingPrograms.id, programId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Training program not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating training program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a training program
router.delete('/programs/:id', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    await db.delete(trainingProgramTasks).where(eq(trainingProgramTasks.programId, programId));
    await db.delete(trainingPrograms).where(eq(trainingPrograms.id, programId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting training program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tasks for a training program
router.get('/programs/:id/tasks', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    let tasks: any[] = [];
    try {
      tasks = await db
        .select()
        .from(trainingProgramTasks)
        .where(eq(trainingProgramTasks.programId, programId))
        .orderBy(trainingProgramTasks.sortOrder);
    } catch (e) {
      // Neon returns null for empty result sets sometimes
      tasks = [];
    }
    res.json(tasks || []);
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add a task to a training program
router.post('/programs/:id/tasks', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const parsed = insertTrainingProgramTaskSchema.safeParse({ ...req.body, programId });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [task] = await db.insert(trainingProgramTasks).values(parsed.data).returning();
    res.status(201).json(task);
  } catch (error: any) {
    console.error('Error adding task to training program:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a task
router.patch('/programs/:programId/tasks/:taskId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const [updated] = await db
      .update(trainingProgramTasks)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(trainingProgramTasks.id, taskId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a task
router.delete('/programs/:programId/tasks/:taskId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    await db.delete(trainingProgramTasks).where(eq(trainingProgramTasks.id, taskId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINING ASSIGNMENTS
// ============================================================================

// Get all training assignments
router.get('/assignments', async (req, res) => {
  try {
    const assignments = await db
      .select()
      .from(trainingAssignments)
      .orderBy(desc(trainingAssignments.createdAt));
    res.json(assignments);
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a training assignment (and session)
router.post('/assignments', async (req, res) => {
  try {
    const parsed = insertTrainingAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [assignment] = await db.insert(trainingAssignments).values(parsed.data).returning();

    // Create a session for this assignment
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const [session] = await db
      .insert(trainingBuilderSessions)
      .values({
        sessionId,
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        programId: assignment.programId,
      })
      .returning();

    // Create task progress entries for each task in the program
    const tasks = await db
      .select()
      .from(trainingProgramTasks)
      .where(eq(trainingProgramTasks.programId, assignment.programId));

    if (tasks.length > 0) {
      await db.insert(trainingBuilderTaskProgress).values(
        tasks.map((task) => ({
          sessionId: session.id,
          taskId: task.id,
          status: 'pending',
        }))
      );
    }

    res.status(201).json({ assignment, session });
  } catch (error: any) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINING SESSIONS
// ============================================================================

// Get a training session by sessionId
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get the program with tasks
    const [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.id, session.programId));

    const tasks = await db
      .select()
      .from(trainingProgramTasks)
      .where(eq(trainingProgramTasks.programId, session.programId))
      .orderBy(trainingProgramTasks.sortOrder);

    // Get task progress
    const taskProgress = await db
      .select()
      .from(trainingBuilderTaskProgress)
      .where(eq(trainingBuilderTaskProgress.sessionId, session.id));

    // Get employee info
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.employeeId));

    res.json({
      session,
      program: { ...program, tasks },
      taskProgress,
      employee,
    });
  } catch (error: any) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update task progress (mark task complete)
router.patch('/sessions/:sessionId/tasks/:taskId', async (req, res) => {
  try {
    const { sessionId, taskId } = req.params;
    const { status } = req.body;

    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const [progress] = await db
      .update(trainingBuilderTaskProgress)
      .set({
        status,
        completedAt: status === 'completed' ? new Date() : null,
      })
      .where(
        and(
          eq(trainingBuilderTaskProgress.sessionId, session.id),
          eq(trainingBuilderTaskProgress.taskId, parseInt(taskId))
        )
      )
      .returning();

    res.json(progress);
  } catch (error: any) {
    console.error('Error updating task progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Signoff a session (supervisor approval)
router.post('/sessions/:sessionId/signoff', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { supervisorId, notes, pin } = req.body;

    // Verify supervisor PIN if provided
    if (pin) {
      const [supervisor] = await db
        .select()
        .from(users)
        .where(eq(users.id, supervisorId));

      if (!supervisor) {
        return res.status(404).json({ error: 'Supervisor not found' });
      }
    }

    const [session] = await db
      .update(trainingBuilderSessions)
      .set({
        supervisorSignoff: supervisorId,
        signoffNotes: notes,
        signoffAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingBuilderSessions.sessionId, sessionId))
      .returning();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error: any) {
    console.error('Error signing off session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete a session
router.post('/sessions/:sessionId/complete', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get the current session
    const [existingSession] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));

    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Validate supervisor signoff exists
    if (!existingSession.supervisorSignoff) {
      return res.status(400).json({ 
        error: 'Supervisor signoff required before completing session' 
      });
    }

    // Update session to completed
    const [session] = await db
      .update(trainingBuilderSessions)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingBuilderSessions.sessionId, sessionId))
      .returning();

    // Update the assignment status
    await db
      .update(trainingAssignments)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingAssignments.id, session.assignmentId));

    // Get program details to record in training matrix
    const [program] = await db
      .select()
      .from(trainingPrograms)
      .where(eq(trainingPrograms.id, session.programId));

    // Get employee details
    const [employee] = await db
      .select()
      .from(employees)
      .where(eq(employees.id, session.employeeId));

    // Record completion in training matrix
    if (program && employee) {
      const employeeName = employee.name || 
                           employee.email || 
                           `Employee ${employee.id}`;

      // Check if matrix entry exists for this employee/program
      const existingMatrix = await db
        .select()
        .from(trainingMatrix)
        .where(
          and(
            eq(trainingMatrix.employeeId, employee.id),
            eq(trainingMatrix.trainingName, program.title)
          )
        );

      if (existingMatrix.length > 0) {
        // Update existing entry
        await db
          .update(trainingMatrix)
          .set({
            lastCompleted: new Date(),
            status: 'COMPLETED',
            updatedAt: new Date(),
          })
          .where(eq(trainingMatrix.id, existingMatrix[0].id));
      } else {
        // Create new matrix entry
        await db
          .insert(trainingMatrix)
          .values({
            employeeId: employee.id,
            employeeName: employeeName,
            jobTitle: employee.jobTitle || program.role,
            department: program.department,
            trainingName: program.title,
            requiredBy: 'PROGRAM_BUILDER',
            frequency: 'ONCE',
            lastCompleted: new Date(),
            status: 'COMPLETED',
            notes: `Completed via Training Builder. Session: ${sessionId}`,
          });
      }
    }

    res.json({ 
      session, 
      message: 'Session completed and recorded in Training Matrix' 
    });
  } catch (error: any) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== QUIZ REFS ENDPOINTS ==============

// Get quiz refs for a program
router.get('/programs/:id/quiz-refs', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    
    // Handle Neon serverless null returns for empty result sets
    let refs: any[] = [];
    try {
      const result = await db
        .select()
        .from(trainingProgramQuizRefs)
        .where(eq(trainingProgramQuizRefs.programId, programId))
        .orderBy(trainingProgramQuizRefs.dayNumber, trainingProgramQuizRefs.sortOrder);
      refs = result || [];
    } catch (queryError: any) {
      // Handle Neon driver null result issue
      if (queryError.message?.includes("null") || queryError.message?.includes("map")) {
        refs = [];
      } else {
        throw queryError;
      }
    }
    
    // Then get question details for each ref
    const refsWithQuestions = await Promise.all(
      refs.map(async (ref) => {
        if (ref.quizQuestionId) {
          try {
            const questions = await db
              .select()
              .from(trainingQuestions)
              .where(eq(trainingQuestions.id, ref.quizQuestionId));
            return { 
              ...ref, 
              question: questions && questions.length > 0 ? questions[0] : null 
            };
          } catch {
            return { ...ref, question: null };
          }
        }
        return { ...ref, question: null };
      })
    );

    res.json(refsWithQuestions);
  } catch (error: any) {
    console.error('Error fetching quiz refs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a quiz ref (link program to existing question or store draft)
router.post('/programs/:id/quiz-refs', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const { dayNumber, taskId, quizQuestionId, questionDraft } = req.body;

    if (!quizQuestionId && !questionDraft) {
      return res.status(400).json({ 
        error: 'Either quizQuestionId or questionDraft is required' 
      });
    }

    // Build values object, only include defined fields
    const values: any = {
      programId,
      dayNumber,
      sortOrder: 0,
      isActive: true,
    };

    if (taskId) values.taskId = parseInt(taskId);
    if (quizQuestionId) values.quizQuestionId = parseInt(quizQuestionId);
    if (questionDraft) values.questionDraft = questionDraft;

    const [ref] = await db
      .insert(trainingProgramQuizRefs)
      .values(values)
      .returning();

    res.status(201).json(ref);
  } catch (error: any) {
    console.error('Error creating quiz ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new question and link it to the program
router.post('/programs/:id/quiz-refs/create-question', async (req, res) => {
  try {
    const programId = parseInt(req.params.id);
    const { dayNumber, taskId, moduleId, questionText, questionType, correctAnswer, explanation, options } = req.body;

    if (!moduleId) {
      return res.status(400).json({ error: 'moduleId is required to create a question' });
    }

    // Create the question in trainingQuestions table
    const [question] = await db
      .insert(trainingQuestions)
      .values({
        moduleId,
        questionText,
        questionType: questionType || 'MULTIPLE_CHOICE',
        correctAnswer,
        explanation,
        isActive: true,
      })
      .returning();

    // If multiple choice, add options
    if (options && Array.isArray(options) && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        await db.insert(trainingQuestionOptions).values({
          questionId: question.id,
          optionText: options[i].text,
          isCorrect: options[i].isCorrect || false,
          sortOrder: i,
        });
      }
    }

    // Link to the program
    const refValues: any = {
      programId,
      dayNumber,
      quizQuestionId: question.id,
      sortOrder: 0,
      isActive: true,
    };
    if (taskId) refValues.taskId = parseInt(taskId);

    const [ref] = await db
      .insert(trainingProgramQuizRefs)
      .values(refValues)
      .returning();

    res.status(201).json({ ref, question });
  } catch (error: any) {
    console.error('Error creating question and quiz ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a quiz ref
router.patch('/programs/:programId/quiz-refs/:refId', async (req, res) => {
  try {
    const refId = parseInt(req.params.refId);
    const updates = req.body;

    const [ref] = await db
      .update(trainingProgramQuizRefs)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(trainingProgramQuizRefs.id, refId))
      .returning();

    if (!ref) {
      return res.status(404).json({ error: 'Quiz ref not found' });
    }

    res.json(ref);
  } catch (error: any) {
    console.error('Error updating quiz ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a quiz ref
router.delete('/programs/:programId/quiz-refs/:refId', async (req, res) => {
  try {
    const refId = parseInt(req.params.refId);

    const deleted = await db
      .delete(trainingProgramQuizRefs)
      .where(eq(trainingProgramQuizRefs.id, refId))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Quiz ref not found' });
    }

    res.json({ success: true, deleted: deleted[0] });
  } catch (error: any) {
    console.error('Error deleting quiz ref:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get quiz questions for a session (by day)
router.get('/sessions/:sessionId/quiz', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const dayNumber = parseInt(req.query.day as string) || 1;

    // Get session to find program
    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get quiz refs for this program and day
    const refs = await db
      .select({
        id: trainingProgramQuizRefs.id,
        dayNumber: trainingProgramQuizRefs.dayNumber,
        quizQuestionId: trainingProgramQuizRefs.quizQuestionId,
        questionDraft: trainingProgramQuizRefs.questionDraft,
        question: {
          id: trainingQuestions.id,
          questionText: trainingQuestions.questionText,
          questionType: trainingQuestions.questionType,
          correctAnswer: trainingQuestions.correctAnswer,
          explanation: trainingQuestions.explanation,
        },
      })
      .from(trainingProgramQuizRefs)
      .leftJoin(trainingQuestions, eq(trainingProgramQuizRefs.quizQuestionId, trainingQuestions.id))
      .where(
        and(
          eq(trainingProgramQuizRefs.programId, session.programId),
          eq(trainingProgramQuizRefs.dayNumber, dayNumber),
          eq(trainingProgramQuizRefs.isActive, true)
        )
      )
      .orderBy(trainingProgramQuizRefs.sortOrder);

    // For each question, get its options if it's multiple choice
    const safeRefs = refs || [];
    const questionsWithOptions = await Promise.all(
      safeRefs.map(async (ref) => {
        if (ref.quizQuestionId) {
          const options = await db
            .select()
            .from(trainingQuestionOptions)
            .where(eq(trainingQuestionOptions.questionId, ref.quizQuestionId))
            .orderBy(trainingQuestionOptions.sortOrder);
          return { ...ref, options: options || [] };
        }
        return { ...ref, options: [] };
      })
    );

    res.json(questionsWithOptions);
  } catch (error: any) {
    console.error('Error fetching session quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WORK INSTRUCTIONS - Task-specific procedural documents
// ============================================================================

import { workInstructions, trainingTaskWorkInstructions, trainingSOAFeedback, insertWorkInstructionSchema } from '@shared/schema';

// Get all work instructions
router.get('/work-instructions', async (req, res) => {
  try {
    const { department, status } = req.query;
    let query = db.select().from(workInstructions);
    
    // Apply filters
    const conditions = [];
    if (department && department !== 'all') {
      conditions.push(eq(workInstructions.department, department as string));
    }
    if (status && status !== 'all') {
      conditions.push(eq(workInstructions.status, status as string));
    }
    
    let instructions: any[] = [];
    try {
      if (conditions.length > 0) {
        instructions = await db.select().from(workInstructions).where(and(...conditions)).orderBy(desc(workInstructions.updatedAt));
      } else {
        instructions = await db.select().from(workInstructions).orderBy(desc(workInstructions.updatedAt));
      }
    } catch (e) {
      instructions = [];
    }
    res.json(instructions || []);
  } catch (error: any) {
    console.error('Error fetching work instructions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single work instruction
router.get('/work-instructions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [instruction] = await db
      .select()
      .from(workInstructions)
      .where(eq(workInstructions.id, id));
    
    if (!instruction) {
      return res.status(404).json({ error: 'Work instruction not found' });
    }
    res.json(instruction);
  } catch (error: any) {
    console.error('Error fetching work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create work instruction
router.post('/work-instructions', async (req, res) => {
  try {
    const parsed = insertWorkInstructionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    
    // Generate document number if not provided
    let docNumber = parsed.data.documentNumber;
    if (!docNumber) {
      let count: any[] = [];
      try {
        count = await db.select().from(workInstructions);
      } catch (e) {
        count = [];
      }
      docNumber = `WI-${String((count?.length || 0) + 1).padStart(3, '0')}`;
    }
    
    const [instruction] = await db
      .insert(workInstructions)
      .values({ ...parsed.data, documentNumber: docNumber })
      .returning();
    
    res.status(201).json(instruction);
  } catch (error: any) {
    console.error('Error creating work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update work instruction
router.put('/work-instructions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db
      .update(workInstructions)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(workInstructions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Work instruction not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete work instruction
router.delete('/work-instructions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(workInstructions).where(eq(workInstructions.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link work instruction to a training task
router.post('/tasks/:taskId/work-instructions', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { workInstructionId, trainingStep, stepDescription } = req.body;
    
    const [link] = await db
      .insert(trainingTaskWorkInstructions)
      .values({
        taskId,
        workInstructionId,
        trainingStep: trainingStep || 1,
        stepDescription: stepDescription || getStepDescription(trainingStep || 1),
      })
      .returning();
    
    res.status(201).json(link);
  } catch (error: any) {
    console.error('Error linking work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get work instructions for a task
router.get('/tasks/:taskId/work-instructions', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    let links: any[] = [];
    try {
      links = await db
        .select({
          id: trainingTaskWorkInstructions.id,
          taskId: trainingTaskWorkInstructions.taskId,
          workInstructionId: trainingTaskWorkInstructions.workInstructionId,
          trainingStep: trainingTaskWorkInstructions.trainingStep,
          stepDescription: trainingTaskWorkInstructions.stepDescription,
          workInstruction: {
            id: workInstructions.id,
            title: workInstructions.title,
            department: workInstructions.department,
            documentNumber: workInstructions.documentNumber,
            status: workInstructions.status,
          },
        })
        .from(trainingTaskWorkInstructions)
        .leftJoin(workInstructions, eq(trainingTaskWorkInstructions.workInstructionId, workInstructions.id))
        .where(eq(trainingTaskWorkInstructions.taskId, taskId));
    } catch (e) {
      links = [];
    }
    res.json(links || []);
  } catch (error: any) {
    console.error('Error fetching task work instructions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// S-O-A COACHING FEEDBACK
// ============================================================================

// Add S-O-A feedback for a session task
router.post('/sessions/:sessionId/soa-feedback', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { taskId, trainerId, traineeId, strength, opportunity, action, currentStep, notes } = req.body;
    
    // Find session by sessionId string
    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const [feedback] = await db
      .insert(trainingSOAFeedback)
      .values({
        sessionId: session.id,
        taskId,
        trainerId,
        traineeId,
        strength,
        opportunity,
        action,
        currentStep: currentStep || 1,
        notes,
      })
      .returning();
    
    res.status(201).json(feedback);
  } catch (error: any) {
    console.error('Error creating S-O-A feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get S-O-A feedback for a session
router.get('/sessions/:sessionId/soa-feedback', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    let feedback: any[] = [];
    try {
      feedback = await db
        .select()
        .from(trainingSOAFeedback)
        .where(eq(trainingSOAFeedback.sessionId, session.id))
        .orderBy(desc(trainingSOAFeedback.createdAt));
    } catch (e) {
      feedback = [];
    }
    res.json(feedback || []);
  } catch (error: any) {
    console.error('Error fetching S-O-A feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get work instructions for a training session (trainer view with critical points)
router.get('/sessions/:sessionId/work-instructions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get session details
    const [session] = await db
      .select()
      .from(trainingBuilderSessions)
      .where(eq(trainingBuilderSessions.sessionId, sessionId));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get assignment to find program
    const [assignment] = await db
      .select()
      .from(trainingAssignments)
      .where(eq(trainingAssignments.id, session.assignmentId));
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Get all tasks for this program
    let tasks: any[] = [];
    try {
      tasks = await db
        .select()
        .from(trainingProgramTasks)
        .where(eq(trainingProgramTasks.programId, assignment.programId));
    } catch (e) {
      tasks = [];
    }
    
    // Get work instructions linked to these tasks
    const taskIds = tasks.map(t => t.id);
    
    let workInstructionLinks: any[] = [];
    let allWorkInstructions: any[] = [];
    
    if (taskIds.length > 0) {
      try {
        workInstructionLinks = await db
          .select({
            linkId: trainingTaskWorkInstructions.id,
            taskId: trainingTaskWorkInstructions.taskId,
            workInstructionId: trainingTaskWorkInstructions.workInstructionId,
            trainingStep: trainingTaskWorkInstructions.trainingStep,
            stepDescription: trainingTaskWorkInstructions.stepDescription,
          })
          .from(trainingTaskWorkInstructions)
          .where(inArray(trainingTaskWorkInstructions.taskId, taskIds));
      } catch (e) {
        workInstructionLinks = [];
      }
      
      const wiIds = Array.from(new Set(workInstructionLinks.map(l => l.workInstructionId).filter(Boolean)));
      
      if (wiIds.length > 0) {
        try {
          allWorkInstructions = await db
            .select()
            .from(workInstructions)
            .where(inArray(workInstructions.id, wiIds));
        } catch (e) {
          allWorkInstructions = [];
        }
      }
    }
    
    // Build response with tasks, their work instructions, and critical points summary
    const tasksWithInstructions = tasks.map(task => {
      const taskLinks = workInstructionLinks.filter(l => l.taskId === task.id);
      const taskWIs = taskLinks.map(link => {
        const wi = allWorkInstructions.find(w => w.id === link.workInstructionId);
        return wi ? {
          ...wi,
          trainingStep: link.trainingStep,
          stepDescription: link.stepDescription,
        } : null;
      }).filter(Boolean);
      
      return {
        ...task,
        workInstructions: taskWIs,
      };
    });
    
    // Aggregate all critical points for daily reflection - use Map to collapse by task
    const criticalPointsMap = new Map<number, { task: string; points: string[] }>();
    const safetyConsiderationsMap = new Map<number, { task: string; considerations: string[] }>();
    
    tasksWithInstructions.forEach(task => {
      task.workInstructions.forEach((wi: any) => {
        // Handle criticalPoints from work instruction summary
        if (wi.criticalPoints && Array.isArray(wi.criticalPoints) && wi.criticalPoints.length > 0) {
          if (!criticalPointsMap.has(task.id)) {
            criticalPointsMap.set(task.id, { task: task.name, points: [] });
          }
          criticalPointsMap.get(task.id)!.points.push(...wi.criticalPoints);
        }
        
        // Handle safetyConsiderations from work instruction summary
        if (wi.safetyConsiderations && Array.isArray(wi.safetyConsiderations) && wi.safetyConsiderations.length > 0) {
          if (!safetyConsiderationsMap.has(task.id)) {
            safetyConsiderationsMap.set(task.id, { task: task.name, considerations: [] });
          }
          safetyConsiderationsMap.get(task.id)!.considerations.push(...wi.safetyConsiderations);
        }
        
        // Extract from individual steps
        if (wi.steps && Array.isArray(wi.steps)) {
          const stepCriticalPoints = wi.steps
            .filter((s: any) => s.criticalPoint)
            .map((s: any) => `Step ${s.stepNumber}: ${s.criticalPoint}`);
          if (stepCriticalPoints.length > 0) {
            if (!criticalPointsMap.has(task.id)) {
              criticalPointsMap.set(task.id, { task: task.name, points: [] });
            }
            criticalPointsMap.get(task.id)!.points.push(...stepCriticalPoints);
          }
          
          const stepSafetyNotes = wi.steps
            .filter((s: any) => s.safetyNote)
            .map((s: any) => `Step ${s.stepNumber}: ${s.safetyNote}`);
          if (stepSafetyNotes.length > 0) {
            if (!safetyConsiderationsMap.has(task.id)) {
              safetyConsiderationsMap.set(task.id, { task: task.name, considerations: [] });
            }
            safetyConsiderationsMap.get(task.id)!.considerations.push(...stepSafetyNotes);
          }
        }
      });
    });
    
    res.json({
      session,
      assignment,
      tasks: tasksWithInstructions,
      dailyReflection: {
        criticalPoints: Array.from(criticalPointsMap.values()),
        safetyConsiderations: Array.from(safetyConsiderationsMap.values()),
      },
    });
  } catch (error: any) {
    console.error('Error fetching session work instructions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function for 4-Step model descriptions
function getStepDescription(step: number): string {
  switch (step) {
    case 1: return 'Trainer Does / Trainer Explains';
    case 2: return 'Trainer Does / Trainee Explains';
    case 3: return 'Trainee Does / Trainer Coaches';
    case 4: return 'Trainee Does / Trainer Observes';
    default: return 'Unknown Step';
  }
}

// Get 4-Step Training Model reference data
router.get('/training-model', async (_req, res) => {
  res.json({
    steps: [
      { step: 1, name: 'Trainer Does / Trainer Explains', description: 'Introduce the task and establish correct mental models.' },
      { step: 2, name: 'Trainer Does / Trainee Explains', description: 'Verify comprehension before hands-on execution.' },
      { step: 3, name: 'Trainee Does / Trainer Coaches', description: 'Build confidence while preventing bad habits.' },
      { step: 4, name: 'Trainee Does / Trainer Observes', description: 'Validate independent competence.' },
    ],
    soaModel: {
      S: { name: 'Strength', prompt: 'What did the trainee do well?' },
      O: { name: 'Opportunity', prompt: 'What could be improved or refined?' },
      A: { name: 'Action', prompt: 'What will we do differently next time?' },
    },
    approvedPhrases: [
      'Good catch.',
      "That's exactly what we want.",
      "Pause here — what's the next critical point?",
      "You're on the right track — what happens if that spec is missed?",
      'Your material prep was spot-on.',
      'One opportunity is checking orientation earlier to avoid rework.',
      "You're doing this part exactly right — let's build on that.",
      'This is an opportunity to tighten the process.',
    ],
    prohibitedBehaviors: [
      'Yelling or raised voice',
      'Public embarrassment',
      'Sarcasm or ridicule',
      '"Figure it out" responses',
      'Withholding help to "test" someone',
    ],
  });
});

// ============= TRAINING BUILDER QUIZZES API =============

// Get all quizzes
router.get('/quizzes', async (req, res) => {
  try {
    const { programId, isActive } = req.query;
    let quizzes: any[] = [];
    try {
      if (programId) {
        quizzes = await db.select().from(trainingBuilderQuizzes)
          .where(eq(trainingBuilderQuizzes.programId, parseInt(programId as string)));
      } else {
        quizzes = await db.select().from(trainingBuilderQuizzes);
      }
    } catch (e) {
      quizzes = [];
    }
    res.json(quizzes || []);
  } catch (error: any) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single quiz with questions
router.get('/quizzes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [quiz] = await db.select().from(trainingBuilderQuizzes).where(eq(trainingBuilderQuizzes.id, id));
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    let questions: any[] = [];
    try {
      questions = await db.select().from(trainingBuilderQuizQuestions)
        .where(eq(trainingBuilderQuizQuestions.quizId, id))
        .orderBy(trainingBuilderQuizQuestions.sortOrder);
    } catch (e) {
      questions = [];
    }
    res.json({ ...quiz, questions: questions || [] });
  } catch (error: any) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create quiz
router.post('/quizzes', async (req, res) => {
  try {
    const parsed = insertTrainingBuilderQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [quiz] = await db.insert(trainingBuilderQuizzes).values(parsed.data).returning();
    res.status(201).json(quiz);
  } catch (error: any) {
    console.error('Error creating quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update quiz
router.put('/quizzes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(trainingBuilderQuizzes)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(trainingBuilderQuizzes.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete quiz
router.delete('/quizzes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingBuilderQuizQuestions).where(eq(trainingBuilderQuizQuestions.quizId, id));
    await db.delete(trainingBuilderQuizzes).where(eq(trainingBuilderQuizzes.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add question to quiz
router.post('/quizzes/:quizId/questions', async (req, res) => {
  try {
    const quizId = parseInt(req.params.quizId);
    const parsed = insertTrainingBuilderQuizQuestionSchema.safeParse({ ...req.body, quizId });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [question] = await db.insert(trainingBuilderQuizQuestions).values(parsed.data).returning();
    res.status(201).json(question);
  } catch (error: any) {
    console.error('Error adding question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update question
router.put('/quizzes/:quizId/questions/:questionId', async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    const [updated] = await db.update(trainingBuilderQuizQuestions)
      .set(req.body)
      .where(eq(trainingBuilderQuizQuestions.id, questionId))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Question not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete question
router.delete('/quizzes/:quizId/questions/:questionId', async (req, res) => {
  try {
    const questionId = parseInt(req.params.questionId);
    await db.delete(trainingBuilderQuizQuestions).where(eq(trainingBuilderQuizQuestions.id, questionId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= DAILY QUIZ SELECTION API =============

// Get daily quiz selections for a date
router.get('/daily-quizzes', async (req, res) => {
  try {
    const { date, department } = req.query;
    let selections: any[] = [];
    try {
      if (date) {
        const targetDate = new Date(date as string);
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
        selections = await db.select().from(trainingDailyQuizSelections)
          .where(and(
            sql`${trainingDailyQuizSelections.scheduledDate} >= ${startOfDay}`,
            sql`${trainingDailyQuizSelections.scheduledDate} <= ${endOfDay}`
          ));
      } else {
        selections = await db.select().from(trainingDailyQuizSelections)
          .orderBy(desc(trainingDailyQuizSelections.scheduledDate));
      }
    } catch (e) {
      selections = [];
    }
    res.json(selections || []);
  } catch (error: any) {
    console.error('Error fetching daily quizzes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Select quizzes for a day
router.post('/daily-quizzes', async (req, res) => {
  try {
    // Convert date string to Date object
    const data = { ...req.body };
    if (data.scheduledDate && typeof data.scheduledDate === 'string') {
      data.scheduledDate = new Date(data.scheduledDate);
    }
    const parsed = insertTrainingDailyQuizSelectionSchema.safeParse(data);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [selection] = await db.insert(trainingDailyQuizSelections).values(parsed.data).returning();
    res.status(201).json(selection);
  } catch (error: any) {
    console.error('Error creating daily quiz selection:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove daily quiz selection
router.delete('/daily-quizzes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingDailyQuizSelections).where(eq(trainingDailyQuizSelections.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting daily quiz selection:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= QUIZ ATTEMPTS API =============

// Start quiz attempt
router.post('/quiz-attempts', async (req, res) => {
  try {
    const parsed = insertTrainingBuilderQuizAttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    // Count existing attempts
    let existingAttempts: any[] = [];
    try {
      existingAttempts = await db.select().from(trainingBuilderQuizAttempts)
        .where(and(
          eq(trainingBuilderQuizAttempts.quizId, parsed.data.quizId),
          eq(trainingBuilderQuizAttempts.employeeId, parsed.data.employeeId)
        ));
    } catch (e) {
      existingAttempts = [];
    }
    const attemptNumber = (existingAttempts?.length || 0) + 1;
    const [attempt] = await db.insert(trainingBuilderQuizAttempts)
      .values({ ...parsed.data, attemptNumber })
      .returning();
    res.status(201).json(attempt);
  } catch (error: any) {
    console.error('Error starting quiz attempt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit quiz attempt
router.put('/quiz-attempts/:id/submit', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { answers } = req.body;
    
    // Get the attempt and quiz details
    const [attempt] = await db.select().from(trainingBuilderQuizAttempts).where(eq(trainingBuilderQuizAttempts.id, id));
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }
    
    // Get quiz questions
    let questions: any[] = [];
    try {
      questions = await db.select().from(trainingBuilderQuizQuestions)
        .where(eq(trainingBuilderQuizQuestions.quizId, attempt.quizId));
    } catch (e) {
      questions = [];
    }
    
    // Calculate score
    let correctCount = 0;
    const totalPoints = questions?.reduce((sum: number, q: any) => sum + (q.points || 1), 0) || 0;
    for (const q of (questions || [])) {
      if (answers && answers[q.id] === q.correctAnswer) {
        correctCount += q.points || 1;
      }
    }
    const score = totalPoints > 0 ? Math.round((correctCount / totalPoints) * 100) : 0;
    
    // Get passing score from quiz
    const [quiz] = await db.select().from(trainingBuilderQuizzes).where(eq(trainingBuilderQuizzes.id, attempt.quizId));
    const passed = score >= (quiz?.passingScore || 80);
    
    const [updated] = await db.update(trainingBuilderQuizAttempts)
      .set({ answers, score, passed, completedAt: new Date() })
      .where(eq(trainingBuilderQuizAttempts.id, id))
      .returning();
    
    res.json(updated);
  } catch (error: any) {
    console.error('Error submitting quiz attempt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee quiz attempts
router.get('/quiz-attempts/employee/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    let attempts: any[] = [];
    try {
      attempts = await db.select().from(trainingBuilderQuizAttempts)
        .where(eq(trainingBuilderQuizAttempts.employeeId, employeeId))
        .orderBy(desc(trainingBuilderQuizAttempts.createdAt));
    } catch (e) {
      attempts = [];
    }
    res.json(attempts || []);
  } catch (error: any) {
    console.error('Error fetching employee quiz attempts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============= CERTIFICATION API =============

// Get certifications for an employee
router.get('/certifications/employee/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    let certifications: any[] = [];
    try {
      certifications = await db.select().from(trainingCertifications)
        .where(eq(trainingCertifications.traineeId, employeeId))
        .orderBy(desc(trainingCertifications.createdAt));
    } catch (e) {
      certifications = [];
    }
    res.json(certifications || []);
  } catch (error: any) {
    console.error('Error fetching certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create certification (trainer observation signoff)
router.post('/certifications', async (req, res) => {
  try {
    // Convert date strings to Date objects
    const data = { ...req.body };
    if (data.observationDate && typeof data.observationDate === 'string') {
      data.observationDate = new Date(data.observationDate);
    }
    if (data.expiresAt && typeof data.expiresAt === 'string') {
      data.expiresAt = new Date(data.expiresAt);
    }
    const parsed = insertTrainingCertificationSchema.safeParse(data);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const [certification] = await db.insert(trainingCertifications).values(parsed.data).returning();
    res.status(201).json(certification);
  } catch (error: any) {
    console.error('Error creating certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update certification (for signoffs)
router.put('/certifications/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = { ...req.body, updatedAt: new Date() };
    
    // If both trainer and trainee signed off, update status to certified
    if (updates.trainerSignoff && updates.traineeSignoff && updates.allQuizzesPassed && updates.allTasksCompleted) {
      updates.status = 'certified';
      updates.certifiedAt = new Date();
    }
    
    const [updated] = await db.update(trainingCertifications)
      .set(updates)
      .where(eq(trainingCertifications.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tasks grouped by day for a program
router.get('/programs/:programId/tasks-by-day', async (req, res) => {
  try {
    const programId = parseInt(req.params.programId);
    let tasks: any[] = [];
    try {
      tasks = await db.select().from(trainingProgramTasks)
        .where(eq(trainingProgramTasks.programId, programId))
        .orderBy(trainingProgramTasks.dayNumber, trainingProgramTasks.sortOrder);
    } catch (e) {
      tasks = [];
    }
    
    // Group by day number
    const grouped: Record<number, any[]> = {};
    for (const task of (tasks || [])) {
      const day = task.dayNumber || 1;
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(task);
    }
    
    res.json(grouped);
  } catch (error: any) {
    console.error('Error fetching tasks by day:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// FACILITY TOPICS - Standard facility training topics (PPE, FOD, ITAR, etc.)
// ============================================================================

import { facilityTopics, facilityTopicQuestions, dailyTrainingSessions, dailyTaskBlocks, trainerCertifications } from '../../schema';

// Get all facility topics
router.get('/facility-topics', async (req, res) => {
  try {
    let topics: any[] = [];
    try {
      topics = await db.select().from(facilityTopics).orderBy(facilityTopics.title);
    } catch (e) {
      topics = [];
    }
    res.json(topics || []);
  } catch (error: any) {
    console.error('Error fetching facility topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single facility topic
router.get('/facility-topics/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [topic] = await db.select().from(facilityTopics).where(eq(facilityTopics.id, id));
    if (!topic) {
      return res.status(404).json({ error: 'Facility topic not found' });
    }
    res.json(topic);
  } catch (error: any) {
    console.error('Error fetching facility topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create facility topic
router.post('/facility-topics', async (req, res) => {
  try {
    const [topic] = await db.insert(facilityTopics).values(req.body).returning();
    res.status(201).json(topic);
  } catch (error: any) {
    console.error('Error creating facility topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update facility topic
router.put('/facility-topics/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(facilityTopics)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(facilityTopics.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Facility topic not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating facility topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get questions for a facility topic
router.get('/facility-topics/:id/questions', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    let questions: any[] = [];
    try {
      questions = await db.select().from(facilityTopicQuestions)
        .where(eq(facilityTopicQuestions.topicId, topicId));
    } catch (e) {
      questions = [];
    }
    res.json(questions || []);
  } catch (error: any) {
    console.error('Error fetching facility topic questions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add question to facility topic
router.post('/facility-topics/:id/questions', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);
    const [question] = await db.insert(facilityTopicQuestions)
      .values({ ...req.body, topicId })
      .returning();
    res.status(201).json(question);
  } catch (error: any) {
    console.error('Error adding facility topic question:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DAILY TRAINING SESSIONS - Train-the-Trainer session management
// ============================================================================

// Get all daily training sessions
router.get('/daily-sessions', async (req, res) => {
  try {
    const { traineeId, trainerId, status } = req.query;
    let sessions: any[] = [];
    try {
      if (traineeId) {
        sessions = await db.select().from(dailyTrainingSessions)
          .where(eq(dailyTrainingSessions.traineeId, parseInt(traineeId as string)))
          .orderBy(desc(dailyTrainingSessions.sessionDate));
      } else if (trainerId) {
        sessions = await db.select().from(dailyTrainingSessions)
          .where(eq(dailyTrainingSessions.trainerId, parseInt(trainerId as string)))
          .orderBy(desc(dailyTrainingSessions.sessionDate));
      } else {
        sessions = await db.select().from(dailyTrainingSessions)
          .orderBy(desc(dailyTrainingSessions.sessionDate));
      }
    } catch (e) {
      sessions = [];
    }
    res.json(sessions || []);
  } catch (error: any) {
    console.error('Error fetching daily sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start a new daily training session
router.post('/daily-sessions', async (req, res) => {
  try {
    const { traineeId, trainerId, facilityTopicId, planDayId, notes } = req.body;
    const [session] = await db.insert(dailyTrainingSessions).values({
      traineeId,
      trainerId,
      facilityTopicId,
      planDayId,
      sessionDate: new Date(),
      notes,
      status: 'active',
    }).returning();
    res.status(201).json(session);
  } catch (error: any) {
    console.error('Error starting daily session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get session with task blocks
router.get('/daily-sessions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [session] = await db.select().from(dailyTrainingSessions)
      .where(eq(dailyTrainingSessions.id, id));
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    let taskBlocks: any[] = [];
    try {
      taskBlocks = await db.select().from(dailyTaskBlocks)
        .where(eq(dailyTaskBlocks.sessionId, id));
    } catch (e) {
      taskBlocks = [];
    }
    
    res.json({ ...session, taskBlocks: taskBlocks || [] });
  } catch (error: any) {
    console.error('Error fetching daily session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update task block (4-step progress and S-O-A feedback)
router.put('/task-blocks/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(dailyTaskBlocks)
      .set(req.body)
      .where(eq(dailyTaskBlocks.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Task block not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating task block:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add task block to session
router.post('/daily-sessions/:sessionId/task-blocks', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.sessionId);
    const [block] = await db.insert(dailyTaskBlocks).values({
      sessionId,
      taskId: req.body.taskId,
    }).returning();
    res.status(201).json(block);
  } catch (error: any) {
    console.error('Error adding task block:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sign session (trainer or trainee)
router.put('/daily-sessions/:id/sign', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, signature, competencyAttested } = req.body;
    
    const updates: any = { signedAt: new Date() };
    if (role === 'trainer') {
      updates.trainerSignature = signature;
      if (competencyAttested !== undefined) {
        updates.competencyAttested = competencyAttested;
      }
    } else {
      updates.traineeSignature = signature;
    }
    
    const [updated] = await db.update(dailyTrainingSessions)
      .set(updates)
      .where(eq(dailyTrainingSessions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error signing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete session
router.put('/daily-sessions/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(dailyTrainingSessions)
      .set({ status: 'completed' })
      .where(eq(dailyTrainingSessions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update session
router.put('/daily-sessions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { traineeId, trainerId, facilityTopicId, planDayId, notes, status } = req.body;
    
    const updateData: any = {};
    if (traineeId !== undefined) updateData.traineeId = traineeId;
    if (trainerId !== undefined) updateData.trainerId = trainerId;
    if (facilityTopicId !== undefined) updateData.facilityTopicId = facilityTopicId;
    if (planDayId !== undefined) updateData.planDayId = planDayId;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    
    const [updated] = await db.update(dailyTrainingSessions)
      .set(updateData)
      .where(eq(dailyTrainingSessions.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete session
router.delete('/daily-sessions/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(dailyTrainingSessions)
      .where(eq(dailyTrainingSessions.id, id))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINER CERTIFICATIONS - Track certified trainers
// ============================================================================

// Get all certified trainers
router.get('/trainer-certifications', async (req, res) => {
  try {
    let certs: any[] = [];
    try {
      certs = await db.select({
        id: trainerCertifications.id,
        employeeId: trainerCertifications.employeeId,
        certifiedAt: trainerCertifications.certifiedAt,
        certifiedBy: trainerCertifications.certifiedBy,
        quizScore: trainerCertifications.quizScore,
        expiresAt: trainerCertifications.expiresAt,
        isActive: trainerCertifications.isActive,
        notes: trainerCertifications.notes,
        employeeName: employees.name,
        department: employees.department,
      }).from(trainerCertifications)
        .leftJoin(employees, eq(trainerCertifications.employeeId, employees.id))
        .where(eq(trainerCertifications.isActive, true));
    } catch (e) {
      certs = [];
    }
    res.json(certs || []);
  } catch (error: any) {
    console.error('Error fetching trainer certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if employee is certified trainer
router.get('/trainer-certifications/check/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    const [cert] = await db.select().from(trainerCertifications)
      .where(and(
        eq(trainerCertifications.employeeId, employeeId),
        eq(trainerCertifications.isActive, true)
      ));
    res.json({ isCertified: !!cert, certification: cert || null });
  } catch (error: any) {
    console.error('Error checking trainer certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create trainer certification
router.post('/trainer-certifications', async (req, res) => {
  try {
    // Create the trainer certification
    const [cert] = await db.insert(trainerCertifications).values({
      employeeId: req.body.employeeId,
      certifiedBy: req.body.certifiedBy,
      quizScore: req.body.quizScore,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      notes: req.body.notes,
    }).returning();

    // Get employee details for the matrix entry
    const [employee] = await db.select().from(employees).where(eq(employees.id, req.body.employeeId));

    // Also create/update training matrix entry for Train-the-Trainer certification
    const existingMatrix = await db.select().from(trainingMatrix)
      .where(and(
        eq(trainingMatrix.employeeId, req.body.employeeId),
        eq(trainingMatrix.trainingName, 'Train-the-Trainer Certification')
      ));

    if (existingMatrix.length > 0) {
      // Update existing entry
      await db.update(trainingMatrix)
        .set({
          lastCompleted: new Date(),
          lastScore: req.body.quizScore,
          nextDue: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
          status: 'COMPLETED',
          notes: `Certified with score: ${req.body.quizScore}%`,
        })
        .where(eq(trainingMatrix.id, existingMatrix[0].id));
    } else {
      // Create new matrix entry
      await db.insert(trainingMatrix).values({
        employeeId: req.body.employeeId,
        employeeName: employee?.name || null,
        jobTitle: employee?.jobTitle || null,
        department: employee?.department || null,
        trainingName: 'Train-the-Trainer Certification',
        requiredBy: 'ROLE',
        frequency: 'ANNUAL',
        lastCompleted: new Date(),
        lastScore: req.body.quizScore,
        nextDue: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        status: 'COMPLETED',
        notes: `Certified with score: ${req.body.quizScore}%`,
      });
    }

    res.status(201).json(cert);
  } catch (error: any) {
    console.error('Error creating trainer certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Revoke trainer certification
router.put('/trainer-certifications/:id/revoke', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(trainerCertifications)
      .set({ isActive: false })
      .where(eq(trainerCertifications.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    // Also update the training matrix entry to show revoked status
    await db.update(trainingMatrix)
      .set({
        status: 'PENDING',
        notes: 'Certification revoked',
      })
      .where(and(
        eq(trainingMatrix.employeeId, updated.employeeId),
        eq(trainingMatrix.trainingName, 'Train-the-Trainer Certification')
      ));

    res.json(updated);
  } catch (error: any) {
    console.error('Error revoking trainer certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// AI-POWERED WORK INSTRUCTION IMPORT
// ============================================================================

import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY or configure the AI integration.');
    }
    openaiClient = new OpenAI({ 
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

router.post('/work-instructions/ai-extract', async (req, res) => {
  try {
    const { pdfText, department } = req.body;
    
    if (!pdfText) {
      return res.status(400).json({ error: 'PDF text is required' });
    }
    
    const client = getOpenAIClient();
    
    const systemPrompt = `You are an expert at extracting work instructions from manufacturing documents.
Extract structured work instruction data from the provided document text.

Output a JSON object with this structure:
{
  "title": "Work instruction title",
  "processArea": "Process area (e.g., Layup, CNC, Paint)",
  "objective": "Clear objective statement",
  "estimatedMinutes": 30,
  "prerequisites": ["List of prerequisites"],
  "ppeRequired": ["PPE items required"],
  "tools": ["Tools and equipment needed"],
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "Step instruction",
      "criticalPoint": "Critical point if any (important for quality/safety)",
      "safetyNote": "Safety note if any"
    }
  ],
  "criticalPoints": ["Overall critical points for quality"],
  "safetyConsiderations": ["Safety considerations"],
  "qualityCheckpoints": ["Quality verification points"]
}

Focus on extracting:
- Clear, actionable steps
- Critical points that could affect quality
- Safety notes and PPE requirements
- Quality checkpoints
- Prerequisites and tools needed`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract work instruction from this document:\n\n${pdfText.substring(0, 10000)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    const extracted = JSON.parse(content);
    extracted.department = department || 'Manufacturing';
    
    res.json(extracted);
  } catch (error: any) {
    console.error('Error extracting work instruction:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/work-instructions/ai-generate-quiz', async (req, res) => {
  try {
    const { workInstruction } = req.body;
    
    if (!workInstruction) {
      return res.status(400).json({ error: 'Work instruction is required' });
    }
    
    const client = getOpenAIClient();
    
    const systemPrompt = `Generate 5-10 quiz questions based on this work instruction.
Focus on critical points, safety considerations, and proper execution.

Output a JSON object with this structure:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
      "correctAnswer": "A",
      "explanation": "Why this answer is correct",
      "category": "Critical Point" or "Safety" or "Quality" or "Process"
    }
  ]
}

Focus on:
- Critical safety points
- Quality checkpoints
- Correct sequence of steps
- Common mistakes to avoid`;

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate quiz for this work instruction:\n\nTitle: ${workInstruction.title}\n\nSteps: ${JSON.stringify(workInstruction.steps)}\n\nCritical Points: ${JSON.stringify(workInstruction.criticalPoints)}\n\nSafety: ${JSON.stringify(workInstruction.safetyConsiderations)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    const generated = JSON.parse(content);
    res.json(generated);
  } catch (error: any) {
    console.error('Error generating quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINING PLAN DAYS - 4-Day Competency Structure
// ============================================================================

import { trainingPlanDays, trainingPlanDayTopics } from '../../schema';

// Get all training plan days with their topics
router.get('/plan-days', async (req, res) => {
  try {
    let days: any[] = [];
    try {
      days = await db.select().from(trainingPlanDays).orderBy(trainingPlanDays.dayNumber);
    } catch (e) {
      days = [];
    }
    
    const daysWithTopics = await Promise.all((days || []).map(async (day) => {
      let topics: any[] = [];
      try {
        const topicLinks = await db.select().from(trainingPlanDayTopics)
          .where(eq(trainingPlanDayTopics.planDayId, day.id));
        
        for (const link of topicLinks) {
          const [topic] = await db.select().from(facilityTopics)
            .where(eq(facilityTopics.id, link.facilityTopicId));
          if (topic) topics.push(topic);
        }
      } catch (e) {
        topics = [];
      }
      return { ...day, topics };
    }));
    
    res.json(daysWithTopics);
  } catch (error: any) {
    console.error('Error fetching plan days:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize 4-day training plan for an assignment
router.post('/plan-days/initialize', async (req, res) => {
  try {
    const { assignmentId } = req.body;
    
    if (!assignmentId) {
      return res.status(400).json({ error: 'assignmentId is required' });
    }
    
    const defaultDays = [
      { dayNumber: 1, assignmentId, stepFocus: "Step 1: Trainer Does/Explains", objectives: "Introduction to facility processes, safety overview, and critical equipment orientation. Cover PPE requirements, FOD awareness, and basic chemical handling." },
      { dayNumber: 2, assignmentId, stepFocus: "Step 2: Trainer Does/Trainee Explains", objectives: "Hands-on practice with supervised instruction. Focus on work instruction comprehension, ITAR awareness, and basic production tasks." },
      { dayNumber: 3, assignmentId, stepFocus: "Step 3: Trainee Does/Trainer Coaches", objectives: "Trainee demonstrates skills under coaching. Apply learned concepts, practice S-O-A feedback techniques, and refine techniques." },
      { dayNumber: 4, assignmentId, stepFocus: "Step 4: Trainee Does/Trainer Observes", objectives: "Independent task completion with observation. Final competency verification and certification signoff." },
    ];
    
    const existing = await db.select().from(trainingPlanDays)
      .where(eq(trainingPlanDays.assignmentId, assignmentId));
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Training plan already initialized for this assignment' });
    }
    
    const created = await db.insert(trainingPlanDays).values(defaultDays).returning();
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Error initializing plan days:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update training plan day
router.put('/plan-days/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(trainingPlanDays)
      .set({ stepFocus: req.body.stepFocus, objectives: req.body.objectives })
      .where(eq(trainingPlanDays.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Plan day not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating plan day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add topic to plan day
router.post('/plan-days/:dayId/topics', async (req, res) => {
  try {
    const dayId = parseInt(req.params.dayId);
    const topicId = parseInt(req.body.topicId);
    
    const existing = await db.select().from(trainingPlanDayTopics)
      .where(and(
        eq(trainingPlanDayTopics.planDayId, dayId),
        eq(trainingPlanDayTopics.facilityTopicId, topicId)
      ));
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Topic already assigned to this day' });
    }
    
    const [link] = await db.insert(trainingPlanDayTopics)
      .values({ planDayId: dayId, facilityTopicId: topicId })
      .returning();
    res.status(201).json(link);
  } catch (error: any) {
    console.error('Error adding topic to day:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove topic from plan day
router.delete('/plan-days/:dayId/topics/:topicId', async (req, res) => {
  try {
    const dayId = parseInt(req.params.dayId);
    const topicId = parseInt(req.params.topicId);
    
    await db.delete(trainingPlanDayTopics)
      .where(and(
        eq(trainingPlanDayTopics.planDayId, dayId),
        eq(trainingPlanDayTopics.facilityTopicId, topicId)
      ));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing topic from day:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TRAINING CONTENT LIBRARY - Central repository for training materials
// ============================================================================

import { 
  trainingContentCategories, 
  trainingLibraryDocuments, 
  documentCategoryAssignments,
  trainingLibraryTopics,
  topicDocumentLinks,
  trainingTopicMaterials,
  trainingTopicQuizQuestions,
  traineeTopicAssignments,
  aiTrainingPlans
} from '../../schema';

// --- CATEGORIES ---

// Get all categories
router.get('/content-library/categories', async (req, res) => {
  try {
    const categories = await db.select().from(trainingContentCategories).orderBy(trainingContentCategories.type, trainingContentCategories.name);
    res.json(categories);
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/content-library/categories', async (req, res) => {
  try {
    const [category] = await db.insert(trainingContentCategories).values({
      name: req.body.name,
      type: req.body.type || 'custom',
      description: req.body.description,
      color: req.body.color,
      parentId: req.body.parentId,
      createdBy: req.body.createdBy,
    }).returning();
    res.status(201).json(category);
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/content-library/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [updated] = await db.update(trainingContentCategories)
      .set({
        name: req.body.name,
        description: req.body.description,
        color: req.body.color,
        updatedAt: new Date(),
      })
      .where(eq(trainingContentCategories.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/content-library/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingContentCategories).where(eq(trainingContentCategories.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- DOCUMENTS ---

// Get all documents with categories
router.get('/content-library/documents', async (req, res) => {
  try {
    const docs = await db.select({
      id: trainingLibraryDocuments.id,
      title: trainingLibraryDocuments.title,
      originalFilename: trainingLibraryDocuments.originalFilename,
      fileUrl: trainingLibraryDocuments.fileUrl,
      fileType: trainingLibraryDocuments.fileType,
      fileSize: trainingLibraryDocuments.fileSize,
      summary: trainingLibraryDocuments.summary,
      status: trainingLibraryDocuments.status,
      uploadedBy: trainingLibraryDocuments.uploadedBy,
      createdAt: trainingLibraryDocuments.createdAt,
    }).from(trainingLibraryDocuments).orderBy(desc(trainingLibraryDocuments.createdAt));

    // Get categories for each document
    const docsWithCategories = await Promise.all(docs.map(async (doc) => {
      const assignments = await db.select({
        categoryId: documentCategoryAssignments.categoryId,
        categoryName: trainingContentCategories.name,
        categoryType: trainingContentCategories.type,
        categoryColor: trainingContentCategories.color,
      }).from(documentCategoryAssignments)
        .leftJoin(trainingContentCategories, eq(documentCategoryAssignments.categoryId, trainingContentCategories.id))
        .where(eq(documentCategoryAssignments.documentId, doc.id));
      
      return { ...doc, categories: assignments };
    }));

    res.json(docsWithCategories);
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single document with full content
router.get('/content-library/documents/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(trainingLibraryDocuments).where(eq(trainingLibraryDocuments.id, id));
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const assignments = await db.select({
      categoryId: documentCategoryAssignments.categoryId,
      categoryName: trainingContentCategories.name,
      categoryType: trainingContentCategories.type,
    }).from(documentCategoryAssignments)
      .leftJoin(trainingContentCategories, eq(documentCategoryAssignments.categoryId, trainingContentCategories.id))
      .where(eq(documentCategoryAssignments.documentId, id));

    res.json({ ...doc, categories: assignments });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload document with category assignment and AI extraction
router.post('/content-library/documents', async (req, res) => {
  try {
    const { title, originalFilename, fileUrl, fileType, fileSize, categoryIds, uploadedBy, extractedText } = req.body;

    // Create document record
    const [doc] = await db.insert(trainingLibraryDocuments).values({
      title,
      originalFilename,
      fileUrl,
      fileType,
      fileSize,
      extractedContent: extractedText,
      status: extractedText ? 'processing' : 'uploaded',
      uploadedBy,
    }).returning();

    // Assign categories
    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        await db.insert(documentCategoryAssignments).values({
          documentId: doc.id,
          categoryId,
        });
      }
    }

    // If we have extracted text, process with AI
    if (extractedText) {
      try {
        const client = getOpenAIClient();
        const completion = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: `Analyze this training document and extract a summary and key points. Return JSON with:
{
  "summary": "2-3 sentence summary",
  "keyPoints": ["point 1", "point 2", ...]
}`
            },
            { role: 'user', content: extractedText.substring(0, 15000) }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        });

        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        
        await db.update(trainingLibraryDocuments)
          .set({
            summary: parsed.summary,
            keyPoints: JSON.stringify(parsed.keyPoints),
            status: 'ready',
            updatedAt: new Date(),
          })
          .where(eq(trainingLibraryDocuments.id, doc.id));

        doc.summary = parsed.summary;
        doc.keyPoints = JSON.stringify(parsed.keyPoints);
        doc.status = 'ready';
      } catch (aiError: any) {
        console.error('AI extraction error:', aiError);
        await db.update(trainingLibraryDocuments)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(trainingLibraryDocuments.id, doc.id));
      }
    }

    res.status(201).json(doc);
  } catch (error: any) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update document categories
router.put('/content-library/documents/:id/categories', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categoryIds } = req.body;

    // Remove existing assignments
    await db.delete(documentCategoryAssignments).where(eq(documentCategoryAssignments.documentId, id));

    // Add new assignments
    for (const categoryId of categoryIds) {
      await db.insert(documentCategoryAssignments).values({
        documentId: id,
        categoryId,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating document categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete document
router.delete('/content-library/documents/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(documentCategoryAssignments).where(eq(documentCategoryAssignments.documentId, id));
    await db.delete(trainingLibraryDocuments).where(eq(trainingLibraryDocuments.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extract text from uploaded file (PDF, DOC, DOCX)
router.post('/content-library/extract-text', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = file.originalname.toLowerCase();
    let extractedText = '';

    if (fileName.endsWith('.pdf')) {
      const { PDFParse } = await import('pdf-parse/node');
      const uint8Array = new Uint8Array(file.buffer);
      const parser = new PDFParse({ data: uint8Array, verbosity: 0 });
      try {
        const pdfData = await parser.getText();
        extractedText = pdfData.text;
      } finally {
        await parser.destroy();
      }
    } else if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
      const mammothModule = await import('mammoth');
      const result = await mammothModule.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv')) {
      extractedText = file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Please use PDF, DOC, DOCX, TXT, MD, or CSV files.' });
    }

    res.json({ text: extractedText, filename: file.originalname });
  } catch (error: any) {
    console.error('Error extracting text from file:', error);
    res.status(500).json({ error: `Failed to extract text: ${error.message}` });
  }
});

// --- AI TRAINING TOPIC GENERATION ---

// Generate training topic from selected documents
router.post('/content-library/generate-topic', async (req, res) => {
  try {
    const { documentIds, categoryId, createdBy } = req.body;

    // Fetch document contents
    const docs = await db.select().from(trainingLibraryDocuments)
      .where(inArray(trainingLibraryDocuments.id, documentIds));

    const combinedContent = docs.map(d => 
      `Document: ${d.title}\n${d.extractedContent || d.summary || ''}`
    ).join('\n\n---\n\n');

    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are creating a comprehensive training topic using the 4-Step Training Method.
Create training materials that a trainer can easily follow.

Return JSON with this structure:
{
  "title": "Training Topic Title",
  "description": "Overview of what will be learned",
  "objectives": ["objective 1", "objective 2", ...],
  "prerequisites": "Any required prior knowledge",
  "estimatedDuration": 60,
  "difficultyLevel": "beginner|intermediate|advanced",
  "materials": [
    {
      "stepNumber": 1,
      "stepTitle": "Trainer Does / Trainer Explains",
      "trainerInstructions": "Detailed instructions for what the trainer should demonstrate and explain",
      "keyPoints": ["key point 1", "key point 2"],
      "demonstrations": "What to physically demonstrate",
      "safetyNotes": "Any safety considerations",
      "estimatedTime": 15
    },
    {
      "stepNumber": 2,
      "stepTitle": "Trainer Does / Trainee Explains",
      "trainerInstructions": "Instructions for this step...",
      "keyPoints": [...],
      "demonstrations": "...",
      "safetyNotes": "...",
      "estimatedTime": 15
    },
    {
      "stepNumber": 3,
      "stepTitle": "Trainee Does / Trainer Coaches",
      "trainerInstructions": "Instructions for hands-on practice with coaching...",
      "keyPoints": [...],
      "demonstrations": "...",
      "safetyNotes": "...",
      "estimatedTime": 15
    },
    {
      "stepNumber": 4,
      "stepTitle": "Trainee Does / Trainer Observes",
      "trainerInstructions": "Instructions for independent execution with observation...",
      "keyPoints": [...],
      "demonstrations": "...",
      "safetyNotes": "...",
      "estimatedTime": 15
    }
  ],
  "quizQuestions": [
    {
      "question": "Question text",
      "questionType": "multiple_choice",
      "options": ["A) option", "B) option", "C) option", "D) option"],
      "correctAnswer": "A",
      "explanation": "Why this is correct",
      "difficulty": "easy|medium|hard",
      "stepNumber": 1
    }
  ]
}`
        },
        { role: 'user', content: `Create a complete 4-Step training topic from this content:\n\n${combinedContent.substring(0, 25000)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const generated = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Create the topic
    const [topic] = await db.insert(trainingLibraryTopics).values({
      title: generated.title,
      description: generated.description,
      objectives: JSON.stringify(generated.objectives),
      prerequisites: generated.prerequisites,
      estimatedDuration: generated.estimatedDuration,
      difficultyLevel: generated.difficultyLevel,
      categoryId,
      createdBy,
      isAiGenerated: true,
    }).returning();

    // Link documents to topic
    for (const docId of documentIds) {
      await db.insert(topicDocumentLinks).values({
        topicId: topic.id,
        documentId: docId,
      });
    }

    // Create training materials for each step
    for (const material of generated.materials || []) {
      await db.insert(trainingTopicMaterials).values({
        topicId: topic.id,
        stepNumber: material.stepNumber,
        stepTitle: material.stepTitle,
        trainerInstructions: material.trainerInstructions,
        keyPoints: JSON.stringify(material.keyPoints),
        demonstrations: material.demonstrations,
        safetyNotes: material.safetyNotes,
        estimatedTime: material.estimatedTime,
      });
    }

    // Create quiz questions
    for (const q of generated.quizQuestions || []) {
      await db.insert(trainingTopicQuizQuestions).values({
        topicId: topic.id,
        question: q.question,
        questionType: q.questionType,
        options: JSON.stringify(q.options),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        stepNumber: q.stepNumber,
      });
    }

    res.status(201).json({ topic, materials: generated.materials, quizQuestions: generated.quizQuestions });
  } catch (error: any) {
    console.error('Error generating topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- TOPICS ---

// Get all topics with materials count
router.get('/content-library/topics', async (req, res) => {
  try {
    const topics = await db.select({
      id: trainingLibraryTopics.id,
      title: trainingLibraryTopics.title,
      description: trainingLibraryTopics.description,
      objectives: trainingLibraryTopics.objectives,
      estimatedDuration: trainingLibraryTopics.estimatedDuration,
      difficultyLevel: trainingLibraryTopics.difficultyLevel,
      categoryId: trainingLibraryTopics.categoryId,
      isAiGenerated: trainingLibraryTopics.isAiGenerated,
      createdAt: trainingLibraryTopics.createdAt,
      categoryName: trainingContentCategories.name,
      categoryColor: trainingContentCategories.color,
    }).from(trainingLibraryTopics)
      .leftJoin(trainingContentCategories, eq(trainingLibraryTopics.categoryId, trainingContentCategories.id))
      .orderBy(desc(trainingLibraryTopics.createdAt));

    res.json(topics);
  } catch (error: any) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single topic with full details
router.get('/content-library/topics/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [topic] = await db.select().from(trainingLibraryTopics).where(eq(trainingLibraryTopics.id, id));
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const materials = await db.select().from(trainingTopicMaterials)
      .where(eq(trainingTopicMaterials.topicId, id))
      .orderBy(trainingTopicMaterials.stepNumber);

    const quizQuestions = await db.select().from(trainingTopicQuizQuestions)
      .where(eq(trainingTopicQuizQuestions.topicId, id));

    const linkedDocs = await db.select({
      id: trainingLibraryDocuments.id,
      title: trainingLibraryDocuments.title,
    }).from(topicDocumentLinks)
      .leftJoin(trainingLibraryDocuments, eq(topicDocumentLinks.documentId, trainingLibraryDocuments.id))
      .where(eq(topicDocumentLinks.topicId, id));

    res.json({ ...topic, materials, quizQuestions, linkedDocuments: linkedDocs });
  } catch (error: any) {
    console.error('Error fetching topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete topic
router.delete('/content-library/topics/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingTopicQuizQuestions).where(eq(trainingTopicQuizQuestions.topicId, id));
    await db.delete(trainingTopicMaterials).where(eq(trainingTopicMaterials.topicId, id));
    await db.delete(topicDocumentLinks).where(eq(topicDocumentLinks.topicId, id));
    await db.delete(trainingLibraryTopics).where(eq(trainingLibraryTopics.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- TRAINEE ASSIGNMENTS ---

// Get assignments for a trainee
router.get('/content-library/assignments/:traineeId', async (req, res) => {
  try {
    const traineeId = parseInt(req.params.traineeId);
    const assignments = await db.select({
      id: traineeTopicAssignments.id,
      topicId: traineeTopicAssignments.topicId,
      trainerId: traineeTopicAssignments.trainerId,
      dayNumber: traineeTopicAssignments.dayNumber,
      status: traineeTopicAssignments.status,
      dueDate: traineeTopicAssignments.dueDate,
      startedAt: traineeTopicAssignments.startedAt,
      completedAt: traineeTopicAssignments.completedAt,
      topicTitle: trainingLibraryTopics.title,
      topicDuration: trainingLibraryTopics.estimatedDuration,
    }).from(traineeTopicAssignments)
      .leftJoin(trainingLibraryTopics, eq(traineeTopicAssignments.topicId, trainingLibraryTopics.id))
      .where(eq(traineeTopicAssignments.traineeId, traineeId))
      .orderBy(traineeTopicAssignments.dayNumber);

    res.json(assignments);
  } catch (error: any) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign topics to trainee
router.post('/content-library/assign-topics', async (req, res) => {
  try {
    const { traineeId, topicIds, trainerId, createdBy } = req.body;

    const assignments = [];
    for (let i = 0; i < topicIds.length; i++) {
      const dayNumber = Math.ceil((i + 1) / Math.ceil(topicIds.length / 4)); // Distribute across 4 days
      const [assignment] = await db.insert(traineeTopicAssignments).values({
        traineeId,
        topicId: topicIds[i],
        trainerId,
        dayNumber,
        createdBy,
      }).returning();
      assignments.push(assignment);
    }

    res.status(201).json(assignments);
  } catch (error: any) {
    console.error('Error assigning topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate AI training plan from selected topics
router.post('/content-library/generate-training-plan', async (req, res) => {
  try {
    const { traineeId, topicIds, trainerId, createdBy } = req.body;

    // Fetch topics
    const topics = await db.select().from(trainingLibraryTopics)
      .where(inArray(trainingLibraryTopics.id, topicIds));

    // Get trainee info
    const [trainee] = await db.select().from(employees).where(eq(employees.id, traineeId));

    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are organizing training topics into an optimal 4-day training plan.
Each day should have a logical flow and appropriate workload.
Consider prerequisites and build skills progressively.

Return JSON with:
{
  "title": "Training Plan for [Area]",
  "description": "Overview of this training program",
  "days": [
    {
      "dayNumber": 1,
      "theme": "Day theme/focus",
      "objectives": ["what trainee will learn"],
      "topicIds": [list of topic IDs for this day],
      "estimatedHours": 4
    },
    ...
  ]
}`
        },
        { 
          role: 'user', 
          content: `Create a 4-day training plan for ${trainee?.name || 'trainee'} using these topics:\n\n${topics.map(t => `ID: ${t.id}, Title: ${t.title}, Duration: ${t.estimatedDuration}min, Prerequisites: ${t.prerequisites || 'None'}`).join('\n')}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const plan = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Create the training plan
    const [savedPlan] = await db.insert(aiTrainingPlans).values({
      traineeId,
      title: plan.title,
      description: plan.description,
      planStructure: JSON.stringify(plan),
      totalTopics: topicIds.length,
      createdBy,
    }).returning();

    // Create assignments based on the plan
    for (const day of plan.days || []) {
      for (const topicId of day.topicIds || []) {
        await db.insert(traineeTopicAssignments).values({
          traineeId,
          topicId,
          trainerId,
          dayNumber: day.dayNumber,
          createdBy,
        });
      }
    }

    res.status(201).json({ plan: savedPlan, structure: plan });
  } catch (error: any) {
    console.error('Error generating training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update assignment status
router.put('/content-library/assignments/:id/status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    const updates: any = { status, updatedAt: new Date() };
    if (status === 'in_progress' && !req.body.startedAt) {
      updates.startedAt = new Date();
    }
    if (status === 'completed') {
      updates.completedAt = new Date();
    }

    const [updated] = await db.update(traineeTopicAssignments)
      .set(updates)
      .where(eq(traineeTopicAssignments.id, id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI training plans
router.get('/content-library/training-plans', async (req, res) => {
  try {
    const plans = await db.select({
      id: aiTrainingPlans.id,
      traineeId: aiTrainingPlans.traineeId,
      title: aiTrainingPlans.title,
      description: aiTrainingPlans.description,
      planStructure: aiTrainingPlans.planStructure,
      totalTopics: aiTrainingPlans.totalTopics,
      status: aiTrainingPlans.status,
      createdAt: aiTrainingPlans.createdAt,
      traineeName: employees.name,
    }).from(aiTrainingPlans)
      .leftJoin(employees, eq(aiTrainingPlans.traineeId, employees.id))
      .orderBy(desc(aiTrainingPlans.createdAt));

    res.json(plans);
  } catch (error: any) {
    console.error('Error fetching training plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training plan with full structure
router.get('/content-library/training-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [plan] = await db.select().from(aiTrainingPlans).where(eq(aiTrainingPlans.id, id));
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }

    const assignments = await db.select({
      id: traineeTopicAssignments.id,
      topicId: traineeTopicAssignments.topicId,
      dayNumber: traineeTopicAssignments.dayNumber,
      status: traineeTopicAssignments.status,
      topicTitle: trainingLibraryTopics.title,
      topicDuration: trainingLibraryTopics.estimatedDuration,
    }).from(traineeTopicAssignments)
      .leftJoin(trainingLibraryTopics, eq(traineeTopicAssignments.topicId, trainingLibraryTopics.id))
      .where(eq(traineeTopicAssignments.traineeId, plan.traineeId))
      .orderBy(traineeTopicAssignments.dayNumber);

    res.json({ ...plan, assignments });
  } catch (error: any) {
    console.error('Error fetching training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
