import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { db } from '../../db';
import {
  proteusPrompts,
  proteusPromptVariables,
  proteusPromptExecutions,
  proteusPromptResults,
  proteusPromptTags,
  insertProteusPromptSchema,
  insertProteusPromptExecutionSchema,
  insertProteusPromptResultSchema,
  type ProteusPrompt,
  type ProteusPromptVariable,
  type ProteusPromptExecution,
  type ProteusPromptResult,
  type ProteusPromptTag,
} from '../../schema';
import { eq, desc, ilike, or, and, sql, inArray } from 'drizzle-orm';

const router = Router();

function requireGlennJ(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  if (user.username !== 'glennj') return res.status(403).json({ error: 'Access denied' });
  return next();
}

const guard = [authenticateToken, requireGlennJ];

type VariableInput = {
  name: string;
  label?: string;
  defaultValue?: string | null;
  required?: boolean;
  sortOrder?: number;
};

// ─── Prompts ──────────────────────────────────────────────────────────────────

// GET /api/proteus-labs/prompts — list with optional search/category/tag filter
router.get('/prompts', ...guard, async (req: Request, res: Response) => {
  try {
    const { search, category } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (category && category !== 'all') {
      conditions.push(eq(proteusPrompts.category, category as ProteusPrompt['category']));
    }
    if (search) {
      conditions.push(
        or(
          ilike(proteusPrompts.title, `%${search}%`),
          ilike(proteusPrompts.description, `%${search}%`),
          ilike(proteusPrompts.body, `%${search}%`)
        ) as ReturnType<typeof eq>
      );
    }

    const rows = await db
      .select()
      .from(proteusPrompts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(proteusPrompts.updatedAt));

    const promptIds = rows.map((r) => r.id);

    // Tag search: always run if a search term is given, even if text-match returned nothing
    let tagMatchIds: string[] = [];
    if (search) {
      const tagHits = await db
        .select({ promptId: proteusPromptTags.promptId })
        .from(proteusPromptTags)
        .where(ilike(proteusPromptTags.tag, `%${search}%`));
      tagMatchIds = tagHits.map((t) => t.promptId);
    }

    // Early return only after we've run tag lookup
    if (promptIds.length === 0 && tagMatchIds.length === 0) {
      return res.json([]);
    }

    // Fetch tags for all matching prompt IDs (union of text results + tag matches)
    const allIds = Array.from(new Set([...promptIds, ...tagMatchIds]));
    const tagRows = await db
      .select()
      .from(proteusPromptTags)
      .where(inArray(proteusPromptTags.promptId, allIds));

    const tagsMap: Record<string, string[]> = {};
    for (const t of tagRows) {
      if (!tagsMap[t.promptId]) tagsMap[t.promptId] = [];
      tagsMap[t.promptId].push(t.tag);
    }

    // Fetch extra prompts that were matched only via tag
    let extraRows: ProteusPrompt[] = [];
    if (tagMatchIds.length > 0) {
      const extraIds = tagMatchIds.filter((id) => !promptIds.includes(id));
      if (extraIds.length > 0) {
        extraRows = await db
          .select()
          .from(proteusPrompts)
          .where(inArray(proteusPrompts.id, extraIds))
          .orderBy(desc(proteusPrompts.updatedAt));
      }
    }

    const allRows = [...rows, ...extraRows];
    const result = allRows.map((r) => ({ ...r, tags: tagsMap[r.id] || [] }));
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[proteusLabs] GET /prompts error:', msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/prompts/recent — 5 most recently touched
router.get('/prompts/recent', ...guard, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(proteusPrompts)
      .orderBy(desc(proteusPrompts.updatedAt))
      .limit(5);
    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/prompts/most-used — top 5 by usageCount
router.get('/prompts/most-used', ...guard, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(proteusPrompts)
      .orderBy(desc(proteusPrompts.usageCount))
      .limit(5);
    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/prompts/:id — single prompt with variables and tags
router.get('/prompts/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [prompt] = await db
      .select()
      .from(proteusPrompts)
      .where(eq(proteusPrompts.id, id));

    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const variables = await db
      .select()
      .from(proteusPromptVariables)
      .where(eq(proteusPromptVariables.promptId, id))
      .orderBy(proteusPromptVariables.sortOrder);

    const tagRows = await db
      .select()
      .from(proteusPromptTags)
      .where(eq(proteusPromptTags.promptId, id));

    res.json({ ...prompt, variables, tags: tagRows.map((t: ProteusPromptTag) => t.tag) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/proteus-labs/prompts — create
router.post('/prompts', ...guard, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { variables, tags, ...rest } = req.body as {
      variables?: VariableInput[];
      tags?: string[];
      title?: string;
      category?: string;
      body?: string;
      description?: string;
    };

    const parsed = insertProteusPromptSchema.safeParse({
      ...rest,
      createdByUserId: user.id,
      createdByDisplayName: user.username,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const [prompt] = await db
      .insert(proteusPrompts)
      .values(parsed.data)
      .returning();

    if (Array.isArray(variables) && variables.length > 0) {
      await db.insert(proteusPromptVariables).values(
        variables.map((v: VariableInput, idx: number) => ({
          promptId: prompt.id,
          name: v.name,
          label: v.label || v.name,
          defaultValue: v.defaultValue ?? null,
          required: v.required !== false,
          sortOrder: v.sortOrder ?? idx,
        }))
      );
    }

    if (Array.isArray(tags) && tags.length > 0) {
      await db.insert(proteusPromptTags).values(
        tags.map((tag: string) => ({ promptId: prompt.id, tag }))
      );
    }

    res.status(201).json(prompt);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[proteusLabs] POST /prompts error:', msg);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/proteus-labs/prompts/:id — update
router.patch('/prompts/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { variables, tags, ...rest } = req.body as {
      variables?: VariableInput[];
      tags?: string[];
      title?: string;
      category?: string;
      body?: string;
      description?: string;
    };

    const [existing] = await db
      .select()
      .from(proteusPrompts)
      .where(eq(proteusPrompts.id, id));

    if (!existing) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const updateData: Partial<ProteusPrompt> = {};
    if (rest.title !== undefined) updateData.title = rest.title;
    if (rest.category !== undefined) updateData.category = rest.category as ProteusPrompt['category'];
    if (rest.body !== undefined) updateData.body = rest.body;
    if (rest.description !== undefined) updateData.description = rest.description;
    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(proteusPrompts)
      .set(updateData)
      .where(eq(proteusPrompts.id, id))
      .returning();

    if (Array.isArray(variables)) {
      await db.delete(proteusPromptVariables).where(eq(proteusPromptVariables.promptId, id));
      if (variables.length > 0) {
        await db.insert(proteusPromptVariables).values(
          variables.map((v: VariableInput, idx: number) => ({
            promptId: id,
            name: v.name,
            label: v.label || v.name,
            defaultValue: v.defaultValue ?? null,
            required: v.required !== false,
            sortOrder: v.sortOrder ?? idx,
          }))
        );
      }
    }

    if (Array.isArray(tags)) {
      await db.delete(proteusPromptTags).where(eq(proteusPromptTags.promptId, id));
      if (tags.length > 0) {
        await db.insert(proteusPromptTags).values(
          tags.map((tag: string) => ({ promptId: id, tag }))
        );
      }
    }

    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[proteusLabs] PATCH /prompts/:id error:', msg);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/proteus-labs/prompts/:id
router.delete('/prompts/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.delete(proteusPrompts).where(eq(proteusPrompts.id, id));
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Executions ───────────────────────────────────────────────────────────────

// GET /api/proteus-labs/executions — global execution history
router.get('/executions', ...guard, async (req: Request, res: Response) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const conditions: ReturnType<typeof eq>[] = [];
    if (status && status !== 'all') {
      conditions.push(eq(proteusPromptExecutions.status, status as ProteusPromptExecution['status']));
    }

    const rows = await db
      .select()
      .from(proteusPromptExecutions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(proteusPromptExecutions.executedAt))
      .limit(parseInt(limit, 10))
      .offset(parseInt(offset, 10));

    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/executions/recent-success — last 5 successful
router.get('/executions/recent-success', ...guard, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(proteusPromptExecutions)
      .where(eq(proteusPromptExecutions.status, 'success'))
      .orderBy(desc(proteusPromptExecutions.executedAt))
      .limit(5);
    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/executions/recent-failure — last 5 failed
router.get('/executions/recent-failure', ...guard, async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(proteusPromptExecutions)
      .where(eq(proteusPromptExecutions.status, 'failure'))
      .orderBy(desc(proteusPromptExecutions.executedAt))
      .limit(5);
    res.json(rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/prompts/:id/executions — executions for a specific prompt
router.get('/prompts/:id/executions', ...guard, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '20', offset = '0' } = req.query as Record<string, string>;

    const rows = await db
      .select()
      .from(proteusPromptExecutions)
      .where(eq(proteusPromptExecutions.promptId, id))
      .orderBy(desc(proteusPromptExecutions.executedAt))
      .limit(parseInt(limit, 10))
      .offset(parseInt(offset, 10));

    if (rows.length === 0) {
      return res.json([]);
    }

    const execIds = rows.map((r) => r.id);
    const resultRows = await db
      .select()
      .from(proteusPromptResults)
      .where(inArray(proteusPromptResults.executionId, execIds));

    const resultsMap: Record<string, ProteusPromptResult> = {};
    for (const r of resultRows) {
      resultsMap[r.executionId] = r;
    }

    const enriched = rows.map((r) => ({ ...r, result: resultsMap[r.id] ?? null }));
    res.json(enriched);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/proteus-labs/executions — record a new execution (copy event)
router.post('/executions', ...guard, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const parsed = insertProteusPromptExecutionSchema.safeParse({
      ...req.body,
      executedByUserId: user.id,
      executedByDisplayName: user.username,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const [execution] = await db
      .insert(proteusPromptExecutions)
      .values(parsed.data)
      .returning();

    await db
      .update(proteusPrompts)
      .set({
        usageCount: sql`${proteusPrompts.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(proteusPrompts.id, parsed.data.promptId));

    res.status(201).json(execution);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[proteusLabs] POST /executions error:', msg);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/proteus-labs/executions/:id — update status/notes
router.patch('/executions/:id', ...guard, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body as {
      status?: ProteusPromptExecution['status'];
      notes?: string;
    };

    const updateData: Partial<ProteusPromptExecution> = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const [updated] = await db
      .update(proteusPromptExecutions)
      .set(updateData)
      .where(eq(proteusPromptExecutions.id, id))
      .returning();

    res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────

// POST /api/proteus-labs/results — store a pasted result
router.post('/results', ...guard, async (req: Request, res: Response) => {
  try {
    const parsed = insertProteusPromptResultSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const [result] = await db
      .insert(proteusPromptResults)
      .values(parsed.data)
      .returning();

    await db
      .update(proteusPromptExecutions)
      .set({ status: 'success' })
      .where(
        and(
          eq(proteusPromptExecutions.id, parsed.data.executionId),
          eq(proteusPromptExecutions.status, 'pending')
        )
      );

    res.status(201).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[proteusLabs] POST /results error:', msg);
    res.status(500).json({ error: msg });
  }
});

// GET /api/proteus-labs/results/:executionId
router.get('/results/:executionId', ...guard, async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const [result] = await db
      .select()
      .from(proteusPromptResults)
      .where(eq(proteusPromptResults.executionId, executionId));
    res.json(result ?? null);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
