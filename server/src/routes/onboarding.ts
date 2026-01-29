import express, { Request, Response } from 'express';
import { pool } from '../../db';
import { z } from 'zod';
import { auditService } from '../services/auditService';
import { generateOnboardingBundle } from '../services/onboardingPdfBundleService';

const router = express.Router();

const pathTypeSchema = z.enum(['FULL_TIME', 'CONTRACT']);

const createPathSchema = z.object({
  name: z.string().min(1),
  pathType: pathTypeSchema.optional().default('FULL_TIME'),
  intakeFormId: z.string().uuid().nullable().optional(),
  documentFolderId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updatePathSchema = z.object({
  name: z.string().min(1).optional(),
  pathType: pathTypeSchema.optional(),
  intakeFormId: z.string().uuid().nullable().optional(),
  documentFolderId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const formFieldSchema = z.object({
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'date', 'select', 'checkbox']),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional(),
  employeeFieldMapping: z.string().optional(),
});

const createFormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fieldsJson: z.array(formFieldSchema).default([]),
  isActive: z.boolean().optional().default(true),
});

const updateFormSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  fieldsJson: z.array(formFieldSchema).optional(),
  isActive: z.boolean().optional(),
});

router.get('/paths', async (_req: Request, res: Response) => {
  try {
    const paths = await pool.query(`
      SELECT id, name, path_type as "pathType", intake_form_id as "intakeFormId", 
             document_folder_id as "documentFolderId", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM onboarding_paths 
      ORDER BY created_at DESC
    `);
    
    res.json(paths);
  } catch (error) {
    console.error('Error fetching onboarding paths:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding paths' });
  }
});

