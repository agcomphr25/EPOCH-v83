import express, { Request, Response } from 'express';
import { pool } from '../../db';
import { z } from 'zod';
import crypto from 'crypto';
import { auditService } from '../services/auditService';
import { generateOnboardingBundle } from '../services/onboardingPdfBundleService';
import { sendEmailViaSendGrid } from '../../utils/sendgrid';
import {
  getFileStorageProviderForObjectPath,
  isSupabaseObjectPath,
} from '../services/fileStorageProvider';
import * as fs from 'fs';
import * as path from 'path';

const router = express.Router();

const INVITE_TTL_DAYS = 7;
const VERIFICATION_CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createPublicInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function createVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function hashVerificationCode(invitationId: string, channel: string, code: string): string {
  const salt = process.env.ONBOARDING_CODE_HASH_SALT || process.env.SESSION_SECRET || 'epoch-onboarding-dev-salt';
  return sha256Hex(`${salt}:${invitationId}:${channel}:${code}`);
}

function maskEmail(email?: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '***';
}

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function actorFromRequest(req: Request) {
  const user = (req as any).user;
  return {
    id: user?.id,
    username: user?.username || user?.email || 'system',
  };
}

function requestIp(req: Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || null;
}

function signatureEvidenceHash(payload: Record<string, any>): string {
  return sha256Hex(JSON.stringify(payload));
}

async function logOnboardingEvent(req: Request, entityId: string, action: string, meta: Record<string, any> = {}) {
  try {
    await auditService.logEvent({
      entityType: 'employee_onboarding',
      entityId,
      action,
      actor: actorFromRequest(req),
      meta,
    });
  } catch (auditError) {
    console.warn(`Audit logging failed for ${action}:`, auditError);
  }
}

async function getInvitationByToken(token: string) {
  const tokenHash = sha256Hex(token);
  const invitations = await pool.query(`
    SELECT i.id, i.session_id as "sessionId", i.employee_id as "employeeId",
           i.delivery_mode as "deliveryMode", i.status, i.expires_at as "expiresAt",
           i.email, i.phone, i.email_verified_at as "emailVerifiedAt",
           i.phone_verified_at as "phoneVerifiedAt",
           i.no_cell_phone_available as "noCellPhoneAvailable",
           i.no_cell_phone_reason as "noCellPhoneReason",
           s.status as "sessionStatus", s.current_step as "currentStep",
           s.signature_auth_completed as "signatureAuthCompleted",
           p.name as "pathName", p.path_type as "pathType", p.path_purpose as "pathPurpose",
           e.name as "employeeName"
    FROM onboarding_invitations i
    JOIN onboarding_sessions s ON s.id = i.session_id
    JOIN onboarding_paths p ON p.id = s.path_id
    LEFT JOIN employees e ON e.id = i.employee_id
    WHERE i.token_hash = $1
    LIMIT 1
  `, [tokenHash]);

  if (invitations.length === 0) return null;
  return invitations[0];
}

function inviteCanAccessPaperwork(invitation: any): boolean {
  const emailVerified = !!invitation.emailVerifiedAt;
  const phoneVerified = !!invitation.phoneVerifiedAt || !!invitation.noCellPhoneAvailable;
  return emailVerified && phoneVerified && invitation.status === 'active' && new Date(invitation.expiresAt) > new Date();
}

async function sendVerificationNotice(channel: 'email' | 'phone', destination: string, code: string) {
  if (channel === 'email') {
    if (!process.env.SENDGRID_API_KEY) {
      console.warn(`[Onboarding] Email verification code for ${destination}: ${code}`);
      return { devMode: true };
    }

    await sendEmailViaSendGrid({
      to: destination,
      subject: 'Your EPOCH onboarding verification code',
      text: `Your EPOCH onboarding verification code is ${code}. It expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes.`,
      html: `<p>Your EPOCH onboarding verification code is <strong>${code}</strong>.</p><p>It expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes.</p>`,
    });
    return { devMode: false };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE || process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !authToken || !from) {
    console.warn(`[Onboarding] SMS verification code for ${destination}: ${code}`);
    return { devMode: true };
  }

  const twilioFactory = require('twilio');
  const client = twilioFactory(sid, authToken);
  await client.messages.create({
    to: destination,
    from,
    body: `Your EPOCH onboarding verification code is ${code}. It expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes.`,
  });

  return { devMode: false };
}

const pathTypeSchema = z.enum(['FULL_TIME', 'CONTRACT']);
const pathPurposeSchema = z.enum(['ONBOARDING', 'REHIRE']);

