import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../../middleware/auth';
import { db } from '../../db';
import { DatabaseStorage } from '../../storage';
import { insertUserIntegrationSchema } from '../../schema';
import { z } from 'zod';

const router = Router();
const storage = new DatabaseStorage();

// Get all integrations for the current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const integrations = await storage.getUserIntegrations(userId);
    res.json(integrations);
  } catch (error) {
    console.error('Error fetching user integrations:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// Get a specific integration for the current user
router.get('/:integrationType', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { integrationType } = req.params;
    const integration = await storage.getUserIntegration(userId, integrationType);
    
    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    
    res.json(integration);
  } catch (error) {
    console.error('Error fetching user integration:', error);
    res.status(500).json({ error: 'Failed to fetch integration' });
  }
});

// Create or update an integration
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const data = insertUserIntegrationSchema.parse({
      ...req.body,
      userId,
    });
    
    const integration = await storage.createOrUpdateUserIntegration(data);
    res.json(integration);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error creating/updating user integration:', error);
    res.status(500).json({ error: 'Failed to create/update integration' });
  }
});

// Delete an integration
router.delete('/:integrationType', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { integrationType } = req.params;
    
    await storage.deleteUserIntegration(userId, integrationType);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user integration:', error);
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

export default router;