router.get('/paths/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const paths = await pool.query(`
      SELECT id, name, path_type as "pathType", intake_form_id as "intakeFormId", 
             document_folder_id as "documentFolderId", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM onboarding_paths 
      WHERE id = $1
    `, [id]);
    
    if (paths.length === 0) {
      return res.status(404).json({ error: 'Onboarding path not found' });
    }
    
    res.json(paths[0]);
  } catch (error) {
    console.error('Error fetching onboarding path:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding path' });
  }
});

router.post('/paths', async (req: Request, res: Response) => {
  try {
    const parsed = createPathSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: parsed.error.errors 
      });
    }
    
    const paths = await pool.query(`
      INSERT INTO onboarding_paths (name, path_type, intake_form_id, document_folder_id, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, path_type as "pathType", intake_form_id as "intakeFormId", 
                document_folder_id as "documentFolderId", is_active as "isActive",
                created_at as "createdAt", updated_at as "updatedAt"
    `, [
      parsed.data.name,
      parsed.data.pathType,
      parsed.data.intakeFormId || null,
      parsed.data.documentFolderId || null,
      parsed.data.isActive,
    ]);
    
    const newPath = paths[0];
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: newPath.id,
        action: 'PATH_CREATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          pathName: newPath.name,
          pathType: newPath.pathType,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for PATH_CREATED:', auditError);
    }
    
    res.status(201).json(newPath);
  } catch (error) {
    console.error('Error creating onboarding path:', error);
    res.status(500).json({ error: 'Failed to create onboarding path' });
  }
});

router.patch('/paths/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updatePathSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: parsed.error.errors 
      });
    }
    
    const existingPaths = await pool.query(`
      SELECT id, name, path_type as "pathType", intake_form_id as "intakeFormId", 
             document_folder_id as "documentFolderId", is_active as "isActive"
      FROM onboarding_paths 
      WHERE id = $1
    `, [id]);
    
    if (existingPaths.length === 0) {
      return res.status(404).json({ error: 'Onboarding path not found' });
    }
    
    const existingPath = existingPaths[0];
    
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (parsed.data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(parsed.data.name);
    }
    if (parsed.data.pathType !== undefined) {
      updates.push(`path_type = $${paramIndex++}`);
      values.push(parsed.data.pathType);
    }
    if (parsed.data.intakeFormId !== undefined) {
      updates.push(`intake_form_id = $${paramIndex++}`);
      values.push(parsed.data.intakeFormId);
    }
    if (parsed.data.documentFolderId !== undefined) {
      updates.push(`document_folder_id = $${paramIndex++}`);
      values.push(parsed.data.documentFolderId);
    }
    if (parsed.data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(parsed.data.isActive);
    }
    
    values.push(id);
    
    const updatedPaths = await pool.query(`
      UPDATE onboarding_paths 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, path_type as "pathType", intake_form_id as "intakeFormId", 
                document_folder_id as "documentFolderId", is_active as "isActive",
                created_at as "createdAt", updated_at as "updatedAt"
    `, values);
    
    const updatedPath = updatedPaths[0];
    
    const fieldsChanged: Record<string, { before: any; after: any }> = {};
    for (const key of Object.keys(parsed.data)) {
      if ((existingPath as any)[key] !== (updatedPath as any)[key]) {
        fieldsChanged[key] = {
          before: (existingPath as any)[key],
          after: (updatedPath as any)[key],
        };
      }
    }
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: updatedPath.id,
        action: 'PATH_UPDATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        fieldsChanged,
        meta: {
          pathName: updatedPath.name,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for PATH_UPDATED:', auditError);
    }
    
    res.json(updatedPath);
  } catch (error) {
    console.error('Error updating onboarding path:', error);
    res.status(500).json({ error: 'Failed to update onboarding path' });
  }
});

router.delete('/paths/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const existingPaths = await pool.query(`
      SELECT id, name FROM onboarding_paths WHERE id = $1
    `, [id]);
    
    if (existingPaths.length === 0) {
      return res.status(404).json({ error: 'Onboarding path not found' });
    }
    
    const existingPath = existingPaths[0];
    
    const deactivatedPaths = await pool.query(`
      UPDATE onboarding_paths 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, path_type as "pathType", is_active as "isActive"
    `, [id]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'PATH_DEACTIVATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          pathName: existingPath.name,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for PATH_DEACTIVATED:', auditError);
    }
    
    res.json(deactivatedPaths[0]);
  } catch (error) {
    console.error('Error deactivating onboarding path:', error);
    res.status(500).json({ error: 'Failed to deactivate onboarding path' });
  }
});

router.get('/forms', async (_req: Request, res: Response) => {
  try {
    const forms = await pool.query(`
      SELECT id, name, description, fields_json as "fieldsJson", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM onboarding_forms 
      ORDER BY created_at DESC
    `);
    
    res.json(forms);
  } catch (error) {
    console.error('Error fetching onboarding forms:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding forms' });
  }
});

router.get('/forms/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const forms = await pool.query(`
      SELECT id, name, description, fields_json as "fieldsJson", is_active as "isActive",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM onboarding_forms 
      WHERE id = $1
    `, [id]);
    
    if (forms.length === 0) {
      return res.status(404).json({ error: 'Onboarding form not found' });
    }
    
    res.json(forms[0]);
  } catch (error) {
    console.error('Error fetching onboarding form:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding form' });
  }
});

router.post('/forms', async (req: Request, res: Response) => {
  try {
    const parsed = createFormSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: parsed.error.errors 
      });
    }
    
    const transformedFields = parsed.data.fieldsJson.map(field => ({
      name: field.fieldKey,
      label: field.label,
      type: field.type === 'select' ? 'dropdown' : field.type,
      required: field.required,
      options: field.options,
      mappedToField: field.employeeFieldMapping,
    }));
    
    const forms = await pool.query(`
      INSERT INTO onboarding_forms (name, description, fields_json, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, description, fields_json as "fieldsJson", is_active as "isActive",
                created_at as "createdAt", updated_at as "updatedAt"
    `, [
      parsed.data.name,
      parsed.data.description || null,
      JSON.stringify(transformedFields),
      parsed.data.isActive,
    ]);
    
    const newForm = forms[0];
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: newForm.id,
        action: 'FORM_CREATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          formName: newForm.name,
          fieldCount: transformedFields.length,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for FORM_CREATED:', auditError);
    }
    
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Error creating onboarding form:', error);
    res.status(500).json({ error: 'Failed to create onboarding form' });
  }
});

router.patch('/forms/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateFormSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: parsed.error.errors 
      });
    }
    
    const existingForms = await pool.query(`
      SELECT id, name FROM onboarding_forms WHERE id = $1
    `, [id]);
    
    if (existingForms.length === 0) {
      return res.status(404).json({ error: 'Onboarding form not found' });
    }
    
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (parsed.data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(parsed.data.name);
    }
    if (parsed.data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(parsed.data.description);
    }
    if (parsed.data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(parsed.data.isActive);
    }
    if (parsed.data.fieldsJson !== undefined) {
      const transformedFields = parsed.data.fieldsJson.map(field => ({
        name: field.fieldKey,
        label: field.label,
        type: field.type === 'select' ? 'dropdown' : field.type,
        required: field.required,
        options: field.options,
        mappedToField: field.employeeFieldMapping,
      }));
      updates.push(`fields_json = $${paramIndex++}`);
      values.push(JSON.stringify(transformedFields));
    }
    
    values.push(id);
    
    const updatedForms = await pool.query(`
      UPDATE onboarding_forms 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, fields_json as "fieldsJson", is_active as "isActive",
                created_at as "createdAt", updated_at as "updatedAt"
    `, values);
    
    const updatedForm = updatedForms[0];
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: updatedForm.id,
        action: 'FORM_UPDATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          formName: updatedForm.name,
          fieldCount: (updatedForm.fieldsJson as any[])?.length || 0,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for FORM_UPDATED:', auditError);
    }
    
    res.json(updatedForm);
  } catch (error) {
    console.error('Error updating onboarding form:', error);
    res.status(500).json({ error: 'Failed to update onboarding form' });
  }
});

router.delete('/forms/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const existingForms = await pool.query(`
      SELECT id, name FROM onboarding_forms WHERE id = $1
    `, [id]);
    
    if (existingForms.length === 0) {
      return res.status(404).json({ error: 'Onboarding form not found' });
    }
    
    const existingForm = existingForms[0];
    
    const deactivatedForms = await pool.query(`
      UPDATE onboarding_forms 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, is_active as "isActive"
    `, [id]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'FORM_DEACTIVATED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          formName: existingForm.name,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for FORM_DEACTIVATED:', auditError);
    }
    
    res.json(deactivatedForms[0]);
  } catch (error) {
    console.error('Error deactivating onboarding form:', error);
    res.status(500).json({ error: 'Failed to deactivate onboarding form' });
  }
});

// Session Schemas
const createSessionSchema = z.object({
  onboardingPathId: z.string().uuid(),
  employeeId: z.number().int().positive().optional(),
});

const sessionStatusSchema = z.enum(['in_progress', 'paused', 'completed']);

// GET /sessions - List all sessions with filters
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    
    let query = `
      SELECT 
        s.id, s.employee_id as "employeeId", s.path_id as "pathId",
        s.admin_id as "adminId", s.status, s.intake_data as "intakeData",
        s.intake_data_schema as "intakeDataSchema", s.current_step as "currentStep",
        s.started_at as "startedAt", s.paused_at as "pausedAt", s.completed_at as "completedAt",
        p.name as "pathName", p.path_type as "pathType",
        e.name as "employeeName"
      FROM onboarding_sessions s
      LEFT JOIN onboarding_paths p ON s.path_id = p.id
      LEFT JOIN employees e ON s.employee_id = e.id
    `;
    
    const params: any[] = [];
    
    if (status && typeof status === 'string') {
      query += ` WHERE s.status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY s.started_at DESC`;
    
    const sessions = await pool.query(query, params);
    
    // Fetch documents and captures for each session
    const sessionsWithSteps = await Promise.all(
      sessions.map(async (session: any) => {
        const documents = await pool.query(`
          SELECT id, template_id as "templateId", instance_id as "instanceId",
                 order_index as "orderIndex", status, signed_at as "signedAt"
          FROM onboarding_session_documents
          WHERE session_id = $1
          ORDER BY order_index
        `, [session.id]);
        
        const captures = await pool.query(`
          SELECT id, capture_type as "captureType", media_item_id as "mediaItemId",
                 captured_at as "capturedAt"
          FROM onboarding_session_captures
          WHERE session_id = $1
        `, [session.id]);
        
        return {
          ...session,
          documents,
          captures,
        };
      })
    );
    
    res.json(sessionsWithSteps);
  } catch (error) {
    console.error('Error fetching onboarding sessions:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding sessions' });
  }
});

// GET /sessions/:id - Get single session with full details
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const sessions = await pool.query(`
      SELECT 
        s.id, s.employee_id as "employeeId", s.path_id as "pathId",
        s.admin_id as "adminId", s.status, s.intake_data as "intakeData",
        s.intake_data_schema as "intakeDataSchema", s.current_step as "currentStep",
        s.started_at as "startedAt", s.paused_at as "pausedAt", s.completed_at as "completedAt",
        p.name as "pathName", p.path_type as "pathType",
        e.name as "employeeName"
      FROM onboarding_sessions s
      LEFT JOIN onboarding_paths p ON s.path_id = p.id
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    
    // Fetch documents
    const documents = await pool.query(`
      SELECT id, template_id as "templateId", instance_id as "instanceId",
             order_index as "orderIndex", status, signed_at as "signedAt"
      FROM onboarding_session_documents
      WHERE session_id = $1
      ORDER BY order_index
    `, [id]);
    
    // Fetch captures
    const captures = await pool.query(`
      SELECT id, capture_type as "captureType", media_item_id as "mediaItemId",
             captured_at as "capturedAt"
      FROM onboarding_session_captures
      WHERE session_id = $1
    `, [id]);
    
    res.json({
      ...session,
      documents,
      captures,
    });
  } catch (error) {
    console.error('Error fetching onboarding session:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding session' });
  }
});

