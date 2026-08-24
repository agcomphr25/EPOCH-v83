import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';
import { insertPartRoutingSchema, insertRoutingOperationSchema, insertRoutingCncOperationSchema, insertRoutingDependencySchema, updateRoutingDependencySchema, partRoutings, routingOperations } from '../../schema';
import { db, pool } from '../../db';
import { eq } from 'drizzle-orm';
import { evaluateDocumentationRequirements } from '../lib/documentationRequirementsEngine';
import {
  areRoutingOperationDepartmentIdsEnabled,
  areSharedInventoryDepartmentReadsEnabled,
  areSharedInventoryDepartmentWritesEnabled,
  isStableRoutingInventoryItemFkEnabled,
} from '../lib/featureFlags';
import {
  createSharedDepartment,
  listSharedDepartments,
} from '../services/sharedDepartmentService';
import { requirePermission } from '../../middleware/requirePermission';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

const router = Router();

async function controlledRoutingIdentity(body: any) {
  if (!isStableRoutingInventoryItemFkEnabled()) return body;
  const inventoryItemFk = Number(body?.inventoryItemFk);
  if (!Number.isSafeInteger(inventoryItemFk) || inventoryItemFk <= 0) {
    const error: any = new Error('A real manufactured inventory item is required.');
    error.status = 400;
    error.code = 'ROUTING_INVENTORY_ITEM_FK_REQUIRED';
    throw error;
  }
  const result = await pool.query(
    `SELECT id,ag_part_number,name,item_type::text AS item_type,type,
            part_configuration_revision
       FROM inventory_items WHERE id=$1 AND is_active IS DISTINCT FROM false`,
    [inventoryItemFk]
  );
  const item = result.rows[0];
  const manufactured = item &&
    (String(item.item_type || '').toUpperCase() === 'MANUFACTURED' ||
      String(item.type || '').toUpperCase() === 'MANUFACTURED');
  if (!manufactured) {
    const error: any = new Error('Routing inventory item must be an active manufactured item.');
    error.status = 409;
    error.code = 'ROUTING_INVENTORY_ITEM_NOT_MANUFACTURED';
    throw error;
  }
  if (body.partNumber && String(body.partNumber).trim() !== String(item.ag_part_number).trim()) {
    const error: any = new Error('Routing part snapshot does not match the selected inventory item.');
    error.status = 409;
    error.code = 'ROUTING_INVENTORY_IDENTITY_MISMATCH';
    throw error;
  }
  return {
    ...body,
    inventoryItemFk,
    inventoryItemId: String(item.id),
    partNumber: String(item.ag_part_number),
    partName: String(item.name),
    partRevisionSnapshot: String(item.part_configuration_revision || '').trim() || null,
  };
}

async function controlledOperation(raw: any) {
  if (!areRoutingOperationDepartmentIdsEnabled()) return raw;
  const departmentId = Number(raw?.departmentId);
  if (!Number.isSafeInteger(departmentId) || departmentId <= 0) {
    const error: any = new Error('Every new routing operation requires a shared department ID.');
    error.status = 400;
    error.code = 'ROUTING_OPERATION_DEPARTMENT_ID_REQUIRED';
    throw error;
  }
  const result = await pool.query(
    `SELECT id,name FROM inventory_departments
      WHERE id=$1 AND is_active=true AND routing_enabled=true`,
    [departmentId]
  );
  const department = result.rows[0];
  if (!department) {
    const error: any = new Error('Routing department is unavailable.');
    error.status = 409;
    error.code = 'ROUTING_OPERATION_DEPARTMENT_UNAVAILABLE';
    throw error;
  }
  return {
    ...raw,
    departmentId,
    departmentName: department.name,
    departmentNameSnapshot: department.name,
  };
}

