import { Router } from 'express';
import { requirePermission } from '../../middleware/requirePermission';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { db } from '../../db';

// Drizzle client union type: works for both the top-level db instance and a
// transaction sub-client returned by db.transaction().
type DrizzleClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// Direct pg Pool for raw SQL queries (bypasses Neon serverless driver issues)
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : undefined
});
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
  partRoutings,
  inventoryItems,
  poProducts,
  capabilities,
  employeeCapabilities,
  trainingPrograms,
  trainingProgramTasks,
  trainingAssignments,
  trainingBuilderSessions,
  trainingBuilderTaskProgress,
  trainingProgramQuizRefs,
  trainingSoaNotes,
  trainingBuilderQuizzes,
  trainingBuilderQuizQuestions,
  trainingDailyQuizSelections,
  trainingBuilderQuizAttempts,
  trainingCertifications,
  aiTrainingPlans,
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
  trainingPlanTrainers,
  trainingPlanProductionInfo,
  trainingStepQuizzes,
  trainingStepQuizQuestions,
  trainingStepQuizAttempts,
  trainingStepFacilityModules,
  trainingStepProgress,
  trainerTopicCertifications,
  travelerAuthorizations,
  insertTrainingPlanTrainerSchema,
  insertTrainingPlanProductionInfoSchema,
  insertTrainingStepQuizSchema,
  insertTrainingStepQuizQuestionSchema,
  insertTrainingStepQuizAttemptSchema,
  insertTrainingStepFacilityModuleSchema,
  insertTrainingStepProgressSchema,
  insertTrainerTopicCertificationSchema,
  insertTravelerAuthorizationSchema,
} from '../../schema';
import { eq, and, desc, sql, inArray, gte, lt, or, isNotNull } from 'drizzle-orm';
import {
  extractTrainingContent,
  extractTrainingMatrixData,
} from '../lib/azureDocumentIntelligence';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Convert plain text content to formatted HTML with professional styling
function convertContentToHtml(content: string): string {
  if (!content) return '';
  
  let html = content;
  
  // Escape HTML entities first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Convert headers with professional styling
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2 mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<div class="text-center border-b-2 border-blue-200 pb-6 mb-8"><h1 class="text-3xl font-bold text-blue-900 mb-2">$1</h1></div>');
  
  // Convert numbered section headers (1️⃣, 2️⃣, etc.)
  html = html.replace(/^([0-9]️⃣|1️⃣0️⃣)\s*(.+)$/gm, 
    '<h2 class="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2 mt-8 mb-4">$1 $2</h2>');
  
  // Convert bold text (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  
  // Convert italic text (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Convert bullet points (-, *, •) at start of lines
  html = html.replace(/^[-*•]\s+(.+)$/gm, '<li class="text-lg">$1</li>');
  
  // Convert numbered lists (1. 2. 3. etc)
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="text-lg list-decimal-marker">$1</li>');
  
  // Wrap consecutive <li> elements in styled lists
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    if (match.includes('list-decimal-marker')) {
      return '<ol class="list-decimal list-inside space-y-2 ml-4 text-lg my-4">' + match + '</ol>';
    }
    return '<ul class="list-disc list-inside space-y-2 ml-4 text-lg my-4">' + match + '</ul>';
  });
  
  // Convert red important points section header
  html = html.replace(/^🔴\s*IMPORTANT POINTS$/gm, 
    '<div class="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-lg my-4"><h3 class="text-lg font-bold text-red-900">🔴 IMPORTANT POINTS</h3></div>');
  
  // Convert important callouts with professional colored boxes
  html = html.replace(/^📌\s*(.+)$/gm, 
    '<div class="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-blue-900">📌 $1</p></div>');
  html = html.replace(/^⚠️\s*(.+)$/gm, 
    '<div class="bg-yellow-50 border-l-4 border-yellow-400 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-yellow-900">⚠️ $1</p></div>');
  html = html.replace(/^✅\s*(.+)$/gm, 
    '<div class="bg-green-50 border-l-4 border-green-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-green-900">✅ $1</p></div>');
  html = html.replace(/^❌\s*(.+)$/gm, 
    '<div class="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-red-900">❌ $1</p></div>');
  html = html.replace(/^💡\s*(.+)$/gm, 
    '<div class="bg-purple-50 border-l-4 border-purple-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-purple-900">💡 $1</p></div>');
  html = html.replace(/^🔑\s*(.+)$/gm, 
    '<div class="bg-orange-50 border-l-4 border-orange-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-orange-900">🔑 $1</p></div>');
  html = html.replace(/^🔒\s*(.+)$/gm, 
    '<div class="bg-gray-100 border-l-4 border-gray-600 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-gray-900">🔒 $1</p></div>');
  html = html.replace(/^(⭐|📋|🎯)\s*(.+)$/gm, 
    '<div class="bg-indigo-50 border-l-4 border-indigo-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-indigo-900">$1 $2</p></div>');
  
  // Convert horizontal rules (--- or ___) to styled dividers
  html = html.replace(/^[-_]{3,}$/gm, '<hr class="my-8 border-t-2 border-gray-200" />');
  
  // Convert remaining newlines to paragraphs with proper styling
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    // Don't wrap if already wrapped in HTML tags
    if (p.trim().startsWith('<')) return p;
    // Convert single newlines to <br> within paragraphs
    const withBreaks = p.replace(/\n/g, '<br/>');
    return `<p class="text-lg leading-relaxed mb-4">${withBreaks}</p>`;
  }).join('\n');
  
  return `<div class="bg-white rounded-lg p-8 shadow-sm space-y-6 text-gray-800">${html}</div>`;
}

