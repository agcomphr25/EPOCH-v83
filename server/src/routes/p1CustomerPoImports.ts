import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { pool } from '../../db';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import {
  applyP1CustomerPoImport,
  listRecentP1CustomerPoImports,
  previewP1CustomerPoImport,
  type P1ImportFile,
} from '../services/p1CustomerPoImportService';
import { getFileStorageProviderForObjectPath } from '../services/fileStorageProvider';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const name = file.originalname.toLowerCase();
    const supported =
      name.endsWith('.pdf') ||
      name.endsWith('.csv') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype.includes('csv');
    if (supported) callback(null, true);
    else callback(new Error('Only Midway PDF and CSV files are supported'));
  },
});

function importFile(req: Request): P1ImportFile {
  if (!req.file) throw new Error('Choose a Midway PDF or cancellation CSV');
  return {
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    mimetype:
      req.file.mimetype ||
      (req.file.originalname.toLowerCase().endsWith('.csv')
        ? 'text/csv'
        : 'application/pdf'),
    size: req.file.size,
  };
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /not found|unresolved|already exists/i.test(message)
    ? 409
    : 400;
  return res.status(status).json({ error: message });
}

router.use(authenticateToken);

router.post(
  '/preview',
  requirePermission('purchasing.manage_pos'),
  upload.single('file'),
  async (req, res) => {
    try {
      return res.json(await previewP1CustomerPoImport(importFile(req)));
    } catch (error) {
      console.error('[p1-customer-po-import-preview]', error);
      return sendError(res, error);
    }
  }
);

router.post(
  '/apply',
  requirePermission('purchasing.manage_pos'),
  upload.single('file'),
  async (req, res) => {
    try {
      const reason = String(req.body.reason ?? '').trim();
      if (!reason)
        return res.status(400).json({ error: 'An audit reason is required' });
      const selectedPoNumbers = JSON.parse(
        String(req.body.selectedPoNumbers ?? '[]')
      );
      if (
        !Array.isArray(selectedPoNumbers) ||
        selectedPoNumbers.some((value) => typeof value !== 'string')
      ) {
        return res
          .status(400)
          .json({ error: 'Selected PO numbers are invalid' });
      }
      const snapshot = await resolveUserSnapshot(req.user!.id);
      const result = await applyP1CustomerPoImport({
        file: importFile(req),
        selectedPoNumbers,
        reason,
        actor: {
          ...snapshot,
          username: req.user?.username,
          role: req.user?.role,
        },
      });
      return res.status(result.duplicate ? 200 : 201).json(result);
    } catch (error) {
      console.error('[p1-customer-po-import-apply]', error);
      return sendError(res, error);
    }
  }
);

router.get(
  '/',
  requirePermission('purchasing.manage_pos'),
  async (req, res) => {
    try {
      return res.json(
        await listRecentP1CustomerPoImports(Number(req.query.limit) || 20)
      );
    } catch (error) {
      console.error('[p1-customer-po-import-list]', error);
      return res
        .status(500)
        .json({ error: 'Unable to load P1 PO import history' });
    }
  }
);

router.get(
  '/:id/document',
  requirePermission('purchasing.manage_pos'),
  async (req, res) => {
    const result = await pool.query<{
      storage_object_path: string;
      original_file_name: string;
      mime_type: string;
    }>(
      `SELECT storage_object_path, original_file_name, mime_type
         FROM p1_customer_po_document_imports
        WHERE id = $1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row)
      return res.status(404).json({ error: 'Import document not found' });
    res.setHeader('Content-Type', row.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${row.original_file_name.replace(/["\r\n]/g, '_')}"`
    );
    return getFileStorageProviderForObjectPath(
      row.storage_object_path
    ).downloadObject(row.storage_object_path, res, {
      contentType: row.mime_type,
    });
  }
);

export default router;