async function ensureTablesExist() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS p2_routing_departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS part_routings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inventory_item_id TEXT NOT NULL,
        project_id UUID,
        part_number TEXT NOT NULL,
        part_name TEXT NOT NULL,
        routing_name TEXT NOT NULL DEFAULT 'Default',
        routing_revision INTEGER NOT NULL DEFAULT 1,
        department_sequence JSONB NOT NULL DEFAULT '[]',
        traceability_config JSONB NOT NULL DEFAULT '{}',
        department_config JSONB,
        special_process_config JSONB,
        materials_config JSONB,
        qc_standards JSONB,
        custom_fields JSONB,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE part_routings ADD COLUMN IF NOT EXISTS project_id UUID`);
    await pool.query(`CREATE INDEX IF NOT EXISTS part_routings_project_idx ON part_routings(project_id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routing_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        part_routing_id UUID,
        part_number VARCHAR(255),
        department_name VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        document_type VARCHAR(100) NOT NULL DEFAULT 'work_instruction',
        source_type VARCHAR(50) NOT NULL DEFAULT 'uploaded',
        file_url TEXT,
        file_name VARCHAR(500),
        file_type VARCHAR(100),
        file_size INTEGER,
        ai_extracted_content JSONB,
        ai_extracted_fields JSONB,
        ai_processed_at TIMESTAMPTZ,
        is_template BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routing_document_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        part_routing_id UUID NOT NULL,
        department_name VARCHAR(255),
        document_type VARCHAR(100) NOT NULL,
        document_id UUID NOT NULL,
        is_primary BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS routing_document_links_routing_idx ON routing_document_links(part_routing_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS routing_document_links_document_idx ON routing_document_links(document_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS routing_training_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        part_routing_id UUID,
        department_name VARCHAR(255) NOT NULL,
        process_name VARCHAR(255),
        source_document_ids JSONB DEFAULT '[]',
        source_document_titles JSONB DEFAULT '[]',
        training_content JSONB,
        quiz_questions JSONB DEFAULT '[]',
        total_questions INTEGER DEFAULT 0,
        passing_score INTEGER DEFAULT 80,
        model_version VARCHAR(50) DEFAULT 'gpt-4o-mini',
        status VARCHAR(50) DEFAULT 'generated',
        generated_by VARCHAR(255),
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const existing = await pool.query(`SELECT COUNT(*) as count FROM p2_routing_departments`);
    if (parseInt(existing[0]?.count) === 0) {
      console.log('[PartRoutings] Seeding default departments...');
      const defaults = ['Layup', 'Assemble/Disassembly', 'CNC', 'Finish', 'Paint', 'Final QC'];
      for (let i = 0; i < defaults.length; i++) {
        await pool.query(
          `INSERT INTO p2_routing_departments (name, display_order) VALUES ($1, $2)`,
          [defaults[i], i + 1]
        );
      }
      console.log('[PartRoutings] Default departments seeded');
    }
    console.log('[PartRoutings] Tables verified/created successfully');
  } catch (error: any) {
    console.error('[PartRoutings] Error ensuring tables exist:', error?.message);
  }
}

let tablesInitialized = false;

// Middleware to log all requests and ensure tables exist
router.use(async (req: Request, res: Response, next: NextFunction) => {
  console.log(`[PartRoutings] ${req.method} ${req.path} Content-Type: ${req.get('Content-Type')}`);
  if (!tablesInitialized) {
    await ensureTablesExist();
    tablesInitialized = true;
  }
  next();
});

// Get all part routings with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { inventoryItemId, isActive } = req.query;
    
    const filters: { inventoryItemId?: string; isActive?: boolean } = {};
    
    if (inventoryItemId && typeof inventoryItemId === 'string') {
      filters.inventoryItemId = inventoryItemId;
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    const routings = await storage.getPartRoutings(filters);
    res.json(routings);
  } catch (error: any) {
    console.error('Error fetching part routings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routings',
      message: error.message 
    });
  }
});

// Get part routing by part number (MUST be before /:id route)
router.get('/by-part/:partNumber', async (req: Request, res: Response) => {
  try {
    const { partNumber } = req.params;
    const routing = await storage.getPartRoutingByPartNumber(partNumber);
    
    if (!routing) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.json(routing);
  } catch (error: any) {
    console.error('Error fetching part routing by part number:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routing',
      message: error.message 
    });
  }
});

