import { Router } from 'express';
import { storage } from '../../storage';
import { sessionAwareAuth } from '../../middleware/auth';

// ============================================================
// FIELD API Routes - Calm Thinking Surface (Unstructured, Opaque)
// Field is intentionally unstructured
// Field does not affect EPOCH data
// No automation or integration is allowed here
// All transitions out of Field are human-initiated
// ============================================================

const router = Router();

// Single user only: glennj
const FIELD_ALLOWED_USER = 'glennj';

router.get('/state', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const username = user?.username;

    if (username !== FIELD_ALLOWED_USER) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const state = await storage.getFieldState(username);
    
    res.json({
      fieldData: state?.fieldData || {},
      updatedAt: state?.updatedAt || null
    });
  } catch (error) {
    console.error('Error fetching field state:', error);
    res.status(500).json({ error: 'Failed to fetch field state' });
  }
});

router.post('/state', sessionAwareAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const username = user?.username;

    if (username !== FIELD_ALLOWED_USER) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { fieldData } = req.body;
    
    if (fieldData === undefined) {
      return res.status(400).json({ error: 'fieldData is required' });
    }

    const state = await storage.saveFieldState(username, fieldData);
    
    res.json({
      success: true,
      updatedAt: state.updatedAt
    });
  } catch (error) {
    console.error('Error saving field state:', error);
    res.status(500).json({ error: 'Failed to save field state' });
  }
});

export default router;
