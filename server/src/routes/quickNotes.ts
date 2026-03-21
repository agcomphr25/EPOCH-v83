import { Router, Request, Response } from 'express';
import { db } from '../../db';
import {
  quickNotes,
  quickNoteShares,
  users,
  type QuickNote,
  type QuickNoteShare,
} from '../../schema';
import { eq, and, or, ilike, desc, inArray } from 'drizzle-orm';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { z } from 'zod';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { search } = req.query;
    const userId = user.id as number;

    const sharedNoteRows = await db
      .select({ noteId: quickNoteShares.noteId })
      .from(quickNoteShares)
      .where(eq(quickNoteShares.sharedWithUserId, userId));

    const sharedNoteIds = sharedNoteRows.map((r) => r.noteId);

    let ownedNotes: QuickNote[] = [];
    let sharedNotes: QuickNote[] = [];

    if (search) {
      const searchStr = `%${search}%`;
      ownedNotes = await db
        .select()
        .from(quickNotes)
        .where(
          and(
            eq(quickNotes.createdByUserId, userId),
            or(ilike(quickNotes.title, searchStr), ilike(quickNotes.content, searchStr))
          )
        )
        .orderBy(desc(quickNotes.updatedAt));

      if (sharedNoteIds.length > 0) {
        sharedNotes = await db
          .select()
          .from(quickNotes)
          .where(
            and(
              inArray(quickNotes.id, sharedNoteIds),
              or(ilike(quickNotes.title, searchStr), ilike(quickNotes.content, searchStr))
            )
          )
          .orderBy(desc(quickNotes.updatedAt));
      }
    } else {
      ownedNotes = await db
        .select()
        .from(quickNotes)
        .where(eq(quickNotes.createdByUserId, userId))
        .orderBy(desc(quickNotes.updatedAt));

      if (sharedNoteIds.length > 0) {
        sharedNotes = await db
          .select()
          .from(quickNotes)
          .where(inArray(quickNotes.id, sharedNoteIds))
          .orderBy(desc(quickNotes.updatedAt));
      }
    }

    const visibleNoteIds = [...ownedNotes, ...sharedNotes].map((n) => n.id);
    const allSharesForVisible =
      visibleNoteIds.length > 0
        ? await db
            .select()
            .from(quickNoteShares)
            .where(inArray(quickNoteShares.noteId, visibleNoteIds))
        : [];

    const sharesMap: Record<number, QuickNoteShare[]> = {};
    for (const share of allSharesForVisible) {
      if (!sharesMap[share.noteId]) sharesMap[share.noteId] = [];
      sharesMap[share.noteId].push(share);
    }

    const ownedWithMeta = ownedNotes.map((n) => ({
      ...n,
      isOwned: true,
      sharedBy: null,
      shares: sharesMap[n.id] || [],
    }));

    const sharedWithMeta = sharedNotes.map((n) => ({
      ...n,
      isOwned: false,
      sharedBy: n.createdByDisplayName,
      shares: sharesMap[n.id] || [],
    }));

    const merged = [...ownedWithMeta, ...sharedWithMeta].sort(
      (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
    );

    res.json(merged);
  } catch (error) {
    console.error('Error fetching quick notes:', error);
    res.status(500).json({ error: 'Failed to fetch quick notes' });
  }
});