const createPathSchema = z.object({
  name: z.string().min(1),
  pathType: pathTypeSchema.optional().default('FULL_TIME'),
  pathPurpose: pathPurposeSchema.optional().default('ONBOARDING'),
  intakeFormId: z.string().uuid().nullable().optional(),
  documentFolderId: z.string().uuid().nullable().optional(),
  signatureAuthTemplateId: z.string().uuid().nullable().optional(),
  documentTemplateIds: z.array(z.string().uuid()).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updatePathSchema = z.object({
  name: z.string().min(1).optional(),
  pathType: pathTypeSchema.optional(),
  pathPurpose: pathPurposeSchema.optional(),
  intakeFormId: z.string().uuid().nullable().optional(),
  documentFolderId: z.string().uuid().nullable().optional(),
  signatureAuthTemplateId: z.string().uuid().nullable().optional(),
  documentTemplateIds: z.array(z.string().uuid()).nullable().optional(),
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
      SELECT id, name, path_type as "pathType", path_purpose as "pathPurpose",
             intake_form_id as "intakeFormId", document_folder_id as "documentFolderId", 
             signature_auth_template_id as "signatureAuthTemplateId",
             document_template_ids as "documentTemplateIds",
             is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
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
      SELECT id, name, path_type as "pathType", path_purpose as "pathPurpose",
             intake_form_id as "intakeFormId", document_folder_id as "documentFolderId", 
             signature_auth_template_id as "signatureAuthTemplateId",
             document_template_ids as "documentTemplateIds",
             is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
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
      INSERT INTO onboarding_paths (name, path_type, path_purpose, intake_form_id, document_folder_id, 
                                    signature_auth_template_id, document_template_ids, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, path_type as "pathType", path_purpose as "pathPurpose",
                intake_form_id as "intakeFormId", document_folder_id as "documentFolderId", 
                signature_auth_template_id as "signatureAuthTemplateId",
                document_template_ids as "documentTemplateIds",
                is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt"
    `, [
      parsed.data.name,
      parsed.data.pathType,
      parsed.data.pathPurpose,
      parsed.data.intakeFormId || null,
      parsed.data.documentFolderId || null,
      parsed.data.signatureAuthTemplateId || null,
      parsed.data.documentTemplateIds || null,
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
      SELECT id, name, path_type as "pathType", path_purpose as "pathPurpose",
             intake_form_id as "intakeFormId", document_folder_id as "documentFolderId", 
             signature_auth_template_id as "signatureAuthTemplateId",
             document_template_ids as "documentTemplateIds",
             is_active as "isActive"
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
    if (parsed.data.pathPurpose !== undefined) {
      updates.push(`path_purpose = $${paramIndex++}`);
      values.push(parsed.data.pathPurpose);
    }
    if (parsed.data.intakeFormId !== undefined) {
      updates.push(`intake_form_id = $${paramIndex++}`);
      values.push(parsed.data.intakeFormId);
    }
    if (parsed.data.documentFolderId !== undefined) {
      updates.push(`document_folder_id = $${paramIndex++}`);
      values.push(parsed.data.documentFolderId);
    }
    if (parsed.data.signatureAuthTemplateId !== undefined) {
      updates.push(`signature_auth_template_id = $${paramIndex++}`);
      values.push(parsed.data.signatureAuthTemplateId);
    }
    if (parsed.data.documentTemplateIds !== undefined) {
      updates.push(`document_template_ids = $${paramIndex++}`);
      values.push(parsed.data.documentTemplateIds);
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
      RETURNING id, name, path_type as "pathType", path_purpose as "pathPurpose",
                intake_form_id as "intakeFormId", document_folder_id as "documentFolderId", 
                signature_auth_template_id as "signatureAuthTemplateId",
                document_template_ids as "documentTemplateIds",
                is_active as "isActive",
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
  employeeDraft: z.object({
    name: z.string().min(1),
    preferredName: z.string().optional().default(''),
    email: z.string().email().optional(),
    phone: z.string().optional().default(''),
    jobTitle: z.string().optional().default(''),
    department: z.string().optional().default(''),
    hireDate: z.string().optional().default(''),
    payType: z.enum(['HOURLY', 'SALARY']).optional(),
  }).optional(),
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
        p.name as "pathName", p.path_type as "pathType", p.path_purpose as "pathPurpose",
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
          SELECT id, media_item_id as "mediaItemId", template_id as "templateId", 
                 instance_id as "instanceId", document_name as "documentName",
                 is_fillable as "isFillable", order_index as "orderIndex", 
                 status, signed_at as "signedAt"
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
        s.intake_data_schema as "intakeDataSchema", s.demographics_data as "demographicsData",
        s.current_step as "currentStep",
        s.started_at as "startedAt", s.paused_at as "pausedAt", s.completed_at as "completedAt",
        s.signature_auth_completed as "signatureAuthCompleted",
        s.signature_auth_data as "signatureAuthData",
        p.name as "pathName", p.path_type as "pathType", p.path_purpose as "pathPurpose",
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
    
    // Fetch documents with template info
    const documents = await pool.query(`
      SELECT sd.id, sd.media_item_id as "mediaItemId", sd.template_id as "templateId", 
             sd.instance_id as "instanceId", sd.document_name as "documentName",
             sd.is_fillable as "isFillable", sd.order_index as "orderIndex", 
             sd.status, sd.signed_at as "signedAt",
             COALESCE(t.name, sd.document_name) as "templateName",
             COALESCE(t.page_count, 1) as "pageCount"
      FROM onboarding_session_documents sd
      LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
      WHERE sd.session_id = $1
      ORDER BY sd.order_index
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
    const adminUsername = (req as any).user?.username || 'system';
    const { onboardingPathId, employeeDraft } = parsed.data;
    let { employeeId } = parsed.data;
    
    // Fetch the path to get intake form and document templates
    const paths = await pool.query(`
      SELECT id, name, path_type as "pathType", path_purpose as "pathPurpose",
             intake_form_id as "intakeFormId", document_folder_id as "documentFolderId",
             signature_auth_template_id as "signatureAuthTemplateId",
             document_template_ids as "documentTemplateIds"
      FROM onboarding_paths
      WHERE id = $1 AND is_active = true
    `, [onboardingPathId]);
    
    if (paths.length === 0) {
      return res.status(404).json({ error: 'Onboarding path not found or inactive' });
    }
    
    const path = paths[0];
    const isRehire = path.pathPurpose === 'REHIRE';
    
    // Validate re-hire requirements
    if (isRehire) {
      if (!employeeId) {
        return res.status(400).json({ 
          error: 'Re-hire sessions require selecting an existing employee' 
        });
      }
      
      // Check employee exists and is inactive
      const employees = await pool.query(`
        SELECT id, name, is_active as "isActive"
        FROM employees WHERE id = $1
      `, [employeeId]);
      
      if (employees.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      
      if (employees[0].isActive) {
        return res.status(400).json({ 
          error: 'Cannot start re-hire for active employee. Only inactive employees can be re-hired.' 
        });
      }
    }

    if (!isRehire && !employeeId && employeeDraft) {
      const inactiveEmployee = await pool.query(`
        INSERT INTO employees (
          name, preferred_name, email, phone, job_title, department, hire_date,
          user_role, employment_type, pay_type, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'EMPLOYEE', 'FULL_TIME', $8, false, NOW(), NOW())
        RETURNING id, name
      `, [
        employeeDraft.name.trim(),
        employeeDraft.preferredName?.trim() || null,
        employeeDraft.email || null,
        normalizePhone(employeeDraft.phone),
        employeeDraft.jobTitle?.trim() || null,
        employeeDraft.department?.trim() || null,
        employeeDraft.hireDate || null,
        employeeDraft.payType || null,
      ]);

      employeeId = inactiveEmployee[0].id;

      await logOnboardingEvent(req, String(employeeId), 'ONBOARDING_INACTIVE_EMPLOYEE_CREATED', {
        employeeId,
        employeeName: inactiveEmployee[0].name,
        onboardingPathId,
        payType: employeeDraft.payType || null,
      });
    }
    
    // Resolve intake form structure (snapshot) - optional for REHIRE paths
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
    
    // Resolve documents - prefer new ordered template IDs, fall back to legacy folder mode
    const templateIds = path.documentTemplateIds as string[] | null;
    
    if (templateIds && templateIds.length > 0) {
      // NEW MODE: Use ordered template IDs directly
      for (let i = 0; i < templateIds.length; i++) {
        const templateId = templateIds[i];
        
        // Fetch template info
        const templates = await pool.query(`
          SELECT id, name, source_media_item_id as "sourceMediaItemId", employer_signature_required as "employerSignatureRequired"
          FROM fillable_pdf_templates
          WHERE id = $1 AND is_active = true
        `, [templateId]);
        
        if (templates.length === 0) {
          console.warn(`Template ${templateId} not found or inactive, skipping`);
          continue;
        }
        
        const template = templates[0];
        
        // Generate unique signature IDs for the instance
        const crypto = await import('crypto');
        const publicSignatureId = 'onb_' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const signatureToken = crypto.randomBytes(32).toString('base64url');
        
        const instances = await pool.query(`
          INSERT INTO fillable_pdf_instances
            (template_id, entity_type, entity_id, public_signature_id, signature_token, status, environment, employer_signature_required)
          VALUES ($1, 'onboarding_session', $2, $3, $4, 'draft', 'dev', $5)
          RETURNING id
        `, [template.id, newSession.id, publicSignatureId, signatureToken, template.employerSignatureRequired || false]);
        
        const instanceId = instances[0].id;
        
        // Create session document entry
        await pool.query(`
          INSERT INTO onboarding_session_documents
            (session_id, media_item_id, template_id, instance_id, document_name, is_fillable, order_index, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [
          newSession.id,
          template.sourceMediaItemId || null,
          template.id,
          instanceId,
          template.name,
          true,
          i
        ]);
      }
    } else if (path.documentFolderId) {
      // LEGACY MODE: Resolve documents from folder
      const mediaItems = await pool.query(`
        SELECT id, filename, mime_type as "mimeType"
        FROM media_library
        WHERE folder_id = $1 AND mime_type = 'application/pdf'
        ORDER BY filename
      `, [path.documentFolderId]);
      
      // For each media item, check if there's a fillable template linked to it
      for (let i = 0; i < mediaItems.length; i++) {
        const mediaItem = mediaItems[i];
        
        // Check if there's a fillable PDF template for this media item
        const templates = await pool.query(`
          SELECT id, name, employer_signature_required as "employerSignatureRequired"
          FROM fillable_pdf_templates
          WHERE source_media_item_id = $1 AND is_active = true
          LIMIT 1
        `, [mediaItem.id]);
        
        const hasTemplate = templates.length > 0;
        const template = hasTemplate ? templates[0] : null;
        let instanceId = null;
        
        // If there's a fillable template, create an instance for this session
        if (hasTemplate && template) {
          // Generate unique signature IDs for the instance
          const crypto = await import('crypto');
          const publicSignatureId = 'onb_' + crypto.randomBytes(4).toString('hex').toUpperCase();
          const signatureToken = crypto.randomBytes(32).toString('base64url');
          
          const instances = await pool.query(`
            INSERT INTO fillable_pdf_instances
              (template_id, entity_type, entity_id, public_signature_id, signature_token, status, environment, employer_signature_required)
            VALUES ($1, 'onboarding_session', $2, $3, $4, 'draft', 'dev', $5)
            RETURNING id
          `, [template.id, newSession.id, publicSignatureId, signatureToken, template.employerSignatureRequired || false]);
          
          instanceId = instances[0].id;
        }
        
        // Create session document entry
        await pool.query(`
          INSERT INTO onboarding_session_documents
            (session_id, media_item_id, template_id, instance_id, document_name, is_fillable, order_index, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [
          newSession.id,
          mediaItem.id,
          template?.id || null,
          instanceId,
          mediaItem.filename.replace(/\.pdf$/i, ''),
          hasTemplate,
          i
        ]);
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
      SELECT id, media_item_id as "mediaItemId", template_id as "templateId", 
             instance_id as "instanceId", document_name as "documentName",
             is_fillable as "isFillable", order_index as "orderIndex", status
      FROM onboarding_session_documents
      WHERE session_id = $1
      ORDER BY order_index
    `, [newSession.id]);
    
    const captures = await pool.query(`
      SELECT id, capture_type as "captureType", media_item_id as "mediaItemId"
      FROM onboarding_session_captures
      WHERE session_id = $1
    `, [newSession.id]);
    
    // Audit log - use REHIRE_STARTED for re-hire sessions
    const auditAction = isRehire ? 'REHIRE_STARTED' : 'ONBOARDING_STARTED';
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: newSession.id,
        action: auditAction,
        actor: {
          id: adminId,
          username: adminUsername,
        },
        meta: {
          pathId: onboardingPathId,
          pathName: path.name,
          pathPurpose: path.pathPurpose,
          employeeId: employeeId || null,
          documentsCount: documents.length,
          capturesCount: captures.length,
          isRehire,
        },
      });
    } catch (auditError) {
      console.warn(`Audit logging failed for ${auditAction}:`, auditError);
    }
    
    res.status(201).json({
      ...newSession,
      pathName: path.name,
      pathType: path.pathType,
      pathPurpose: path.pathPurpose,
      documents,
      captures,
    });
  } catch (error) {
    console.error('Error creating onboarding session:', error);
    res.status(500).json({ error: 'Failed to create onboarding session' });
  }
});

const createInvitationSchema = z.object({
  deliveryMode: z.enum(['in_person', 'send_link']).optional().default('in_person'),
  noCellPhoneAvailable: z.boolean().optional().default(false),
  noCellPhoneReason: z.string().optional().default(''),
});

// POST /sessions/:id/invitation - Create a 7-day employee onboarding invite
router.post('/sessions/:id/invitation', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = createInvitationSchema.safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid invitation request', details: parsed.error.errors });
    }

    const sessions = await pool.query(`
      SELECT s.id, s.employee_id as "employeeId", s.status,
             e.name as "employeeName", e.email, e.phone
      FROM onboarding_sessions s
      LEFT JOIN employees e ON e.id = s.employee_id
      WHERE s.id = $1
    `, [id]);

    if (sessions.length === 0) return res.status(404).json({ error: 'Onboarding session not found' });

    const session = sessions[0];
    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Only in-progress sessions can receive an invite' });
    }
    if (!session.employeeId) {
      return res.status(400).json({ error: 'Create or link an inactive employee before inviting them' });
    }
    if (!session.email) {
      return res.status(400).json({ error: 'Employee email is required before creating an invite' });
    }

    const phone = normalizePhone(session.phone);
    if (!phone && !parsed.data.noCellPhoneAvailable) {
      return res.status(400).json({ error: 'Employee cell phone is required unless no cell phone is available' });
    }
    if (parsed.data.noCellPhoneAvailable && parsed.data.noCellPhoneReason.trim().length < 3) {
      return res.status(400).json({ error: 'A reason is required when marking no cell phone available' });
    }

    const actor = actorFromRequest(req);
    const token = createPublicInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(`
      UPDATE onboarding_invitations
      SET status = 'revoked',
          revoked_at = NOW(),
          revoked_by_user_id = $2,
          revoked_reason = 'Replaced by a new invite'
      WHERE session_id = $1 AND status = 'active'
    `, [id, actor.id || null]);

    const invitations = await pool.query(`
      INSERT INTO onboarding_invitations (
        session_id, employee_id, token_hash, public_token_hint, delivery_mode,
        status, expires_at, email, phone, no_cell_phone_available,
        no_cell_phone_reason, no_cell_phone_marked_by_user_id,
        no_cell_phone_marked_at, created_by_user_id, created_by_display_name
      ) VALUES (
        $1, $2, $3, $4, $5, 'active', $6, $7, $8, $9,
        $10, $11, CASE WHEN $9 = true THEN NOW() ELSE NULL END, $12, $13
      )
      RETURNING id, session_id as "sessionId", employee_id as "employeeId",
                delivery_mode as "deliveryMode", status, expires_at as "expiresAt",
                email, phone, no_cell_phone_available as "noCellPhoneAvailable",
                no_cell_phone_reason as "noCellPhoneReason", created_at as "createdAt"
    `, [
      id,
      session.employeeId,
      sha256Hex(token),
      token.slice(-6),
      parsed.data.deliveryMode,
      expiresAt.toISOString(),
      session.email,
      phone,
      parsed.data.noCellPhoneAvailable,
      parsed.data.noCellPhoneAvailable ? parsed.data.noCellPhoneReason.trim() : null,
      parsed.data.noCellPhoneAvailable ? actor.id || null : null,
      actor.id || null,
      actor.username,
    ]);

    await logOnboardingEvent(req, id, 'ONBOARDING_INVITE_CREATED', {
      invitationId: invitations[0].id,
      employeeId: session.employeeId,
      deliveryMode: parsed.data.deliveryMode,
      expiresAt: expiresAt.toISOString(),
      noCellPhoneAvailable: parsed.data.noCellPhoneAvailable,
    });

    if (parsed.data.noCellPhoneAvailable) {
      await logOnboardingEvent(req, id, 'ONBOARDING_NO_CELL_PHONE_OVERRIDE', {
        invitationId: invitations[0].id,
        employeeId: session.employeeId,
        reason: parsed.data.noCellPhoneReason.trim(),
      });
    }

    res.status(201).json({
      invitation: {
        ...invitations[0],
        email: maskEmail(invitations[0].email),
        phone: maskPhone(invitations[0].phone),
      },
      inviteUrl: `/onboarding/invite/${token}`,
      token,
    });
  } catch (error) {
    console.error('Error creating onboarding invite:', error);
    res.status(500).json({ error: 'Failed to create onboarding invite' });
  }
});

// GET /invite/:token - Public invite status and gated session summary
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const invitation = await getInvitationByToken(req.params.token);
    if (!invitation) return res.status(404).json({ error: 'Invite not found' });

    const expired = new Date(invitation.expiresAt) <= new Date();
    if (invitation.status !== 'active' || expired) {
      return res.status(410).json({ error: expired ? 'Invite expired' : 'Invite is no longer active' });
    }

    const canAccessPaperwork = inviteCanAccessPaperwork(invitation);
    let documents: any[] = [];
    if (canAccessPaperwork) {
      documents = await pool.query(`
        SELECT sd.id, sd.media_item_id as "mediaItemId", sd.template_id as "templateId",
               sd.instance_id as "instanceId", sd.document_name as "documentName",
               sd.is_fillable as "isFillable", sd.order_index as "orderIndex",
               sd.status, sd.signed_at as "signedAt",
               COALESCE(t.name, sd.document_name) as "templateName",
               COALESCE(t.page_count, 1) as "pageCount"
        FROM onboarding_session_documents sd
        LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
        WHERE sd.session_id = $1
        ORDER BY sd.order_index
      `, [invitation.sessionId]);
    }

    res.json({
      id: invitation.id,
      sessionId: invitation.sessionId,
      employeeId: invitation.employeeId,
      employeeName: invitation.employeeName,
      pathName: invitation.pathName,
      pathType: invitation.pathType,
      pathPurpose: invitation.pathPurpose,
      sessionStatus: invitation.sessionStatus,
      currentStep: invitation.currentStep,
      signatureAuthCompleted: invitation.signatureAuthCompleted,
      expiresAt: invitation.expiresAt,
      email: maskEmail(invitation.email),
      phone: maskPhone(invitation.phone),
      emailVerified: !!invitation.emailVerifiedAt,
      phoneVerified: !!invitation.phoneVerifiedAt,
      noCellPhoneAvailable: !!invitation.noCellPhoneAvailable,
      canAccessPaperwork,
      documents,
    });
  } catch (error) {
    console.error('Error fetching onboarding invite:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding invite' });
  }
});

const sendInviteCodeSchema = z.object({ channel: z.enum(['email', 'phone']) });

router.post('/invite/:token/send-code', async (req: Request, res: Response) => {
  try {
    const parsed = sendInviteCodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid verification request', details: parsed.error.errors });

    const invitation = await getInvitationByToken(req.params.token);
    if (!invitation) return res.status(404).json({ error: 'Invite not found' });
    if (invitation.status !== 'active' || new Date(invitation.expiresAt) <= new Date()) {
      return res.status(410).json({ error: 'Invite expired or inactive' });
    }
    if (parsed.data.channel === 'phone' && invitation.noCellPhoneAvailable) {
      return res.status(400).json({ error: 'Phone verification has been waived by HR' });
    }

    const destination = parsed.data.channel === 'email' ? invitation.email : invitation.phone;
    if (!destination) return res.status(400).json({ error: `${parsed.data.channel} destination is not available` });

    const code = createVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);

    await pool.query(`
      UPDATE onboarding_verification_codes
      SET status = 'superseded'
      WHERE invitation_id = $1 AND channel = $2 AND status = 'pending'
    `, [invitation.id, parsed.data.channel]);

    await pool.query(`
      INSERT INTO onboarding_verification_codes (
        invitation_id, channel, code_hash, status, attempts, sent_to, expires_at
      ) VALUES ($1, $2, $3, 'pending', 0, $4, $5)
    `, [
      invitation.id,
      parsed.data.channel,
      hashVerificationCode(invitation.id, parsed.data.channel, code),
      destination,
      expiresAt.toISOString(),
    ]);

    const delivery = await sendVerificationNotice(parsed.data.channel, destination, code);
    await logOnboardingEvent(req, invitation.sessionId, 'ONBOARDING_VERIFICATION_CODE_SENT', {
      invitationId: invitation.id,
      channel: parsed.data.channel,
      destination: parsed.data.channel === 'email' ? maskEmail(destination) : maskPhone(destination),
      devMode: delivery.devMode,
    });

    res.json({
      success: true,
      channel: parsed.data.channel,
      sentTo: parsed.data.channel === 'email' ? maskEmail(destination) : maskPhone(destination),
      expiresAt: expiresAt.toISOString(),
      devCode: delivery.devMode && process.env.NODE_ENV !== 'production' ? code : undefined,
    });
  } catch (error) {
    console.error('Error sending onboarding verification code:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

const verifyInviteCodeSchema = z.object({
  channel: z.enum(['email', 'phone']),
  code: z.string().regex(/^\d{6}$/),
});

router.post('/invite/:token/verify-code', async (req: Request, res: Response) => {
  try {
    const parsed = verifyInviteCodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid verification code', details: parsed.error.errors });

    const invitation = await getInvitationByToken(req.params.token);
    if (!invitation) return res.status(404).json({ error: 'Invite not found' });
    if (invitation.status !== 'active' || new Date(invitation.expiresAt) <= new Date()) {
      return res.status(410).json({ error: 'Invite expired or inactive' });
    }

    const codes = await pool.query(`
      SELECT id, code_hash as "codeHash", attempts, expires_at as "expiresAt"
      FROM onboarding_verification_codes
      WHERE invitation_id = $1 AND channel = $2 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `, [invitation.id, parsed.data.channel]);

    if (codes.length === 0) return res.status(400).json({ error: 'No pending verification code found' });

    const codeRecord = codes[0];
    if (new Date(codeRecord.expiresAt) <= new Date()) {
      await pool.query(`UPDATE onboarding_verification_codes SET status = 'expired' WHERE id = $1`, [codeRecord.id]);
      return res.status(400).json({ error: 'Verification code expired' });
    }
    if (codeRecord.attempts >= MAX_CODE_ATTEMPTS) {
      await pool.query(`UPDATE onboarding_verification_codes SET status = 'locked' WHERE id = $1`, [codeRecord.id]);
      return res.status(400).json({ error: 'Too many verification attempts' });
    }

    const submittedHash = hashVerificationCode(invitation.id, parsed.data.channel, parsed.data.code);
    if (submittedHash !== codeRecord.codeHash) {
      await pool.query(`
        UPDATE onboarding_verification_codes
        SET attempts = attempts + 1
        WHERE id = $1
      `, [codeRecord.id]);

      await logOnboardingEvent(req, invitation.sessionId, 'ONBOARDING_VERIFICATION_FAILED', {
        invitationId: invitation.id,
        channel: parsed.data.channel,
      });

      return res.status(400).json({ error: 'Verification code is incorrect' });
    }

    await pool.query(`
      UPDATE onboarding_verification_codes
      SET status = 'verified', verified_at = NOW(), attempts = attempts + 1
      WHERE id = $1
    `, [codeRecord.id]);

    const verifiedColumn = parsed.data.channel === 'email' ? 'email_verified_at' : 'phone_verified_at';
    await pool.query(`UPDATE onboarding_invitations SET ${verifiedColumn} = NOW() WHERE id = $1`, [invitation.id]);

    await logOnboardingEvent(req, invitation.sessionId, 'ONBOARDING_VERIFICATION_COMPLETED', {
      invitationId: invitation.id,
      channel: parsed.data.channel,
    });

    const updatedInvitation = await getInvitationByToken(req.params.token);
    res.json({
      success: true,
      channel: parsed.data.channel,
      canAccessPaperwork: updatedInvitation ? inviteCanAccessPaperwork(updatedInvitation) : false,
    });
  } catch (error) {
    console.error('Error verifying onboarding code:', error);
    res.status(500).json({ error: 'Failed to verify code' });
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

// Demographics validation schema
const demographicsSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  preferredName: z.string().optional().default(''),
  email: z.string().email('Invalid email'),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().optional().default(''),
  aptUnit: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().optional().default(''),
  zipCode: z.string().optional().default(''),
  vehicleType: z.string().optional().default(''),
  vehicleColor: z.string().optional().default(''),
  vehicleMakeModel: z.string().optional().default(''),
  driversLicenseNumber: z.string().optional().default(''),
  driversLicenseState: z.string().optional().default(''),
  driversLicenseExpiration: z.string().optional().default(''),
  driversLicensePhotoId: z.string().nullable().optional().default(null),
  bankName: z.string().optional().default(''),
  bankRoutingNumber: z.string().optional().default(''),
  bankAccountNumber: z.string().optional().default(''),
  bankAccountType: z.string().optional().default(''),
  voidedCheckPhotoId: z.string().nullable().optional().default(null),
  skippedSections: z.array(z.string()).optional().default([]),
});

// PATCH /sessions/:id/demographics - Save fixed-schema demographics (NEW SYSTEM)
router.patch('/sessions/:id/demographics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = demographicsSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid demographics data',
        details: parsed.error.errors,
      });
    }
    
    const demographics = parsed.data;
    
    // Check session exists and is not completed
    const sessions = await pool.query(`
      SELECT s.id, s.status, s.employee_id as "employeeId", 
             p.path_purpose as "pathPurpose"
      FROM onboarding_sessions s
      JOIN onboarding_paths p ON s.path_id = p.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Cannot modify completed session' });
    }
    
    // Save demographics to session
    await pool.query(`
      UPDATE onboarding_sessions
      SET demographics_data = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(demographics), id]);
    
    // Update the linked employee profile without activating it. Re-hire activation
    // remains an admin approval/finalization action.
    if (session.employeeId) {
      const fullName = `${demographics.firstName} ${demographics.lastName}`.trim();
      const streetAddress = demographics.aptUnit 
        ? `${demographics.address} ${demographics.aptUnit}`.trim()
        : demographics.address;
      const fullAddress = streetAddress 
        ? `${streetAddress}${demographics.city ? ', ' + demographics.city : ''}${demographics.state ? ', ' + demographics.state : ''} ${demographics.zipCode || ''}`.trim()
        : null;
      
      await pool.query(`
        UPDATE employees
        SET name = $1,
            preferred_name = $2,
            email = $3,
            phone = $4,
            address = $5,
            city = $6,
            state = $7,
            zip_code = $8,
            vehicle_type = $9,
            vehicle_make_model = $10,
            drivers_license_number = $11,
            drivers_license_state = $12,
            drivers_license_expiration = $13,
            bank_name = $14,
            bank_routing_number = $15,
            bank_account_number = $16,
            bank_account_type = $17,
            updated_at = NOW()
        WHERE id = $18
      `, [
        fullName,
        demographics.preferredName || null,
        demographics.email || null,
        demographics.phone || null,
        fullAddress,
        demographics.city || null,
        demographics.state || null,
        demographics.zipCode || null,
        demographics.vehicleType || null,
        demographics.vehicleMakeModel || null,
        demographics.driversLicenseNumber || null,
        demographics.driversLicenseState || null,
        demographics.driversLicenseExpiration || null,
        demographics.bankName || null,
        demographics.bankRoutingNumber || null,
        demographics.bankAccountNumber || null,
        demographics.bankAccountType || null,
        session.employeeId,
      ]);
    }
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'DEMOGRAPHICS_SAVED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: {
          employeeName: `${demographics.firstName} ${demographics.lastName}`,
          isRehire: session.pathPurpose === 'REHIRE',
          employeeId: session.employeeId,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for DEMOGRAPHICS_SAVED:', auditError);
    }
    
    res.json({ 
      success: true, 
      demographicsData: demographics,
      employeeUpdated: !!session.employeeId,
    });
  } catch (error) {
    console.error('Error saving demographics:', error);
    res.status(500).json({ error: 'Failed to save demographics' });
  }
});

// PATCH /sessions/:id/signature-auth - Save signature authorization
router.patch('/sessions/:id/signature-auth', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { signedName, signatureImage, acknowledged, signedAt } = req.body;
    
    const hasTypedSignature = signedName && signedName.trim().length >= 2;
    const hasDrawnSignature = signatureImage && signatureImage.startsWith('data:image/');
    
    if (!hasTypedSignature && !hasDrawnSignature) {
      return res.status(400).json({ error: 'Either a typed name or drawn signature is required' });
    }
    
    if (!acknowledged) {
      return res.status(400).json({ error: 'Acknowledgement is required' });
    }
    
    const sessions = await pool.query(`
      SELECT id, status FROM onboarding_sessions WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessions[0];
    
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'Cannot modify completed session' });
    }
    
    const signatureAuthData: Record<string, any> = {
      acknowledged: true,
      signedAt: signedAt || new Date().toISOString(),
      ipAddress: requestIp(req),
      userAgent: req.get('user-agent') || null,
      method: hasTypedSignature ? 'typed' : 'drawn',
    };
    
    if (hasTypedSignature) {
      signatureAuthData.signedName = signedName.trim();
    }
    
    if (hasDrawnSignature) {
      signatureAuthData.signatureImage = signatureImage;
    }

    signatureAuthData.evidenceHash = signatureEvidenceHash({
      sessionId: id,
      acknowledged: signatureAuthData.acknowledged,
      signedName: signatureAuthData.signedName || null,
      signedAt: signatureAuthData.signedAt,
      ipAddress: signatureAuthData.ipAddress,
      userAgent: signatureAuthData.userAgent,
      method: signatureAuthData.method,
    });
    
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    signatureAuthData.signedFromIp = Array.isArray(clientIp) ? clientIp[0] : clientIp;
    
    await pool.query(`
      UPDATE onboarding_sessions
      SET signature_auth_completed = true,
          signature_auth_data = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(signatureAuthData), id]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'SIGNATURE_AUTH_COMPLETED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: { 
          signedName: hasTypedSignature ? signedName.trim() : undefined,
          signatureType: hasDrawnSignature ? 'drawn' : 'typed',
          evidenceHash: signatureAuthData.evidenceHash,
        },
      });
    } catch (auditError) {
      console.warn('Audit logging failed:', auditError);
    }
    
    res.json({ success: true, signatureAuthCompleted: true });
  } catch (error) {
    console.error('Error saving signature authorization:', error);
    res.status(500).json({ error: 'Failed to save signature authorization' });
  }
});

// GET /sessions/:id/signature-auth - Get signature auth status
router.get('/sessions/:id/signature-auth', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const sessions = await pool.query(`
      SELECT signature_auth_completed as "signatureAuthCompleted",
             signature_auth_data as "signatureAuthData"
      FROM onboarding_sessions WHERE id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(sessions[0]);
  } catch (error) {
    console.error('Error fetching signature auth status:', error);
    res.status(500).json({ error: 'Failed to fetch signature auth status' });
  }
});

// GET /sessions/:id/demographics - Get demographics (with prefill for re-hire)
router.get('/sessions/:id/demographics', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Get session with employee data for prefill
    const sessions = await pool.query(`
      SELECT s.id, s.demographics_data as "demographicsData", s.employee_id as "employeeId",
             p.path_purpose as "pathPurpose",
             e.name, e.preferred_name as "preferredName", e.email, e.phone, e.address, 
             e.city, e.state, e.zip_code as "zipCode",
             e.vehicle_type as "vehicleType", e.vehicle_make_model as "vehicleMakeModel",
             e.drivers_license_number as "driversLicenseNumber", 
             e.drivers_license_state as "driversLicenseState",
             e.drivers_license_expiration as "driversLicenseExpiration",
             e.bank_name as "bankName", e.bank_routing_number as "bankRoutingNumber",
             e.bank_account_number as "bankAccountNumber", e.bank_account_type as "bankAccountType"
      FROM onboarding_sessions s
      JOIN onboarding_paths p ON s.path_id = p.id
      LEFT JOIN employees e ON s.employee_id = e.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessions[0];
    
    // If demographics already saved, return it
    if (session.demographicsData && Object.keys(session.demographicsData).length > 0) {
      return res.json({
        demographicsData: session.demographicsData,
        isRehire: session.pathPurpose === 'REHIRE',
        source: 'session',
      });
    }
    
    // For re-hire, prefill from employee record
    if (session.pathPurpose === 'REHIRE' && session.employeeId && session.name) {
      const nameParts = (session.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const prefilled = {
        firstName,
        lastName,
        preferredName: session.preferredName || '',
        email: session.email || '',
        phone: session.phone || '',
        address: session.address || '',
        aptUnit: '',
        city: session.city || '',
        state: session.state || '',
        zipCode: session.zipCode || '',
        vehicleType: session.vehicleType || '',
        vehicleMakeModel: session.vehicleMakeModel || '',
        driversLicenseNumber: session.driversLicenseNumber || '',
        driversLicenseState: session.driversLicenseState || '',
        driversLicenseExpiration: session.driversLicenseExpiration || '',
        driversLicensePhotoId: null,
        bankName: session.bankName || '',
        bankRoutingNumber: session.bankRoutingNumber || '',
        bankAccountNumber: session.bankAccountNumber || '',
        bankAccountType: session.bankAccountType || '',
        voidedCheckPhotoId: null,
      };
      
      return res.json({
        demographicsData: prefilled,
        isRehire: true,
        source: 'employee_prefill',
      });
    }
    
    // New hire with no data yet
    res.json({
      demographicsData: null,
      isRehire: session.pathPurpose === 'REHIRE',
      source: 'empty',
    });
  } catch (error) {
    console.error('Error fetching demographics:', error);
    res.status(500).json({ error: 'Failed to fetch demographics' });
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

// GET /sessions/:sessionId/documents/:docId/pdf - Serve document PDF with correct source resolution
router.get('/sessions/:sessionId/documents/:docId/pdf', async (req: Request, res: Response) => {
  try {
    const { sessionId, docId } = req.params;
    
    // Fetch document with all related data for resolution
    // Also fetch source_media_item from template as fallback for legacy paths
    const docs = await pool.query(`
      SELECT 
        sd.id, sd.status, sd.template_id as "templateId",
        sd.instance_id as "instanceId", sd.media_item_id as "mediaItemId",
        sd.is_fillable as "isFillable",
        i.signed_pdf_path as "signedPdfPath",
        t.template_pdf_path as "templatePdfPath",
        t.source_media_item_id as "sourceMediaItemId",
        m.storage_path as "mediaStoragePath",
        sm.storage_path as "sourceMediaStoragePath"
      FROM onboarding_session_documents sd
      LEFT JOIN fillable_pdf_instances i ON sd.instance_id = i.id
      LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
      LEFT JOIN media_library m ON sd.media_item_id = m.id
      LEFT JOIN media_library sm ON t.source_media_item_id = sm.id
      WHERE sd.id = $1 AND sd.session_id = $2
    `, [docId, sessionId]);
    
    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const doc = docs[0];
    let pdfPath: string | null = null;
    
    // Resolution logic - prioritize object storage paths:
    // 1. Signed PDF (if document is signed)
    // 2. Source media from object storage (canonical for scaffolded templates)
    // 3. Template PDF from object storage
    // 4. Media storage from object storage
    // 5. Legacy filesystem paths (development only)
    
    if (doc.status === 'signed' && doc.signedPdfPath) {
      pdfPath = doc.signedPdfPath;
    } else if (doc.sourceMediaStoragePath && doc.sourceMediaStoragePath.startsWith('/objects/')) {
      pdfPath = doc.sourceMediaStoragePath;
    } else if (doc.templatePdfPath && doc.templatePdfPath.startsWith('/objects/')) {
      pdfPath = doc.templatePdfPath;
    } else if (doc.mediaStoragePath && doc.mediaStoragePath.startsWith('/objects/')) {
      pdfPath = doc.mediaStoragePath;
    } else if (doc.templatePdfPath) {
      pdfPath = doc.templatePdfPath;
    } else if (doc.mediaStoragePath) {
      pdfPath = doc.mediaStoragePath;
    }
    
    if (!pdfPath) {
      console.error('[Onboarding PDF] No valid PDF path found for document:', docId);
      return res.status(404).json({ error: 'PDF source not available' });
    }
    
    const normalizedPdfPath = pdfPath.startsWith('objects/') ? `/${pdfPath}` : pdfPath;

    // Check if path is object storage.
    if (normalizedPdfPath.startsWith('/objects/') || isSupabaseObjectPath(normalizedPdfPath)) {
      try {
        console.log('[Onboarding PDF] DIRECT FETCH - downloading object path:', normalizedPdfPath);
        const buffer = await getFileStorageProviderForObjectPath(normalizedPdfPath).downloadBuffer(normalizedPdfPath);
        
        // Log buffer details
        const first20Hex = buffer.slice(0, 20).toString('hex');
        const first20Ascii = buffer.slice(0, 20).toString('ascii');
        console.log('[Onboarding PDF] DIRECT FETCH - buffer details:', {
          contentLength: buffer.length,
          first20Hex: first20Hex,
          first20Ascii: first20Ascii,
          startsWithPDF: first20Ascii.startsWith('%PDF')
        });
        
        // Serve directly
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        
        console.log('[Onboarding PDF] DIRECT FETCH - sending response with headers:', {
          contentType: 'application/pdf',
          contentLength: buffer.length
        });
        
        res.send(buffer);
        return;
      } catch (error: any) {
        console.error('[Onboarding PDF] DIRECT FETCH ERROR:', error.message, error.stack);
        if (error.name === 'ObjectNotFoundError') {
          return res.status(404).json({ error: 'PDF file not found in object storage' });
        }
        return res.status(500).json({ error: 'Failed to fetch PDF from object storage', details: error.message });
      }
    }
    
    // Legacy: local filesystem path
    let resolvedPath = pdfPath;
    if (!path.isAbsolute(pdfPath)) {
      resolvedPath = path.resolve(process.cwd(), pdfPath);
    }
    
    // Security: Ensure path is within allowed directories
    const allowedBases = [
      path.resolve(process.cwd(), 'uploads'),
      '/home/runner/workspace/uploads'
    ];
    
    const isAllowed = allowedBases.some(base => resolvedPath.startsWith(base));
    if (!isAllowed) {
      console.error('[Onboarding PDF] Path traversal attempt blocked:', pdfPath);
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      console.error('[Onboarding PDF] File not found:', resolvedPath);
      console.error('[Onboarding PDF] This is a legacy filesystem path that does not exist in production.');
      console.error('[Onboarding PDF] Template needs to be re-uploaded to use object storage.');
      
      // Return a specific error so the frontend can show a helpful message
      return res.status(404).json({ 
        error: 'Template PDF not available',
        code: 'LEGACY_STORAGE_PATH',
        message: 'This template uses legacy storage. Please re-upload the template through the PDF Template Manager.',
        templateId: doc.templateId,
        path: pdfPath
      });
    }
    
    // Serve the PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(resolvedPath);
    
  } catch (error) {
    console.error('[Onboarding PDF] Error serving document PDF:', error);
    res.status(500).json({ error: 'Failed to serve PDF' });
  }
});

// POST /sessions/:sessionId/documents/:docId/sign - Sign a document
router.post('/sessions/:sessionId/documents/:docId/sign', async (req: Request, res: Response) => {
  try {
    const { sessionId, docId } = req.params;
    const { signatureData, initials, signedAt } = req.body;
    
    // Validate signature data is provided
    if (!signatureData || typeof signatureData !== 'string' || signatureData.trim().length < 2) {
      return res.status(400).json({ error: 'Valid signature data is required' });
    }
    
    // Verify session and document exist
    const docs = await pool.query(`
      SELECT sd.id, sd.status, sd.session_id as "sessionId", 
             t.name as "templateName"
      FROM onboarding_session_documents sd
      LEFT JOIN fillable_pdf_templates t ON sd.template_id = t.id
      WHERE sd.id = $1 AND sd.session_id = $2
    `, [docId, sessionId]);
    
    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const doc = docs[0];
    
    if (doc.status === 'signed') {
      return res.status(400).json({ error: 'Document already signed' });
    }
    
    const signedAtValue = signedAt || new Date().toISOString();
    const signatureEvidence = {
      typedName: signatureData.trim(),
      initials: initials || {},
      signedAt: signedAtValue,
      ipAddress: requestIp(req),
      userAgent: req.get('user-agent') || null,
      method: 'typed',
    };
    const signaturePayload = {
      ...signatureEvidence,
      evidenceHash: signatureEvidenceHash({
        sessionId,
        docId,
        ...signatureEvidence,
      }),
    };

    // Update document status to signed
    await pool.query(`
      UPDATE onboarding_session_documents
      SET status = 'signed',
          signed_at = $1,
          signature_data = $2,
          initials_data = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [signedAtValue, JSON.stringify(signaturePayload), JSON.stringify(initials || {}), docId]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: sessionId,
        action: 'DOCUMENT_SIGNED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: { docId, templateName: doc.templateName, evidenceHash: signaturePayload.evidenceHash },
      });
    } catch (auditError) {
      console.warn('Audit logging failed for DOCUMENT_SIGNED:', auditError);
    }
    
    res.json({ success: true, status: 'signed' });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({ error: 'Failed to sign document' });
  }
});