router.get('/project/:projectId/wad-documentation-requirements', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    if (!z.string().uuid().safeParse(projectId).success) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const rows = await pool.query(
      `SELECT id::text, work_order_number AS "workOrderNumber", wizard_data AS "wizardData", updated_at AS "updatedAt"
       FROM production_work_orders
       WHERE project_id = $1
       ORDER BY
         CASE wad_status WHEN 'APPROVED' THEN 0 WHEN 'PENDING_APPROVAL' THEN 1 ELSE 2 END,
         updated_at DESC NULLS LAST,
         created_at DESC NULLS LAST
       LIMIT 1`,
      [projectId]
    );

    const wad = rows[0];
    if (!wad) {
      return res.json({
        wadId: null,
        workOrderNumber: null,
        requirements: null,
      });
    }

    const documentationPackage = evaluateDocumentationRequirements(wad);

    res.json({
      wadId: wad.id,
      workOrderNumber: wad.workOrderNumber,
      requirements: {
        travelerRequired: documentationPackage.requirements.travelerRequired === true,
        inspectionSheetRequired: documentationPackage.requirements.inspectionSheetRequired === true,
        samplingPlanRequired: documentationPackage.requirements.samplingPlanRequired === true,
        samplingPlanId: String(documentationPackage.requirements.samplingPlanId ?? ''),
        inspectionStrategy: documentationPackage.inspectionStrategy,
      },
      documentationPackage,
    });
  } catch (error: any) {
    console.error('Error fetching WAD routing requirements:', error);
    res.status(500).json({
      error: 'Failed to fetch WAD routing requirements',
      message: error.message,
    });
  }
});

// Get part routing by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const routing = await storage.getPartRouting(id);
    
    if (!routing) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.json(routing);
  } catch (error: any) {
    console.error('Error fetching part routing:', error);
    res.status(500).json({ 
      error: 'Failed to fetch part routing',
      message: error.message 
    });
  }
});

// Create new part routing
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('[PartRouting POST] ========== REQUEST DEBUG ==========');
    console.log('[PartRouting POST] Request keys:', Object.keys(req.body || {}));
    console.log('[PartRouting POST] Full body:', JSON.stringify(req.body, null, 2));
    console.log('[PartRouting POST] =====================================');
    
    const validatedData = insertPartRoutingSchema.parse(await controlledRoutingIdentity(req.body));
    console.log('[PartRouting POST] Validation passed, creating routing...');
    const routing = await storage.createPartRouting(validatedData);
    res.status(201).json(routing);
  } catch (error: any) {
    console.error('[PartRouting POST] ========== ERROR ==========');
    console.error('[PartRouting POST] Error type:', error.constructor.name);
    console.error('[PartRouting POST] Error message:', error.message);
    
    if (error instanceof z.ZodError) {
      console.error('[PartRouting POST] Zod validation FAILED');
      console.error('[PartRouting POST] Issues array:', JSON.stringify(error.issues, null, 2));
      console.error('[PartRouting POST] Received keys:', Object.keys(req.body || {}));
      console.error('[PartRouting POST] ===========================');
      
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'One or more fields failed validation',
        receivedKeys: Object.keys(req.body || {}),
        issues: error.issues,
        details: error.errors.map(e => ({
          path: e.path.join('.'),
          code: e.code,
          message: e.message,
          received: e.path.reduce((obj: any, key) => obj?.[key], req.body)
        }))
      });
    }
    
    console.error('[PartRouting POST] Non-Zod error:', error);
    console.error('[PartRouting POST] ===========================');
    
    res.status(error.status || 500).json({
      code: error.code,
      error: 'Failed to create part routing',
      message: error.message 
    });
  }
});

