import { Router } from 'express';

import { storage } from '../../storage';
import { insertMetalAccessorySchema } from '../../schema';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const items = await storage.getAllMetalAccessories();
    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/demands', async (req, res) => {
  try {
    const demands = await storage.getMetalAccessoriesDemands();
    res.json(demands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for bottom metal demands from the explicit tracking table
router.get('/bottom-metal-demands', async (req, res) => {
  try {
    const demands = await storage.getBottomMetalDemandsSummary();
    res.json(demands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all bottom metal demand records (raw data)
router.get('/bottom-metal-demands/all', async (req, res) => {
  try {
    const demands = await storage.getBottomMetalDemands();
    res.json(demands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Rail demand endpoints
router.get('/rail-demands', async (req, res) => {
  try {
    const demands = await storage.getRailDemandsSummary();
    res.json(demands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/rail-demands/all', async (req, res) => {
  try {
    const demands = await storage.getRailDemandsAll();
    res.json(demands);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await storage.getMetalAccessory(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const parsed = insertMetalAccessorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }
  try {
    const item = await storage.createMetalAccessory(parsed.data);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const parsed = insertMetalAccessorySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
  }
  try {
    const item = await storage.updateMetalAccessory(id, parsed.data);
    res.json(item);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteMetalAccessory(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
