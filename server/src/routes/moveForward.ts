import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';

import { db, pool } from '../../db';
import {
  moveForwardCaptures,
  moveForwardClarifications,
  moveForwardItems,
  moveForwardRules,
} from '../../schema';
import {
  analyzeMoveForward,
  MOVE_FORWARD_TYPES,
} from '../services/moveForwardAnalysis';
import {
  convertWebmToWav,
  speechToText,
} from '../../replit_integrations/audio/client';

const router = Router();

function glennOnly(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).session?.user || (req as any).user;
  if (user?.username?.toLowerCase() !== 'glennj')
    return res.status(403).json({ error: 'Move Forward is private.' });
  (req as any).moveForwardUser = user;
  next();
}
router.use(glennOnly);

const getUser = (req: Request) =>
  (req as any).moveForwardUser as { id: number; username: string };

router.post('/captures', async (req, res) => {
  const originalText = String(req.body.originalText || '').trim();
  if (!originalText)
    return res.status(400).json({ error: 'Capture text is required.' });
  const [capture] = await db
    .insert(moveForwardCaptures)
    .values({
      userId: getUser(req).id,
      originalText,
      inputMethod: req.body.inputMethod === 'voice' ? 'voice' : 'typed',
    })
    .returning();
  res.status(201).json(capture);
});

router.patch('/captures/:id', async (req, res) => {
  const [capture] = await db
    .update(moveForwardCaptures)
    .set({
      originalText: String(req.body.originalText || '').trim(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(moveForwardCaptures.id, Number(req.params.id)),
        eq(moveForwardCaptures.userId, getUser(req).id),
        eq(moveForwardCaptures.status, 'draft')
      )
    )
    .returning();
  if (!capture) return res.status(404).json({ error: 'Draft not found.' });
  res.json(capture);
});

router.post('/captures/:id/analyze', async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const [capture] = await db
    .select()
    .from(moveForwardCaptures)
    .where(
      and(
        eq(moveForwardCaptures.id, id),
        eq(moveForwardCaptures.userId, user.id)
      )
    )
    .limit(1);
  if (!capture) return res.status(404).json({ error: 'Capture not found.' });
  const rules = await db
    .select()
    .from(moveForwardRules)
    .where(
      and(
        eq(moveForwardRules.userId, user.id),
        eq(moveForwardRules.status, 'approved')
      )
    );
  try {
    const analysis = await analyzeMoveForward(
      capture.originalText,
      rules.map((r) => `${r.triggerText}: ${r.instruction}`)
    );
    await db
      .delete(moveForwardItems)
      .where(
        and(
          eq(moveForwardItems.captureId, id),
          eq(moveForwardItems.status, 'proposed')
        )
      );
    await db
      .delete(moveForwardClarifications)
      .where(
        and(
          eq(moveForwardClarifications.captureId, id),
          eq(moveForwardClarifications.status, 'pending')
        )
      );
    const items = await db
      .insert(moveForwardItems)
      .values(
        analysis.items.map((item) => ({
          ...item,
          captureId: id,
          userId: user.id,
          status: 'proposed',
          suggestedLinks: item.suggestedLinks || [],
        }))
      )
      .returning();
    const questions = analysis.questions.length
      ? await db
          .insert(moveForwardClarifications)
          .values(
            analysis.questions.map((question, sortOrder) => ({
              captureId: id,
              userId: user.id,
              question,
              sortOrder,
            }))
          )
          .returning()
      : [];
    await db
      .update(moveForwardCaptures)
      .set({
        status: questions.length ? 'clarifying' : 'review',
        analysisError: null,
        updatedAt: new Date(),
      })
      .where(eq(moveForwardCaptures.id, id));
    res.json({
      capture: {
        ...capture,
        status: questions.length ? 'clarifying' : 'review',
      },
      items,
      question: questions[0] || null,
      usedAi: analysis.usedAi,
    });
  } catch {
    await db
      .update(moveForwardCaptures)
      .set({
        status: 'unprocessed',
        analysisError: 'Analysis unavailable',
        updatedAt: new Date(),
      })
      .where(eq(moveForwardCaptures.id, id));
    res
      .status(202)
      .json({ unprocessed: true, error: 'Saved safely for later analysis.' });
  }
});