// POST /sessions - Create new session
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: parsed.error.errors 
      });
    }
    
    const adminId = (req as any).user?.id || 1;
    const { onboardingPathId, employeeId } = parsed.data;
    
    // Fetch the path to get intake form and document folder
    const paths = await pool.query(`
      SELECT id, name, path_type as "pathType", intake_form_id as "intakeFormId",
             document_folder_id as "documentFolderId"
      FROM onboarding_paths
      WHERE id = $1 AND is_active = true
    `, [onboardingPathId]);
    
    if (paths.length === 0) {
      return res.status(404).json({ error: 'Onboarding path not found or inactive' });
    }
    
    const path = paths[0];
    
    // Resolve intake form structure (snapshot)
    let intakeDataSchema = null;
    if (path.intakeFormId) {
      const forms = await pool.query(`
        SELECT fields_json as "fieldsJson"
        FROM onboarding_forms
        WHERE id = $1 AND is_active = true
      `, [path.intakeFormId]);
      
      if (forms.length > 0) {
        intakeDataSchema = forms[0].fieldsJson;
      }
    }
    
    // Create the session
    const sessions = await pool.query(`
      INSERT INTO onboarding_sessions 
        (employee_id, path_id, admin_id, status, intake_data_schema, started_at)
      VALUES ($1, $2, $3, 'in_progress', $4, NOW())
      RETURNING id, employee_id as "employeeId", path_id as "pathId",
                admin_id as "adminId", status, intake_data as "intakeData",
                intake_data_schema as "intakeDataSchema", current_step as "currentStep",
                started_at as "startedAt", paused_at as "pausedAt", completed_at as "completedAt"
    `, [
      employeeId || null,
      onboardingPathId,
      adminId,
      intakeDataSchema ? JSON.stringify(intakeDataSchema) : null,
    ]);
    
    const newSession = sessions[0];
    
    // Resolve document templates from folder if configured
    if (path.documentFolderId) {
      // Query fillable PDF templates from the document folder
      const templates = await pool.query(`
        SELECT id, name
        FROM fillable_pdf_templates
        WHERE folder_id = $1 AND is_active = true
        ORDER BY name
      `, [path.documentFolderId]);
      
      // Create session documents for each template
      for (let i = 0; i < templates.length; i++) {
        await pool.query(`
          INSERT INTO onboarding_session_documents
            (session_id, template_id, order_index, status)
          VALUES ($1, $2, $3, 'pending')
        `, [newSession.id, templates[i].id, i]);
      }
    }
    
    // Create default capture steps (photo ID, signature)
    const defaultCaptures = ['photo_id', 'employee_photo'];
    for (const captureType of defaultCaptures) {
      await pool.query(`
        INSERT INTO onboarding_session_captures
          (session_id, capture_type)
        VALUES ($1, $2)
      `, [newSession.id, captureType]);
    }
    
    // Fetch the created documents and captures
    const documents = await pool.query(`
      SELECT id, template_id as "templateId", order_index as "orderIndex", status
      FROM onboarding_session_documents
      WHERE session_id = $1
      ORDER BY order_index
    `, [newSession.id]);
    
    const captures = await pool.query(`
      SELECT id, capture_type as "captureType", media_item_id as "mediaItemId"
      FROM onboarding_session_captures
      WHERE session_id = $1
    `, [newSession.id]);
    
    // Audit log
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: newSession.id,
        action: 'ONBOARDING_STARTED',
        actor: {
          id: adminId,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          pathId: onboardingPathId,
          pathName: path.name,
          employeeId: employeeId || null,
          documentsCount: documents.length,
          capturesCount: captures.length,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for ONBOARDING_STARTED:', auditError);
    }
    
    res.status(201).json({
      ...newSession,
      pathName: path.name,
      pathType: path.pathType,
      documents,
      captures,
    });
  } catch (error) {
    console.error('Error creating onboarding session:', error);
    res.status(500).json({ error: 'Failed to create onboarding session' });
  }
});