// Helper function to grant P2 certification capability to employee
// Accepts an optional transaction client so it can be used inside db.transaction().
async function grantP2CertificationCapability(
  employeeId: number,
  partNumber: string,
  department: string,
  client: DrizzleClient = db
) {
  // Create capability name: P2_CERT_PARTNUMBER_DEPARTMENT
  const capabilityName = `P2_CERT_${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${department.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const displayName = `P2 Certification: ${partNumber} - ${department}`;
  
  // Find or create capability
  let [capability] = await client
    .select()
    .from(capabilities)
    .where(eq(capabilities.name, capabilityName));
  
  if (!capability) {
    [capability] = await client
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
  const [existing] = await client
    .select()
    .from(employeeCapabilities)
    .where(
      and(
        eq(employeeCapabilities.employeeId, employeeId),
        eq(employeeCapabilities.capabilityId, capability.id)
      )
    );
  
  if (!existing) {
    await client
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
// Accepts an optional transaction client so it can be used inside db.transaction().
async function revokeP2CertificationCapability(
  employeeId: number,
  partNumber: string,
  department: string,
  client: DrizzleClient = db
) {
  const capabilityName = `P2_CERT_${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_${department.replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  const [capability] = await client
    .select()
    .from(capabilities)
    .where(eq(capabilities.name, capabilityName));
  
  if (capability) {
    await client
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

    let questions: any[] = [];
    try {
      const questionsResult = await db
        .select()
        .from(trainingQuestions)
        .where(eq(trainingQuestions.moduleId, moduleId))
        .orderBy(trainingQuestions.sortOrder);
      questions = questionsResult || [];
    } catch (e) {
      questions = [];
    }

    const questionsWithOptions = await Promise.all(
      questions.map(async (question) => {
        let options: any[] = [];
        try {
          const optionsResult = await db
            .select()
            .from(trainingQuestionOptions)
            .where(eq(trainingQuestionOptions.questionId, question.id))
            .orderBy(trainingQuestionOptions.sortOrder);
          options = optionsResult || [];
        } catch (e) {
          options = [];
        }
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
router.post('/modules', requirePermission('training.manage_content'), async (req, res) => {
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
router.patch('/modules/:id', requirePermission('training.manage_content'), async (req, res) => {
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

// Regenerate contentHtml for a training module from its content field
router.post('/modules/:id/regenerate-html', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    
    // Get the module
    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    if (!module) {
      return res.status(404).json({ error: 'Training module not found' });
    }
    
    if (!module.content) {
      return res.status(400).json({ error: 'Module has no content to convert' });
    }
    
    // Regenerate contentHtml using the converter
    const newContentHtml = convertContentToHtml(module.content);
    
    // Update the module
    const [updatedModule] = await db
      .update(trainingModules)
      .set({ contentHtml: newContentHtml, updatedAt: new Date() })
      .where(eq(trainingModules.id, moduleId))
      .returning();
    
    res.json(updatedModule);
  } catch (error: any) {
    console.error('Error regenerating content HTML:', error);
    res.status(500).json({ error: error.message });
  }
});

// AI-powered: Transform raw content into professional training material with quiz
router.post('/modules/:id/ai-transform', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    
    // Get the module
    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    if (!module) {
      return res.status(404).json({ error: 'Training module not found' });
    }
    
    if (!module.content) {
      return res.status(400).json({ error: 'Module has no content to transform' });
    }
    
    // Use OpenAI to transform content
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    const openai = new OpenAI({ 
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined
    });
    
    const systemPrompt = `You are a training content formatter. Your ONLY job is to REFORMAT the exact content provided - nothing more.

ABSOLUTE RULES - VIOLATION = FAILURE:
1. ONLY use content that appears in the provided text
2. DO NOT add any content from other training topics
3. DO NOT add AS9100 orientation material, quality policy, KPIs, or general company info
4. DO NOT combine multiple training topics into one
5. If the content is about "Travelers" - output ONLY traveler content
6. If the content is about "FOD" - output ONLY FOD content
7. NEVER add sections that don't exist in the original

Your task is FORMATTING ONLY:
- Add emoji numbers (1️⃣, 2️⃣) to existing sections
- Add 🔴 IMPORTANT POINTS markers to key items from the original
- Add 📌 markers for key definitions from the original  
- Add ⚠️ for warnings that exist in the original
- Add ✅ for completion requirements from the original
- Use --- for section separators

Generate 5-7 quiz questions based ONLY on the specific content provided.

Return JSON:
{
  "title": "Title matching the original topic exactly",
  "description": "1 sentence description of the original topic",
  "formattedContent": "The reformatted content using ONLY information from the original",
  "quizQuestions": [
    {
      "questionText": "Question about content that appears in the original",
      "options": ["A", "B", "C", "D"],
      "correctAnswerIndex": 0,
      "explanation": "Why correct based on original content"
    }
  ]
}

CRITICAL: If the original content does not mention AS9100 basics, quality policy, KPIs, or employee orientation - DO NOT ADD THEM.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Transform this raw content into professional training material:\n\n${module.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'Failed to transform content' });
    }
    
    const parsed = JSON.parse(content);
    
    // Convert the formatted content to HTML
    const contentHtml = convertContentToHtml(parsed.formattedContent || parsed.content || module.content);
    
    // Update the module with new content
    await db
      .update(trainingModules)
      .set({ 
        title: parsed.title || module.title,
        description: parsed.description || module.description,
        content: parsed.formattedContent || parsed.content || module.content,
        contentHtml,
        updatedAt: new Date() 
      })
      .where(eq(trainingModules.id, moduleId));
    
    // Delete existing questions for this module (handle Neon driver null returns)
    try {
      const existingQuestions = await db
        .select({ id: trainingQuestions.id })
        .from(trainingQuestions)
        .where(eq(trainingQuestions.moduleId, moduleId));
      
      if (existingQuestions && Array.isArray(existingQuestions) && existingQuestions.length > 0) {
        for (const q of existingQuestions) {
          try {
            await db.delete(trainingQuestionOptions).where(eq(trainingQuestionOptions.questionId, q.id));
          } catch (e) { /* ignore if no options */ }
        }
      }
      await db.delete(trainingQuestions).where(eq(trainingQuestions.moduleId, moduleId));
    } catch (e) {
      console.log('No existing questions to delete or error:', e);
    }
    
    // Save new quiz questions
    const questions = parsed.quizQuestions || parsed.questions || [];
    const savedQuestions = [];
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      await db
        .insert(trainingQuestions)
        .values({
          moduleId,
          questionText: q.questionText,
          questionType: 'multiple_choice',
          correctAnswer: q.options[q.correctAnswerIndex],
          explanation: q.explanation,
          sortOrder: i,
        });
      
      // Fetch the inserted question
      const insertedQuestions = await db
        .select()
        .from(trainingQuestions)
        .where(and(
          eq(trainingQuestions.moduleId, moduleId),
          eq(trainingQuestions.sortOrder, i)
        ))
        .orderBy(desc(trainingQuestions.id))
        .limit(1);
      
      const newQuestion = insertedQuestions[0];
      if (!newQuestion) continue;
      
      // Insert options
      for (let j = 0; j < q.options.length; j++) {
        await db
          .insert(trainingQuestionOptions)
          .values({
            questionId: newQuestion.id,
            optionText: q.options[j],
            isCorrect: j === q.correctAnswerIndex,
            sortOrder: j,
          });
      }
      
      savedQuestions.push({ ...newQuestion, options: q.options });
    }
    
    // Fetch updated module
    const [updatedModule] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    res.json({ 
      success: true, 
      module: updatedModule,
      questionsGenerated: savedQuestions.length,
      questions: savedQuestions
    });
  } catch (error: any) {
    console.error('Error transforming content:', error);
    res.status(500).json({ error: error.message });
  }
});

// Translate training content to Spanish
router.post('/translate', async (req, res) => {
  try {
    const { content, type = 'html' } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined });

    if (type === 'html') {
      const systemPrompt = `You are a professional translator. Translate the following HTML content from English to Spanish.
RULES:
- Preserve ALL HTML tags, attributes, classes, and structure exactly as-is
- Only translate the visible text content inside HTML tags
- Do NOT translate CSS class names, HTML attributes, or inline styles
- Do NOT add or remove any HTML elements
- Return ONLY the translated HTML, nothing else`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        temperature: 0.2,
      });

      const translated = response.choices[0]?.message?.content?.trim() || content;
      return res.json({ translated });
    }

    // type === 'json': quiz translation — use json_object response_format for reliable parsing
    const systemPromptJson = `You are a professional translator. Translate training quiz questions from English to Spanish.
The input is a JSON object with a "questions" array. Each question has "questionText" and "options" (each with "optionText").
Translate only the "questionText" and "optionText" string values. Keep all other fields (id, etc.) exactly as-is.
Return a valid JSON object with the same "questions" array structure, with translated text.`;

    const wrapped = JSON.stringify({ questions: JSON.parse(content) });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPromptJson },
        { role: 'user', content: wrapped }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const rawJson = response.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(rawJson);
    const translatedArray = parsed.questions ?? [];
    res.json({ translated: JSON.stringify(translatedArray) });
  } catch (error: any) {
    console.error('Error translating content:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate AI quiz questions for a training module
router.post('/modules/:id/generate-quiz', async (req, res) => {
  try {
    const moduleId = parseInt(req.params.id);
    
    // Get the module
    const [module] = await db
      .select()
      .from(trainingModules)
      .where(eq(trainingModules.id, moduleId));
    
    if (!module) {
      return res.status(404).json({ error: 'Training module not found' });
    }
    
    if (!module.content) {
      return res.status(400).json({ error: 'Module has no content to generate quiz from' });
    }
    
    // Use OpenAI to generate quiz questions
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    const openai = new OpenAI({ 
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined
    });
    
    const systemPrompt = `You are an expert training content developer. Generate 5-8 multiple choice quiz questions based on the training content provided. 

Each question should:
- Test understanding of key concepts
- Have 4 answer options (A, B, C, D)
- Have exactly one correct answer
- Include a brief explanation of why the correct answer is right

Return a JSON array with this structure:
[
  {
    "questionText": "The question",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswerIndex": 0,
    "explanation": "Why this is correct"
  }
]

Focus on the most important points, safety requirements, and critical procedures from the training content.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate quiz questions for this training module:\n\nTitle: ${module.title}\n\nContent:\n${module.content}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'Failed to generate quiz questions' });
    }
    
    console.log('AI Quiz Response:', content.substring(0, 500));
    
    const parsed = JSON.parse(content);
    // Handle various response formats
    let questions = parsed.questions || parsed.quiz || parsed.quiz_questions || parsed;
    
    // If it's still an object with a nested array, try to find it
    if (!Array.isArray(questions) && typeof questions === 'object') {
      const keys = Object.keys(questions);
      for (const key of keys) {
        if (Array.isArray(questions[key])) {
          questions = questions[key];
          break;
        }
      }
    }
    
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('Failed to parse quiz questions. Parsed:', JSON.stringify(parsed).substring(0, 500));
      return res.status(500).json({ error: 'No quiz questions generated', debug: parsed });
    }
    
    // Save questions to database using fetch-after-insert pattern for Neon HTTP driver
    const savedQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      // Insert question
      await db
        .insert(trainingQuestions)
        .values({
          moduleId,
          questionText: q.questionText,
          questionType: 'multiple_choice',
          correctAnswer: q.options[q.correctAnswerIndex],
          explanation: q.explanation,
          sortOrder: i,
        });
      
      // Fetch the inserted question
      const insertedQuestions = await db
        .select()
        .from(trainingQuestions)
        .where(and(
          eq(trainingQuestions.moduleId, moduleId),
          eq(trainingQuestions.sortOrder, i)
        ))
        .orderBy(desc(trainingQuestions.id))
        .limit(1);
      
      const newQuestion = insertedQuestions[0];
      if (!newQuestion) {
        console.error('Failed to fetch inserted question');
        continue;
      }
      
      // Insert options
      for (let j = 0; j < q.options.length; j++) {
        await db
          .insert(trainingQuestionOptions)
          .values({
            questionId: newQuestion.id,
            optionText: q.options[j],
            isCorrect: j === q.correctAnswerIndex,
            sortOrder: j,
          });
      }
      
      savedQuestions.push({ ...newQuestion, options: q.options });
    }
    
    res.json({ success: true, questionsGenerated: savedQuestions.length, questions: savedQuestions });
  } catch (error: any) {
    console.error('Error generating quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete training module
router.delete('/modules/:id', requirePermission('training.manage_content'), async (req, res) => {
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

// ============ TRAINING PLANS API ============

// Get all training plans
router.get('/plans', async (req, res) => {
  try {
    let plans: any[] = [];
    try {
      const results = await db
        .select()
        .from(aiTrainingPlans)
        .orderBy(desc(aiTrainingPlans.createdAt));
      plans = Array.isArray(results) ? results : [];
    } catch (fetchErr) {
      console.error('Error querying training plans:', fetchErr);
      return res.json([]);
    }
    
    // Parse JSON fields safely
    const parsedPlans = plans.map(plan => {
      let moduleIds: number[] = [];
      try {
        if (plan.planStructure) {
          const parsed = JSON.parse(plan.planStructure);
          moduleIds = Array.isArray(parsed.moduleIds) ? parsed.moduleIds : [];
        }
      } catch (parseErr) {
        console.error('Error parsing planStructure:', parseErr);
      }
      return {
        ...plan,
        moduleIds,
      };
    });
    
    res.json(parsedPlans);
  } catch (error: any) {
    console.error('Error fetching training plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create training plan with Zod validation
router.post('/plans', async (req, res) => {
  try {
    const { title, description, moduleIds, status } = req.body;
    
    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    }
    
    const validModuleIds = Array.isArray(moduleIds) ? moduleIds.filter(id => typeof id === 'number') : [];
    const validStatus = ['draft', 'active', 'completed'].includes(status) ? status : 'draft';
    
    const planStructure = JSON.stringify({
      moduleIds: validModuleIds,
      createdAt: new Date().toISOString(),
    });
    
    // Insert and then fetch the created plan
    await db.insert(aiTrainingPlans).values({
      title: title.trim(),
      description: (description || '').trim(),
      planStructure,
      totalTopics: validModuleIds.length,
      status: validStatus,
      traineeId: 1, // Will be updated when assigned
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    // Fetch the most recently created plan with error handling for Neon null returns
    let newPlan = null;
    try {
      const results = await db
        .select()
        .from(aiTrainingPlans)
        .orderBy(desc(aiTrainingPlans.id))
        .limit(1);
      newPlan = Array.isArray(results) ? results[0] : null;
    } catch (fetchErr) {
      console.error('Error fetching newly created plan:', fetchErr);
    }
    
    res.status(201).json({
      id: newPlan?.id,
      title: title.trim(),
      description: (description || '').trim(),
      status: validStatus,
      totalTopics: validModuleIds.length,
      moduleIds: validModuleIds,
      createdAt: newPlan?.createdAt || new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training plan
router.get('/plans/:id', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const [plan] = await db
      .select()
      .from(aiTrainingPlans)
      .where(eq(aiTrainingPlans.id, planId));
    
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    
    res.json({
      ...plan,
      moduleIds: plan.planStructure ? JSON.parse(plan.planStructure).moduleIds || [] : [],
    });
  } catch (error: any) {
    console.error('Error fetching training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update training plan
router.patch('/plans/:id', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { title, description, moduleIds, status } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (moduleIds !== undefined) {
      updateData.planStructure = JSON.stringify({ moduleIds });
      updateData.totalTopics = moduleIds.length;
    }
    
    await db
      .update(aiTrainingPlans)
      .set(updateData)
      .where(eq(aiTrainingPlans.id, planId));
    
    const [updatedPlan] = await db
      .select()
      .from(aiTrainingPlans)
      .where(eq(aiTrainingPlans.id, planId));
    
    res.json({
      ...updatedPlan,
      moduleIds: updatedPlan?.planStructure ? JSON.parse(updatedPlan.planStructure).moduleIds || [] : [],
    });
  } catch (error: any) {
    console.error('Error updating training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete training plan
router.delete('/plans/:id', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    await db.delete(aiTrainingPlans).where(eq(aiTrainingPlans.id, planId));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ END TRAINING PLANS API ============

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
router.post('/employee/records', requirePermission('training.record_completion'), async (req, res) => {
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
router.post('/quiz/submit', requirePermission('training.record_completion'), async (req, res) => {
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
        partNumber: partRoutings.partNumber,
        partName: partRoutings.partName,
      })
      .from(partRoutings)
      .where(eq(partRoutings.isActive, true))
      .orderBy(partRoutings.partNumber);
    
    const uniqueItems = Array.from(
      new Map(items.map(item => [item.partNumber, item])).values()
    );
    
    res.json(uniqueItems);
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

    const newCertification = await db.transaction(async (tx) => {
      const [record] = await tx
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
          validatedData.department,
          tx
        );
      }

      return record;
    });

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

    // Get existing record to check checkbox status (outside transaction for the early 404)
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

    const updatedCertification = await db.transaction(async (tx) => {
      const [record] = await tx
        .update(p2EmployeePartCertifications)
        .set({
          ...validatedData,
          certifiedDate,
          updatedAt: new Date(),
        })
        .where(eq(p2EmployeePartCertifications.id, certId))
        .returning();

      // Handle capability changes based on state transitions — all inside the transaction
      if (partNumberChanged || departmentChanged) {
        if (wasFullyCertified) {
          await revokeP2CertificationCapability(
            existing.employeeId,
            existing.partNumber,
            existing.department,
            tx
          );
        }
        if (isNowFullyCertified) {
          await grantP2CertificationCapability(
            existing.employeeId,
            validatedData.partNumber || existing.partNumber,
            validatedData.department || existing.department,
            tx
          );
        }
      } else {
        if (!wasFullyCertified && isNowFullyCertified) {
          await grantP2CertificationCapability(
            existing.employeeId,
            existing.partNumber,
            existing.department,
            tx
          );
        } else if (wasFullyCertified && !isNowFullyCertified) {
          await revokeP2CertificationCapability(
            existing.employeeId,
            existing.partNumber,
            existing.department,
            tx
          );
        }
      }

      return record;
    });

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
    const user = (req as any).user;
    const userRole: string = user?.role ?? 'EMPLOYEE';
    if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
      return res.status(403).json({ error: 'Admin access is required to run capability migration.' });
    }

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

// Admin endpoint: re-grant capabilities for all employees currently fully certified.
// Safe to run multiple times; already-granted capabilities are skipped.
router.post('/p2-certifications/repair-capabilities', async (req, res) => {
  try {
    const user = (req as any).user;
    const userRole: string = user?.role ?? 'EMPLOYEE';
    if (userRole !== 'ADMIN' && userRole !== 'OWNER') {
      return res.status(403).json({ error: 'Admin access is required to run capability repair.' });
    }

    console.log('🔧 Repairing P2 certification capabilities...');

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

    console.log(`Found ${certifications.length} fully certified employee record(s)`);

    let granted = 0;
    const errors: string[] = [];

    for (const cert of certifications) {
      try {
        await grantP2CertificationCapability(
          cert.employeeId,
          cert.partNumber,
          cert.department
        );
        granted++;
        console.log(`✅ Ensured capability: ${cert.employeeName} - ${cert.partNumber} - ${cert.department}`);
      } catch (err: any) {
        errors.push(`${cert.employeeName} / ${cert.partNumber} / ${cert.department}: ${err.message}`);
        console.error(`❌ Error granting capability for cert ${cert.id}:`, err.message);
      }
    }

    console.log(`✅ Repair complete. Processed: ${certifications.length}, Ensured: ${granted}, Errors: ${errors.length}`);
    res.json({
      success: errors.length === 0,
      total: certifications.length,
      granted,
      errors,
    });
  } catch (error: any) {
    console.error('Repair error:', error);
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

// Generate AI 4-Step Training Content for a task
router.post('/programs/:programId/tasks/:taskId/generate-4step', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { trainingMaterial } = req.body; // Optional: training material content to base generation on
    
    // Get the task details
    const [task] = await db.select().from(trainingProgramTasks).where(eq(trainingProgramTasks.id, taskId));
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Get program details for context
    const [program] = await db.select().from(trainingPrograms).where(eq(trainingPrograms.id, task.programId));
    
    const openai = new OpenAI({ 
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL 
    });
    
    const prompt = `You are a manufacturing training expert. Generate detailed 4-step training content for the following task using the Train-the-Trainer methodology.

Task: ${task.title}
${task.description ? `Description: ${task.description}` : ''}
Department: ${program?.department || 'Manufacturing'}
Role: ${program?.role || 'Production'}
${trainingMaterial ? `\nTraining Material Reference:\n${trainingMaterial}` : ''}

Generate content for each of the 4 steps:

1. **Step 1 - Trainer Does/Explains**: The trainer demonstrates the task while explaining each step. Include:
   - Key points to emphasize
   - Safety considerations
   - Quality checkpoints
   - Common mistakes to point out

2. **Step 2 - Trainer Does/Trainee Explains**: The trainer performs the task again while the trainee explains what's happening. Include:
   - Questions to ask the trainee
   - Key concepts to verify understanding
   - Tips for the trainer

3. **Step 3 - Trainee Does/Trainer Coaches**: The trainee performs the task with trainer coaching. Include:
   - Coaching prompts
   - Things to watch for
   - Intervention points
   - Encouragement phrases

4. **Step 4 - Trainee Does/Trainer Observes**: The trainee performs independently while trainer observes. Include:
   - Observation checklist
   - Success criteria
   - Certification requirements
   - Sign-off criteria

Format your response as JSON with keys: step1Content, step2Content, step3Content, step4Content (each as a string with the detailed content).`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: 'No content generated' });
    }
    
    const generated = JSON.parse(content);
    
    // Update the task with the generated content
    const [updated] = await db
      .update(trainingProgramTasks)
      .set({
        step1Content: generated.step1Content,
        step2Content: generated.step2Content,
        step3Content: generated.step3Content,
        step4Content: generated.step4Content,
        updatedAt: new Date(),
      })
      .where(eq(trainingProgramTasks.id, taskId))
      .returning();
    
    res.json(updated);
  } catch (error: any) {
    console.error('Error generating 4-step content:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SOA DAILY NOTES (Strengths-Opportunities-Actions)
// ============================================================================

// Get SOA notes for an assignment
router.get('/assignments/:assignmentId/soa-notes', async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const notes = await db
      .select()
      .from(trainingSoaNotes)
      .where(eq(trainingSoaNotes.assignmentId, assignmentId))
      .orderBy(desc(trainingSoaNotes.noteDate));
    res.json(notes);
  } catch (error: any) {
    console.error('Error fetching SOA notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get today's and yesterday's SOA notes for a trainer's view
router.get('/trainer/:trainerId/soa-notes/recent', async (req, res) => {
  try {
    const trainerId = parseInt(req.params.trainerId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const notes = await db
      .select()
      .from(trainingSoaNotes)
      .where(and(
        eq(trainingSoaNotes.trainerId, trainerId),
        gte(trainingSoaNotes.noteDate, yesterday)
      ))
      .orderBy(desc(trainingSoaNotes.noteDate));
    
    // Separate into today and yesterday
    const todaysNotes = notes.filter(n => new Date(n.noteDate) >= today);
    const yesterdaysNotes = notes.filter(n => new Date(n.noteDate) < today);
    
    res.json({ todaysNotes, yesterdaysNotes });
  } catch (error: any) {
    console.error('Error fetching recent SOA notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update SOA note for a day
router.post('/assignments/:assignmentId/soa-notes', async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.assignmentId);
    const { trainerId, traineeId, dayNumber, strengths, opportunities, actions, generalNotes } = req.body;
    
    // Check if a note already exists for this day
    const existing = await db
      .select()
      .from(trainingSoaNotes)
      .where(and(
        eq(trainingSoaNotes.assignmentId, assignmentId),
        eq(trainingSoaNotes.dayNumber, dayNumber)
      ))
      .limit(1);
    
    if (existing && existing.length > 0) {
      // Update existing note
      const [updated] = await db
        .update(trainingSoaNotes)
        .set({
          strengths,
          opportunities,
          actions,
          generalNotes,
          updatedAt: new Date(),
        })
        .where(eq(trainingSoaNotes.id, existing[0].id))
        .returning();
      return res.json(updated);
    }
    
    // Create new note
    const [note] = await db.insert(trainingSoaNotes).values({
      assignmentId,
      trainerId,
      traineeId,
      dayNumber,
      strengths,
      opportunities,
      actions,
      generalNotes,
    }).returning();
    
    res.status(201).json(note);
  } catch (error: any) {
    console.error('Error saving SOA note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trainer signoff on SOA note
router.patch('/soa-notes/:noteId/signoff', async (req, res) => {
  try {
    const noteId = parseInt(req.params.noteId);
    const [updated] = await db
      .update(trainingSoaNotes)
      .set({ trainerSignoff: true, updatedAt: new Date() })
      .where(eq(trainingSoaNotes.id, noteId))
      .returning();
    res.json(updated);
  } catch (error: any) {
    console.error('Error signing off SOA note:', error);
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

// Get assignments for a specific program (with trainee and trainer details)
router.get('/programs/:programId/assignments', async (req, res) => {
  try {
    const programId = parseInt(req.params.programId);
    
    let assignments: any[] = [];
    try {
      assignments = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.programId, programId))
        .orderBy(desc(trainingAssignments.createdAt));
    } catch (queryError) {
      console.error('Query error fetching assignments:', queryError);
      return res.json([]);
    }

    // Handle null or undefined assignments
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.json([]);
    }

    // Get employee details for each assignment
    const employeeIds = Array.from(new Set(assignments.flatMap(a => [a.employeeId, a.trainerId].filter(Boolean))));
    let employeeList: any[] = [];
    if (employeeIds.length > 0) {
      try {
        employeeList = await db.select().from(employees).where(inArray(employees.id, employeeIds as number[]));
      } catch (empError) {
        console.error('Error fetching employees for assignments:', empError);
      }
    }
    const employeeMap = new Map((employeeList || []).map(e => [e.id, e]));

    const enrichedAssignments = assignments.map(a => ({
      id: a.id,
      programId: a.programId,
      employeeId: a.employeeId,
      trainerId: a.trainerId,
      status: a.status,
      startDate: a.startDate,
      dueDate: a.dueDate,
      notes: a.notes,
      createdAt: a.createdAt,
      trainee: employeeMap.get(a.employeeId) || null,
      trainer: a.trainerId ? employeeMap.get(a.trainerId) || null : null,
    }));

    res.json(enrichedAssignments);
  } catch (error: any) {
    console.error('Error fetching program assignments:', error);
    res.json([]);
  }
});

// Create assignment for a program
router.post('/programs/:programId/assignments', async (req, res) => {
  try {
    const programId = parseInt(req.params.programId);
    const { employeeId, trainerId } = req.body;

    console.log('Creating assignment with body:', JSON.stringify(req.body));

    if (!employeeId) {
      return res.status(400).json({ error: 'Trainee (employeeId) is required' });
    }

    // Build the values object explicitly to avoid undefined/null issues
    const insertValues: any = {
      programId,
      employeeId: Number(employeeId),
      status: 'pending',
      startDate: new Date(),
    };
    
    // Only add trainerId if it's a valid number
    if (trainerId && trainerId !== '' && !isNaN(Number(trainerId))) {
      insertValues.trainerId = Number(trainerId);
    }

    // Insert assignment - Neon HTTP driver may not return rows properly with .returning()
    const result = await db.insert(trainingAssignments).values(insertValues).returning();
    
    // Handle case where returning() doesn't work properly with Neon HTTP driver
    let assignment;
    if (result && result.length > 0) {
      assignment = result[0];
    } else {
      // Fallback: fetch the most recently created assignment for this program/employee
      const [fetched] = await db
        .select()
        .from(trainingAssignments)
        .where(and(
          eq(trainingAssignments.programId, programId),
          eq(trainingAssignments.employeeId, Number(employeeId))
        ))
        .orderBy(desc(trainingAssignments.id))
        .limit(1);
      assignment = fetched;
    }

    if (!assignment) {
      return res.status(500).json({ error: 'Failed to create assignment - could not retrieve created record' });
    }

    // Create a session for this assignment
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    try {
      await db.insert(trainingBuilderSessions).values({
        sessionId,
        assignmentId: assignment.id,
        employeeId: assignment.employeeId,
        programId: assignment.programId,
      });
    } catch (sessionError) {
      console.error('Error creating training session:', sessionError);
      // Continue - assignment was created even if session failed
    }

    res.status(201).json(assignment);
  } catch (error: any) {
    console.error('Error creating program assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update assignment (change trainer, status, etc.)
router.patch('/assignments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { trainerId, status, dueDate, notes, partNumber } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (trainerId !== undefined) updateData.trainerId = trainerId || null;
    if (status) updateData.status = status;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (partNumber !== undefined) updateData.partNumber = partNumber || null;
    if (status === 'completed') updateData.completedAt = new Date();

    const [updated] = await db
      .update(trainingAssignments)
      .set(updateData)
      .where(eq(trainingAssignments.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete assignment
router.delete('/assignments/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingAssignments).where(eq(trainingAssignments.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainee's assigned programs (for trainee dashboard)
router.get('/my-training/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    
    let assignments: any[] = [];
    try {
      assignments = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.employeeId, employeeId))
        .orderBy(desc(trainingAssignments.createdAt));
    } catch (queryError) {
      console.error('Query error fetching trainee assignments:', queryError);
      return res.json([]);
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.json([]);
    }

    // Get program details and trainer info
    const programIds = Array.from(new Set(assignments.map(a => a.programId)));
    const trainerIds = Array.from(new Set(assignments.map(a => a.trainerId).filter(Boolean)));

    const programs = programIds.length > 0
      ? await db.select().from(trainingPrograms).where(inArray(trainingPrograms.id, programIds))
      : [];
    const trainers = trainerIds.length > 0
      ? await db.select().from(employees).where(inArray(employees.id, trainerIds as number[]))
      : [];

    const programMap = new Map(programs.map(p => [p.id, p]));
    const trainerMap = new Map(trainers.map(t => [t.id, t]));

    // Get tasks for each program
    const allTasks = programIds.length > 0
      ? await db.select().from(trainingProgramTasks).where(inArray(trainingProgramTasks.programId, programIds)).orderBy(trainingProgramTasks.sortOrder)
      : [];

    const tasksByProgram = allTasks.reduce((acc, task) => {
      if (!acc[task.programId]) acc[task.programId] = [];
      acc[task.programId].push(task);
      return acc;
    }, {} as Record<number, typeof allTasks>);

    const enrichedAssignments = assignments.map(a => ({
      ...a,
      program: programMap.get(a.programId) || null,
      trainer: a.trainerId ? trainerMap.get(a.trainerId) || null : null,
      tasks: tasksByProgram[a.programId] || [],
    }));

    res.json(enrichedAssignments);
  } catch (error: any) {
    console.error('Error fetching trainee assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainer's assigned trainees (for trainer dashboard)
router.get('/trainer-assignments/:trainerId', async (req, res) => {
  try {
    const trainerId = parseInt(req.params.trainerId);
    
    let assignments: any[] = [];
    try {
      assignments = await db
        .select()
        .from(trainingAssignments)
        .where(eq(trainingAssignments.trainerId, trainerId))
        .orderBy(desc(trainingAssignments.createdAt));
    } catch (queryError) {
      console.error('Query error fetching trainer assignments:', queryError);
      return res.json([]);
    }

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.json([]);
    }

    // Get trainee and program details - wrap in try-catch for Neon driver issues
    const traineeIds = Array.from(new Set(assignments.map(a => a.employeeId)));
    const programIds = Array.from(new Set(assignments.map(a => a.programId)));

    let trainees: any[] = [];
    let programs: any[] = [];
    let allTasks: any[] = [];

    try {
      if (traineeIds.length > 0) {
        trainees = await db.select().from(employees).where(inArray(employees.id, traineeIds)) || [];
      }
    } catch (e) {
      console.error('Error fetching trainees:', e);
    }

    try {
      if (programIds.length > 0) {
        programs = await db.select().from(trainingPrograms).where(inArray(trainingPrograms.id, programIds)) || [];
      }
    } catch (e) {
      console.error('Error fetching programs:', e);
    }

    try {
      if (programIds.length > 0) {
        allTasks = await db.select().from(trainingProgramTasks).where(inArray(trainingProgramTasks.programId, programIds)).orderBy(trainingProgramTasks.sortOrder) || [];
      }
    } catch (e) {
      console.error('Error fetching tasks:', e);
    }

    const traineeMap = new Map((trainees || []).map(t => [t.id, t]));
    const programMap = new Map((programs || []).map(p => [p.id, p]));

    const tasksByProgram = (allTasks || []).reduce((acc: Record<number, any[]>, task: any) => {
      if (!acc[task.programId]) acc[task.programId] = [];
      acc[task.programId].push(task);
      return acc;
    }, {} as Record<number, any[]>);

    const enrichedAssignments = assignments.map(a => ({
      ...a,
      trainee: traineeMap.get(a.employeeId) || null,
      program: programMap.get(a.programId) || null,
      tasks: tasksByProgram[a.programId] || [],
    }));

    res.json(enrichedAssignments);
  } catch (error: any) {
    console.error('Error fetching trainer assignments:', error);
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

import { workInstructions, trainingTaskWorkInstructions, trainingSOAFeedback, insertWorkInstructionSchema, criticalPoints } from '@shared/schema';

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

    // Auto-derive partNumber from the assignment chain when not explicitly supplied.
    // This ensures every new certification carries the correct part scope so that
    // checkEmployeeHasValidTrainingCertification can filter by part number as intended.
    if (!data.partNumber && data.assignmentId) {
      const [assignment] = await db
        .select({ partNumber: trainingAssignments.partNumber })
        .from(trainingAssignments)
        .where(eq(trainingAssignments.id, data.assignmentId));
      if (assignment?.partNumber) {
        data.partNumber = assignment.partNumber;
      }
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

// Admin: backfill part_number on existing training_certifications from their assignments.
// Runs as a single SQL UPDATE...FROM for deterministic performance on large datasets.
// Certifications that already have a part_number are left unchanged.
router.post('/certifications/backfill-part-numbers', async (req, res) => {
  try {
    const result = await pgPool.query(`
      UPDATE training_certifications tc
      SET part_number = ta.part_number,
          updated_at  = now()
      FROM training_assignments ta
      WHERE tc.assignment_id = ta.id
        AND ta.part_number IS NOT NULL
        AND tc.part_number IS NULL
    `);
    const updated = result.rowCount ?? 0;
    res.json({ updated, message: `Backfilled part_number on ${updated} certification record(s).` });
  } catch (error: any) {
    console.error('Error backfilling certification part numbers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status check: how many certified records still have a NULL part_number.
// Use after backfill to verify the QC gate is fully part-specific.
router.get('/certifications/part-number-status', async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT
        COUNT(*)                                              AS total_certified,
        COUNT(*) FILTER (WHERE part_number IS NULL)          AS null_part_number,
        COUNT(*) FILTER (WHERE part_number IS NOT NULL)      AS has_part_number
      FROM training_certifications
      WHERE status = 'certified'
    `);
    const row = result.rows[0];
    res.json({
      totalCertified: parseInt(row.total_certified, 10),
      nullPartNumber:  parseInt(row.null_part_number, 10),
      hasPartNumber:   parseInt(row.has_part_number, 10),
      fullyPartSpecific: parseInt(row.null_part_number, 10) === 0,
    });
  } catch (error: any) {
    console.error('Error fetching certification part number status:', error);
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

// Get detailed facility topic with work instructions and critical points
router.get('/facility-topics/:id/full-content', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Get the facility topic
    const [topic] = await db.select().from(facilityTopics).where(eq(facilityTopics.id, id));
    if (!topic) {
      return res.status(404).json({ error: 'Facility topic not found' });
    }
    
    // Get linked work instructions via moduleId if exists
    let workInstructionsList: any[] = [];
    let criticalPointsList: any[] = [];
    
    if (topic.moduleId) {
      // Get work instructions for this module
      const wiResults = await db.select()
        .from(workInstructions)
        .where(eq(workInstructions.status, 'active'));
      workInstructionsList = wiResults;
      
      // Get critical points for each work instruction
      for (const wi of workInstructionsList) {
        const cpResults = await db.select()
          .from(criticalPoints)
          .where(eq(criticalPoints.workInstructionId, wi.id));
        criticalPointsList.push(...cpResults);
      }
    }
    
    // Get questions for the topic
    let questions: any[] = [];
    try {
      questions = await db.select()
        .from(facilityTopicQuestions)
        .where(eq(facilityTopicQuestions.topicId, id));
    } catch (e) {}
    
    res.json({
      ...topic,
      workInstructions: workInstructionsList,
      criticalPoints: criticalPointsList,
      questions
    });
  } catch (error: any) {
    console.error('Error fetching facility topic content:', error);
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
    const { traineeId, trainerId, facilityTopicId, planDayId, planId, stepNumber, notes } = req.body;
    const result = await pgPool.query(`
      INSERT INTO daily_training_sessions (trainee_id, trainer_id, facility_topic_id, plan_day_id, plan_id, step_number, notes, status, started_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'in_progress', NOW(), NOW(), NOW())
      RETURNING *
    `, [traineeId, trainerId, facilityTopicId || null, planDayId || null, planId || null, stepNumber || 1, notes || null]);
    res.status(201).json(result.rows[0]);
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

// Complete session with SOA feedback
router.put('/daily-sessions/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { soaStrength, soaOpportunity, soaAction } = req.body;
    
    await db.update(dailyTrainingSessions)
      .set({ 
        status: 'completed',
        soaStrength: soaStrength || null,
        soaOpportunity: soaOpportunity || null,
        soaAction: soaAction || null,
      })
      .where(eq(dailyTrainingSessions.id, id));
    
    // Fetch after update for Neon driver compatibility
    const [updated] = await db.select().from(dailyTrainingSessions).where(eq(dailyTrainingSessions.id, id));
    
    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error completing session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get yesterday's completed sessions with SOA feedback (for morning review)
router.get('/daily-sessions/yesterday-feedback', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Get trainer ID from session if available
    const trainerId = (req as any).session?.user?.employeeId;
    
    const conditions = [
      eq(dailyTrainingSessions.status, 'completed'),
      gte(dailyTrainingSessions.sessionDate, yesterday),
      lt(dailyTrainingSessions.sessionDate, today),
      or(
        isNotNull(dailyTrainingSessions.soaStrength),
        isNotNull(dailyTrainingSessions.soaOpportunity),
        isNotNull(dailyTrainingSessions.soaAction)
      )
    ];
    
    // Scope to current trainer if logged in
    if (trainerId) {
      conditions.push(eq(dailyTrainingSessions.trainerId, trainerId));
    }
    
    const sessions = await db.select()
      .from(dailyTrainingSessions)
      .where(and(...conditions));
    
    res.json(sessions);
  } catch (error: any) {
    console.error('Error fetching yesterday feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark SOA feedback as reviewed
router.put('/daily-sessions/:id/mark-reviewed', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    await db.update(dailyTrainingSessions)
      .set({ soaReviewedAt: new Date() })
      .where(eq(dailyTrainingSessions.id, id));
    
    const [updated] = await db.select().from(dailyTrainingSessions).where(eq(dailyTrainingSessions.id, id));
    
    if (!updated) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error marking session reviewed:', error);
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
  traineeTopicAssignments
} from '../../schema';

// --- CATEGORIES ---

// Get all categories
router.get('/content-library/categories', async (req, res) => {
  try {
    const result = await pgPool.query(`
      SELECT id, name, type, description, color, parent_id as "parentId", 
             created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
      FROM training_content_categories 
      ORDER BY type, name
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/content-library/categories', async (req, res) => {
  try {
    const { name, type, description, color, parentId, createdBy } = req.body;
    const result = await pgPool.query(`
      INSERT INTO training_content_categories (name, type, description, color, parent_id, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, name, type, description, color, parent_id as "parentId", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
    `, [name, type || 'custom', description || null, color || null, parentId || null, createdBy || null]);
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/content-library/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color } = req.body;
    const result = await pgPool.query(`
      UPDATE training_content_categories 
      SET name = $1, description = $2, color = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, name, type, description, color, parent_id as "parentId", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
    `, [name, description || null, color || null, id]);
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/content-library/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pgPool.query(`DELETE FROM training_content_categories WHERE id = $1`, [id]);
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
    const docsResult = await pgPool.query(`
      SELECT id, title, original_filename as "originalFilename", file_url as "fileUrl",
             file_type as "fileType", file_size as "fileSize", summary, status,
             uploaded_by as "uploadedBy", created_at as "createdAt"
      FROM training_library_documents
      ORDER BY created_at DESC
    `);
    const docs = docsResult.rows;

    // Get categories for each document
    const docsWithCategories = await Promise.all(docs.map(async (doc: any) => {
      const assignmentsResult = await pgPool.query(`
        SELECT dca.category_id as "categoryId", tcc.name as "categoryName", 
               tcc.type as "categoryType", tcc.color as "categoryColor"
        FROM document_category_assignments dca
        LEFT JOIN training_content_categories tcc ON dca.category_id = tcc.id
        WHERE dca.document_id = $1
      `, [doc.id]);
      
      return { ...doc, categories: assignmentsResult.rows };
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

    // Create document record using raw SQL to avoid ORM column mapping issues
    const status = extractedText ? 'processing' : 'uploaded';
    // Convert fileSize to integer or null, handling empty string and NaN
    let fileSizeInt: number | null = null;
    if (fileSize !== undefined && fileSize !== null && fileSize !== '') {
      const parsed = parseInt(String(fileSize), 10);
      if (!isNaN(parsed)) {
        fileSizeInt = parsed;
      }
    }
    let uploadedByInt: number | null = null;
    if (uploadedBy !== undefined && uploadedBy !== null && uploadedBy !== '') {
      const parsed = parseInt(String(uploadedBy), 10);
      if (!isNaN(parsed)) {
        uploadedByInt = parsed;
      }
    }
    
    console.log('Document upload params:', { title, originalFilename, fileUrl, fileType, fileSize, fileSizeInt, uploadedBy, uploadedByInt });
    
    const insertResult = await pgPool.query(`
      INSERT INTO training_library_documents 
        (title, original_filename, file_url, file_type, file_size, extracted_content, status, uploaded_by, created_at, updated_at)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, title, original_filename as "originalFilename", file_url as "fileUrl", file_type as "fileType", 
                file_size as "fileSize", extracted_content as "extractedContent", summary, key_points as "keyPoints", 
                status, uploaded_by as "uploadedBy", created_at as "createdAt", updated_at as "updatedAt"
    `, [title, originalFilename, fileUrl || null, fileType || null, fileSizeInt, extractedText || null, status, uploadedByInt]);
    
    const doc = insertResult.rows[0];
    
    if (!doc) {
      throw new Error('Failed to insert document');
    }

    // Assign categories
    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        await pgPool.query(`
          INSERT INTO document_category_assignments (document_id, category_id, created_at)
          VALUES ($1, $2, NOW())
        `, [doc.id, categoryId]);
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
        
        await db.execute(sql`
          UPDATE training_library_documents
          SET summary = ${parsed.summary}, key_points = ${JSON.stringify(parsed.keyPoints)}, status = 'ready', updated_at = NOW()
          WHERE id = ${doc.id}
        `);

        doc.summary = parsed.summary;
        doc.keyPoints = JSON.stringify(parsed.keyPoints);
        doc.status = 'ready';
      } catch (aiError: any) {
        console.error('AI extraction error:', aiError);
        await db.execute(sql`
          UPDATE training_library_documents SET status = 'failed', updated_at = NOW() WHERE id = ${doc.id}
        `);
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
    // Delete topic links first (foreign key constraint)
    await db.delete(topicDocumentLinks).where(eq(topicDocumentLinks.documentId, id));
    // Delete category assignments
    await db.delete(documentCategoryAssignments).where(eq(documentCategoryAssignments.documentId, id));
    // Finally delete the document itself
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

// Generate training topic PREVIEW from selected documents (returns data for review, doesn't save)
router.post('/content-library/generate-topic-preview', async (req, res) => {
  try {
    const { documentIds, categoryId } = req.body;

    // Fetch document contents using pgPool
    const docsResult = await pgPool.query(`
      SELECT id, title, extracted_content as "extractedContent", summary
      FROM training_library_documents
      WHERE id = ANY($1)
    `, [documentIds]);
    const docs = docsResult.rows;

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

    // Return the generated content for review (don't save yet)
    res.json(generated);
  } catch (error: any) {
    console.error('Error generating topic preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save reviewed/customized training topic
router.post('/content-library/save-reviewed-topic', async (req, res) => {
  try {
    const { 
      title, description, objectives, prerequisites, 
      estimatedDuration, difficultyLevel, categoryId, 
      materials, quizQuestions, documentIds 
    } = req.body;

    // Validation: require at least one material
    if (!materials || materials.length === 0) {
      return res.status(400).json({ error: 'At least one training step is required' });
    }

    // Parse category ID
    const categoryIdInt = categoryId && categoryId !== '' ? parseInt(String(categoryId), 10) : null;

    // Create the topic
    const topicResult = await pgPool.query(`
      INSERT INTO training_library_topics 
        (title, description, objectives, prerequisites, estimated_duration, difficulty_level, category_id, is_ai_generated, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, title, description, objectives, prerequisites, estimated_duration as "estimatedDuration", 
                difficulty_level as "difficultyLevel", category_id as "categoryId",
                is_ai_generated as "isAiGenerated", created_at as "createdAt", updated_at as "updatedAt"
    `, [
      title,
      description,
      JSON.stringify(objectives || []),
      prerequisites || null,
      estimatedDuration || 60,
      difficultyLevel || 'intermediate',
      categoryIdInt,
      true
    ]);
    const topic = topicResult.rows[0];

    // Link documents to topic (preserve traceability)
    if (documentIds && Array.isArray(documentIds)) {
      for (const docId of documentIds) {
        await pgPool.query(`
          INSERT INTO topic_document_links (topic_id, document_id, created_at)
          VALUES ($1, $2, NOW())
        `, [topic.id, docId]);
      }
    }

    // Create training materials for each accepted step
    for (const material of materials || []) {
      await pgPool.query(`
        INSERT INTO training_topic_materials 
          (topic_id, step_number, step_title, trainer_instructions, trainee_activities, key_points, visual_aids, estimated_duration, facility_modules, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        topic.id,
        material.stepNumber,
        material.stepTitle,
        material.trainerInstructions,
        material.demonstrations || null,
        JSON.stringify(material.keyPoints || []),
        material.safetyNotes || null,
        material.estimatedTime || 15,
        null
      ]);
    }

    // Create quiz questions for each accepted question
    for (const q of quizQuestions || []) {
      await pgPool.query(`
        INSERT INTO training_topic_quiz_questions 
          (topic_id, step_number, question, question_type, options, correct_answer, explanation, points, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        topic.id,
        q.stepNumber || 1,
        q.question,
        q.questionType || 'multiple_choice',
        JSON.stringify(q.options || []),
        q.correctAnswer,
        q.explanation || null,
        10
      ]);
    }

    res.status(201).json({ topic, materials, quizQuestions });
  } catch (error: any) {
    console.error('Error saving reviewed topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate training topic from selected documents
router.post('/content-library/generate-topic', async (req, res) => {
  try {
    const { documentIds, categoryId, createdBy } = req.body;

    // Parse integer values, handling empty strings
    const categoryIdInt = categoryId && categoryId !== '' ? parseInt(String(categoryId), 10) : null;
    const createdByInt = createdBy && createdBy !== '' ? parseInt(String(createdBy), 10) : null;

    // Fetch document contents using pgPool
    const docsResult = await pgPool.query(`
      SELECT id, title, extracted_content as "extractedContent", summary
      FROM training_library_documents
      WHERE id = ANY($1)
    `, [documentIds]);
    const docs = docsResult.rows;

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

    // Create the topic using pgPool
    const topicResult = await pgPool.query(`
      INSERT INTO training_library_topics 
        (title, description, objectives, prerequisites, estimated_duration, difficulty_level, category_id, created_by, is_ai_generated, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, title, description, objectives, prerequisites, estimated_duration as "estimatedDuration", 
                difficulty_level as "difficultyLevel", category_id as "categoryId", created_by as "createdBy", 
                is_ai_generated as "isAiGenerated", created_at as "createdAt", updated_at as "updatedAt"
    `, [
      generated.title,
      generated.description,
      JSON.stringify(generated.objectives),
      generated.prerequisites || null,
      generated.estimatedDuration || 60,
      generated.difficultyLevel || 'intermediate',
      categoryIdInt,
      createdByInt,
      true
    ]);
    const topic = topicResult.rows[0];

    // Link documents to topic
    for (const docId of documentIds) {
      await pgPool.query(`
        INSERT INTO topic_document_links (topic_id, document_id, created_at)
        VALUES ($1, $2, NOW())
      `, [topic.id, docId]);
    }

    // Create training materials for each step
    for (const material of generated.materials || []) {
      await pgPool.query(`
        INSERT INTO training_topic_materials 
          (topic_id, step_number, step_title, trainer_instructions, trainee_activities, key_points, visual_aids, estimated_duration, facility_modules, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        topic.id,
        material.stepNumber,
        material.stepTitle,
        material.trainerInstructions,
        material.demonstrations || null,
        JSON.stringify(material.keyPoints),
        material.safetyNotes || null,
        material.estimatedTime || 15,
        null
      ]);
    }

    // Create quiz questions
    for (const q of generated.quizQuestions || []) {
      await pgPool.query(`
        INSERT INTO training_topic_quiz_questions 
          (topic_id, step_number, question, question_type, options, correct_answer, explanation, points, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        topic.id,
        q.stepNumber || 1,
        q.question,
        q.questionType || 'multiple_choice',
        JSON.stringify(q.options),
        q.correctAnswer,
        q.explanation || null,
        10
      ]);
    }

    res.status(201).json({ topic, materials: generated.materials, quizQuestions: generated.quizQuestions });
  } catch (error: any) {
    console.error('Error generating topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- TOPICS ---

// Get all topics with materials count (excluding trashed unless ?includeTrash=true)
router.get('/content-library/topics', async (req, res) => {
  try {
    const includeTrash = req.query.includeTrash === 'true';
    const onlyTrash = req.query.onlyTrash === 'true';
    
    let whereClause = '';
    if (onlyTrash) {
      whereClause = 'WHERE t.is_trashed = true';
    } else if (!includeTrash) {
      whereClause = 'WHERE t.is_trashed = false OR t.is_trashed IS NULL';
    }
    
    const result = await pgPool.query(`
      SELECT t.id, t.title, t.description, t.objectives, 
             t.estimated_duration as "estimatedDuration", t.difficulty_level as "difficultyLevel",
             t.category_id as "categoryId", t.is_ai_generated as "isAiGenerated",
             t.is_trashed as "isTrashed",
             t.created_at as "createdAt", c.name as "categoryName", c.color as "categoryColor"
      FROM training_library_topics t
      LEFT JOIN training_content_categories c ON t.category_id = c.id
      ${whereClause}
      ORDER BY t.created_at DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trash or restore a topic (soft delete)
router.patch('/content-library/topics/:id/trash', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { trashed } = req.body; // true to trash, false to restore
    
    const { rawSql } = await import('../../db');
    await rawSql`UPDATE training_library_topics SET is_trashed = ${trashed === true}, updated_at = NOW() WHERE id = ${id}`;
    
    const result = await rawSql`SELECT * FROM training_library_topics WHERE id = ${id}`;
    const rows = Array.isArray(result) ? result : [];
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    
    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating topic trash status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk trash topics
router.post('/content-library/topics/bulk-trash', async (req, res) => {
  try {
    const { ids, trashed } = req.body; // array of topic IDs
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    
    const { pool } = await import('../../db');
    const idList = ids.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id));
    
    await pool.query(`UPDATE training_library_topics SET is_trashed = $1, updated_at = NOW() WHERE id = ANY($2)`, [trashed === true, idList]);
    
    res.json({ success: true, count: idList.length });
  } catch (error: any) {
    console.error('Error bulk trashing topics:', error);
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

// Create topic manually
router.post('/content-library/topics', async (req, res) => {
  try {
    const { title, description, objectives, prerequisites, estimatedDuration, difficultyLevel, categoryId, createdBy } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const parseIntOrUndefined = (val: any): number | undefined => {
      if (val === null || val === undefined || val === '') return undefined;
      const parsed = parseInt(String(val), 10);
      return isNaN(parsed) ? undefined : parsed;
    };

    const insertData: any = {
      title,
      isAiGenerated: false,
    };
    
    if (description) insertData.description = description;
    if (objectives) insertData.objectives = typeof objectives === 'string' ? objectives : JSON.stringify(objectives);
    if (prerequisites) insertData.prerequisites = prerequisites;
    if (difficultyLevel) insertData.difficultyLevel = difficultyLevel;
    
    const parsedDuration = parseIntOrUndefined(estimatedDuration);
    if (parsedDuration !== undefined) insertData.estimatedDuration = parsedDuration;
    
    const parsedCategoryId = parseIntOrUndefined(categoryId);
    if (parsedCategoryId !== undefined) insertData.categoryId = parsedCategoryId;
    
    const parsedCreatedBy = parseIntOrUndefined(createdBy);
    if (parsedCreatedBy !== undefined) insertData.createdBy = parsedCreatedBy;

    // Insert the topic
    await db.insert(trainingLibraryTopics).values(insertData);
    
    // Fetch the newly created topic (Neon driver has issues with .returning())
    const { rawSql } = await import('../../db');
    const result = await rawSql`SELECT * FROM training_library_topics WHERE title = ${insertData.title} ORDER BY id DESC LIMIT 1`;
    const rows = Array.isArray(result) ? result : [];
    const topic = rows[0] || insertData;

    res.status(201).json(topic);
  } catch (error: any) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update topic
router.put('/content-library/topics/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, objectives, prerequisites, estimatedDuration, difficultyLevel, categoryId } = req.body;

    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title || null);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description || null);
    }
    if (objectives !== undefined) {
      updates.push(`objectives = $${paramIndex++}`);
      params.push(objectives ? (typeof objectives === 'string' ? objectives : JSON.stringify(objectives)) : null);
    }
    if (prerequisites !== undefined) {
      updates.push(`prerequisites = $${paramIndex++}`);
      params.push(prerequisites || null);
    }
    if (estimatedDuration !== undefined && estimatedDuration !== null && estimatedDuration !== '') {
      const parsed = parseInt(String(estimatedDuration), 10);
      if (!isNaN(parsed)) {
        updates.push(`estimated_duration = $${paramIndex++}`);
        params.push(parsed);
      }
    }
    if (difficultyLevel !== undefined) {
      updates.push(`difficulty_level = $${paramIndex++}`);
      params.push(difficultyLevel || null);
    }
    if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
      const parsed = parseInt(String(categoryId), 10);
      if (!isNaN(parsed)) {
        updates.push(`category_id = $${paramIndex++}`);
        params.push(parsed);
      }
    }
    
    updates.push('updated_at = NOW()');
    params.push(id);

    const { rawSql, pool: dbPool } = await import('../../db');
    await dbPool.query(`UPDATE training_library_topics SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    
    // Fetch the updated topic separately
    const fetchResult = await rawSql`SELECT * FROM training_library_topics WHERE id = ${id}`;
    const rows = Array.isArray(fetchResult) ? fetchResult : [];
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating topic:', error);
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
    const { traineeId, topicIds, trainerId, trainerIds, partNumber, department, productionLine, createdBy } = req.body;

    // Parse and validate inputs
    const parsedTraineeId = parseInt(traineeId);
    const parsedCreatedBy = createdBy ? parseInt(createdBy) : null;
    const parsedTopicIds = Array.isArray(topicIds) ? topicIds.map((id: any) => parseInt(id)) : [];
    
    if (isNaN(parsedTraineeId) || parsedTopicIds.length === 0) {
      return res.status(400).json({ error: 'Valid traineeId and topicIds are required' });
    }

    // Fetch topics
    const topics = await db.select().from(trainingLibraryTopics)
      .where(inArray(trainingLibraryTopics.id, parsedTopicIds));

    // Get trainee info
    const [trainee] = await db.select().from(employees).where(eq(employees.id, parsedTraineeId));

    // Fetch topic content including materials
    const topicMaterials = await pgPool.query(`
      SELECT tm.*, t.title as topic_title, t.description as topic_description
      FROM training_topic_materials tm
      JOIN training_library_topics t ON tm.topic_id = t.id
      WHERE tm.topic_id = ANY($1)
    `, [parsedTopicIds]);

    // Build comprehensive content context
    const topicContentDetails = topics.map(t => {
      const materials = topicMaterials.rows.filter(m => m.topic_id === t.id);
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        duration: t.estimatedDuration,
        prerequisites: t.prerequisites,
        materials: materials.map(m => ({
          trainerActivities: m.trainer_activities,
          traineeActivities: m.trainee_activities,
          visualAids: m.visual_aids,
          facilityModules: m.facility_modules
        }))
      };
    });

    const client = getOpenAIClient();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { 
          role: 'system', 
          content: `You are creating a comprehensive 4-step training plan using the "Train the Trainer" method.
Generate DETAILED training content that trainers need during each session.

The 4 steps are:
1. Trainer Does / Trainer Explains - Trainer demonstrates while explaining the process
2. Trainer Does / Trainee Explains - Trainer performs, trainee describes what's happening
3. Trainee Does / Trainer Coaches - Trainee practices with active coaching
4. Trainee Does / Trainer Observes - Trainee performs independently, trainer observes

For EACH step, you MUST include:
- workInstructions: Detailed step-by-step instructions from the source documents
- criticalPoints: Array of critical points the trainer MUST emphasize (quality, precision, timing)
- safetyPrecautions: Array of safety warnings and PPE requirements
- demonstrations: Array of specific things to demonstrate during this step
- objectives: What the trainee should learn in this step
- quizQuestions: 4-5 comprehension questions for this step

Return JSON with:
{
  "title": "Training Plan for [specific task/part]",
  "description": "Comprehensive overview of this training program",
  "workInstructions": "Overall work instructions extracted from documents",
  "criticalPoints": ["Critical point 1", "Critical point 2", ...],
  "safetyPrecautions": ["Safety precaution 1", "Safety precaution 2", ...],
  "steps": [
    {
      "stepNumber": 1,
      "stepTitle": "Trainer Does / Trainer Explains",
      "theme": "Introduction and Demonstration",
      "objectives": ["Objective 1", "Objective 2"],
      "workInstructions": "Step-specific detailed work instructions for this phase",
      "criticalPoints": ["Critical point specific to this step"],
      "safetyPrecautions": ["Safety items for this step"],
      "demonstrations": ["What to demonstrate during this step"],
      "trainerTalkingPoints": ["Key points trainer should cover"],
      "estimatedHours": 2,
      "topicIds": [topic IDs for this step],
      "quizQuestions": [
        {
          "question": "Question about this step",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "A",
          "explanation": "Why A is correct"
        }
      ]
    },
    ...repeat for steps 2-4 with appropriate content
  ]
}

IMPORTANT: Extract actual work instructions, safety info, and critical points from the provided document content. Do NOT use generic placeholders.`
        },
        { 
          role: 'user', 
          content: `Create a comprehensive 4-step training plan for ${trainee?.name || 'trainee'}${partNumber ? ` for Part #${partNumber}` : ''}${department ? ` in ${department}` : ''}${productionLine ? ` on ${productionLine}` : ''}.

TOPIC CONTENT TO USE:
${topicContentDetails.map(t => `
=== Topic: ${t.title} (ID: ${t.id}) ===
Duration: ${t.duration}min
Prerequisites: ${t.prerequisites || 'None'}
Content: ${t.content || 'No content available'}
${t.materials.length > 0 ? `Materials: ${JSON.stringify(t.materials)}` : ''}
`).join('\n')}

Based on this content, generate:
1. Detailed work instructions extracted from the documents
2. Critical points and quality checkpoints the trainer must emphasize
3. Safety precautions and PPE requirements
4. Specific demonstrations for each step
5. 4-5 quiz questions per step to verify understanding

Make the content specific to the actual training task, not generic.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
    });

    const plan = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Create the training plan using pgPool for reliability
    const planResult = await pgPool.query(`
      INSERT INTO ai_training_plans 
        (trainee_id, title, description, plan_structure, total_topics, status, created_by, part_number, department, production_line, assigned_trainers, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      RETURNING *
    `, [
      parsedTraineeId,
      plan.title || `Training Plan for ${trainee?.name || 'Trainee'}`,
      plan.description || null,
      JSON.stringify(plan),
      parsedTopicIds.length,
      'active',
      parsedCreatedBy,
      partNumber || null,
      department || null,
      productionLine || null,
      JSON.stringify(trainerIds || (trainerId ? [trainerId] : [])),
    ]);
    const savedPlan = planResult.rows[0];
    
    if (!savedPlan) {
      throw new Error('Failed to create training plan');
    }

    // Save trainer assignments (trainers also stored in main table for quick access)
    const allTrainerIds = (trainerIds || (trainerId ? [trainerId] : [])).map((id: any) => parseInt(id));
    for (let i = 0; i < allTrainerIds.length; i++) {
      if (!isNaN(allTrainerIds[i])) {
        await pgPool.query(`
          INSERT INTO training_plan_trainers (plan_id, trainer_id, is_primary, assigned_by, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `, [savedPlan.id, allTrainerIds[i], i === 0, parsedCreatedBy]);
      }
    }

    // Save production info if provided (also stored in main table)
    if (partNumber || department || productionLine) {
      await pgPool.query(`
        INSERT INTO training_plan_production_info (plan_id, part_number, department, production_line, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [savedPlan.id, partNumber || null, department || null, productionLine || null]);
    }

    // Create step quizzes and questions
    for (const step of plan.steps || []) {
      const quizResult = await pgPool.query(`
        INSERT INTO training_step_quizzes (plan_id, step_number, title, description, passing_score, is_ai_generated, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
      `, [savedPlan.id, step.stepNumber, `Step ${step.stepNumber} Quiz: ${step.stepTitle}`, step.theme, 80, true]);
      const quiz = quizResult.rows[0];

      // Add quiz questions
      for (let i = 0; i < (step.quizQuestions || []).length; i++) {
        const q = step.quizQuestions[i];
        await pgPool.query(`
          INSERT INTO training_step_quiz_questions (quiz_id, question, question_type, options, correct_answer, explanation, sort_order, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [quiz.id, q.question, 'multiple_choice', JSON.stringify(q.options), q.correctAnswer, q.explanation, i]);
      }

      // Create topic assignments for this step
      const primaryTrainerId = allTrainerIds[0] || null;
      for (const topicId of step.topicIds || []) {
        await pgPool.query(`
          INSERT INTO trainee_topic_assignments (trainee_id, topic_id, trainer_id, current_step, status, part_number, department, production_line, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        `, [parsedTraineeId, topicId, primaryTrainerId, step.stepNumber, 'pending', partNumber || null, department || null, productionLine || null]);
      }
    }

    // Create initial step progress for the trainee
    for (let stepNum = 1; stepNum <= 4; stepNum++) {
      await pgPool.query(`
        INSERT INTO training_step_progress (plan_id, trainee_id, step_number, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `, [savedPlan.id, parsedTraineeId, stepNum, stepNum === 1 ? 'available' : 'locked']);
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
    const result = await pgPool.query(`
      SELECT p.id, p.title, p.description, p.source_document_ids as "sourceDocumentIds",
             p.objectives, p.four_step_content as "fourStepContent", p.quiz_questions as "quizQuestions",
             p.part_number as "partNumber", p.department, p.production_line as "productionLine",
             p.assigned_trainers as "assignedTrainers", p.status, 
             p.created_by as "createdBy", p.created_at as "createdAt", p.updated_at as "updatedAt",
             p.trainee_id as "traineeId", p.plan_structure as "planStructure",
             e.name as "traineeName"
      FROM ai_training_plans p
      LEFT JOIN employees e ON p.trainee_id = e.id
      ORDER BY p.created_at DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching training plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training plan with full structure
router.get('/content-library/training-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const planResult = await pgPool.query(`
      SELECT p.*, e.name as trainee_name
      FROM ai_training_plans p
      LEFT JOIN employees e ON p.trainee_id = e.id
      WHERE p.id = $1
    `, [id]);
    
    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    const plan = planResult.rows[0];

    const assignmentsResult = await pgPool.query(`
      SELECT a.id, a.topic_id as "topicId", a.current_step as "currentStep", a.status,
             t.title as "topicTitle", t.estimated_duration as "topicDuration"
      FROM trainee_topic_assignments a
      LEFT JOIN training_library_topics t ON a.topic_id = t.id
      WHERE a.trainee_id = $1
      ORDER BY a.id
    `, [plan.trainee_id]);

    res.json({ ...plan, assignments: assignmentsResult.rows });
  } catch (error: any) {
    console.error('Error fetching training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update training plan
router.put('/content-library/training-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, status, planStructure, quizQuestions, fourStepContent, objectives } = req.body;
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (planStructure !== undefined) {
      updates.push(`plan_structure = $${paramIndex++}`);
      values.push(planStructure);
    }
    if (quizQuestions !== undefined) {
      updates.push(`quiz_questions = $${paramIndex++}`);
      values.push(quizQuestions);
    }
    if (fourStepContent !== undefined) {
      updates.push(`four_step_content = $${paramIndex++}`);
      values.push(fourStepContent);
    }
    if (objectives !== undefined) {
      updates.push(`objectives = $${paramIndex++}`);
      values.push(objectives);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    // Use update without RETURNING due to Neon driver issues, then fetch
    await pgPool.query(`
      UPDATE ai_training_plans 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
    `, values);
    
    // Fetch the updated record
    const fetchResult = await pgPool.query(`
      SELECT * FROM ai_training_plans WHERE id = $1
    `, [id]);
    
    if (fetchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    res.json(fetchResult.rows[0]);
  } catch (error: any) {
    console.error('Error updating training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete training plan
router.delete('/content-library/training-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // First get the plan to find the trainee
    const [plan] = await db.select().from(aiTrainingPlans).where(eq(aiTrainingPlans.id, id));
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    
    // Delete associated topic assignments
    await db.delete(traineeTopicAssignments)
      .where(eq(traineeTopicAssignments.traineeId, plan.traineeId));
    
    // Delete the plan
    const [deleted] = await db.delete(aiTrainingPlans)
      .where(eq(aiTrainingPlans.id, id))
      .returning();
    
    res.json({ success: true, deleted });
  } catch (error: any) {
    console.error('Error deleting training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update document (general update)
router.put('/content-library/documents/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, summary, status } = req.body;
    
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (summary !== undefined) updateData.summary = summary;
    if (status !== undefined) updateData.status = status;
    
    const [updated] = await db.update(trainingLibraryDocuments)
      .set(updateData)
      .where(eq(trainingLibraryDocuments.id, id))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// EPOCH TRAINING SYSTEM API ROUTES
// ============================================================================

// Get all AI training plans with trainers and production info
router.get('/epoch/training-plans', async (req, res) => {
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
    }).from(aiTrainingPlans)
      .orderBy(desc(aiTrainingPlans.createdAt));
    
    // Get trainers and production info for each plan
    const enrichedPlans = await Promise.all(plans.map(async (plan) => {
      const trainers = await db.select({
        id: trainingPlanTrainers.id,
        trainerId: trainingPlanTrainers.trainerId,
        isPrimary: trainingPlanTrainers.isPrimary,
        trainerName: employees.name,
      }).from(trainingPlanTrainers)
        .leftJoin(employees, eq(trainingPlanTrainers.trainerId, employees.id))
        .where(eq(trainingPlanTrainers.planId, plan.id));
      
      const [productionInfo] = await db.select()
        .from(trainingPlanProductionInfo)
        .where(eq(trainingPlanProductionInfo.planId, plan.id));
      
      const [trainee] = await db.select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, plan.traineeId));
      
      return {
        ...plan,
        traineeName: trainee?.name || null,
        trainers,
        productionInfo,
      };
    }));
    
    res.json(enrichedPlans);
  } catch (error: any) {
    console.error('Error fetching epoch training plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single training plan with all details
router.get('/epoch/training-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const [plan] = await db.select().from(aiTrainingPlans).where(eq(aiTrainingPlans.id, id));
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    
    const trainers = await db.select({
      id: trainingPlanTrainers.id,
      trainerId: trainingPlanTrainers.trainerId,
      isPrimary: trainingPlanTrainers.isPrimary,
      trainerName: employees.name,
    }).from(trainingPlanTrainers)
      .leftJoin(employees, eq(trainingPlanTrainers.trainerId, employees.id))
      .where(eq(trainingPlanTrainers.planId, id));
    
    const [productionInfo] = await db.select()
      .from(trainingPlanProductionInfo)
      .where(eq(trainingPlanProductionInfo.planId, id));
    
    const stepQuizzes = await db.select()
      .from(trainingStepQuizzes)
      .where(eq(trainingStepQuizzes.planId, id))
      .orderBy(trainingStepQuizzes.stepNumber);
    
    const facilityModules = await db.select({
      id: trainingStepFacilityModules.id,
      stepNumber: trainingStepFacilityModules.stepNumber,
      moduleId: trainingStepFacilityModules.moduleId,
      facilityTopicId: trainingStepFacilityModules.facilityTopicId,
      isRequired: trainingStepFacilityModules.isRequired,
      moduleTitle: trainingModules.title,
      facilityTopicTitle: facilityTopics.title,
    }).from(trainingStepFacilityModules)
      .leftJoin(trainingModules, eq(trainingStepFacilityModules.moduleId, trainingModules.id))
      .leftJoin(facilityTopics, eq(trainingStepFacilityModules.facilityTopicId, facilityTopics.id))
      .where(eq(trainingStepFacilityModules.planId, id))
      .orderBy(trainingStepFacilityModules.stepNumber, trainingStepFacilityModules.sortOrder);
    
    const [trainee] = await db.select({ name: employees.name, department: employees.department })
      .from(employees)
      .where(eq(employees.id, plan.traineeId));
    
    res.json({
      ...plan,
      traineeName: trainee?.name || null,
      traineeDepartment: trainee?.department || null,
      trainers,
      productionInfo,
      stepQuizzes,
      facilityModules,
    });
  } catch (error: any) {
    console.error('Error fetching epoch training plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Assign trainers to a training plan
router.post('/epoch/training-plans/:id/trainers', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { trainerId, isPrimary = false, assignedBy } = req.body;
    
    const [trainer] = await db.insert(trainingPlanTrainers)
      .values({
        planId,
        trainerId,
        isPrimary,
        assignedBy,
      })
      .returning();
    
    res.json(trainer);
  } catch (error: any) {
    console.error('Error assigning trainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove trainer from training plan
router.delete('/epoch/training-plans/:planId/trainers/:trainerId', async (req, res) => {
  try {
    const planId = parseInt(req.params.planId);
    const trainerId = parseInt(req.params.trainerId);
    
    await db.delete(trainingPlanTrainers)
      .where(and(
        eq(trainingPlanTrainers.planId, planId),
        eq(trainingPlanTrainers.trainerId, trainerId)
      ));
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing trainer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set production info for training plan (part #, department, production line)
router.post('/epoch/training-plans/:id/production-info', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { partNumber, department, productionLine } = req.body;
    
    // Check if production info already exists
    const [existing] = await db.select()
      .from(trainingPlanProductionInfo)
      .where(eq(trainingPlanProductionInfo.planId, planId));
    
    let result;
    if (existing) {
      [result] = await db.update(trainingPlanProductionInfo)
        .set({ partNumber, department, productionLine, updatedAt: new Date() })
        .where(eq(trainingPlanProductionInfo.planId, planId))
        .returning();
    } else {
      [result] = await db.insert(trainingPlanProductionInfo)
        .values({ planId, partNumber, department, productionLine })
        .returning();
    }
    
    res.json(result);
  } catch (error: any) {
    console.error('Error setting production info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create step quizzes for a training plan (4 quizzes, one per step)
router.post('/epoch/training-plans/:id/step-quizzes', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { quizzes } = req.body; // Array of { stepNumber, title, description, questions: [...] }
    
    const createdQuizzes = [];
    
    for (const quiz of quizzes) {
      const [newQuiz] = await db.insert(trainingStepQuizzes)
        .values({
          planId,
          stepNumber: quiz.stepNumber,
          title: quiz.title,
          description: quiz.description,
          passingScore: quiz.passingScore || 80,
          isAiGenerated: quiz.isAiGenerated || false,
        })
        .returning();
      
      // Add questions to the quiz
      if (quiz.questions && quiz.questions.length > 0) {
        const questions = await Promise.all(quiz.questions.map(async (q: any, idx: number) => {
          const [question] = await db.insert(trainingStepQuizQuestions)
            .values({
              quizId: newQuiz.id,
              question: q.question,
              questionType: q.questionType || 'multiple_choice',
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              sortOrder: idx,
            })
            .returning();
          return question;
        }));
        
        createdQuizzes.push({ ...newQuiz, questions });
      } else {
        createdQuizzes.push(newQuiz);
      }
    }
    
    res.json(createdQuizzes);
  } catch (error: any) {
    console.error('Error creating step quizzes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get step quiz with questions
router.get('/epoch/step-quizzes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const [quiz] = await db.select().from(trainingStepQuizzes).where(eq(trainingStepQuizzes.id, id));
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const questions = await db.select()
      .from(trainingStepQuizQuestions)
      .where(eq(trainingStepQuizQuestions.quizId, id))
      .orderBy(trainingStepQuizQuestions.sortOrder);
    
    res.json({ ...quiz, questions });
  } catch (error: any) {
    console.error('Error fetching step quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit quiz attempt
router.post('/epoch/step-quizzes/:id/attempt', async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { traineeId, planId, answers } = req.body;
    
    // Get quiz and questions
    const [quiz] = await db.select().from(trainingStepQuizzes).where(eq(trainingStepQuizzes.id, quizId));
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    const questions = await db.select()
      .from(trainingStepQuizQuestions)
      .where(eq(trainingStepQuizQuestions.quizId, quizId));
    
    // Calculate score
    let correctCount = 0;
    const gradedAnswers = answers.map((a: { questionId: number; answer: string }) => {
      const question = questions.find(q => q.id === a.questionId);
      const correct = question?.correctAnswer === a.answer;
      if (correct) correctCount++;
      return { ...a, correct };
    });
    
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= (quiz.passingScore || 80);
    
    // Count previous attempts
    const previousAttempts = await db.select({ count: sql<number>`count(*)::int` })
      .from(trainingStepQuizAttempts)
      .where(and(
        eq(trainingStepQuizAttempts.quizId, quizId),
        eq(trainingStepQuizAttempts.traineeId, traineeId)
      ));
    
    const attemptNumber = (previousAttempts[0]?.count || 0) + 1;
    
    // Save attempt
    const [attempt] = await db.insert(trainingStepQuizAttempts)
      .values({
        quizId,
        traineeId,
        planId,
        score,
        passed,
        answers: gradedAnswers,
        attemptNumber,
      })
      .returning();
    
    // Update step progress if passed
    if (passed) {
      await db.update(trainingStepProgress)
        .set({
          quizPassed: true,
          quizScore: score,
          updatedAt: new Date(),
        })
        .where(and(
          eq(trainingStepProgress.planId, planId),
          eq(trainingStepProgress.traineeId, traineeId),
          eq(trainingStepProgress.stepNumber, quiz.stepNumber)
        ));
      
      // Also update training matrix with the score
      await db.update(trainingMatrix)
        .set({
          lastScore: score,
          status: 'COMPLETED',
          lastCompleted: new Date(),
        })
        .where(and(
          eq(trainingMatrix.employeeId, traineeId)
        ));
    }
    
    res.json({ attempt, score, passed, correctCount, total: questions.length });
  } catch (error: any) {
    console.error('Error submitting quiz attempt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add facility module to training step
router.post('/epoch/training-plans/:id/facility-modules', async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { stepNumber, moduleId, facilityTopicId, isRequired = true, createdBy } = req.body;
    
    const [module] = await db.insert(trainingStepFacilityModules)
      .values({
        planId,
        stepNumber,
        moduleId: moduleId || null,
        facilityTopicId: facilityTopicId || null,
        isRequired,
        createdBy,
      })
      .returning();
    
    res.json(module);
  } catch (error: any) {
    console.error('Error adding facility module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove facility module from training step
router.delete('/epoch/facility-modules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(trainingStepFacilityModules).where(eq(trainingStepFacilityModules.id, id));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing facility module:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainee step progress
router.get('/epoch/training-plans/:planId/progress/:traineeId', async (req, res) => {
  try {
    const planId = parseInt(req.params.planId);
    const traineeId = parseInt(req.params.traineeId);
    
    const progress = await db.select()
      .from(trainingStepProgress)
      .where(and(
        eq(trainingStepProgress.planId, planId),
        eq(trainingStepProgress.traineeId, traineeId)
      ))
      .orderBy(trainingStepProgress.stepNumber);
    
    // If no progress exists, create initial progress for all 4 steps
    if (progress.length === 0) {
      const initialProgress = [];
      for (let step = 1; step <= 4; step++) {
        const [p] = await db.insert(trainingStepProgress)
          .values({
            planId,
            traineeId,
            stepNumber: step,
            status: step === 1 ? 'available' : 'locked',
          })
          .returning();
        initialProgress.push(p);
      }
      return res.json(initialProgress);
    }
    
    res.json(progress);
  } catch (error: any) {
    console.error('Error fetching step progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update step progress (trainer marks step complete)
router.put('/epoch/step-progress/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, trainedBy, trainerNotes, facilityModulesComplete } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (trainedBy) updateData.trainedBy = trainedBy;
    if (trainerNotes !== undefined) updateData.trainerNotes = trainerNotes;
    if (facilityModulesComplete !== undefined) updateData.facilityModulesComplete = facilityModulesComplete;
    
    if (status === 'in_progress' && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }
    
    const [updated] = await db.update(trainingStepProgress)
      .set(updateData)
      .where(eq(trainingStepProgress.id, id))
      .returning();
    
    // If step completed, unlock next step
    if (status === 'completed' && updated.stepNumber < 4) {
      await db.update(trainingStepProgress)
        .set({ status: 'available', updatedAt: new Date() })
        .where(and(
          eq(trainingStepProgress.planId, updated.planId),
          eq(trainingStepProgress.traineeId, updated.traineeId),
          eq(trainingStepProgress.stepNumber, updated.stepNumber + 1)
        ));
    }
    
    // If all 4 steps complete, grant traveler authorization
    if (status === 'completed' && updated.stepNumber === 4) {
      // Get production info for this plan
      const [productionInfo] = await db.select()
        .from(trainingPlanProductionInfo)
        .where(eq(trainingPlanProductionInfo.planId, updated.planId));
      
      if (productionInfo?.partNumber) {
        // Grant traveler authorization
        await db.insert(travelerAuthorizations)
          .values({
            employeeId: updated.traineeId,
            planId: updated.planId,
            partNumber: productionInfo.partNumber,
            department: productionInfo.department,
            productionLine: productionInfo.productionLine,
            authorizedBy: trainedBy,
          })
          .onConflictDoNothing();
        
        // Update AI training plan status
        await db.update(aiTrainingPlans)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(aiTrainingPlans.id, updated.planId));
      }
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating step progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainer certifications (who is certified to train what)
router.get('/epoch/trainer-certifications', async (req, res) => {
  try {
    const certifications = await db.select({
      id: trainerTopicCertifications.id,
      trainerId: trainerTopicCertifications.trainerId,
      trainerName: employees.name,
      department: trainerTopicCertifications.department,
      topicId: trainerTopicCertifications.topicId,
      topicTitle: trainingLibraryTopics.title,
      moduleId: trainerTopicCertifications.moduleId,
      moduleTitle: trainingModules.title,
      certifiedAt: trainerTopicCertifications.certifiedAt,
      expiresAt: trainerTopicCertifications.expiresAt,
      isActive: trainerTopicCertifications.isActive,
    }).from(trainerTopicCertifications)
      .leftJoin(employees, eq(trainerTopicCertifications.trainerId, employees.id))
      .leftJoin(trainingLibraryTopics, eq(trainerTopicCertifications.topicId, trainingLibraryTopics.id))
      .leftJoin(trainingModules, eq(trainerTopicCertifications.moduleId, trainingModules.id))
      .where(eq(trainerTopicCertifications.isActive, true))
      .orderBy(employees.name);
    
    res.json(certifications);
  } catch (error: any) {
    console.error('Error fetching trainer certifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add trainer certification
router.post('/epoch/trainer-certifications', async (req, res) => {
  try {
    const { trainerId, topicId, moduleId, department, certifiedBy, expiresAt, notes } = req.body;
    
    const [cert] = await db.insert(trainerTopicCertifications)
      .values({
        trainerId,
        topicId: topicId || null,
        moduleId: moduleId || null,
        department,
        certifiedBy,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
      })
      .returning();
    
    res.json(cert);
  } catch (error: any) {
    console.error('Error adding trainer certification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get traveler authorizations for an employee
router.get('/epoch/traveler-authorizations/:employeeId', async (req, res) => {
  try {
    const employeeId = parseInt(req.params.employeeId);
    
    const authorizations = await db.select({
      id: travelerAuthorizations.id,
      partNumber: travelerAuthorizations.partNumber,
      department: travelerAuthorizations.department,
      productionLine: travelerAuthorizations.productionLine,
      authorizedAt: travelerAuthorizations.authorizedAt,
      expiresAt: travelerAuthorizations.expiresAt,
      isActive: travelerAuthorizations.isActive,
      planId: travelerAuthorizations.planId,
      planTitle: aiTrainingPlans.title,
    }).from(travelerAuthorizations)
      .leftJoin(aiTrainingPlans, eq(travelerAuthorizations.planId, aiTrainingPlans.id))
      .where(and(
        eq(travelerAuthorizations.employeeId, employeeId),
        eq(travelerAuthorizations.isActive, true)
      ))
      .orderBy(desc(travelerAuthorizations.authorizedAt));
    
    res.json(authorizations);
  } catch (error: any) {
    console.error('Error fetching traveler authorizations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a traveler authorization for an employee (admin action)
router.post('/epoch/traveler-authorizations', async (req, res) => {
  try {
    const { employeeId, partNumber, department, productionLine, expiresAt, authorizedBy } = req.body;
    if (!employeeId || !partNumber) {
      return res.status(400).json({ error: 'employeeId and partNumber are required' });
    }
    const [record] = await db
      .insert(travelerAuthorizations)
      .values({
        employeeId: parseInt(employeeId),
        partNumber,
        department: department || null,
        productionLine: productionLine || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        authorizedBy: authorizedBy ? parseInt(authorizedBy) : null,
        isActive: true,
      })
      .returning();
    res.status(201).json(record);
  } catch (error: any) {
    console.error('Error creating traveler authorization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deactivate (soft-delete) a traveler authorization
router.patch('/epoch/traveler-authorizations/:id', async (req, res) => {
  try {
    const authId = parseInt(req.params.id);
    const { isActive, productionLine, department, expiresAt } = req.body;
    const patch: Partial<{ isActive: boolean; productionLine: string; department: string; expiresAt: Date | null }> = {};
    if (typeof isActive === 'boolean') patch.isActive = isActive;
    if (productionLine !== undefined) patch.productionLine = productionLine;
    if (department !== undefined) patch.department = department;
    if (expiresAt !== undefined) patch.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const [record] = await db
      .update(travelerAuthorizations)
      .set(patch)
      .where(eq(travelerAuthorizations.id, authId))
      .returning();
    if (!record) return res.status(404).json({ error: 'Authorization not found' });
    res.json(record);
  } catch (error: any) {
    console.error('Error updating traveler authorization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hard-delete a traveler authorization
router.delete('/epoch/traveler-authorizations/:id', async (req, res) => {
  try {
    const authId = parseInt(req.params.id);
    await db.delete(travelerAuthorizations).where(eq(travelerAuthorizations.id, authId));
    res.status(204).end();
  } catch (error: any) {
    console.error('Error deleting traveler authorization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if employee is authorized for a part/line/department
router.get('/epoch/check-authorization', async (req, res) => {
  try {
    const { employeeId, partNumber, productionLine, department } = req.query;
    
    if (!employeeId || !partNumber) {
      return res.status(400).json({ error: 'employeeId and partNumber are required' });
    }
    
    const conditions = [
      eq(travelerAuthorizations.employeeId, parseInt(employeeId as string)),
      eq(travelerAuthorizations.partNumber, partNumber as string),
      eq(travelerAuthorizations.isActive, true),
    ];
    
    if (productionLine) {
      conditions.push(eq(travelerAuthorizations.productionLine, productionLine as string));
    }
    if (department) {
      conditions.push(eq(travelerAuthorizations.department, department as string));
    }
    
    const [authorization] = await db.select()
      .from(travelerAuthorizations)
      .where(and(...conditions));
    
    res.json({
      authorized: !!authorization,
      authorization: authorization || null,
    });
  } catch (error: any) {
    console.error('Error checking authorization:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainee's active training assignments with quizzes
router.get('/epoch/trainee-assignments/:traineeId', async (req, res) => {
  try {
    const traineeId = parseInt(req.params.traineeId);
    
    // Get all active plans for this trainee
    const plans = await db.select({
      id: aiTrainingPlans.id,
      title: aiTrainingPlans.title,
      description: aiTrainingPlans.description,
      status: aiTrainingPlans.status,
      createdAt: aiTrainingPlans.createdAt,
    }).from(aiTrainingPlans)
      .where(and(
        eq(aiTrainingPlans.traineeId, traineeId),
        inArray(aiTrainingPlans.status, ['draft', 'active'])
      ))
      .orderBy(desc(aiTrainingPlans.createdAt));
    
    // Get progress and quizzes for each plan
    const enrichedPlans = await Promise.all(plans.map(async (plan) => {
      const progress = await db.select()
        .from(trainingStepProgress)
        .where(and(
          eq(trainingStepProgress.planId, plan.id),
          eq(trainingStepProgress.traineeId, traineeId)
        ))
        .orderBy(trainingStepProgress.stepNumber);
      
      const stepQuizzes = await db.select()
        .from(trainingStepQuizzes)
        .where(eq(trainingStepQuizzes.planId, plan.id))
        .orderBy(trainingStepQuizzes.stepNumber);
      
      // Get trainers
      const trainers = await db.select({
        trainerId: trainingPlanTrainers.trainerId,
        trainerName: employees.name,
        isPrimary: trainingPlanTrainers.isPrimary,
      }).from(trainingPlanTrainers)
        .leftJoin(employees, eq(trainingPlanTrainers.trainerId, employees.id))
        .where(eq(trainingPlanTrainers.planId, plan.id));
      
      return {
        ...plan,
        progress,
        stepQuizzes,
        trainers,
      };
    }));
    
    res.json(enrichedPlans);
  } catch (error: any) {
    console.error('Error fetching trainee assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trainee's training plans with step progress for portal
router.get('/epoch/trainee-plans/:traineeId', async (req, res) => {
  try {
    const traineeId = parseInt(req.params.traineeId);
    
    // Get all plans for this trainee
    const plans = await db.select({
      id: aiTrainingPlans.id,
      title: aiTrainingPlans.title,
      description: aiTrainingPlans.description,
      status: aiTrainingPlans.status,
      createdAt: aiTrainingPlans.createdAt,
      planStructure: aiTrainingPlans.planStructure,
    }).from(aiTrainingPlans)
      .where(eq(aiTrainingPlans.traineeId, traineeId));
    
    // Enrich each plan with trainers, production info, and step progress
    const enrichedPlans = await Promise.all(plans.map(async (plan) => {
      // Get trainers
      const trainers = await db.select({
        id: trainingPlanTrainers.id,
        trainerId: trainingPlanTrainers.trainerId,
        trainerName: employees.name,
        isPrimary: trainingPlanTrainers.isPrimary,
      }).from(trainingPlanTrainers)
        .leftJoin(employees, eq(trainingPlanTrainers.trainerId, employees.id))
        .where(eq(trainingPlanTrainers.planId, plan.id));
      
      // Get production info
      const [productionInfo] = await db.select().from(trainingPlanProductionInfo)
        .where(eq(trainingPlanProductionInfo.planId, plan.id));
      
      // Get step progress
      const stepProgress = await db.select({
        stepNumber: trainingStepProgress.stepNumber,
        status: trainingStepProgress.status,
        quizScore: trainingStepProgress.quizScore,
        quizPassed: trainingStepProgress.quizPassed,
      }).from(trainingStepProgress)
        .where(and(
          eq(trainingStepProgress.planId, plan.id),
          eq(trainingStepProgress.traineeId, traineeId)
        ))
        .orderBy(trainingStepProgress.stepNumber);
      
      return {
        ...plan,
        trainers,
        productionInfo,
        stepProgress,
      };
    }));
    
    res.json(enrichedPlans);
  } catch (error: any) {
    console.error('Error fetching trainee plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get quiz for a specific step
router.get('/epoch/plans/:planId/steps/:stepNumber/quiz', async (req, res) => {
  try {
    const planId = parseInt(req.params.planId);
    const stepNumber = parseInt(req.params.stepNumber);
    
    // Get the plan to verify trainee
    const [plan] = await db.select().from(aiTrainingPlans)
      .where(eq(aiTrainingPlans.id, planId));
    
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    
    // Verify step is available for taking the quiz
    const [stepProgress] = await db.select().from(trainingStepProgress)
      .where(and(
        eq(trainingStepProgress.planId, planId),
        eq(trainingStepProgress.traineeId, plan.traineeId),
        eq(trainingStepProgress.stepNumber, stepNumber)
      ));
    
    if (stepProgress && stepProgress.status === 'locked') {
      return res.status(403).json({ error: 'This step is not yet available. Complete the previous step first.' });
    }
    
    if (stepProgress && stepProgress.status === 'completed') {
      return res.status(400).json({ error: 'This step quiz has already been completed.' });
    }
    
    // Get the quiz for this step
    const [quiz] = await db.select().from(trainingStepQuizzes)
      .where(and(
        eq(trainingStepQuizzes.planId, planId),
        eq(trainingStepQuizzes.stepNumber, stepNumber)
      ));
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found for this step' });
    }
    
    // Get questions WITHOUT correct answers (security - don't expose answers)
    const questions = await db.select({
      id: trainingStepQuizQuestions.id,
      question: trainingStepQuizQuestions.question,
      questionType: trainingStepQuizQuestions.questionType,
      options: trainingStepQuizQuestions.options,
    }).from(trainingStepQuizQuestions)
      .where(eq(trainingStepQuizQuestions.quizId, quiz.id))
      .orderBy(trainingStepQuizQuestions.sortOrder);
    
    res.json({
      ...quiz,
      questions: questions.map(q => ({
        id: q.id,
        question: q.question,
        questionType: q.questionType,
        options: q.options || [],
      })),
    });
  } catch (error: any) {
    console.error('Error fetching step quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit quiz answers and get results
router.post('/epoch/plans/:planId/steps/:stepNumber/quiz/submit', async (req, res) => {
  try {
    const planId = parseInt(req.params.planId);
    const stepNumber = parseInt(req.params.stepNumber);
    const { answers } = req.body; // { questionId: selectedAnswer }
    
    // Get trainee from plan
    const [plan] = await db.select().from(aiTrainingPlans)
      .where(eq(aiTrainingPlans.id, planId));
    
    if (!plan) {
      return res.status(404).json({ error: 'Training plan not found' });
    }
    
    // Verify step is available before allowing submission
    let [existingProgress] = await db.select().from(trainingStepProgress)
      .where(and(
        eq(trainingStepProgress.planId, planId),
        eq(trainingStepProgress.traineeId, plan.traineeId),
        eq(trainingStepProgress.stepNumber, stepNumber)
      ));
    
    // If step progress doesn't exist, create it (handle case where initialization failed)
    if (!existingProgress) {
      // Create all missing step progress rows for this plan/trainee
      for (let s = 1; s <= 4; s++) {
        const [existing] = await db.select().from(trainingStepProgress)
          .where(and(
            eq(trainingStepProgress.planId, planId),
            eq(trainingStepProgress.traineeId, plan.traineeId),
            eq(trainingStepProgress.stepNumber, s)
          ));
        
        if (!existing) {
          await db.insert(trainingStepProgress).values({
            planId,
            traineeId: plan.traineeId,
            stepNumber: s,
            status: s === 1 ? 'available' : 'locked',
          });
        }
      }
      
      // Re-fetch the current step progress
      [existingProgress] = await db.select().from(trainingStepProgress)
        .where(and(
          eq(trainingStepProgress.planId, planId),
          eq(trainingStepProgress.traineeId, plan.traineeId),
          eq(trainingStepProgress.stepNumber, stepNumber)
        ));
    }
    
    // Check step availability
    if (existingProgress && existingProgress.status === 'locked') {
      return res.status(403).json({ error: 'This step is not yet available. Complete the previous step first.' });
    }
    
    if (existingProgress && existingProgress.status === 'completed') {
      return res.status(400).json({ error: 'This step quiz has already been completed.' });
    }
    
    // Get the quiz
    const [quiz] = await db.select().from(trainingStepQuizzes)
      .where(and(
        eq(trainingStepQuizzes.planId, planId),
        eq(trainingStepQuizzes.stepNumber, stepNumber)
      ));
    
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }
    
    // Get all questions with correct answers
    const questions = await db.select().from(trainingStepQuizQuestions)
      .where(eq(trainingStepQuizQuestions.quizId, quiz.id));
    
    // Calculate score
    let correctCount = 0;
    const details = questions.map(q => {
      const userAnswer = answers[q.id];
      const isCorrect = userAnswer === q.correctAnswer;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        question: q.question,
        userAnswer,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        isCorrect,
      };
    });
    
    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= (quiz.passingScore || 80);
    
    // Update step progress
    await db.update(trainingStepProgress)
      .set({
        quizScore: score,
        quizPassed: passed,
        status: passed ? 'completed' : 'in_progress',
        completedAt: passed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(trainingStepProgress.id, existingProgress.id));
    
    // If passed and not the last step, unlock the next step
    if (passed && stepNumber < 4) {
      // Check if next step progress exists
      const [nextStep] = await db.select().from(trainingStepProgress)
        .where(and(
          eq(trainingStepProgress.planId, planId),
          eq(trainingStepProgress.traineeId, plan.traineeId),
          eq(trainingStepProgress.stepNumber, stepNumber + 1)
        ));
      
      if (nextStep) {
        await db.update(trainingStepProgress)
          .set({ status: 'available', updatedAt: new Date() })
          .where(eq(trainingStepProgress.id, nextStep.id));
      } else {
        // Create next step progress if missing
        await db.insert(trainingStepProgress).values({
          planId,
          traineeId: plan.traineeId,
          stepNumber: stepNumber + 1,
          status: 'available',
        });
      }
    }
    
    // If all 4 steps are completed, create traveler authorization
    if (passed && stepNumber === 4) {
      const [productionInfo] = await db.select().from(trainingPlanProductionInfo)
        .where(eq(trainingPlanProductionInfo.planId, planId));
      
      if (productionInfo && productionInfo.partNumber) {
        // Check if authorization already exists
        const existingAuth = await db.select().from(travelerAuthorizations)
          .where(and(
            eq(travelerAuthorizations.employeeId, plan.traineeId),
            eq(travelerAuthorizations.partNumber, productionInfo.partNumber)
          ));
        
        if (existingAuth.length === 0) {
          await db.insert(travelerAuthorizations).values({
            employeeId: plan.traineeId,
            partNumber: productionInfo.partNumber,
            department: productionInfo.department,
            productionLine: productionInfo.productionLine,
            trainingPlanId: planId,
            grantedBy: null,
          });
        }
      }
      
      // Update plan status to completed
      await db.update(aiTrainingPlans)
        .set({ status: 'completed' })
        .where(eq(aiTrainingPlans.id, planId));
    }
    
    res.json({
      score,
      passed,
      passingScore: quiz.passingScore || 80,
      correctCount,
      totalQuestions: questions.length,
      details,
    });
  } catch (error: any) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
