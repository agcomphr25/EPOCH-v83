import express, { Request, Response } from 'express';
import { pool } from '../../db';
import { z } from 'zod';
import { auditService } from '../services/auditService';

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

router.get('/sessions', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming in Phase 2'
  });
});

router.post('/sessions', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming in Phase 2'
  });
});

router.get('/sessions/:id', (_req: Request, res: Response) => {
  res.status(501).json({ 
    error: 'Not Implemented',
    message: 'Onboarding sessions API coming in Phase 2'
  });
});

export default router;
