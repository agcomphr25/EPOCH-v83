/**
 * Business Continuity Dashboard — API Routes
 *
 * GET  /api/continuity/sections          — all section content
 * PATCH /api/continuity/sections/:key    — update section content
 * GET  /api/continuity/doc-items         — documentation roadmap items
 * PATCH /api/continuity/doc-items/:id    — update doc item status/notes
 * GET  /api/continuity/roles             — support roles matrix
 * GET  /api/continuity/dependencies      — system/vendor dependencies
 * PATCH /api/continuity/dependencies/:id — update a dependency field
 * GET  /api/continuity/ai-updates        — AI update audit trail
 * POST /api/continuity/ai-updates/generate — generate a draft AI revision
 * POST /api/continuity/ai-updates/:id/approve — approve a draft
 * POST /api/continuity/ai-updates/:id/reject  — reject a draft
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { db } from '../../db';
import {
  continuitySections,
  continuityDocItems,
  continuityRoles,
  continuityDependencies,
  continuityAiUpdates,
} from '../../schema';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import OpenAI from 'openai';

const router = Router();
router.use(authenticateToken);

function requireAdminOrOwner(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as { id: number; role: string; username: string } | undefined;
  if (!user) { res.status(401).json({ error: 'Authentication required' }); return; }
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') {
    res.status(403).json({ error: 'Business Continuity Dashboard requires ADMIN or OWNER role.' });
    return;
  }
  next();
}

function getUser(req: Request) {
  return (req as any).user as { id: number; role: string; username: string; displayName?: string } | undefined;
}

// ── GET /api/continuity/sections ──────────────────────────────────────────
router.get('/sections', requireAdminOrOwner, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(continuitySections).orderBy(asc(continuitySections.sectionKey));
    res.json(rows);
  } catch (err) {
    console.error('[continuity] GET /sections error:', err);
    res.status(500).json({ error: 'Failed to load sections' });
  }
});

// ── PATCH /api/continuity/sections/:key ───────────────────────────────────
router.patch('/sections/:key', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { key } = req.params;
    const { content } = req.body;
    if (!content || typeof content !== 'object') {
      res.status(400).json({ error: 'content must be a JSON object' });
      return;
    }
    const existing = await db.select().from(continuitySections).where(eq(continuitySections.sectionKey, key));
    if (existing.length === 0) {
      res.status(404).json({ error: 'Section not found' });
      return;
    }
    const [updated] = await db.update(continuitySections)
      .set({
        content,
        updatedAt: new Date(),
        updatedByUserId: user?.id,
        updatedByDisplayName: user?.displayName || user?.username,
      })
      .where(eq(continuitySections.sectionKey, key))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error('[continuity] PATCH /sections/:key error:', err);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// ── GET /api/continuity/doc-items ─────────────────────────────────────────
router.get('/doc-items', requireAdminOrOwner, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(continuityDocItems).orderBy(asc(continuityDocItems.sortOrder));
    res.json(rows);
  } catch (err) {
    console.error('[continuity] GET /doc-items error:', err);
    res.status(500).json({ error: 'Failed to load documentation items' });
  }
});

// ── PATCH /api/continuity/doc-items/:id ───────────────────────────────────
const updateDocItemSchema = z.object({
  status: z.enum(['not_started', 'drafted', 'needs_review', 'approved', 'archived']).optional(),
  notes: z.string().optional(),
});

router.patch('/doc-items/:id', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const parsed = updateDocItemSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const [updated] = await db.update(continuityDocItems)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
        updatedByUserId: user?.id,
        updatedByDisplayName: user?.displayName || user?.username,
      })
      .where(eq(continuityDocItems.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Item not found' }); return; }
    res.json(updated);
  } catch (err) {
    console.error('[continuity] PATCH /doc-items/:id error:', err);
    res.status(500).json({ error: 'Failed to update documentation item' });
  }
});

// ── GET /api/continuity/roles ─────────────────────────────────────────────
router.get('/roles', requireAdminOrOwner, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(continuityRoles).orderBy(asc(continuityRoles.sortOrder));
    res.json(rows);
  } catch (err) {
    console.error('[continuity] GET /roles error:', err);
    res.status(500).json({ error: 'Failed to load roles' });
  }
});

// ── GET /api/continuity/dependencies ──────────────────────────────────────
router.get('/dependencies', requireAdminOrOwner, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(continuityDependencies).orderBy(asc(continuityDependencies.category), asc(continuityDependencies.sortOrder));
    res.json(rows);
  } catch (err) {
    console.error('[continuity] GET /dependencies error:', err);
    res.status(500).json({ error: 'Failed to load dependencies' });
  }
});

// ── PATCH /api/continuity/dependencies/:id ────────────────────────────────
const updateDepSchema = z.object({
  currentState: z.string().optional(),
  continuityOption: z.string().optional(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});

router.patch('/dependencies/:id', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const parsed = updateDepSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const [updated] = await db.update(continuityDependencies)
      .set(parsed.data)
      .where(eq(continuityDependencies.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Dependency not found' }); return; }
    res.json(updated);
  } catch (err) {
    console.error('[continuity] PATCH /dependencies/:id error:', err);
    res.status(500).json({ error: 'Failed to update dependency' });
  }
});

// ── GET /api/continuity/ai-updates ────────────────────────────────────────
router.get('/ai-updates', requireAdminOrOwner, async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(continuityAiUpdates).orderBy(asc(continuityAiUpdates.createdAt));
    res.json(rows);
  } catch (err) {
    console.error('[continuity] GET /ai-updates error:', err);
    res.status(500).json({ error: 'Failed to load AI updates' });
  }
});

// ── POST /api/continuity/ai-updates/generate ──────────────────────────────
const generateSchema = z.object({
  sectionKey: z.string().min(1),
  sectionTitle: z.string().min(1),
  currentContent: z.record(z.unknown()),
  prompt: z.string().min(5).max(2000),
});

router.post('/ai-updates/generate', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { sectionKey, sectionTitle, currentContent, prompt } = parsed.data;

    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const systemPrompt = `You are an expert governance and business continuity advisor for AG Composites, a precision manufacturing company.
You are helping maintain EPOCH's internal Business Continuity Dashboard — a governance tool for company owners and senior leadership.
Your tone is professional, reassuring, executive-level, and practical. Avoid technical jargon where possible.
You must return ONLY valid JSON that matches the structure of the currentContent object provided.
Do not add new keys. Do not remove existing keys. Only update the values of existing keys based on the user's prompt.
Return ONLY the updated JSON object, no explanation, no markdown fences.`;

    const userPrompt = `Section: "${sectionTitle}" (key: ${sectionKey})
Current content JSON:
${JSON.stringify(currentContent, null, 2)}

Update request: ${prompt}

Return the updated JSON object only.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    let newVersion: Record<string, unknown>;
    try {
      newVersion = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: 'AI returned invalid JSON. Please try a more specific prompt.' });
      return;
    }

    const [draft] = await db.insert(continuityAiUpdates).values({
      sectionKey,
      prompt,
      priorVersion: currentContent,
      newVersion,
      status: 'draft_generated',
      createdByUserId: user?.id,
      createdByDisplayName: user?.displayName || user?.username,
    }).returning();

    res.json(draft);
  } catch (err) {
    console.error('[continuity] POST /ai-updates/generate error:', err);
    res.status(500).json({ error: 'Failed to generate AI draft' });
  }
});

// ── POST /api/continuity/ai-updates/:id/approve ───────────────────────────
router.post('/ai-updates/:id/approve', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

    const [update] = await db.select().from(continuityAiUpdates).where(eq(continuityAiUpdates.id, id));
    if (!update) { res.status(404).json({ error: 'AI update not found' }); return; }
    if (update.status !== 'draft_generated' && update.status !== 'under_review') {
      res.status(409).json({ error: `Cannot approve update in status: ${update.status}` });
      return;
    }

    await db.update(continuityAiUpdates)
      .set({
        status: 'approved',
        reviewedByUserId: user?.id,
        reviewedByDisplayName: user?.displayName || user?.username,
        reviewedAt: new Date(),
      })
      .where(eq(continuityAiUpdates.id, id));

    const sectionRows = await db.select().from(continuitySections).where(eq(continuitySections.sectionKey, update.sectionKey));
    if (sectionRows.length > 0 && update.newVersion) {
      await db.update(continuitySections)
        .set({
          content: update.newVersion as Record<string, unknown>,
          updatedAt: new Date(),
          updatedByUserId: user?.id,
          updatedByDisplayName: user?.displayName || user?.username,
        })
        .where(eq(continuitySections.sectionKey, update.sectionKey));
    }

    res.json({ success: true, message: 'Draft approved and section content updated.' });
  } catch (err) {
    console.error('[continuity] POST /ai-updates/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve update' });
  }
});

// ── POST /api/continuity/ai-updates/:id/reject ────────────────────────────
router.post('/ai-updates/:id/reject', requireAdminOrOwner, async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const [update] = await db.select().from(continuityAiUpdates).where(eq(continuityAiUpdates.id, id));
    if (!update) { res.status(404).json({ error: 'AI update not found' }); return; }
    await db.update(continuityAiUpdates)
      .set({
        status: 'rejected',
        reviewedByUserId: user?.id,
        reviewedByDisplayName: user?.displayName || user?.username,
        reviewedAt: new Date(),
      })
      .where(eq(continuityAiUpdates.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error('[continuity] POST /ai-updates/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject update' });
  }
});

export default router;