// Update part routing
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    console.log('[PartRouting PATCH] ========== REQUEST DEBUG ==========');
    console.log('[PartRouting PATCH] ID:', req.params.id);
    console.log('[PartRouting PATCH] Request keys:', Object.keys(req.body || {}));
    console.log('[PartRouting PATCH] Full body:', JSON.stringify(req.body, null, 2));
    console.log('[PartRouting PATCH] =====================================');
    
    const { id } = req.params;
    const existing = await storage.getPartRouting(id);
    if (!existing) return res.status(404).json({ error: 'Part routing not found' });
    if (areRoutingOperationDepartmentIdsEnabled() && existing.inventoryItemFk && req.body?.departmentSequence)
      return res.status(409).json({ error: 'ROUTING_OPERATION_SEQUENCE_AUTHORITY', message: 'The compatibility sequence is derived from ordered routing operations.' });
    const candidate = isStableRoutingInventoryItemFkEnabled() && existing.inventoryItemFk
      ? await controlledRoutingIdentity({ ...existing, ...req.body })
      : req.body;
    const validatedData = insertPartRoutingSchema.partial().parse(candidate);
    const routing = await storage.updatePartRouting(id, validatedData);
    res.json(routing);
  } catch (error: any) {
    console.error('[PartRouting PATCH] Error:', error);
    
    if (error instanceof z.ZodError) {
      console.error('[PartRouting PATCH] Zod validation FAILED');
      console.error('[PartRouting PATCH] Issues:', JSON.stringify(error.issues, null, 2));
      
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'One or more fields failed validation',
        receivedKeys: Object.keys(req.body || {}),
        issues: error.issues,
        details: error.errors.map(e => ({
          path: e.path.join('.'),
          code: e.code,
          message: e.message,
          received: e.path.reduce((obj: any, key) => obj?.[key], req.body)
        }))
      });
    }
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.status(500).json({ 
      error: 'Failed to update part routing',
      message: error.message 
    });
  }
});

// Delete part routing
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await storage.deletePartRouting(id);
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting part routing:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Part routing not found' });
    }
    
    res.status(500).json({ 
      error: 'Failed to delete part routing',
      message: error.message 
    });
  }
});

router.get('/departments/list', async (_req: Request, res: Response) => {
  try {
    if (areSharedInventoryDepartmentReadsEnabled()) {
      return res.json(await listSharedDepartments({ routingOnly: true }));
    }
    const rows = await pool.query(
      `SELECT id::text, name, display_order AS "displayOrder", is_active AS "isActive",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM p2_routing_departments
       WHERE is_active = true
       ORDER BY display_order ASC`
    );
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching routing departments:', error);
    res.status(500).json({ error: 'Failed to fetch routing departments' });
  }
});

