import { Router } from 'express';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';

import { db } from '../../db';
import { nonConformingItems } from '../../schema';

const router = Router();

const nonConformingItemSchema = z.object({
  date: z.string().min(1),
  p1OrP2: z.enum(['P1', 'P2']),
  customer: z.string().min(1),
  sku: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  issueCause: z.string().min(1),
  manufacturerDefect: z.coerce.boolean().default(false),
  disposition: z.string().min(1),
  authorization: z.string().min(1),
  serialTagNumber: z.string().nullable().optional(),
  dispositionDate: z.string().nullable().optional(),
  correctiveActionNotes: z.string().nullable().optional(),
});

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeItemPayload(body: unknown) {
  const parsed = nonConformingItemSchema.parse(body);

  return {
    date: parsed.date,
    p1OrP2: parsed.p1OrP2,
    customer: parsed.customer.trim(),
    sku: parsed.sku.trim(),
    qty: parsed.qty,
    issueCause: parsed.issueCause.trim(),
    manufacturerDefect: parsed.manufacturerDefect,
    disposition: parsed.disposition.trim(),
    authorization: parsed.authorization.trim(),
    serialTagNumber: normalizeOptionalText(parsed.serialTagNumber),
    dispositionDate: normalizeOptionalText(parsed.dispositionDate),
    correctiveActionNotes: normalizeOptionalText(parsed.correctiveActionNotes),
  };
}

router.get('/', async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(nonConformingItems)
      .orderBy(desc(nonConformingItems.createdAt));

    res.json(items);
  } catch (error) {
    console.error('Error fetching non-conforming items:', error);
    res.status(500).json({ error: 'Failed to fetch non-conforming items' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid non-conforming item ID' });
    }

    const [item] = await db
      .select()
      .from(nonConformingItems)
      .where(eq(nonConformingItems.id, id))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: 'Non-conforming item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching non-conforming item:', error);
    res.status(500).json({ error: 'Failed to fetch non-conforming item' });
  }
});

router.post('/', async (req, res) => {
  try {
    const values = normalizeItemPayload(req.body);

    const [item] = await db
      .insert(nonConformingItems)
      .values({
        ...values,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating non-conforming item:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({ error: 'Failed to create non-conforming item' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid non-conforming item ID' });
    }

    const values = normalizeItemPayload(req.body);

    const [item] = await db
      .update(nonConformingItems)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(nonConformingItems.id, id))
      .returning();

    if (!item) {
      return res.status(404).json({ error: 'Non-conforming item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error updating non-conforming item:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }

    res.status(500).json({ error: 'Failed to update non-conforming item' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid non-conforming item ID' });
    }

    const [item] = await db
      .delete(nonConformingItems)
      .where(eq(nonConformingItems.id, id))
      .returning();

    if (!item) {
      return res.status(404).json({ error: 'Non-conforming item not found' });
    }

    res.json({ message: 'Non-conforming item deleted successfully' });
  } catch (error) {
    console.error('Error deleting non-conforming item:', error);
    res.status(500).json({ error: 'Failed to delete non-conforming item' });
  }
});

export default router;
