import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import { requirePermission } from '../../middleware/requirePermission';

const router = Router();
const programs = z.enum(['P1', 'P2', 'DESIGN', 'GENERAL', 'OTHER']);
const types = z.enum([
  'WORK',
  'QC_INSPECTION',
  'ROUTING_RELEASE',
  'FINAL_QC',
  'FINAL_PRODUCT_RELEASE',
  'COC_APPROVAL',
]);
const statuses = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']);
const draft = z
  .object({
    employeeId: z.number().int().positive(),
    employeeUserId: z.number().int().positive().nullable().optional(),
    program: programs,
    partNumber: z.string().trim().min(1).nullable().optional(),
    productFamily: z.string().trim().min(1).nullable().optional(),
    department: z.string().trim().min(1).nullable().optional(),
    operationScope: z.string().trim().min(1).nullable().optional(),
    authorizationType: types,
    effectiveDate: z.string().datetime().nullable().optional(),
    expirationDate: z.string().datetime().nullable().optional(),
    qualificationMethod: z.string().trim().min(1),
    evidenceReference: z.string().trim().min(1),
    notes: z.string().nullable().optional(),
    limitations: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.partNumber ||
      v.productFamily ||
      ['GENERAL', 'OTHER'].includes(v.program),
    'Part number or product family is required.'
  );

function actor(req: Request) {
  if (!req.user?.id)
    throw Object.assign(new Error('Authenticated identity required.'), {
      status: 401,
    });
  return {
    userId: Number(req.user.id),
    employeeId: req.user.employeeId ? Number(req.user.employeeId) : null,
  };
}
function fail(res: Response, error: any) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error?.code === '23505')
    return res.status(409).json({ error: 'OVERLAPPING_ACTIVE_AUTHORIZATION' });
  return res
    .status(error?.status || 500)
    .json({ error: error?.message || 'Authorization action failed.' });
}

router.get(
  '/',
  requirePermission('training.authorization.view'),
  async (req, res) => {
    try {
      const values: unknown[] = [];
      const where: string[] = [];
      for (const [queryKey, column] of [
        ['employeeId', 'a.employee_id'],
        ['program', 'a.program'],
        ['partNumber', 'a.part_number'],
        ['productFamily', 'a.product_family'],
        ['department', 'a.department'],
        ['authorizationType', 'a.authorization_type'],
        ['status', 'a.status'],
        ['approverId', 'a.approved_by_user_id'],
      ] as const) {
        const value = req.query[queryKey];
        if (value) {
          values.push(value);
          where.push(`${column}=$${values.length}`);
        }
      }
      if (req.query.expiration === 'expired')
        where.push(`a.expiration_date <= now()`);
      if (req.query.expiration === 'soon')
        where.push(
          `a.expiration_date > now() AND a.expiration_date <= now() + interval '60 days'`
        );
      const rows = await pool.query(
        `SELECT a.*, e.employee_id AS employee_number, e.name AS employee_name,
      au.username AS approver_username FROM certification_authorizations a JOIN employees e ON e.id=a.employee_id
      LEFT JOIN users au ON au.id=a.approved_by_user_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.employee_id,a.authorization_type,a.updated_at DESC`,
        values
      );
      res.json(rows);
    } catch (error) {
      fail(res, error);
    }
  }
);

router.get(
  '/:id/history',
  requirePermission('training.authorization.view'),
  async (req, res) => {
    try {
      res.json(
        await pool.query(
          `SELECT * FROM certification_authorization_events WHERE authorization_id=$1 ORDER BY revision DESC`,
          [req.params.id]
        )
      );
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/',
  requirePermission('training.authorization.grant'),
  async (req, res) => {
    try {
      const body = draft.parse(req.body);
      const a = actor(req);
      const rows = await pool.query(
        `INSERT INTO certification_authorizations
      (employee_id,employee_user_id,program,part_number,product_family,department,operation_scope,authorization_type,status,effective_date,expiration_date,qualification_method,evidence_reference,notes,limitations,created_by_user_id,updated_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11,$12,$13,$14,$15,$15) RETURNING *`,
        [
          body.employeeId,
          body.employeeUserId ?? null,
          body.program,
          body.partNumber ?? null,
          body.productFamily ?? null,
          body.department ?? null,
          body.operationScope ?? null,
          body.authorizationType,
          body.effectiveDate ?? null,
          body.expirationDate ?? null,
          body.qualificationMethod,
          body.evidenceReference,
          body.notes ?? null,
          body.limitations ?? null,
          a.userId,
        ]
      );
      const row = (rows as any[])[0];
      await pool.query(
        `INSERT INTO certification_authorization_events(authorization_id,revision,event_type,snapshot,actor_user_id,actor_employee_id) VALUES($1,1,'CREATED',$2::jsonb,$3,$4)`,
        [row.id, JSON.stringify(row), a.userId, a.employeeId]
      );
      res.status(201).json(row);
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/:id/approve',
  requirePermission('training.authorization.approve'),
  async (req, res) => {
    try {
      const body = z
        .object({
          signatureMeaning: z.string().min(1),
          effectiveDate: z.string().datetime(),
          expirationDate: z.string().datetime().nullable().optional(),
        })
        .parse(req.body);
      const a = actor(req);
      const rows = await pool.query(
        `UPDATE certification_authorizations SET status='ACTIVE',revision=revision+1,effective_date=$2,expiration_date=$3,approved_by_user_id=$4,approved_by_employee_id=$5,approved_at=now(),signature_meaning=$6,updated_by_user_id=$4,updated_at=now() WHERE id=$1 AND status IN ('DRAFT','SUSPENDED','EXPIRED') RETURNING *`,
        [
          req.params.id,
          body.effectiveDate,
          body.expirationDate ?? null,
          a.userId,
          a.employeeId,
          body.signatureMeaning,
        ]
      );
      if (!(rows as any[]).length)
        return res.status(409).json({ error: 'INVALID_STATUS_TRANSITION' });
      const row = (rows as any[])[0];
      await pool.query(
        `INSERT INTO certification_authorization_events(authorization_id,revision,event_type,snapshot,actor_user_id,actor_employee_id) VALUES($1,$2,'APPROVED',$3::jsonb,$4,$5)`,
        [row.id, row.revision, JSON.stringify(row), a.userId, a.employeeId]
      );
      res.json(row);
    } catch (error) {
      fail(res, error);
    }
  }
);

router.post(
  '/:id/status',
  requirePermission('training.authorization.change_status'),
  async (req, res) => {
    try {
      const body = z
        .object({
          status: statuses.extract(['SUSPENDED', 'REVOKED']),
          reason: z.string().min(1),
        })
        .parse(req.body);
      const a = actor(req);
      const rows = await pool.query(
        `UPDATE certification_authorizations SET status=$2,revision=revision+1,updated_by_user_id=$3,updated_at=now() WHERE id=$1 AND status <> 'REVOKED' RETURNING *`,
        [req.params.id, body.status, a.userId]
      );
      if (!(rows as any[]).length)
        return res.status(409).json({ error: 'INVALID_STATUS_TRANSITION' });
      const row = (rows as any[])[0];
      await pool.query(
        `INSERT INTO certification_authorization_events(authorization_id,revision,event_type,snapshot,reason,actor_user_id,actor_employee_id) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`,
        [
          row.id,
          row.revision,
          body.status,
          JSON.stringify(row),
          body.reason,
          a.userId,
          a.employeeId,
        ]
      );
      res.json(row);
    } catch (error) {
      fail(res, error);
    }
  }
);

export default router;