router.get('/users/search', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.isActive, true));

    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users for share:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const [note] = await db.select().from(quickNotes).where(eq(quickNotes.id, noteId));
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const userId = user.id as number;

    if (note.createdByUserId !== userId) {
      const [shareRow] = await db
        .select()
        .from(quickNoteShares)
        .where(
          and(
            eq(quickNoteShares.noteId, noteId),
            eq(quickNoteShares.sharedWithUserId, userId)
          )
        );
      if (!shareRow) return res.status(403).json({ error: 'Access denied' });
    }

    const shares = await db
      .select()
      .from(quickNoteShares)
      .where(eq(quickNoteShares.noteId, noteId));

    res.json({ ...note, shares });
  } catch (error) {
    console.error('Error fetching quick note:', error);
    res.status(500).json({ error: 'Failed to fetch quick note' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const snapshot = await resolveUserSnapshot(user.id);

    const parsed = z
      .object({
        title: z.string().min(1),
        content: z.string().default(''),
        format: z.enum(['text', 'spreadsheet']).default('text'),
        tags: z.array(z.string()).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { title, content, format, tags } = parsed.data;

    const [note] = await db
      .insert(quickNotes)
      .values({
        title,
        content,
        format,
        tags: tags ?? null,
        createdByUserId: snapshot.userId,
        createdByDisplayName: snapshot.displayName,
      })
      .returning();

    res.status(201).json({ ...note, shares: [] });
  } catch (error) {
    console.error('Error creating quick note:', error);
    res.status(500).json({ error: 'Failed to create quick note' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const [note] = await db.select().from(quickNotes).where(eq(quickNotes.id, noteId));
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.createdByUserId !== user.id)
      return res.status(403).json({ error: 'Only the owner can edit this note' });

    const parsed = z
      .object({
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        format: z.enum(['text', 'spreadsheet']).optional(),
        tags: z.array(z.string()).nullable().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const updates: Partial<typeof quickNotes.$inferInsert> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(quickNotes)
      .set(updates)
      .where(eq(quickNotes.id, noteId))
      .returning();

    const shares = await db
      .select()
      .from(quickNoteShares)
      .where(eq(quickNoteShares.noteId, noteId));

    res.json({ ...updated, shares });
  } catch (error) {
    console.error('Error updating quick note:', error);
    res.status(500).json({ error: 'Failed to update quick note' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const [note] = await db.select().from(quickNotes).where(eq(quickNotes.id, noteId));
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.createdByUserId !== user.id)
      return res.status(403).json({ error: 'Only the owner can delete this note' });

    await db.delete(quickNotes).where(eq(quickNotes.id, noteId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting quick note:', error);
    res.status(500).json({ error: 'Failed to delete quick note' });
  }
});

router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const [note] = await db.select().from(quickNotes).where(eq(quickNotes.id, noteId));
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.createdByUserId !== user.id)
      return res.status(403).json({ error: 'Only the owner can share this note' });

    const parsed = z
      .object({ userId: z.number().int() })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    if (parsed.data.userId === user.id) {
      return res.status(400).json({ error: 'Cannot share a note with yourself' });
    }

    const [existing] = await db
      .select()
      .from(quickNoteShares)
      .where(
        and(
          eq(quickNoteShares.noteId, noteId),
          eq(quickNoteShares.sharedWithUserId, parsed.data.userId)
        )
      );

    if (existing) return res.status(409).json({ error: 'Already shared with this user' });

    const snapshot = await resolveUserSnapshot(parsed.data.userId);

    const [share] = await db
      .insert(quickNoteShares)
      .values({
        noteId,
        sharedWithUserId: snapshot.userId,
        sharedWithDisplayName: snapshot.displayName,
      })
      .returning();

    res.status(201).json(share);
  } catch (error) {
    console.error('Error sharing quick note:', error);
    res.status(500).json({ error: 'Failed to share quick note' });
  }
});

router.delete('/:id/share/:shareId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const noteId = parseInt(req.params.id);
    const shareId = parseInt(req.params.shareId);
    if (isNaN(noteId) || isNaN(shareId))
      return res.status(400).json({ error: 'Invalid ID' });

    const [note] = await db.select().from(quickNotes).where(eq(quickNotes.id, noteId));
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.createdByUserId !== user.id)
      return res.status(403).json({ error: 'Only the owner can remove shares' });

    const [deleted] = await db
      .delete(quickNoteShares)
      .where(and(eq(quickNoteShares.id, shareId), eq(quickNoteShares.noteId, noteId)))
      .returning();

    if (!deleted) return res.status(404).json({ error: 'Share not found' });

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing quick note share:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

export default router;