router.post('/captures/:id/clarifications/:questionId', async (req, res) => {
  const user = getUser(req);
  const captureId = Number(req.params.id);
  const questionId = Number(req.params.questionId);
  const answer = String(req.body.answer || '').trim() || 'Ask me later';
  await db
    .update(moveForwardClarifications)
    .set({
      answer,
      status: answer === 'Ask me later' ? 'deferred' : 'answered',
      answeredAt: new Date(),
    })
    .where(
      and(
        eq(moveForwardClarifications.id, questionId),
        eq(moveForwardClarifications.captureId, captureId),
        eq(moveForwardClarifications.userId, user.id)
      )
    );
  const [next] = await db
    .select()
    .from(moveForwardClarifications)
    .where(
      and(
        eq(moveForwardClarifications.captureId, captureId),
        eq(moveForwardClarifications.userId, user.id),
        eq(moveForwardClarifications.status, 'pending')
      )
    )
    .orderBy(asc(moveForwardClarifications.sortOrder))
    .limit(1);
  if (!next)
    await db
      .update(moveForwardCaptures)
      .set({ status: 'review', updatedAt: new Date() })
      .where(
        and(
          eq(moveForwardCaptures.id, captureId),
          eq(moveForwardCaptures.userId, user.id)
        )
      );
  const items = await db
    .select()
    .from(moveForwardItems)
    .where(
      and(
        eq(moveForwardItems.captureId, captureId),
        eq(moveForwardItems.userId, user.id),
        eq(moveForwardItems.status, 'proposed')
      )
    );
  res.json({ question: next || null, items });
});