// PATCH /sessions/:sessionId/documents/:docId/status - Update document status (skip/defer)
router.patch('/sessions/:sessionId/documents/:docId/status', async (req: Request, res: Response) => {
  try {
    const { sessionId, docId } = req.params;
    const { status } = req.body;
    
    if (!['skipped', 'deferred', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be skipped, deferred, or pending.' });
    }
    
    // Verify document exists
    const docs = await pool.query(`
      SELECT id, session_id as "sessionId" 
      FROM onboarding_session_documents 
      WHERE id = $1 AND session_id = $2
    `, [docId, sessionId]);
    
    if (docs.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    await pool.query(`
      UPDATE onboarding_session_documents
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `, [status, docId]);
    
    try {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: sessionId,
        action: status === 'skipped' ? 'DOCUMENT_SKIPPED' : 'DOCUMENT_DEFERRED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'system',
        },
        meta: { docId, status },
      });
    } catch (auditError) {
      console.warn('Audit logging failed:', auditError);
    }
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating document status:', error);
    res.status(500).json({ error: 'Failed to update document status' });
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
    
    // Get account config from request body (passed from frontend)
    const { accountConfig: requestAccountConfig } = req.body;
    
    // 1. Fetch session with all related data
    const sessions = await pool.query(`
      SELECT 
        s.id, s.employee_id as "employeeId", s.path_id as "pathId",
        s.admin_id as "adminId", s.status, s.intake_data as "intakeData",
        s.intake_data_schema as "intakeDataSchema", s.demographics_data as "demographicsData",
        s.current_step as "currentStep",
        s.started_at as "startedAt",
        p.name as "pathName", p.path_type as "pathType", p.path_purpose as "pathPurpose"
      FROM onboarding_sessions s
      LEFT JOIN onboarding_paths p ON s.path_id = p.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Onboarding session not found' });
    }
    
    const session = sessions[0];
    const isRehire = session.pathPurpose === 'REHIRE';
    
    // Check 1: Session status must be in_progress
    if (session.status !== 'in_progress') {
      validationErrors.push(`Session status is '${session.status}', must be 'in_progress' to finalize`);
    }
    
    // Check 1a: Re-hire sessions MUST have an existing employee linked
    if (isRehire && !session.employeeId) {
      validationErrors.push('Re-hire session requires an existing employee to be linked');
    }
    
    // Check 2: Intake form marked complete (if intake schema exists)
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
    
    // Check 3b: All documents requiring employer signature have been signed by employer
    const pendingEmployerSignatures = await pool.query(`
      SELECT osd.id, fpi.employer_signature_required, fpi.employer_signed_at
      FROM onboarding_session_documents osd
      JOIN fillable_pdf_instances fpi ON fpi.id = osd.instance_id
      WHERE osd.session_id = $1
        AND fpi.signed_at IS NOT NULL
        AND fpi.employer_signature_required = true
        AND fpi.employer_signed_at IS NULL
    `, [id]);
    
    if (pendingEmployerSignatures && pendingEmployerSignatures.length > 0) {
      validationErrors.push(`${pendingEmployerSignatures.length} document(s) awaiting employer signature`);
    }
    
    // Check 4: Camera captures (optional - just fetch for reference, no validation errors)
    const captures = await pool.query(`
      SELECT id, capture_type as "captureType", media_item_id as "mediaItemId", is_required as "isRequired"
      FROM onboarding_session_captures
      WHERE session_id = $1
    `, [id]);
    
    // Check 5: User account configuration (optional - can finalize without creating a user account)
    const accountConfig = requestAccountConfig || null;
    
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
    
    // Prefer demographicsData (new system) over intakeData (legacy)
    const demographicsData = session.demographicsData || {};
    const employeeData = Object.keys(demographicsData).length > 0
      ? mapDemographicsToEmployee(demographicsData)
      : mapIntakeToEmployee(intakeData, intakeSchema);
    
    // Begin transaction
    await pool.query('BEGIN');
    
    try {
      // A) CREATE OR UPDATE EMPLOYEE (RE-HIRE always updates + reactivates)
      if (employeeId) {
        // UPDATE existing employee
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;
        
        // For re-hire: ALWAYS reactivate the employee
        if (isRehire) {
          updateFields.push(`is_active = $${paramIndex++}`);
          updateValues.push(true);
        }
        
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
        if (employeeData.city) {
          updateFields.push(`city = $${paramIndex++}`);
          updateValues.push(employeeData.city);
        }
        if (employeeData.state) {
          updateFields.push(`state = $${paramIndex++}`);
          updateValues.push(employeeData.state);
        }
        if (employeeData.zipCode) {
          updateFields.push(`zip_code = $${paramIndex++}`);
          updateValues.push(employeeData.zipCode);
        }
        if (employeeData.vehicleType) {
          updateFields.push(`vehicle_type = $${paramIndex++}`);
          updateValues.push(employeeData.vehicleType);
        }
        if (employeeData.licensePlate) {
          updateFields.push(`license_plate = $${paramIndex++}`);
          updateValues.push(employeeData.licensePlate);
        }
        if (employeeData.driversLicenseNumber) {
          updateFields.push(`drivers_license_number = $${paramIndex++}`);
          updateValues.push(employeeData.driversLicenseNumber);
        }
        if (employeeData.driversLicenseState) {
          updateFields.push(`drivers_license_state = $${paramIndex++}`);
          updateValues.push(employeeData.driversLicenseState);
        }
        if (employeeData.bankName) {
          updateFields.push(`bank_name = $${paramIndex++}`);
          updateValues.push(employeeData.bankName);
        }
        if (employeeData.bankRoutingNumber) {
          updateFields.push(`bank_routing_number = $${paramIndex++}`);
          updateValues.push(employeeData.bankRoutingNumber);
        }
        if (employeeData.bankAccountNumber) {
          updateFields.push(`bank_account_number = $${paramIndex++}`);
          updateValues.push(employeeData.bankAccountNumber);
        }
        if (employeeData.preferredName) {
          updateFields.push(`preferred_name = $${paramIndex++}`);
          updateValues.push(employeeData.preferredName);
        }
        if (employeeData.vehicleMakeModel) {
          updateFields.push(`vehicle_make_model = $${paramIndex++}`);
          updateValues.push(employeeData.vehicleMakeModel);
        }
        if (employeeData.driversLicenseExpiration) {
          updateFields.push(`drivers_license_expiration = $${paramIndex++}`);
          updateValues.push(employeeData.driversLicenseExpiration);
        }
        if (employeeData.bankAccountType) {
          updateFields.push(`bank_account_type = $${paramIndex++}`);
          updateValues.push(employeeData.bankAccountType);
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
          action: isRehire ? 'EMPLOYEE_REHIRED' : 'EMPLOYEE_UPDATED',
          meta: { 
            employeeId, 
            updatedFields: Object.keys(employeeData),
            reactivated: isRehire,
          },
        });
      } else {
        // CREATE new employee
        const insertResult = await pool.query(`
          INSERT INTO employees (
            name, preferred_name, email, phone, job_title, department, hire_date, 
            date_of_birth, address, emergency_contact, emergency_phone,
            city, state, zip_code, vehicle_type, vehicle_make_model,
            drivers_license_number, drivers_license_state, drivers_license_expiration,
            bank_name, bank_routing_number, bank_account_number, bank_account_type,
            user_role, employment_type, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, false)
          RETURNING id
        `, [
          employeeData.name || 'New Employee',
          employeeData.preferredName || null,
          employeeData.email || null,
          employeeData.phone || null,
          employeeData.jobTitle || null,
          employeeData.department || null,
          employeeData.hireDate || null,
          employeeData.dateOfBirth || null,
          employeeData.address || null,
          employeeData.emergencyContact || null,
          employeeData.emergencyPhone || null,
          employeeData.city || null,
          employeeData.state || null,
          employeeData.zipCode || null,
          employeeData.vehicleType || null,
          employeeData.vehicleMakeModel || null,
          employeeData.driversLicenseNumber || null,
          employeeData.driversLicenseState || null,
          employeeData.driversLicenseExpiration || null,
          employeeData.bankName || null,
          employeeData.bankRoutingNumber || null,
          employeeData.bankAccountNumber || null,
          employeeData.bankAccountType || null,
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
      // For re-hire: Also check for existing user linked to the employee
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
            action: isRehire ? 'USER_REACTIVATED' : 'USER_ACTIVATED',
            meta: { userId, username: accountConfig.username, role: accountConfig.role, updated: true, isRehire },
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
      } else if (isRehire && employeeId) {
        // For re-hire without account config: Try to reactivate existing user linked to employee
        const existingEmployeeUsers = await pool.query(`
          SELECT id, username FROM users WHERE employee_id = $1
        `, [employeeId]);
        
        if (existingEmployeeUsers.length > 0) {
          userId = existingEmployeeUsers[0].id;
          await pool.query(`
            UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1
          `, [userId]);
          
          auditEvents.push({
            action: 'USER_REACTIVATED',
            meta: { 
              userId, 
              username: existingEmployeeUsers[0].username, 
              reactivatedFromEmployee: true,
              isRehire: true,
            },
          });
        }
      }
      
      // D) CREATE/UPDATE EMPLOYMENT PERIOD (optional - table may not exist)
      try {
        // For REHIRE: Close existing active employment period first
        if (isRehire) {
          const activePeriodsResult = await pool.query(`
            SELECT id, start_date as "startDate" FROM employment_periods 
            WHERE employee_id = $1 AND status = 'ACTIVE'
          `, [employeeId]);
          
          if (activePeriodsResult.length > 0) {
            const activePeriod = activePeriodsResult[0];
            const activePeriodId = activePeriod.id;
            const periodStartDate = activePeriod.startDate;
            
            // Close the active period (end date = day before new hire date, or same day if no hire date)
            let endDate = employeeData.hireDate 
              ? new Date(new Date(employeeData.hireDate).getTime() - 86400000).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            
            // Ensure end_date is not before start_date (use start_date if it would be earlier)
            if (periodStartDate && new Date(endDate) < new Date(periodStartDate)) {
              endDate = new Date(periodStartDate).toISOString().split('T')[0];
              console.warn(`[Onboarding] Adjusted employment end date to match start date for period ${activePeriodId}`);
            }
            
            await pool.query(`
              UPDATE employment_periods 
              SET end_date = $1, status = 'ENDED', ended_via_session_id = $2
              WHERE id = $3
            `, [endDate, id, activePeriodId]);
            
            auditEvents.push({
              action: 'EMPLOYMENT_ENDED',
              meta: { 
                employeeId, 
                periodId: activePeriodId,
                endDate,
                endedViaSessionId: id,
              },
            });
          }
        }
        
        // Create new employment period (guard against duplicates for legacy employees)
        const startDate = employeeData.hireDate || new Date().toISOString().split('T')[0];
        const employmentType = session.pathType === 'CONTRACT' ? 'CONTRACT' : 'FULL_TIME';
        
        // Check if employee already has an active employment period (legacy employee handling)
        let newPeriodId: string | null = null;
        const existingActiveCheck = await pool.query(`
          SELECT id FROM employment_periods WHERE employee_id = $1 AND status = 'ACTIVE'
        `, [employeeId]);
        
        if (existingActiveCheck.length > 0 && !isRehire) {
          // Legacy employee already has active period - skip creation but log warning
          console.warn(`[Onboarding] Employee ${employeeId} already has active employment period - skipping creation (legacy employee)`);
          newPeriodId = existingActiveCheck[0].id;
        } else {
          const newPeriodResult = await pool.query(`
            INSERT INTO employment_periods (
              employee_id, start_date, employment_type, department, job_title,
              status, started_via_session_id
            ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6)
            RETURNING id
          `, [
            employeeId,
            startDate,
            employmentType,
            employeeData.department || null,
            employeeData.jobTitle || null,
            id,
          ]);
          
          newPeriodId = newPeriodResult[0].id;
          
          auditEvents.push({
            action: 'EMPLOYMENT_STARTED',
            meta: { 
              employeeId, 
              periodId: newPeriodId,
              startDate,
              employmentType,
              department: employeeData.department,
              jobTitle: employeeData.jobTitle,
              startedViaSessionId: id,
              isRehire,
            },
          });
        }
      } catch (periodError: any) {
        // Employment periods table may not exist yet - log and continue
        console.warn('[Onboarding] Employment periods table not available, skipping period creation:', periodError.message);
      }
      
      // E) FINALIZE SESSION (LOCK)
      await pool.query(`
        UPDATE onboarding_sessions
        SET status = 'completed',
            completed_at = NOW(),
            approval_status = 'approved',
            approved_at = NOW(),
            approved_by_user_id = $2,
            approved_by_display_name = $3
        WHERE id = $1
      `, [id, adminId, adminUsername]);
      
      auditEvents.push({
        action: isRehire ? 'REHIRE_COMPLETED' : 'ONBOARDING_COMPLETED',
        meta: { 
          sessionId: id, 
          employeeId, 
          userId,
          pathName: session.pathName,
          pathPurpose: session.pathPurpose,
          isRehire,
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
        message: isRehire ? 'Re-hire finalized successfully' : 'Onboarding finalized successfully',
        employeeId,
        userId,
        isRehire,
        pathPurpose: session.pathPurpose,
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
          action: isRehire ? 'REHIRE_FINALIZATION_FAILED' : 'ONBOARDING_FINALIZATION_FAILED',
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

// Helper function to map fixed-schema demographics to employee fields (NEW SYSTEM)
function mapDemographicsToEmployee(demographics: Record<string, any>): Record<string, any> {
  const fullName = `${demographics.firstName || ''} ${demographics.lastName || ''}`.trim();
  const streetAddress = demographics.aptUnit 
    ? `${demographics.address || ''} ${demographics.aptUnit}`.trim()
    : demographics.address || '';
  const fullAddress = streetAddress 
    ? `${streetAddress}${demographics.city ? ', ' + demographics.city : ''}${demographics.state ? ', ' + demographics.state : ''} ${demographics.zipCode || ''}`.trim()
    : null;
  
  return {
    name: fullName || null,
    preferredName: demographics.preferredName || null,
    email: demographics.email || null,
    phone: demographics.phone || null,
    address: fullAddress,
    city: demographics.city || null,
    state: demographics.state || null,
    zipCode: demographics.zipCode || null,
    vehicleType: demographics.vehicleType || null,
    vehicleMakeModel: demographics.vehicleMakeModel || null,
    driversLicenseNumber: demographics.driversLicenseNumber || null,
    driversLicenseState: demographics.driversLicenseState || null,
    driversLicenseExpiration: demographics.driversLicenseExpiration || null,
    bankName: demographics.bankName || null,
    bankRoutingNumber: demographics.bankRoutingNumber || null,
    bankAccountNumber: demographics.bankAccountNumber || null,
    bankAccountType: demographics.bankAccountType || null,
  };
}

// Helper function to map intake data to employee fields (LEGACY)
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
    
    // Normalize objects/ prefix to /objects/
    const normalizedStoragePath = session.storagePath?.startsWith('objects/') 
      ? `/${session.storagePath}` 
      : session.storagePath;
    
    const downloadUrl = normalizedStoragePath?.startsWith('/objects/') 
      ? normalizedStoragePath 
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

// Email bundle request schema
const emailBundleSchema = z.object({
  recipientEmail: z.string().email().optional(), // Override email if needed
  ccAdmin: z.boolean().optional().default(false),
  ccHR: z.boolean().optional().default(false),
});

// POST /sessions/:id/email-bundle - Email the onboarding bundle to the employee
router.post('/sessions/:id/email-bundle', async (req: Request, res: Response) => {
  const { id } = req.params;
  const adminId = (req as any).user?.id || 1;
  const adminUsername = (req as any).user?.username || 'system';
  const adminEmail = (req as any).user?.email;
  
  try {
    // Parse request body
    const body = emailBundleSchema.parse(req.body);
    
    // 1. PREFLIGHT VALIDATION
    // Fetch session with all required data
    const sessions = await pool.query(`
      SELECT 
        s.id, s.status, s.employee_id as "employeeId",
        s.bundle_media_item_id as "bundleMediaItemId",
        s.intake_data as "intakeData",
        e.name as "employeeName", e.email as "employeeEmail",
        e."firstName" as "firstName", e."lastName" as "lastName",
        m.storage_path as "storagePath", m.filename, m.file_size as "fileSize"
      FROM onboarding_sessions s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN media_library m ON s.bundle_media_item_id = m.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'Session not found' },
      });
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessions[0];
    
    // Check session is completed
    if (session.status !== 'completed') {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: `Session status is '${session.status}', must be 'completed'` },
      });
      return res.status(400).json({ 
        error: 'Cannot email bundle: session is not completed',
        status: session.status 
      });
    }
    
    // Check bundle exists
    if (!session.bundleMediaItemId) {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'Bundle not generated yet' },
      });
      return res.status(400).json({ 
        error: 'Cannot email bundle: bundle has not been generated. Please generate the bundle first.' 
      });
    }
    
    // Check employee exists
    if (!session.employeeId) {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'No employee record linked' },
      });
      return res.status(400).json({ 
        error: 'Cannot email bundle: no employee record is linked to this session' 
      });
    }
    
    // Determine recipient email (override, employee profile, or intake data)
    let recipientEmail = body.recipientEmail;
    if (!recipientEmail) {
      recipientEmail = session.employeeEmail;
    }
    if (!recipientEmail && session.intakeData) {
      const intake = typeof session.intakeData === 'string' 
        ? JSON.parse(session.intakeData) 
        : session.intakeData;
      recipientEmail = intake.email || intake.emailAddress || intake.personalEmail;
    }
    
    if (!recipientEmail) {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'No email address found for employee' },
      });
      return res.status(400).json({ 
        error: 'Cannot email bundle: no email address found for the employee. Please provide a recipient email.' 
      });
    }
    
    // Check file size (SendGrid limit is ~30MB but we'll be conservative at 20MB)
    const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB
    if (session.fileSize && session.fileSize > MAX_ATTACHMENT_SIZE) {
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_BLOCKED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'Bundle file size exceeds email limit', fileSize: session.fileSize },
      });
      return res.status(400).json({ 
        error: 'Cannot email bundle: file size exceeds email attachment limit (20MB)' 
      });
    }
    
    // 2. FETCH BUNDLE PDF
    let pdfBuffer: Buffer;
    try {
      // Normalize objects/ prefix to /objects/
      const normalizedBundlePath = session.storagePath?.startsWith('objects/') 
        ? `/${session.storagePath}` 
        : session.storagePath;
      
      if (normalizedBundlePath && (normalizedBundlePath.startsWith('/objects/') || isSupabaseObjectPath(normalizedBundlePath))) {
        // Download from object storage
        pdfBuffer = await getFileStorageProviderForObjectPath(normalizedBundlePath).downloadBuffer(normalizedBundlePath);
      } else if (session.storagePath?.startsWith('uploads/')) {
        // Read from local filesystem
        const localPath = path.join(process.cwd(), session.storagePath);
        pdfBuffer = fs.readFileSync(localPath);
      } else {
        throw new Error('Unknown storage path format');
      }
    } catch (fetchError) {
      console.error('Error fetching bundle file:', fetchError);
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_FAILED',
        actor: { id: adminId, username: adminUsername },
        meta: { reason: 'Failed to fetch bundle file', error: (fetchError as Error).message },
      });
      return res.status(500).json({ 
        error: 'Failed to retrieve bundle file for email attachment' 
      });
    }
    
    // 3. BUILD EMAIL
    // Construct filename: EPOCH_Onboarding_<LastName>_<FirstName>_<YYYY-MM-DD>.pdf
    const lastName = session.lastName || session.employeeName?.split(' ').pop() || 'Employee';
    const firstName = session.firstName || session.employeeName?.split(' ')[0] || '';
    const dateStr = new Date().toISOString().split('T')[0];
    const attachmentFilename = `EPOCH_Onboarding_${lastName}_${firstName}_${dateStr}.pdf`.replace(/\s+/g, '_');
    
    // Build CC list
    const ccList: string[] = [];
    if (body.ccAdmin && adminEmail) {
      ccList.push(adminEmail);
    }
    if (body.ccHR) {
      // Use configured HR email or default
      const hrEmail = process.env.HR_EMAIL || 'hr@agcomposites.com';
      ccList.push(hrEmail);
    }
    
    const emailSubject = 'Your EPOCH Employment Onboarding Documents';
    const emailBody = `
Dear ${firstName || session.employeeName || 'Team Member'},

Thank you for completing your onboarding process with A G Composites!

Attached to this email is your official Onboarding Completion Packet. This document contains:
• Your completed intake information
• All signed documents from your onboarding
• Any captured photos or images
• A summary of your onboarding steps

Please review the attached document and keep it for your records. If you notice any errors or need to make corrections, please contact HR or your supervisor immediately.

Welcome to the team!

Best regards,
A G Composites HR Team

---
This is an automated message from the EPOCH Employee Management System.
If you have questions, please contact hr@agcomposites.com.
    `.trim();
    
    // 4. SEND EMAIL
    try {
      const emailResult = await sendEmailViaSendGrid({
        to: recipientEmail,
        subject: emailSubject,
        text: emailBody,
        html: emailBody.replace(/\n/g, '<br>'),
        cc: ccList.length > 0 ? ccList : undefined,
        attachments: [{
          content: pdfBuffer.toString('base64'),
          filename: attachmentFilename,
          type: 'application/pdf',
          disposition: 'attachment',
        }],
      });
      
      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Email sending failed');
      }
      
      // 5. LOG SUCCESS AUDIT
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAILED',
        actor: { id: adminId, username: adminUsername },
        meta: { 
          recipientEmail,
          employeeId: session.employeeId,
          ccList,
          messageId: emailResult.messageId,
          attachmentFilename,
        },
      });
      
      res.json({
        success: true,
        message: 'Onboarding bundle emailed successfully',
        recipientEmail,
        ccList,
        messageId: emailResult.messageId,
      });
      
    } catch (sendError) {
      console.error('Error sending onboarding bundle email:', sendError);
      await auditService.logEvent({
        entityType: 'employee_onboarding',
        entityId: id,
        action: 'ONBOARDING_BUNDLE_EMAIL_FAILED',
        actor: { id: adminId, username: adminUsername },
        meta: { 
          reason: 'Email sending failed', 
          error: (sendError as Error).message,
          recipientEmail,
        },
      });
      return res.status(500).json({ 
        error: 'Failed to send email',
        details: (sendError as Error).message 
      });
    }
    
  } catch (error) {
    console.error('Error in email-bundle endpoint:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /sessions/:id/email-info - Get info needed for email modal
router.get('/sessions/:id/email-info', async (req: Request, res: Response) => {
  const { id } = req.params;
  
  try {
    const sessions = await pool.query(`
      SELECT 
        s.id, s.status, s.employee_id as "employeeId",
        s.bundle_media_item_id as "bundleMediaItemId",
        s.intake_data as "intakeData",
        e.name as "employeeName", e.email as "employeeEmail",
        e."firstName" as "firstName", e."lastName" as "lastName",
        m.file_size as "fileSize"
      FROM onboarding_sessions s
      LEFT JOIN employees e ON s.employee_id = e.id
      LEFT JOIN media_library m ON s.bundle_media_item_id = m.id
      WHERE s.id = $1
    `, [id]);
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessions[0];
    
    // Determine default email
    let defaultEmail = session.employeeEmail;
    if (!defaultEmail && session.intakeData) {
      const intake = typeof session.intakeData === 'string' 
        ? JSON.parse(session.intakeData) 
        : session.intakeData;
      defaultEmail = intake.email || intake.emailAddress || intake.personalEmail;
    }
    
    res.json({
      canEmail: session.status === 'completed' && !!session.bundleMediaItemId,
      employeeName: session.employeeName,
      defaultEmail,
      hasEmail: !!defaultEmail,
      bundleExists: !!session.bundleMediaItemId,
      fileSize: session.fileSize,
      blockedReason: !session.bundleMediaItemId 
        ? 'Bundle not generated' 
        : session.status !== 'completed' 
          ? 'Session not completed' 
          : !defaultEmail 
            ? 'No email address on file' 
            : null,
    });
  } catch (error) {
    console.error('Error fetching email info:', error);
    res.status(500).json({ error: 'Failed to fetch email info' });
  }
});

// ============================================================================
// AUTHORIZED EMPLOYER SIGNERS ENDPOINTS
// ============================================================================

// Get all authorized employer signers
router.get('/settings/employer-signers', async (req: Request, res: Response) => {
  try {
    const signers = await pool.query(`
      SELECT 
        aes.id, aes.user_id as "userId", aes.display_name_override as "displayNameOverride",
        aes.is_active as "isActive", aes.created_at as "createdAt",
        u.username, u.first_name as "firstName", u.last_name as "lastName", u.role
      FROM authorized_employer_signers aes
      JOIN users u ON u.id = aes.user_id
      ORDER BY u.first_name, u.last_name
    `);
    res.json(signers || []);
  } catch (error) {
    console.error('Error fetching employer signers:', error);
    res.status(500).json({ error: 'Failed to fetch employer signers' });
  }
});

// Add an authorized employer signer
router.post('/settings/employer-signers', async (req: Request, res: Response) => {
  try {
    const { userId, displayNameOverride } = req.body;
    const currentUser = (req as any).user;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Check if user exists and has appropriate role
    const userCheck = await pool.query(
      `SELECT id, role FROM users WHERE id = $1`,
      [userId]
    );
    
    if (!userCheck || userCheck.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userRole = userCheck[0].role;
    if (!['ADMIN', 'OWNER'].includes(userRole)) {
      return res.status(400).json({ error: 'User must have Admin or Owner role to be an employer signer' });
    }
    
    // Check if already exists
    const existing = await pool.query(
      `SELECT id FROM authorized_employer_signers WHERE user_id = $1`,
      [userId]
    );
    
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'User is already an authorized signer' });
    }
    
    const [newSigner] = await pool.query(
      `INSERT INTO authorized_employer_signers (user_id, display_name_override, created_by_id)
       VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", display_name_override as "displayNameOverride", 
                 is_active as "isActive", created_at as "createdAt"`,
      [userId, displayNameOverride || null, currentUser?.id || null]
    );
    
    res.status(201).json(newSigner);
  } catch (error) {
    console.error('Error adding employer signer:', error);
    res.status(500).json({ error: 'Failed to add employer signer' });
  }
});