// PATCH /sessions/:id/pause - Pause a session
router.patch('/sessions/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id || 1;
    
    // Check session exists and is in_progress
    const sessions = await pool.query(`
      SELECT id, status, path_id as "pathId"
      FROM onboarding_sessions
      WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    
    if (session.status !== 'in_progress') {
      return res.status(400).json({ 
        error: 'Cannot pause session', 
        message: `Session is ${session.status}, can only pause in_progress sessions` 
      });
    }
    
    // Update to paused
    const updated = await pool.query(`
      UPDATE onboarding_sessions
      SET status = 'paused', paused_at = NOW()
      WHERE id = $1
      RETURNING id, employee_id as "employeeId", path_id as "pathId",
                admin_id as "adminId", status, intake_data as "intakeData",
                intake_data_schema as "intakeDataSchema", current_step as "currentStep",
                started_at as "startedAt", paused_at as "pausedAt", completed_at as "completedAt"
    `, [id]);
    
    // Audit log
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_PAUSED',
        actor: {
          id: adminId,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          pathId: session.pathId,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for ONBOARDING_PAUSED:', auditError);
    }
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error pausing onboarding session:', error);
    res.status(500).json({ error: 'Failed to pause onboarding session' });
  }
});

// PATCH /sessions/:id/resume - Resume a paused session
router.patch('/sessions/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).user?.id || 1;
    
    // Check session exists and is paused
    const sessions = await pool.query(`
      SELECT id, status, path_id as "pathId"
      FROM onboarding_sessions
      WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    
    if (session.status !== 'paused') {
      return res.status(400).json({ 
        error: 'Cannot resume session', 
        message: `Session is ${session.status}, can only resume paused sessions` 
      });
    }
    
    // Update to in_progress
    const updated = await pool.query(`
      UPDATE onboarding_sessions
      SET status = 'in_progress', paused_at = NULL
      WHERE id = $1
      RETURNING id, employee_id as "employeeId", path_id as "pathId",
                admin_id as "adminId", status, intake_data as "intakeData",
                intake_data_schema as "intakeDataSchema", current_step as "currentStep",
                started_at as "startedAt", paused_at as "pausedAt", completed_at as "completedAt"
    `, [id]);
    
    // Audit log
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_RESUMED',
        actor: {
          id: adminId,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          pathId: session.pathId,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for ONBOARDING_RESUMED:', auditError);
    }
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error resuming onboarding session:', error);
    res.status(500).json({ error: 'Failed to resume onboarding session' });
  }
});

