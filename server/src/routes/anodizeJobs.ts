import { Router } from 'express';
import { storage } from '../../storage';
import {
  insertAnodizeJobSchema,
  updateAnodizeJobSchema,
  insertAnodizeJobDocumentSchema,
  updateAnodizeJobDocumentSchema,
  updateAnodizeJobReceivingInspectionSchema,
} from '../../schema';
import { z } from 'zod';

const router = Router();

// GET /api/anodize-jobs
router.get('/', async (req, res) => {
  try {
    const filters: { status?: string; vendorId?: number; partNumber?: string; travelerId?: string } = {};
    if (req.query.status) filters.status = String(req.query.status);
    if (req.query.vendorId) filters.vendorId = Number(req.query.vendorId);
    if (req.query.partNumber) filters.partNumber = String(req.query.partNumber);
    if (req.query.travelerId) filters.travelerId = String(req.query.travelerId);
    const jobs = await storage.getAnodizeJobs(Object.keys(filters).length > 0 ? filters : undefined);
    res.json(jobs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get anodize jobs', message: err.message });
  }
});

// GET /api/anodize-jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const job = await storage.getAnodizeJob(id);
    if (!job) return res.status(404).json({ error: 'Anodize job not found' });
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get anodize job', message: err.message });
  }
});

// POST /api/anodize-jobs
router.post('/', async (req, res) => {
  try {
    const data = insertAnodizeJobSchema.parse(req.body);
    const job = await storage.createAnodizeJob(data);
    res.status(201).json(job);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to create anodize job', message: err.message });
  }
});

// PUT /api/anodize-jobs/:id
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = updateAnodizeJobSchema.parse(req.body);
    const job = await storage.updateAnodizeJob(id, data);
    res.json(job);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to update anodize job', message: err.message });
  }
});

// POST /api/anodize-jobs/:id/send
router.post('/:id/send', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { sentBy, vendorPoNumber } = req.body;
    if (!sentBy) return res.status(400).json({ error: 'sentBy is required' });
    const job = await storage.markAnodizeJobSent(id, sentBy, vendorPoNumber);
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mark anodize job sent', message: err.message });
  }
});

// POST /api/anodize-jobs/:id/receive
router.post('/:id/receive', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { receivedBy, certReceived } = req.body;
    if (!receivedBy) return res.status(400).json({ error: 'receivedBy is required' });
    const job = await storage.markAnodizeJobReceived(id, receivedBy, certReceived);
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mark anodize job received', message: err.message });
  }
});

// POST /api/anodize-jobs/:id/verify
router.post('/:id/verify', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { inspectionPassed, notes } = req.body;
    if (inspectionPassed === undefined) return res.status(400).json({ error: 'inspectionPassed is required' });
    const job = await storage.verifyAnodizeJob(id, Boolean(inspectionPassed), notes);
    res.json(job);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to verify anodize job', message: err.message });
  }
});

// GET /api/anodize-jobs/:id/completion-status
router.get('/:id/completion-status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await storage.evaluateAnodizeJobCompletion(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to evaluate completion status', message: err.message });
  }
});

// ── Documents ────────────────────────────────────────────────────────────────

// GET /api/anodize-jobs/:id/documents
router.get('/:id/documents', async (req, res) => {
  try {
    const docs = await storage.getAnodizeJobDocuments(Number(req.params.id));
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get documents', message: err.message });
  }
});

// POST /api/anodize-jobs/:id/documents
router.post('/:id/documents', async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const data = insertAnodizeJobDocumentSchema.parse({ ...req.body, anodizeJobId: jobId });
    const doc = await storage.addAnodizeJobDocument(data);
    res.status(201).json(doc);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to add document', message: err.message });
  }
});

// PUT /api/anodize-job-documents/:documentId  (mounted on the anodize-jobs router but prefixed separately)
// This will be accessed as PUT /api/anodize-jobs/documents/:documentId
router.put('/documents/:documentId', async (req, res) => {
  try {
    const docId = Number(req.params.documentId);
    const data = updateAnodizeJobDocumentSchema.parse(req.body);
    const doc = await storage.updateAnodizeJobDocument(docId, data);
    res.json(doc);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to update document', message: err.message });
  }
});

// DELETE /api/anodize-jobs/documents/:documentId
router.delete('/documents/:documentId', async (req, res) => {
  try {
    await storage.deleteAnodizeJobDocument(Number(req.params.documentId));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete document', message: err.message });
  }
});

// ── Receiving Inspection ─────────────────────────────────────────────────────

// GET /api/anodize-jobs/:id/receiving-inspection
router.get('/:id/receiving-inspection', async (req, res) => {
  try {
    const inspection = await storage.getAnodizeJobReceivingInspection(Number(req.params.id));
    res.json(inspection ?? null);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get receiving inspection', message: err.message });
  }
});

// PUT /api/anodize-jobs/:id/receiving-inspection
router.put('/:id/receiving-inspection', async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const data = updateAnodizeJobReceivingInspectionSchema.parse(req.body);
    const inspection = await storage.upsertAnodizeJobReceivingInspection(jobId, data);
    res.json(inspection);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Validation failed', details: err.errors });
    res.status(500).json({ error: 'Failed to upsert receiving inspection', message: err.message });
  }
});

export default router;