router.post('/departments', async (req: Request, res: Response) => {
  try {
    if (areSharedInventoryDepartmentWritesEnabled()) {
      return requirePermission('inventory.adjust')(req, res, async () => {
        try {
          const name = String(req.body?.name || '').trim();
          const departmentCode = String(req.body?.departmentCode || '').trim();
          if (!name || !departmentCode)
            return res.status(400).json({ error: 'name and departmentCode are required' });
          const user = req.user as any;
          return res.status(201).json(await createSharedDepartment(
            { name, departmentCode },
            { id: Number(user?.id) || null, username: user?.username, role: user?.role }
          ));
        } catch (error: any) {
          return res.status(error.status || 500).json({ error: error.code || error.message });
        }
      });
    }
    console.log('[PartRoutings] POST /departments body:', JSON.stringify(req.body));
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      console.error('[PartRoutings] Invalid department name:', { name, bodyType: typeof req.body, body: req.body });
      return res.status(400).json({ error: 'Department name is required' });
    }
    const rows = await pool.query(
      `INSERT INTO p2_routing_departments (name, display_order)
       VALUES ($1, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM p2_routing_departments))
       RETURNING id::text, name, display_order AS "displayOrder", is_active AS "isActive",
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name.trim()]
    );
    console.log('[PartRoutings] Department created:', rows[0]);
    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error creating routing department:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Failed to create routing department' });
  }
});

router.patch('/departments/:id', async (req: Request, res: Response) => {
  try {
    const deptId = req.params.id;
    const { name } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Department name must be a non-empty string' });
    }
    if (name === undefined) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const rows = await pool.query(
      `UPDATE p2_routing_departments
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id::text, name, display_order AS "displayOrder", is_active AS "isActive"`,
      [name.trim(), deptId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json(rows[0]);
  } catch (error: any) {
    console.error('Error updating routing department:', error);
    res.status(500).json({ error: 'Failed to update routing department' });
  }
});

router.delete('/departments/:id', async (req: Request, res: Response) => {
  try {
    const rows = await pool.query(
      `UPDATE p2_routing_departments SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id::text, name`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ message: 'Department deactivated', department: rows[0] });
  } catch (error: any) {
    console.error('Error deleting routing department:', error);
    res.status(500).json({ error: 'Failed to delete routing department' });
  }
});

// ============================================================================
// TRAINING PACKAGE GENERATION FROM WORK INSTRUCTIONS
// ============================================================================

router.post('/:id/generate-training', async (req: Request, res: Response) => {
  try {
    const routingId = req.params.id;
    const { departmentName } = req.body;

    if (!departmentName || typeof departmentName !== 'string') {
      return res.status(400).json({ error: 'departmentName is required' });
    }

    const routingRows = await pool.query(
      `SELECT id::text, part_number AS "partNumber", routing_revision AS "routingRevision" FROM part_routings WHERE id = $1`,
      [routingId]
    );
    if (routingRows.length === 0) {
      return res.status(404).json({ error: 'Routing not found' });
    }
    const routing = routingRows[0];

    const docRows = await pool.query(
      `SELECT id::text, title, ai_extracted_content AS "aiExtractedContent",
              file_url AS "fileUrl", file_name AS "fileName", file_type AS "fileType"
       FROM routing_documents
       WHERE part_routing_id = $1 AND department_name = $2 AND is_active = true`,
      [routingId, departmentName]
    );

    if (docRows.length === 0) {
      return res.status(400).json({
        error: `No work instruction documents found for department "${departmentName}" in this routing.`,
      });
    }

    let allContent = '';
    const sourceDocIds: string[] = [];
    const sourceDocTitles: string[] = [];

    for (const doc of docRows) {
      sourceDocIds.push(doc.id);
      sourceDocTitles.push(doc.title);

      let docContent = '';
      if (doc.aiExtractedContent) {
        docContent = typeof doc.aiExtractedContent === 'string'
          ? doc.aiExtractedContent
          : JSON.stringify(doc.aiExtractedContent);
      }

      if (docContent) {
        allContent += `\n\n--- Document: ${doc.title} ---\n${docContent}`;
      }
    }

    if (!allContent || allContent.trim().length < 20) {
      return res.status(400).json({
        error: 'Not enough document content to generate training. Make sure documents have been analyzed first.',
      });
    }

    const systemPrompt = `You are an expert manufacturing training developer creating AS9100-compliant training content and certification quizzes from work instruction documents.

Return a JSON object with this exact structure:
{
  "trainingContent": {
    "title": "Training title for this department/process",
    "objectives": ["Learning objective 1", "Learning objective 2", ...],
    "keyPoints": [
      { "topic": "Topic name", "details": ["Detail 1", "Detail 2", ...] }
    ],
    "safetyNotes": ["Safety note 1", "Safety note 2", ...],
    "commonMistakes": ["Common mistake 1", "Common mistake 2", ...]
  },
  "quizQuestions": [
    {
      "question": "Question text?",
      "questionType": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "explanation": "Why this is correct...",
      "difficulty": "easy|medium|hard"
    }
  ]
}

Rules:
- Generate 8-12 quiz questions covering the key processes, safety requirements, and quality standards.
- Mix difficulty levels: 3-4 easy, 3-4 medium, 2-3 hard.
- Include both multiple_choice (4 options) and true_false question types.
- Questions must be directly answerable from the work instruction content.
- Training objectives should be specific and measurable (use action verbs: identify, demonstrate, explain, etc).
- Key points should cover critical process steps, quality checkpoints, and acceptance criteria.
- Safety notes should highlight PPE requirements, hazardous materials, and safety procedures.
- Common mistakes should cover typical operator errors and how to avoid them.
- All content must be practical and shop-floor relevant.`;

    const userMessage = `Generate training content and certification quiz for:
Department: ${departmentName}
Part Number: ${routing.partNumber || 'N/A'}
Revision: ${routing.routingRevision || 'N/A'}
Number of source documents: ${docRows.length}

Work Instruction Content:
${allContent.substring(0, 50000)}`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

    if (!parsed.trainingContent || !parsed.quizQuestions || !Array.isArray(parsed.quizQuestions)) {
      return res.status(500).json({ error: 'AI did not return valid training content' });
    }

    const quizQuestions = parsed.quizQuestions.map((q: any, idx: number) => ({
      question: q.question || '',
      questionType: q.questionType === 'true_false' ? 'true_false' : 'multiple_choice',
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correctAnswer || '',
      explanation: q.explanation || '',
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
      sourceDocumentId: sourceDocIds[idx % sourceDocIds.length],
    }));

    const existingRows = await pool.query(
      `SELECT id::text FROM routing_training_packages WHERE part_routing_id = $1 AND department_name = $2`,
      [routingId, departmentName]
    );

    let packageId: string;

    if (existingRows.length > 0) {
      const updateRows = await pool.query(
        `UPDATE routing_training_packages
         SET source_document_ids = $1, source_document_titles = $2,
             training_content = $3, quiz_questions = $4,
             total_questions = $5, model_version = 'gpt-4o-mini',
             status = 'generated', generated_at = NOW(), updated_at = NOW()
         WHERE part_routing_id = $6 AND department_name = $7
         RETURNING id::text`,
        [
          JSON.stringify(sourceDocIds), JSON.stringify(sourceDocTitles),
          JSON.stringify(parsed.trainingContent), JSON.stringify(quizQuestions),
          quizQuestions.length,
          routingId, departmentName,
        ]
      );
      packageId = updateRows[0].id;
    } else {
      const insertRows = await pool.query(
        `INSERT INTO routing_training_packages
         (part_routing_id, department_name, source_document_ids, source_document_titles,
          training_content, quiz_questions, total_questions)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id::text`,
        [
          routingId, departmentName,
          JSON.stringify(sourceDocIds), JSON.stringify(sourceDocTitles),
          JSON.stringify(parsed.trainingContent), JSON.stringify(quizQuestions),
          quizQuestions.length,
        ]
      );
      packageId = insertRows[0].id;
    }

    res.json({
      id: packageId,
      departmentName,
      trainingContent: parsed.trainingContent,
      quizQuestions,
      totalQuestions: quizQuestions.length,
      sourceDocumentIds: sourceDocIds,
      sourceDocumentTitles: sourceDocTitles,
    });
  } catch (error: any) {
    console.error('Error generating training package:', error);
    res.status(500).json({ error: 'Failed to generate training package: ' + (error.message || 'Unknown error') });
  }
});

router.get('/:id/training', async (req: Request, res: Response) => {
  try {
    const routingId = req.params.id;
    const departmentName = req.query.department as string | undefined;

    let query = `SELECT id::text, part_routing_id::text AS "partRoutingId",
                        department_name AS "departmentName", process_name AS "processName",
                        source_document_ids AS "sourceDocumentIds",
                        source_document_titles AS "sourceDocumentTitles",
                        training_content AS "trainingContent",
                        quiz_questions AS "quizQuestions",
                        total_questions AS "totalQuestions",
                        passing_score AS "passingScore",
                        model_version AS "modelVersion",
                        status, generated_at AS "generatedAt"
                 FROM routing_training_packages
                 WHERE part_routing_id = $1`;
    const params: any[] = [routingId];

    if (departmentName) {
      query += ` AND department_name = $2`;
      params.push(departmentName);
    }

    query += ` ORDER BY department_name ASC`;

    const rows = await pool.query(query, params);
    res.json(rows);
  } catch (error: any) {
    console.error('Error fetching training packages:', error);
    res.status(500).json({ error: 'Failed to fetch training packages' });
  }
});

// ============================================================================
// ROUTING OPERATIONS ENDPOINTS
// ============================================================================

// GET /api/part-routings/:id/operations
router.get('/:id/operations', async (req: Request, res: Response) => {
  try {
    const ops = await storage.getRoutingOperations(req.params.id);
    res.json(ops);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch routing operations', message: error.message });
  }
});

// POST /api/part-routings/:id/operations
router.post('/:id/operations', async (req: Request, res: Response) => {
  try {
    const data = insertRoutingOperationSchema.parse(await controlledOperation({ ...req.body, partRoutingId: req.params.id }));
    const op = await storage.createRoutingOperation(data);
    res.status(201).json(op);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', issues: error.issues });
    }
    res.status(error.status || 500).json({ error: error.code || 'Failed to create routing operation', message: error.message });
  }
});

// PUT /api/part-routings/:id/operations/replace
router.put('/:id/operations/replace', async (req: Request, res: Response) => {
  try {
    const prepared = await Promise.all((Array.isArray(req.body) ? req.body : []).map(controlledOperation));
    const rawOps = z.array(insertRoutingOperationSchema.partial().required({ stepNumber: true, departmentName: true, operationName: true, operationType: true })).parse(prepared);
    if (areRoutingOperationDepartmentIdsEnabled()) {
      const steps = rawOps.map((op: any) => op.stepNumber);
      if (new Set(steps).size !== steps.length || steps.some((step, index) => step !== index + 1))
        return res.status(409).json({ error: 'ROUTING_OPERATION_SEQUENCE_INVALID', message: 'Operation steps must be unique and contiguous starting at 1.' });
    }
    const ops = rawOps.map((op: any) => ({ ...op, partRoutingId: req.params.id }));
    const result = areRoutingOperationDepartmentIdsEnabled()
      ? await db.transaction(async (tx) => {
          await tx.delete(routingOperations).where(eq(routingOperations.partRoutingId, req.params.id));
          const inserted = ops.length
            ? await tx.insert(routingOperations).values(ops as any).returning()
            : [];
          await tx.update(partRoutings)
            .set({
              departmentSequence: inserted.map((op) => op.departmentNameSnapshot),
              updatedAt: new Date(),
            })
            .where(eq(partRoutings.id, req.params.id));
          return inserted;
        })
      : await storage.replaceRoutingOperations(req.params.id, ops as any);
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', issues: error.issues });
    }
    res.status(500).json({ error: 'Failed to replace routing operations', message: error.message });
  }
});

// PUT /api/part-routings/:id/operations/:operationId
router.put('/:id/operations/:operationId', async (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.operationId, 10);
    if (isNaN(operationId)) return res.status(400).json({ error: 'Invalid operation id' });
    const data = insertRoutingOperationSchema.partial().parse(await controlledOperation(req.body));
    const op = await storage.updateRoutingOperation(operationId, data);
    res.json(op);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', issues: error.issues });
    }
    if (error.message?.includes('not found')) return res.status(404).json({ error: 'Operation not found' });
    res.status(500).json({ error: 'Failed to update routing operation', message: error.message });
  }
});

// DELETE /api/part-routings/:id/operations/:operationId
router.delete('/:id/operations/:operationId', async (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.operationId, 10);
    if (isNaN(operationId)) return res.status(400).json({ error: 'Invalid operation id' });
    await storage.deleteRoutingOperation(operationId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete routing operation', message: error.message });
  }
});

// ============================================================================
// ROUTING CNC OPERATION ENDPOINTS
// Mounted at /api/part-routings/operations/:operationId/cnc
// ============================================================================

// GET /api/part-routings/operations/:operationId/cnc
router.get('/operations/:operationId/cnc', async (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.operationId, 10);
    if (isNaN(operationId)) return res.status(400).json({ error: 'Invalid operation id' });
    const cnc = await storage.getRoutingCncOperation(operationId);
    if (!cnc) return res.status(404).json({ error: 'CNC operation not found' });
    res.json(cnc);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch CNC operation', message: error.message });
  }
});

// PUT /api/part-routings/operations/:operationId/cnc
router.put('/operations/:operationId/cnc', async (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.operationId, 10);
    if (isNaN(operationId)) return res.status(400).json({ error: 'Invalid operation id' });
    const data = insertRoutingCncOperationSchema.parse({ ...req.body, routingOperationId: operationId });
    const cnc = await storage.upsertRoutingCncOperation(data);
    res.json(cnc);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', issues: error.issues });
    }
    res.status(500).json({ error: 'Failed to upsert CNC operation', message: error.message });
  }
});

// DELETE /api/part-routings/operations/:operationId/cnc
router.delete('/operations/:operationId/cnc', async (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.operationId, 10);
    if (isNaN(operationId)) return res.status(400).json({ error: 'Invalid operation id' });
    await storage.deleteRoutingCncOperation(operationId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete CNC operation', message: error.message });
  }
});

// ============================================================================
// ROUTING DEPENDENCIES ENDPOINTS
// ============================================================================

// GET /api/part-routings/:id/dependencies
router.get('/:id/dependencies', async (req, res) => {
  try {
    const deps = await storage.getRoutingDependencies(req.params.id);
    res.json(deps);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get dependencies', message: error.message });
  }
});

// POST /api/part-routings/:id/dependencies
router.post('/:id/dependencies', async (req, res) => {
  try {
    const parsed = insertRoutingDependencySchema.safeParse({ ...req.body, partRoutingId: req.params.id });
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const dep = await storage.createRoutingDependency(parsed.data);
    res.status(201).json(dep);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create dependency', message: error.message });
  }
});

// PUT /api/part-routings/:id/dependencies/:dependencyId
router.put('/:id/dependencies/:dependencyId', async (req, res) => {
  try {
    const dependencyId = parseInt(req.params.dependencyId);
    if (isNaN(dependencyId)) return res.status(400).json({ error: 'Invalid dependency id' });
    const parsed = updateRoutingDependencySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const dep = await storage.updateRoutingDependency(dependencyId, parsed.data);
    res.json(dep);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update dependency', message: error.message });
  }
});

// DELETE /api/part-routings/:id/dependencies/:dependencyId
router.delete('/:id/dependencies/:dependencyId', async (req, res) => {
  try {
    const dependencyId = parseInt(req.params.dependencyId);
    if (isNaN(dependencyId)) return res.status(400).json({ error: 'Invalid dependency id' });
    await storage.deleteRoutingDependency(dependencyId);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete dependency', message: error.message });
  }
});

// PUT /api/part-routings/:id/dependencies/replace
router.put('/:id/dependencies/replace', async (req, res) => {
  try {
    const arraySchema = z.array(insertRoutingDependencySchema.omit({ partRoutingId: true }));
    const parsed = arraySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    const fullDeps = parsed.data.map((d) => ({ ...d, partRoutingId: req.params.id }));
    const deps = await storage.replaceRoutingDependencies(req.params.id, fullDeps);
    res.json(deps);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to replace dependencies', message: error.message });
  }
});

// GET /api/part-routings/:id/assembly-readiness
router.get('/:id/assembly-readiness', async (req, res) => {
  try {
    const result = await storage.getAssemblyReadinessForRouting(req.params.id);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to evaluate assembly readiness', message: error.message });
  }
});

// GET /api/routing-operations/:operationId/anodize-jobs
// Note: mounted at /api/part-routings but serves routing-operation sub-resource
router.get('/routing-operations/:operationId/anodize-jobs', async (req, res) => {
  try {
    const opId = Number(req.params.operationId);
    const jobs = await storage.getRoutingOperationAnodizeJobs(opId);
    res.json(jobs);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get routing operation anodize jobs', message: error.message });
  }
});

export default router;
