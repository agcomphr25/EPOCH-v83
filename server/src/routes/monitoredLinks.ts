import { Router } from 'express';
import { db } from '../../db';
import { monitoredLinks, insertMonitoredLinkSchema } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const links = await db.select().from(monitoredLinks).orderBy(monitoredLinks.name);
    res.json(links);
  } catch (error) {
    console.error('Error fetching monitored links:', error);
    res.status(500).json({ message: 'Failed to fetch monitored links' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [link] = await db.select().from(monitoredLinks).where(eq(monitoredLinks.id, parseInt(id)));
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error fetching monitored link:', error);
    res.status(500).json({ message: 'Failed to fetch monitored link' });
  }
});

router.post('/', async (req, res) => {
  try {
    const validatedData = insertMonitoredLinkSchema.parse(req.body);
    const [link] = await db.insert(monitoredLinks).values(validatedData).returning();
    res.json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating monitored link:', error);
    res.status(500).json({ message: 'Failed to create monitored link' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const [link] = await db.update(monitoredLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(monitoredLinks.id, parseInt(id)))
      .returning();
    
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error updating monitored link:', error);
    res.status(500).json({ message: 'Failed to update monitored link' });
  }
});

router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isEnabled } = req.body;
    
    const [link] = await db.update(monitoredLinks)
      .set({ isEnabled, updatedAt: new Date() })
      .where(eq(monitoredLinks.id, parseInt(id)))
      .returning();
    
    if (!link) {
      return res.status(404).json({ message: 'Link not found' });
    }
    res.json(link);
  } catch (error) {
    console.error('Error toggling monitored link:', error);
    res.status(500).json({ message: 'Failed to toggle monitored link' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(monitoredLinks).where(eq(monitoredLinks.id, parseInt(id)));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting monitored link:', error);
    res.status(500).json({ message: 'Failed to delete monitored link' });
  }
});

export default router;