// PATCH /sessions/:id/intake - Save intake form data
router.patch('/sessions/:id/intake', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { intakeData } = req.body;
    
    if (!intakeData || typeof intakeData !== 'object') {
      return res.status(400).json({ error: 'Invalid intake data' });
    }
    
    const sessions = await pool.query(`
      SELECT id, status FROM onboarding_sessions WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    if (sessions[0].status === 'completed') {
      return res.status(400).json({ error: 'Cannot modify completed session' });
    }
    
    const updated = await pool.query(`
      UPDATE onboarding_sessions
      SET intake_data = $1
      WHERE id = $2
      RETURNING id, intake_data as "intakeData"
    `, [JSON.stringify(intakeData), id]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'INTAKE_DATA_SAVED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          fieldsCount: Object.keys(intakeData).length,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for INTAKE_DATA_SAVED:', auditError);
    }
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error saving intake data:', error);
    res.status(500).json({ error: 'Failed to save intake data' });
  }
});

// PATCH /sessions/:id/step - Update current step
router.patch('/sessions/:id/step', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentStep } = req.body;
    
    if (!currentStep || typeof currentStep !== 'string') {
      return res.status(400).json({ error: 'Invalid step' });
    }
    
    const sessions = await pool.query(`
      SELECT id, status FROM onboarding_sessions WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const updated = await pool.query(`
      UPDATE onboarding_sessions
      SET current_step = $1
      WHERE id = $2
      RETURNING id, current_step as "currentStep"
    `, [currentStep, id]);
    
    res.json(updated[0]);
  } catch (error) {
    console.error('Error updating current step:', error);
    res.status(500).json({ error: 'Failed to update current step' });
  }
});

