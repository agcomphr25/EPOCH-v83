import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../../storage';

const router = Router();

const uuidSchema = z.string().uuid('Must be a valid UUID');

router.post('/projects/:projectId/quote-feedback/generate', async (req, res) => {
  const parsed = uuidSchema.safeParse(req.params.projectId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid projectId: must be a valid UUID' });
  }
  try {
    const feedback = await storage.generateQuoteExecutionFeedback(parsed.data);
    res.json(feedback);
  } catch (err: any) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Error generating quote execution feedback:', err);
    res.status(500).json({ error: 'Failed to generate quote execution feedback' });
  }
});

router.get('/projects/:projectId/quote-feedback', async (req, res) => {
  const parsed = uuidSchema.safeParse(req.params.projectId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid projectId: must be a valid UUID' });
  }
  try {
    const feedback = await storage.getQuoteExecutionFeedbackByProjectId(parsed.data);
    if (!feedback) {
      return res.status(404).json({ error: 'No feedback record found for this project' });
    }
    res.json(feedback);
  } catch (err: any) {
    console.error('Error fetching quote execution feedback by project:', err);
    res.status(500).json({ error: 'Failed to fetch quote execution feedback' });
  }
});

router.get('/quotes/:quoteId/quote-feedback', async (req, res) => {
  const parsed = uuidSchema.safeParse(req.params.quoteId);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid quoteId: must be a valid UUID' });
  }
  try {
    const feedback = await storage.getQuoteExecutionFeedbackByQuoteId(parsed.data);
    if (!feedback) {
      return res.status(404).json({ error: 'No feedback record found for this quote' });
    }
    res.json(feedback);
  } catch (err: any) {
    console.error('Error fetching quote execution feedback by quote:', err);
    res.status(500).json({ error: 'Failed to fetch quote execution feedback' });
  }
});

export default router;
