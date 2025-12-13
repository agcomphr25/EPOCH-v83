import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  voiceNotes, 
  voiceNoteQuestions, 
  voiceNoteResponses,
  allOrders,
  employees,
  insertVoiceNoteSchema,
  insertVoiceNoteQuestionSchema,
  insertVoiceNoteResponseSchema,
  type VoiceNote,
  type InsertVoiceNote 
} from '../../schema';
import { eq, desc, and, like, sql, inArray, isNull, isNotNull, count } from 'drizzle-orm';

const router = Router();

const ALLOWED_USERS = ['agrace', 'glennj', 'tasham'];

function checkVoiceNoteAccess(req: Request, res: Response, next: Function) {
  // Check session first (for logged-in users), then fall back to bypass user
  const sessionUser = (req as any).session?.user;
  const bypassUser = (req as any).user;
  const user = sessionUser || bypassUser;
  (req as any).user = user; // Ensure user is set for downstream handlers
  const username = user?.username?.toLowerCase();
  console.log('Voice notes access check:', { sessionUser: sessionUser?.username, bypassUser: bypassUser?.username, username });
  if (!username || !ALLOWED_USERS.includes(username)) {
    return res.status(403).json({ error: 'Access denied. Voice notes feature is restricted.' });
  }
  next();
}

function extractOrderId(transcription: string): string | null {
  const patterns = [
    /order\s+([A-Z]{2,3}\d{3,6})/i,
    /\b([A-Z]{2,3}\d{3,6})\b/i,
    /order\s+number\s+([A-Z]{2,3}\d{3,6})/i,
  ];
  
  for (const pattern of patterns) {
    const match = transcription.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

function extractCategory(transcription: string): string | null {
  const categories = [
    'metal insert',
    'duratec',
    'thickness',
    'paint',
    'cnc',
    'layup',
    'finish',
    'quality',
    'shipping',
    'damage',
  ];
  
  const lowerTranscription = transcription.toLowerCase();
  for (const category of categories) {
    if (lowerTranscription.includes(category)) {
      return category;
    }
  }
  return null;
}

function extractTags(transcription: string): string[] {
  const keywords = [
    'problem', 'issue', 'defect', 'thin', 'thick', 'damaged', 'broken',
    'missing', 'wrong', 'incorrect', 'delayed', 'urgent', 'rush',
    'metal insert', 'duratec', 'paint', 'cnc', 'layup', 'finish',
    'quality', 'shipping', 'customer', 'complaint'
  ];
  
  const lowerTranscription = transcription.toLowerCase();
  return keywords.filter(keyword => lowerTranscription.includes(keyword));
}

router.get('/', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { orderId, noteType, category, isResolved, limit = '50', offset = '0' } = req.query;
    
    const conditions = [];
    
    if (orderId) {
      conditions.push(eq(voiceNotes.linkedOrderId, orderId as string));
    }
    if (noteType) {
      conditions.push(eq(voiceNotes.noteType, noteType as string));
    }
    if (category) {
      conditions.push(eq(voiceNotes.category, category as string));
    }
    if (isResolved !== undefined) {
      conditions.push(eq(voiceNotes.isResolved, isResolved === 'true'));
    }
    
    const notes = await db
      .select()
      .from(voiceNotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(voiceNotes.recordedAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    res.json(notes);
  } catch (error) {
    console.error('Error fetching voice notes:', error);
    res.status(500).json({ error: 'Failed to fetch voice notes' });
  }
});

router.get('/by-order/:orderId', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    const notes = await db
      .select()
      .from(voiceNotes)
      .where(eq(voiceNotes.linkedOrderId, orderId))
      .orderBy(desc(voiceNotes.recordedAt));
    
    res.json(notes);
  } catch (error) {
    console.error('Error fetching voice notes for order:', error);
    res.status(500).json({ error: 'Failed to fetch voice notes' });
  }
});