// POST /sessions/:id/finalize - Finalize onboarding session (admin-only)
router.post('/sessions/:id/finalize', async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = (req as any).user?.id || 1;
  const adminUsername = (req as any).user?.username || 'system';
  
  try {
    // ===== PREFLIGHT VALIDATION (NO WRITES) =====
    const validationErrors: string[] = [];
    
    // 1. Fetch session with all related data
    const sessions = await pool.query(`
      SELECT 
        s.id, s.employee_id as "employeeId", s.path_id as "pathId",
        s.admin_id as "adminId", s.status, s.intake_data as "intakeData",
        s.intake_data_schema as "intakeDataSchema", s.current_step as "currentStep",
        s.started_at as "startedAt", s.account_config as "accountConfig",
        p.name as "pathName", p.path_type as "pathType"
      FROM onboarding_sessions s
      LEFT JOIN onboarding_paths p ON s.path_id = p.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    
    // Check 1: Session status must be in_progress
    if (session.status !== 'in_progress') {
      validationErrors.push(`Session status is '${session.status}', must be 'in_progress' to finalize`);
    }
    
    // Check 2: Intake form marked complete
    const intakeData = session.intakeData || {};
    const intakeSchema = session.intakeDataSchema || [];
    const requiredIntakeFields = intakeSchema.filter((f: any) => f.required);
    
    for (const field of requiredIntakeFields) {
      const fieldKey = field.name || field.fieldKey;
      if (!intakeData[fieldKey] && intakeData[fieldKey] !== false && intakeData[fieldKey] !== 0) {
        validationErrors.push(`Required intake field '${field.label || fieldKey}' is missing`);
      }
    }
    
    // Check 3: All REQUIRED documents signed
    const documents = await pool.query(`
      SELECT id, template_id as "templateId", status, is_required as "isRequired"
      FROM onboarding_session_documents
      WHERE session_id = $1
    `, [id]);
    
    const requiredDocs = documents.filter((d: any) => d.isRequired !== false);
    const unsignedRequiredDocs = requiredDocs.filter((d: any) => d.status !== 'signed');
    if (unsignedRequiredDocs.length > 0) {
      validationErrors.push(`${unsignedRequiredDocs.length} required document(s) not signed`);
    }
    
    // Check 4: All REQUIRED camera captures completed
    const captures = await pool.query(`
      SELECT id, capture_type as "captureType", media_item_id as "mediaItemId", is_required as "isRequired"
      FROM onboarding_session_captures
      WHERE session_id = $1
    `, [id]);
    
    const requiredCaptures = captures.filter((c: any) => c.isRequired !== false);
    const incompleteCaptures = requiredCaptures.filter((c: any) => !c.mediaItemId);
    if (incompleteCaptures.length > 0) {
      validationErrors.push(`${incompleteCaptures.length} required camera capture(s) not completed`);
    }
    
    // Check 5: User account configuration exists
    const accountConfig = session.accountConfig || req.body.accountConfig;
    if (!accountConfig || !accountConfig.username) {
      validationErrors.push('User account configuration is missing or incomplete');
    }
    
    // If any validation fails, return error and log audit
    if (validationErrors.length > 0) {
      try {
        await auditService.logEvent({
          entityType: 'employee_onboarding',
          entityId: id,
          action: 'ONBOARDING_FINALIZATION_BLOCKED',
          actor: { id: adminId, username: adminUsername },
          meta: { validationErrors, sessionStatus: session.status },
        });
      } catch (auditError) {
        console.warn('Audit logging failed for ONBOARDING_FINALIZATION_BLOCKED:', auditError);
      }
      
      return res.status(400).json({
        error: 'Validation failed',
        validationReport: validationErrors,
      });
    }
    
    // ===== ATOMIC COMMIT PHASE (TRANSACTIONAL) =====
    // All writes happen within a database transaction.
    // If anything fails, we ROLLBACK and abort.
    
    let employeeId = session.employeeId;
    let userId: number | null = null;
    const auditEvents: Array<{ action: string; meta: any }> = [];
    const employeeData = mapIntakeToEmployee(intakeData, intakeSchema);
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      // A) CREATE OR UPDATE EMPLOYEE
      if (employeeId) {
        // UPDATE existing employee
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;
        
        if (employeeData.name) {
          updateFields.push(`name = $${paramIndex++}`);
          updateValues.push(employeeData.name);
        }
        if (employeeData.email) {
          updateFields.push(`email = $${paramIndex++}`);
          updateValues.push(employeeData.email);
        }
        if (employeeData.phone) {
          updateFields.push(`phone = $${paramIndex++}`);
          updateValues.push(employeeData.phone);
        }
        if (employeeData.jobTitle) {
          updateFields.push(`job_title = $${paramIndex++}`);
          updateValues.push(employeeData.jobTitle);
        }
        if (employeeData.department) {
          updateFields.push(`department = $${paramIndex++}`);
          updateValues.push(employeeData.department);
        }
        if (employeeData.hireDate) {
          updateFields.push(`hire_date = $${paramIndex++}`);
          updateValues.push(employeeData.hireDate);
        }
        if (employeeData.dateOfBirth) {
          updateFields.push(`date_of_birth = $${paramIndex++}`);
          updateValues.push(employeeData.dateOfBirth);
        }
        if (employeeData.address) {
          updateFields.push(`address = $${paramIndex++}`);
          updateValues.push(employeeData.address);
        }
        if (employeeData.emergencyContact) {
          updateFields.push(`emergency_contact = $${paramIndex++}`);
          updateValues.push(employeeData.emergencyContact);
        }
        if (employeeData.emergencyPhone) {
          updateFields.push(`emergency_phone = $${paramIndex++}`);
          updateValues.push(employeeData.emergencyPhone);
        }
        
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(employeeId);
        
        if (updateFields.length > 1) {
          await pool.query(`
            UPDATE employees
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
          `, updateValues);
        }
        
        auditEvents.push({
          action: 'EMPLOYEE_UPDATED',
          meta: { employeeId, updatedFields: Object.keys(employeeData) },
        });
      } else {
        // CREATE new employee
        const insertResult = await pool.query(`
          INSERT INTO employees (
            name, email, phone, job_title, department, hire_date, 
            date_of_birth, address, emergency_contact, emergency_phone,
            user_role, employment_type, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
          RETURNING id
        `, [
          employeeData.name || 'New Employee',
          employeeData.email || null,
          employeeData.phone || null,
          employeeData.jobTitle || null,
          employeeData.department || null,
          employeeData.hireDate || null,
          employeeData.dateOfBirth || null,
          employeeData.address || null,
          employeeData.emergencyContact || null,
          employeeData.emergencyPhone || null,
          accountConfig.role || 'EMPLOYEE',
          session.pathType === 'CONTRACT' ? 'CONTRACT' : 'FULL_TIME',
        ]);
        
        employeeId = insertResult[0].id;
        
        // Update session with new employee ID
        await pool.query(`
          UPDATE onboarding_sessions SET employee_id = $1 WHERE id = $2
        `, [employeeId, id]);
        
        auditEvents.push({
          action: 'EMPLOYEE_CREATED',
          meta: { employeeId, employeeName: employeeData.name },
        });
      }
      
      // B) ATTACH SIGNED DOCUMENTS TO EMPLOYEE (required docs are fatal)
      const signedDocs = documents.filter((d: any) => d.status === 'signed');
      for (const doc of signedDocs) {
        // Get signed PDF path from session document
        const docDetails = await pool.query(`
          SELECT sd.signed_pdf_path as "signedPdfPath", t.name as "templateName"
          FROM onboarding_session_documents sd
          LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
          WHERE sd.id = $1
        `, [doc.id]);
        
        if (docDetails.length > 0 && docDetails[0].signedPdfPath) {
          // Link document to employee - failures are fatal for transaction integrity
          await pool.query(`
            INSERT INTO employee_documents (
              employee_id, document_type, file_path, file_name, 
              uploaded_by, is_verified, created_at
            ) VALUES ($1, 'onboarding', $2, $3, $4, true, NOW())
          `, [
            employeeId,
            docDetails[0].signedPdfPath,
            docDetails[0].templateName || 'Onboarding Document',
            adminId,
          ]);
          
          auditEvents.push({
            action: 'EMPLOYEE_DOCUMENT_ATTACHED',
            meta: { 
              employeeId, 
              documentId: doc.id, 
              templateName: docDetails[0].templateName,
            },
          });
        }
      }
      
      // C) CREATE/ACTIVATE USER ACCOUNT
      if (accountConfig && accountConfig.username) {
        // Check if username already exists
        const existingUsers = await pool.query(`
          SELECT id FROM users WHERE username = $1
        `, [accountConfig.username]);
        
        if (existingUsers.length > 0) {
          // Update existing user
          userId = existingUsers[0].id;
          await pool.query(`
            UPDATE users
            SET employee_id = $1, role = $2, is_active = true, updated_at = NOW()
            WHERE id = $3
          `, [employeeId, accountConfig.role || 'EMPLOYEE', userId]);
          
          auditEvents.push({
            action: 'USER_ACTIVATED',
            meta: { userId, username: accountConfig.username, role: accountConfig.role, updated: true },
          });
        } else {
          // Create new user with temporary password hash
          const bcrypt = require('bcrypt');
          const tempPassword = Math.random().toString(36).slice(-10);
          const passwordHash = await bcrypt.hash(tempPassword, 10);
          
          const newUser = await pool.query(`
            INSERT INTO users (
              username, password_hash, role, employee_id, 
              first_name, last_name, email, is_active, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
            RETURNING id
          `, [
            accountConfig.username,
            passwordHash,
            accountConfig.role || 'EMPLOYEE',
            employeeId,
            employeeData.firstName || null,
            employeeData.lastName || null,
            employeeData.email || null,
          ]);
          
          userId = newUser[0].id;
          
          auditEvents.push({
            action: 'USER_ACTIVATED',
            meta: { 
              userId, 
              username: accountConfig.username, 
              role: accountConfig.role, 
              created: true,
              tempPasswordSet: true,
            },
          });
        }
      }
      
      // D) FINALIZE SESSION (LOCK)
      await pool.query(`
        UPDATE onboarding_sessions
        SET status = 'completed', completed_at = NOW(), account_config = $2
        WHERE id = $1
      `, [id, JSON.stringify(accountConfig)]);
      
      auditEvents.push({
        action: 'ONBOARDING_COMPLETED',
        meta: { 
          sessionId: id, 
          employeeId, 
          userId,
          pathName: session.pathName,
        },
      });
      
      // COMMIT the transaction - all writes succeeded
      await pool.query('COMMIT');
      
      // Log all audit events AFTER commit to ensure consistency
      for (const event of auditEvents) {
        try {
          await auditService.logEvent({
            entityType: 'employee_onboarding',
            entityId: id,
            action: event.action,
            actor: { id: adminId, username: adminUsername },
            meta: event.meta,
          });
        } catch (auditError) {
          console.warn(`Audit logging failed for ${event.action}:`, auditError);
        }
      }
      
      res.json({
        success: true,
        message: 'Onboarding finalized successfully',
        employeeId,
        userId,
        auditEvents: auditEvents.map(e => e.action),
      });
      
    } catch (commitError) {
      // ROLLBACK the transaction - no changes were committed
      try {
        await pool.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }
      
      console.error('Finalization commit failed:', commitError);
      
      try {
        await auditService.logEvent({
          entityType: 'employee_onboarding',
          entityId: id,
          action: 'ONBOARDING_FINALIZATION_FAILED',
          actor: { id: adminId, username: adminUsername },
          meta: { 
            error: (commitError as Error).message,
            attemptedEvents: auditEvents.map(e => e.action),
          },
        });
      } catch (auditError) {
        console.warn('Audit logging failed for ONBOARDING_FINALIZATION_FAILED:', auditError);
      }
      
      return res.status(500).json({
        error: 'Finalization failed',
        message: 'An error occurred during finalization. All changes have been rolled back.',
        detail: (commitError as Error).message,
      });
    }
    
  } catch (error) {
    console.error('Error in finalization endpoint:', error);
    res.status(500).json({ error: 'Failed to finalize onboarding session' });
  }
});

// Helper function to map intake data to employee fields
function mapIntakeToEmployee(intakeData: Record<string, any>, schema: any[]): Record<string, any> {
  const employeeData: Record<string, any> = {};
  
  // Direct mapping for common field names
  const fieldMappings: Record<string, string> = {
    'name': 'name',
    'fullName': 'name',
    'full_name': 'name',
    'firstName': 'firstName',
    'first_name': 'firstName',
    'lastName': 'lastName',
    'last_name': 'lastName',
    'email': 'email',
    'emailAddress': 'email',
    'phone': 'phone',
    'phoneNumber': 'phone',
    'phone_number': 'phone',
    'jobTitle': 'jobTitle',
    'job_title': 'jobTitle',
    'title': 'jobTitle',
    'department': 'department',
    'hireDate': 'hireDate',
    'hire_date': 'hireDate',
    'startDate': 'hireDate',
    'start_date': 'hireDate',
    'dateOfBirth': 'dateOfBirth',
    'date_of_birth': 'dateOfBirth',
    'dob': 'dateOfBirth',
    'birthDate': 'dateOfBirth',
    'address': 'address',
    'homeAddress': 'address',
    'emergencyContact': 'emergencyContact',
    'emergency_contact': 'emergencyContact',
    'emergencyContactName': 'emergencyContact',
    'emergencyPhone': 'emergencyPhone',
    'emergency_phone': 'emergencyPhone',
    'emergencyContactPhone': 'emergencyPhone',
  };
  
  // First, use schema mappings if available
  for (const field of schema) {
    const fieldKey = field.name || field.fieldKey;
    const value = intakeData[fieldKey];
    
    if (value !== undefined && value !== null && value !== '') {
      // Check for explicit mapping in schema
      if (field.mappedToField) {
        employeeData[field.mappedToField] = value;
      }
      // Check for auto-mapping
      else if (fieldMappings[fieldKey]) {
        employeeData[fieldMappings[fieldKey]] = value;
      }
    }
  }
  
  // Also check intake data keys directly
  for (const [key, value] of Object.entries(intakeData)) {
    if (value !== undefined && value !== null && value !== '') {
      if (fieldMappings[key] && !employeeData[fieldMappings[key]]) {
        employeeData[fieldMappings[key]] = value;
      }
    }
  }
  
  // Build full name from firstName + lastName if name not set
  if (!employeeData.name && (employeeData.firstName || employeeData.lastName)) {
    employeeData.name = [employeeData.firstName, employeeData.lastName].filter(Boolean).join(' ');
  }
  
  return employeeData;
}

// POST /sessions/:id/bundle - Generate or retrieve onboarding PDF bundle
router.post('/sessions/:id/bundle', async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = (req as any).user?.id || 1;
  const adminUsername = (req as any).user?.username || 'system';
  
  try {
    // Generate or retrieve the bundle
    const result = await generateOnboardingBundle(id);
    
    if (!result.success) {
      return res.status(400).json({ 
        error: result.error || 'Failed to generate bundle' 
      });
    }
    
    // Log audit event
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_GENERATED',
        actor: { id: adminId, username: adminUsername },
        meta: { 
          mediaItemId: result.mediaItemId,
          downloadUrl: result.downloadUrl,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for ONBOARDING_BUNDLE_GENERATED:', auditError);
    }
    
    res.json({
      success: true,
      mediaItemId: result.mediaItemId,
      downloadUrl: result.downloadUrl,
    });
  } catch (error) {
    console.error('Error generating onboarding bundle:', error);
    res.status(500).json({ error: 'Failed to generate onboarding bundle' });
  }
});

// GET /sessions/:id/bundle - Get bundle status and download URL
router.get('/sessions/:id/bundle', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const sessions = await pool.query(`
      SELECT 
        s.id, s.status, s.bundle_media_item_id as "bundleMediaItemId",
        m.storage_path as "storagePath", m.filename
      FROM onboarding_sessions s
      LEFT JOIN media_library m ON s.bundle_media_item_id = m.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessions[0];
    
    if (!session.bundleMediaItemId) {
      return res.json({
        exists: false,
        canGenerate: session.status === 'completed',
      });
    }
    
    const downloadUrl = session.storagePath?.startsWith('/objects/') 
      ? session.storagePath 
      : `/api/media/download/${session.bundleMediaItemId}`;
    
    res.json({
      exists: true,
      mediaItemId: session.bundleMediaItemId,
      filename: session.filename,
      downloadUrl,
    });
  } catch (error) {
    console.error('Error fetching bundle status:', error);
    res.status(500).json({ error: 'Failed to fetch bundle status' });
  }
});

export default router;
