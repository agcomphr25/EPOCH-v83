import { Router } from 'express';
import { z } from 'zod';

import { storage } from '../../storage';
import { insertMetalAccessorySchema } from '../../schema';

const validCategories = ['Bottom Metals', 'Rails', 'Other'] as const;

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
  try {
    const data = insertMetalAccessorySchema.parse(req.body);
    const item = await storage.createMetalAccessory(data);
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = insertMetalAccessorySchema.partial().parse(req.body);
    const item = await storage.updateMetalAccessory(id, data);
    res.json(item);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
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