router.get('/analytics', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const totalNotes = await db.select({ count: count() }).from(voiceNotes);
    
    const unresolvedNotes = await db
      .select({ count: count() })
      .from(voiceNotes)
      .where(eq(voiceNotes.isResolved, false));
    
    const notesByCategory = await db
      .select({
        category: voiceNotes.category,
        count: count(),
      })
      .from(voiceNotes)
      .where(isNotNull(voiceNotes.category))
      .groupBy(voiceNotes.category);
    
    const notesByUser = await db
      .select({
        username: voiceNotes.recordedByUsername,
        count: count(),
      })
      .from(voiceNotes)
      .groupBy(voiceNotes.recordedByUsername);
    
    const recentNotes = await db
      .select()
      .from(voiceNotes)
      .orderBy(desc(voiceNotes.recordedAt))
      .limit(10);
    
    const notesWithOrders = await db
      .select({ count: count() })
      .from(voiceNotes)
      .where(isNotNull(voiceNotes.linkedOrderId));
    
    res.json({
      total: totalNotes[0]?.count || 0,
      unresolved: unresolvedNotes[0]?.count || 0,
      byCategory: notesByCategory,
      byUser: notesByUser,
      recentNotes,
      linkedToOrders: notesWithOrders[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching voice notes analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.post('/', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { transcription, linkedOrderId, noteType = 'order', category, tags } = req.body;
    
    if (!transcription || transcription.trim().length === 0) {
      return res.status(400).json({ error: 'Transcription is required' });
    }
    
    const extractedOrderId = linkedOrderId || extractOrderId(transcription);
    const extractedCategory = category || extractCategory(transcription);
    const extractedTags = tags || extractTags(transcription);
    
    let verifiedOrderId = null;
    if (extractedOrderId) {
      const existingOrder = await db
        .select({ orderId: allOrders.orderId })
        .from(allOrders)
        .where(eq(allOrders.orderId, extractedOrderId))
        .limit(1);
      
      if (existingOrder.length > 0) {
        verifiedOrderId = extractedOrderId;
      }
    }
    
    let employeeId = null;
    if (user?.username) {
      const employee = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, user.email))
        .limit(1);
      if (employee.length > 0) {
        employeeId = employee[0].id;
      }
    }
    
    const [newNote] = await db
      .insert(voiceNotes)
      .values({
        transcription: transcription.trim(),
        linkedOrderId: verifiedOrderId,
        noteType: verifiedOrderId ? 'order' : (noteType || 'general'),
        category: extractedCategory,
        tags: extractedTags.length > 0 ? extractedTags : null,
        recordedById: employeeId,
        recordedByUsername: user?.username || 'unknown',
      })
      .returning();
    
    // If linked to an order, append the transcription to the order's notes field
    if (verifiedOrderId) {
      const [existingOrder] = await db
        .select({ notes: allOrders.notes })
        .from(allOrders)
        .where(eq(allOrders.orderId, verifiedOrderId))
        .limit(1);
      
      const timestamp = new Date().toLocaleString('en-US', { 
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
      });
      const voiceNoteEntry = `[Voice Note ${timestamp} - ${user?.username || 'unknown'}]: ${transcription.trim()}`;
      
      const updatedNotes = existingOrder?.notes 
        ? `${existingOrder.notes}\n\n${voiceNoteEntry}`
        : voiceNoteEntry;
      
      await db
        .update(allOrders)
        .set({ notes: updatedNotes })
        .where(eq(allOrders.orderId, verifiedOrderId));
    }
    
    res.status(201).json({
      ...newNote,
      extractedOrderId,
      orderVerified: !!verifiedOrderId,
    });
  } catch (error) {
    console.error('Error creating voice note:', error);
    res.status(500).json({ error: 'Failed to create voice note' });
  }
});

router.get('/:id', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [note] = await db
      .select()
      .from(voiceNotes)
      .where(eq(voiceNotes.id, id));
    
    if (!note) {
      return res.status(404).json({ error: 'Voice note not found' });
    }
    
    const responses = await db
      .select({
        response: voiceNoteResponses,
        question: voiceNoteQuestions,
      })
      .from(voiceNoteResponses)
      .leftJoin(voiceNoteQuestions, eq(voiceNoteResponses.questionId, voiceNoteQuestions.id))
      .where(eq(voiceNoteResponses.voiceNoteId, id));
    
    res.json({ ...note, responses });
  } catch (error) {
    console.error('Error fetching voice note:', error);
    res.status(500).json({ error: 'Failed to fetch voice note' });
  }
});

router.patch('/:id/resolve', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolvedNotes } = req.body;
    const user = (req as any).user;
    
    let employeeId = null;
    if (user?.email) {
      const employee = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, user.email))
        .limit(1);
      if (employee.length > 0) {
        employeeId = employee[0].id;
      }
    }
    
    const [updatedNote] = await db
      .update(voiceNotes)
      .set({
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: employeeId,
        resolvedNotes: resolvedNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(voiceNotes.id, id))
      .returning();
    
    if (!updatedNote) {
      return res.status(404).json({ error: 'Voice note not found' });
    }
    
    res.json(updatedNote);
  } catch (error) {
    console.error('Error resolving voice note:', error);
    res.status(500).json({ error: 'Failed to resolve voice note' });
  }
});

router.delete('/:id', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [deletedNote] = await db
      .delete(voiceNotes)
      .where(eq(voiceNotes.id, id))
      .returning();
    
    if (!deletedNote) {
      return res.status(404).json({ error: 'Voice note not found' });
    }
    
    res.json({ message: 'Voice note deleted successfully' });
  } catch (error) {
    console.error('Error deleting voice note:', error);
    res.status(500).json({ error: 'Failed to delete voice note' });
  }
});

router.get('/questions/list', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const questions = await db
      .select()
      .from(voiceNoteQuestions)
      .where(eq(voiceNoteQuestions.isActive, true))
      .orderBy(voiceNoteQuestions.sortOrder);
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching voice note questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

router.post('/questions', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const [newQuestion] = await db
      .insert(voiceNoteQuestions)
      .values(req.body)
      .returning();
    
    res.status(201).json(newQuestion);
  } catch (error) {
    console.error('Error creating voice note question:', error);
    res.status(500).json({ error: 'Failed to create question' });
  }
});

router.post('/:id/responses', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { responses } = req.body;
    
    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: 'Responses array is required' });
    }
    
    const insertData = responses.map((r: any) => ({
      voiceNoteId: id,
      questionId: r.questionId,
      responseValue: r.responseValue,
      employeeId: r.employeeId || null,
    }));
    
    const insertedResponses = await db
      .insert(voiceNoteResponses)
      .values(insertData)
      .returning();
    
    res.status(201).json(insertedResponses);
  } catch (error) {
    console.error('Error saving voice note responses:', error);
    res.status(500).json({ error: 'Failed to save responses' });
  }
});

router.get('/access/check', async (req: Request, res: Response) => {
  // Check session first (for logged-in users), then fall back to bypass user
  const sessionUser = (req as any).session?.user;
  const bypassUser = (req as any).user;
  const user = sessionUser || bypassUser;
  const username = user?.username?.toLowerCase();
  const hasAccess = !!username && ALLOWED_USERS.includes(username);
  console.log('Voice notes access check endpoint:', { sessionUser: sessionUser?.username, bypassUser: bypassUser?.username, username, hasAccess });
  res.json({ hasAccess, username: user?.username });
});

export default router;