router.post('/captures/:id/confirm', async (req, res) => {
  const user = getUser(req);
  const captureId = Number(req.params.id);
  const incoming = Array.isArray(req.body.items) ? req.body.items : [];
  if (!incoming.length)
    return res.status(400).json({ error: 'At least one item is required.' });
  const existing = await db
    .select()
    .from(moveForwardItems)
    .where(
      and(
        eq(moveForwardItems.captureId, captureId),
        eq(moveForwardItems.userId, user.id)
      )
    );
  const existingIds = new Set(existing.map((i) => i.id));
  for (const raw of incoming) {
    if (!MOVE_FORWARD_TYPES.includes(raw.itemType)) continue;
    const values = {
      itemType: raw.itemType,
      title: String(raw.title || '').trim(),
      details: raw.details || null,
      category: raw.category || null,
      priority: raw.priority || 'NORMAL',
      dueDate: raw.dueDate || null,
      amountCents: raw.amountCents ?? null,
      status: 'active',
      updatedAt: new Date(),
    };
    if (raw.id && existingIds.has(Number(raw.id)))
      await db
        .update(moveForwardItems)
        .set(values)
        .where(
          and(
            eq(moveForwardItems.id, Number(raw.id)),
            eq(moveForwardItems.userId, user.id)
          )
        );
    else
      await db.insert(moveForwardItems).values({
        ...values,
        captureId,
        userId: user.id,
        suggestedLinks: raw.suggestedLinks || [],
      });
  }
  // Require the same explicit type correction twice before proposing a
  // reusable rule. Rules remain inactive until Glenn approves them.
  for (const raw of incoming) {
    const before = existing.find((item) => item.id === Number(raw.id));
    if (!before || before.itemType === raw.itemType) continue;
    const triggerText = (before.details || before.title).slice(0, 80);
    const instruction = `Classify similar captures as ${raw.itemType}`;
    const matches = await pool.query(
      `SELECT id, correction_count FROM move_forward_rules
       WHERE user_id = $1 AND trigger_text = $2 AND instruction = $3
       ORDER BY id DESC LIMIT 1`,
      [user.id, triggerText, instruction]
    );
    if (matches.length) {
      const count = Number(matches[0].correction_count) + 1;
      await pool.query(
        `UPDATE move_forward_rules
         SET correction_count = $1,
             status = CASE WHEN $1 >= 2 THEN 'proposed' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [count, matches[0].id]
      );
    } else {
      await db.insert(moveForwardRules).values({
        userId: user.id,
        triggerText,
        instruction,
        status: 'learning',
        correctionCount: 1,
      });
    }
  }
  const kept = new Set(incoming.map((i: any) => Number(i.id)).filter(Boolean));
  for (const item of existing)
    if (!kept.has(item.id))
      await db
        .update(moveForwardItems)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(eq(moveForwardItems.id, item.id));
  await db
    .update(moveForwardCaptures)
    .set({
      status: 'confirmed',
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(moveForwardCaptures.id, captureId),
        eq(moveForwardCaptures.userId, user.id)
      )
    );
  // Move Forward remains the source of truth. Dated actionable items are
  // mirrored into the appropriate Rundown day so Glenn has one daily list.
  const confirmedItems = await db
    .select()
    .from(moveForwardItems)
    .where(
      and(
        eq(moveForwardItems.captureId, captureId),
        eq(moveForwardItems.userId, user.id),
        eq(moveForwardItems.status, 'active')
      )
    );
  for (const item of confirmedItems) {
    if (
      !item.dueDate ||
      item.itemType === 'reference_note' ||
      item.rundownItemId
    )
      continue;
    let groups = await pool.query(
      `SELECT id FROM executive_rundown_groups WHERE user_id = $1 AND group_date = $2 AND is_active = true LIMIT 1`,
      [user.id, item.dueDate]
    );
    if (!groups.length)
      groups = await pool.query(
        `INSERT INTO executive_rundown_groups (user_id, group_date, title, is_active, created_at, updated_at) VALUES ($1, $2, 'Move Forward', true, NOW(), NOW()) RETURNING id`,
        [user.id, item.dueDate]
      );
    const rundown = await pool.query(
      `INSERT INTO executive_rundown_items (group_id, user_id, title, description, priority, category, sort_order, linked_entity_type, linked_entity_id, is_completed, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'move_forward_item', $7, false, true, NOW(), NOW()) RETURNING id`,
      [
        groups[0].id,
        user.id,
        item.title,
        item.details,
        item.priority,
        item.category,
        String(item.id),
      ]
    );
    await db
      .update(moveForwardItems)
      .set({ rundownItemId: rundown[0].id })
      .where(eq(moveForwardItems.id, item.id));
  }
  res.json({ ok: true });
});

router.get('/dashboard', async (req, res) => {
  const user = getUser(req);
  const search = String(req.query.search || '').trim();
  const today = new Date().toISOString().slice(0, 10);
  const active = await db
    .select()
    .from(moveForwardItems)
    .where(
      and(
        eq(moveForwardItems.userId, user.id),
        eq(moveForwardItems.status, 'active')
      )
    )
    .orderBy(asc(moveForwardItems.dueDate), desc(moveForwardItems.updatedAt));
  const unprocessed = await db
    .select()
    .from(moveForwardCaptures)
    .where(
      and(
        eq(moveForwardCaptures.userId, user.id),
        or(
          eq(moveForwardCaptures.status, 'unprocessed'),
          eq(moveForwardCaptures.status, 'draft')
        )
      )
    )
    .orderBy(desc(moveForwardCaptures.updatedAt));
  const pendingRules = await db
    .select()
    .from(moveForwardRules)
    .where(
      and(
        eq(moveForwardRules.userId, user.id),
        eq(moveForwardRules.status, 'proposed')
      )
    );
  let history: any[] = [];
  if (search)
    history = await db
      .select()
      .from(moveForwardItems)
      .where(
        and(
          eq(moveForwardItems.userId, user.id),
          or(
            ilike(moveForwardItems.title, `%${search}%`),
            ilike(moveForwardItems.details, `%${search}%`),
            ilike(moveForwardItems.category, `%${search}%`)
          )
        )
      )
      .orderBy(desc(moveForwardItems.updatedAt))
      .limit(100);
  res.json({
    today: active.filter((i) => i.dueDate && i.dueDate <= today),
    upcoming: active.filter((i) => !i.dueDate || i.dueDate > today),
    unprocessed,
    pendingRules,
    history,
  });
});

router.patch('/items/:id/complete', async (req, res) => {
  const [item] = await db
    .update(moveForwardItems)
    .set({
      status: 'completed',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(moveForwardItems.id, Number(req.params.id)),
        eq(moveForwardItems.userId, getUser(req).id)
      )
    )
    .returning();
  if (!item) return res.status(404).json({ error: 'Item not found.' });
  res.json(item);
});

router.post('/rules', async (req, res) => {
  const triggerText = String(req.body.triggerText || '').trim();
  const instruction = String(req.body.instruction || '').trim();
  if (!triggerText || !instruction)
    return res
      .status(400)
      .json({ error: 'Trigger and instruction are required.' });
  const [rule] = await db
    .insert(moveForwardRules)
    .values({
      userId: getUser(req).id,
      triggerText,
      instruction,
      status: req.body.approved ? 'approved' : 'proposed',
      correctionCount: Number(req.body.correctionCount || 1),
      approvedAt: req.body.approved ? new Date() : null,
    })
    .returning();
  res.status(201).json(rule);
});

router.patch('/rules/:id/approve', async (req, res) => {
  const [rule] = await db
    .update(moveForwardRules)
    .set({ status: 'approved', approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(moveForwardRules.id, Number(req.params.id)),
        eq(moveForwardRules.userId, getUser(req).id)
      )
    )
    .returning();
  res.json(rule);
});

router.post('/transcribe', async (req, res) => {
  const audio = Buffer.from(String(req.body.audio || ''), 'base64');
  if (!audio.length)
    return res.status(400).json({ error: 'Audio is required.' });
  const format =
    req.body.inputFormat === 'webm'
      ? 'webm'
      : req.body.inputFormat === 'mp3'
        ? 'mp3'
        : 'wav';
  const buffer = format === 'webm' ? await convertWebmToWav(audio) : audio;
  const text = await speechToText(buffer, format === 'webm' ? 'wav' : format);
  res.json({ text });
});

export default router;