// Update an authorized employer signer
router.patch('/settings/employer-signers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { displayNameOverride, isActive } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (displayNameOverride !== undefined) {
      updates.push(`display_name_override = $${paramCount++}`);
      values.push(displayNameOverride || null);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    values.push(id);
    const [updated] = await pool.query(
      `UPDATE authorized_employer_signers 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING id, user_id as "userId", display_name_override as "displayNameOverride", 
                 is_active as "isActive", created_at as "createdAt"`,
      values
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Signer not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating employer signer:', error);
    res.status(500).json({ error: 'Failed to update employer signer' });
  }
});

// Delete an authorized employer signer
router.delete('/settings/employer-signers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM authorized_employer_signers WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Signer not found' });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting employer signer:', error);
    res.status(500).json({ error: 'Failed to delete employer signer' });
  }
});

// Check if current user is an authorized employer signer
router.get('/settings/employer-signers/check-authorization', async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user;
    
    if (!currentUser?.id) {
      return res.json({ isAuthorized: false });
    }
    
    // Check role and active signer status
    const isAdminOrOwner = ['ADMIN', 'OWNER'].includes(currentUser.role);
    
    const signerCheck = await pool.query(
      `SELECT id, display_name_override as "displayNameOverride" 
       FROM authorized_employer_signers 
       WHERE user_id = $1 AND is_active = true`,
      [currentUser.id]
    );
    
    const isAuthorized = isAdminOrOwner && signerCheck && signerCheck.length > 0;
    const displayName = signerCheck?.[0]?.displayNameOverride || 
      `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 
      currentUser.username;
    
    res.json({ 
      isAuthorized, 
      displayName,
      userId: currentUser.id 
    });
  } catch (error) {
    console.error('Error checking authorization:', error);
    res.status(500).json({ error: 'Failed to check authorization' });
  }
});

// Get pending employer signatures (documents awaiting employer signature)
router.get('/pending-employer-signatures', async (req: Request, res: Response) => {
  try {
    const pending = await pool.query(`
      SELECT 
        fpi.id as "instanceId",
        fpi.recipient_name as "recipientName",
        fpi.signed_at as "employeeSignedAt",
        fpi.employer_signature_required as "employerSignatureRequired",
        fpi.employer_signed_at as "employerSignedAt",
        fpt.name as "templateName",
        osd.session_id as "sessionId",
        os.status as "sessionStatus",
        e.first_name || ' ' || e.last_name as "employeeName"
      FROM fillable_pdf_instances fpi
      JOIN fillable_pdf_templates fpt ON fpt.id = fpi.template_id
      LEFT JOIN onboarding_session_documents osd ON osd.instance_id = fpi.id
      LEFT JOIN onboarding_sessions os ON os.id = osd.session_id
      LEFT JOIN employees e ON e.id = os.employee_id
      WHERE fpi.signed_at IS NOT NULL
        AND fpi.employer_signature_required = true
        AND fpi.employer_signed_at IS NULL
      ORDER BY fpi.signed_at DESC
    `);
    
    res.json(pending || []);
  } catch (error) {
    console.error('Error fetching pending employer signatures:', error);
    res.status(500).json({ error: 'Failed to fetch pending employer signatures' });
  }
});

// Submit employer signature
router.post('/sessions/:sessionId/documents/:docId/employer-sign', async (req: Request, res: Response) => {
  try {
    const { sessionId, docId } = req.params;
    const { signatureData, signerName } = req.body;
    const currentUser = (req as any).user;
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    if (!signatureData || !signerName) {
      return res.status(400).json({ error: 'Signature data and signer name are required' });
    }
    
    // Verify user is authorized
    const authCheck = await pool.query(
      `SELECT id FROM authorized_employer_signers 
       WHERE user_id = $1 AND is_active = true`,
      [currentUser?.id]
    );
    
    if (!authCheck || authCheck.length === 0) {
      return res.status(403).json({ error: 'You are not authorized to sign as employer' });
    }
    
    // Get the document and verify employee has signed
    const doc = await pool.query(
      `SELECT osd.instance_id, fpi.signed_at, fpi.employer_signature_required
       FROM onboarding_session_documents osd
       JOIN fillable_pdf_instances fpi ON fpi.id = osd.instance_id
       WHERE osd.session_id = $1 AND osd.id = $2`,
      [sessionId, docId]
    );
    
    if (!doc || doc.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const instanceId = doc[0].instance_id;
    
    if (!doc[0].signed_at) {
      return res.status(400).json({ error: 'Employee must sign first' });
    }
    
    // Update with employer signature
    await pool.query(
      `UPDATE fillable_pdf_instances 
       SET employer_signature_data = $1,
           employer_signed_at = NOW(),
           employer_signed_by_ip = $2,
           employer_signer_user_id = $3,
           employer_signer_name = $4
       WHERE id = $5`,
      [signatureData, clientIp, currentUser?.id, signerName, instanceId]
    );
    
    // Audit log
    await auditService.logEvent({
      entityType: 'employee_onboarding',
      entityId: sessionId,
      action: 'EMPLOYER_SIGNATURE_COMPLETED',
      actor: {
        id: currentUser?.id,
        username: currentUser?.username || 'system',
      },
      meta: {
        documentId: docId,
        instanceId,
        signerName,
      },
    });
    
    res.json({ success: true, message: 'Employer signature recorded' });
  } catch (error) {
    console.error('Error recording employer signature:', error);
    res.status(500).json({ error: 'Failed to record employer signature' });
  }
});

export default router;
