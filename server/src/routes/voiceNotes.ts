import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { 
  voiceNotes, 
  voiceNoteQuestions, 
  voiceNoteResponses,
  allOrders,
  customers,
  employees,
  inventoryItems,
  stockModels,
} from '../../schema';
import { eq, desc, and, like, sql, isNotNull, count } from 'drizzle-orm';
import {
  AUDIO_INTEGRATION_UNAVAILABLE,
  AudioIntegrationUnavailableError,
  convertWebmToWav,
  speechToText,
  textToSpeech,
} from '../../replit_integrations/audio/client';

const router = Router();

const ALLOWED_USERS = ['agrace', 'glennj', 'tasham'];
const VIEW_ALL_USERS = ['glennj'];
const DEFAULT_LIMIT = 100;

type VoiceName = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
type AudioInputFormat = 'wav' | 'mp3' | 'webm';

type SuggestedLink = {
  type: 'order' | 'customer' | 'product' | 'inventory';
  id: string;
  label: string;
  confidence: 'verified' | 'suggested';
};

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
    'rail bottleneck',
    'employee observation',
    'process observation',
    'business line complexity',
    'production reprioritization',
    'production concern',
    'customer context',
    'meeting recap',
    'training insight',
    'engineering knowledge',
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
    'quality', 'shipping', 'customer', 'complaint', 'rail', 'bottleneck',
    'reprioritize', 'priority', 'employee', 'process', 'training', 'meeting',
    'vendor', 'supplier', 'capacity', 'resource', 'mold', 'cad', 'engineering'
  ];
  
  const lowerTranscription = transcription.toLowerCase();
  return keywords.filter(keyword => lowerTranscription.includes(keyword));
}

function getCurrentUsername(req: Request): string | null {
  const user = (req as any).user;
  return user?.username?.toLowerCase() || null;
}

function canViewAllVoiceNotes(username: string | null): boolean {
  return !!username && VIEW_ALL_USERS.includes(username);
}

function shouldRestrictVoiceNotesToOwner(username: string | null): username is string {
  return !!username && !canViewAllVoiceNotes(username);
}

function summarizeTranscript(transcription: string): string {
  const clean = transcription.trim().replace(/\s+/g, ' ');
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) || [clean];
  const summary = sentences.slice(0, 2).join(' ');
  return summary.length > 260 ? `${summary.slice(0, 257).trim()}...` : summary;
}

function titleFromTranscript(transcription: string, category: string | null): string {
  const clean = transcription.trim().replace(/\s+/g, ' ');
  const firstPhrase = clean.split(/[.!?]/)[0]?.trim() || clean;
  const title = firstPhrase.length > 72 ? `${firstPhrase.slice(0, 69).trim()}...` : firstPhrase;
  return title || (category ? `${category} note` : 'Knowledge capture note');
}

function classifyNote(transcription: string): string {
  const text = transcription.toLowerCase();
  if (/\b(meeting|recap|talked with|met with|discussion)\b/.test(text)) return 'meeting_recap';
  if (/\b(employee|operator|tech|technician|performance|coaching|training)\b/.test(text)) return 'employee_process_observation';
  if (/\b(repriorit|priority|rush|late|delay|bottleneck|capacity|blocked|rail)\b/.test(text)) return 'production_concern';
  if (/\b(process|workflow|handoff|standard|sop|procedure|resource)\b/.test(text)) return 'process_observation';
  if (/\b(customer|dan|dealer|quote|order)\b/.test(text)) return 'customer_order_context';
  if (/\b(mold|cad|engineering|design|tolerance|drawing)\b/.test(text)) return 'engineering_knowledge';
  if (/\b(learn|lesson|teach|junior|why we)\b/.test(text)) return 'training_insight';
  return 'journal';
}

function extractTasks(transcription: string): string[] {
  const taskMarkers = /\b(need to|needs to|should|follow up|check|review|create|call|ask|look into|make sure)\b/i;
  return transcription
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(sentence => sentence && taskMarkers.test(sentence))
    .map(sentence => sentence.length > 180 ? `${sentence.slice(0, 177).trim()}...` : sentence)
    .slice(0, 6);
}

function generateFollowUpQuestions(noteType: string, transcription: string): string[] {
  const text = transcription.toLowerCase();
  if (text.includes('rail')) {
    return [
      'Which rail parts or suppliers are involved?',
      'Which orders are blocked or at risk?',
      'What priority rule should Kentro remember for the next rail bottleneck?',
    ];
  }
  if (noteType === 'production_concern') {
    return [
      'Which orders, product lines, or departments are affected?',
      'Is this a one-time issue or a recurring bottleneck?',
      'What decision or follow-up should happen next?',
    ];
  }
  if (noteType === 'employee_process_observation') {
    return [
      'Is this mainly a coaching note, a process issue, or both?',
      'What behavior or process signal should Kentro watch for next time?',
      'Should this stay journal-only or become a training/process improvement item?',
    ];
  }
  if (noteType === 'engineering_knowledge') {
    return [
      'What design choice or rule of thumb should a junior engineer learn from this?',
      'Which mold, CAD file, part, or product should this be linked to?',
      'What mistake would this prevent if it became a training card?',
    ];
  }
  if (noteType === 'meeting_recap') {
    return [
      'What decisions came out of this meeting?',
      'Who owns the next actions?',
      'Are there any due dates or affected orders to link?',
    ];
  }
  return [
    'Should this stay as a private journal note or become a task, training insight, or process item?',
    'What Kentro records should this be linked to?',
    'What would make this useful when you search for it later?',
  ];
}

function extractCandidatePhrases(transcription: string): string[] {
  const phrases = new Set<string>();
  const capitalized = transcription.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) || [];
  for (const phrase of capitalized) {
    if (!['I', 'The', 'This', 'That', 'We', 'If', 'When'].includes(phrase)) phrases.add(phrase);
  }
  for (const word of extractTags(transcription)) {
    if (word.length > 3) phrases.add(word);
  }
  return Array.from(phrases).slice(0, 8);
}

async function suggestLinks(transcription: string, verifiedOrderId: string | null): Promise<SuggestedLink[]> {
  const suggestions: SuggestedLink[] = [];
  if (verifiedOrderId) {
    suggestions.push({ type: 'order', id: verifiedOrderId, label: `Order ${verifiedOrderId}`, confidence: 'verified' });
  }

  const phrases = extractCandidatePhrases(transcription);
  for (const phrase of phrases.slice(0, 4)) {
    const pattern = `%${phrase.toLowerCase()}%`;
    const [customerMatches, stockMatches, inventoryMatches] = await Promise.all([
      db.select({ id: customers.id, name: customers.name, company: customers.company })
        .from(customers)
        .where(like(sql`lower(${customers.name})`, pattern))
        .limit(2),
      db.select({ id: stockModels.id, name: stockModels.displayName })
        .from(stockModels)
        .where(like(sql`lower(${stockModels.displayName})`, pattern))
        .limit(2),
      db.select({ id: inventoryItems.id, name: inventoryItems.name, partNumber: inventoryItems.agPartNumber })
        .from(inventoryItems)
        .where(like(sql`lower(${inventoryItems.name})`, pattern))
        .limit(2),
    ]);

    for (const match of customerMatches) {
      suggestions.push({ type: 'customer', id: String(match.id), label: match.company ? `${match.name} (${match.company})` : match.name, confidence: 'suggested' });
    }
    for (const match of stockMatches) {
      suggestions.push({ type: 'product', id: match.id, label: match.name, confidence: 'suggested' });
    }
    for (const match of inventoryMatches) {
      suggestions.push({ type: 'inventory', id: String(match.id), label: `${match.name} (${match.partNumber})`, confidence: 'suggested' });
    }
  }

  const seen = new Set<string>();
  return suggestions.filter(link => {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

async function createVoiceNoteFromTranscript(req: Request, transcription: string, overrides: {
  linkedOrderId?: string | null;
  noteType?: string | null;
  category?: string | null;
  tags?: string[] | null;
} = {}) {
  const user = (req as any).user;
  const cleanedTranscription = transcription.trim();
  const extractedOrderId = overrides.linkedOrderId || extractOrderId(cleanedTranscription);
  const inferredNoteType = overrides.noteType || classifyNote(cleanedTranscription);
  const extractedCategory =
    overrides.category || extractCategory(cleanedTranscription) || inferredNoteType.replace(/_/g, ' ');
  const extractedTags = overrides.tags || extractTags(cleanedTranscription);
  const summary = summarizeTranscript(cleanedTranscription);
  const title = titleFromTranscript(cleanedTranscription, extractedCategory);
  const extractedTasks = extractTasks(cleanedTranscription);
  const followUpQuestions = generateFollowUpQuestions(inferredNoteType, cleanedTranscription);

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

  let linkSuggestions: SuggestedLink[] = [];
  try {
    linkSuggestions = await suggestLinks(cleanedTranscription, verifiedOrderId);
  } catch (suggestionError) {
    console.warn('Voice note link suggestions skipped:', suggestionError);
  }

  let employeeId = null;
  const userEmail = typeof user?.email === 'string' ? user.email.trim() : '';
  if (userEmail) {
    const employee = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, userEmail))
      .limit(1);
    if (employee.length > 0) {
      employeeId = employee[0].id;
    }
  }

  const [newNote] = await db
    .insert(voiceNotes)
    .values({
      transcription: cleanedTranscription,
      title,
      summary,
      linkedOrderId: verifiedOrderId,
      noteType: verifiedOrderId ? 'customer_order_context' : inferredNoteType,
      category: extractedCategory,
      tags: extractedTags.length > 0 ? extractedTags : null,
      extractedTasks: extractedTasks.length > 0 ? extractedTasks : null,
      suggestedLinks: linkSuggestions.length > 0 ? linkSuggestions : null,
      followUpQuestions,
      visibility: 'private',
      recordedById: employeeId,
      recordedByUsername: user?.username || 'unknown',
    })
    .returning();

  if (verifiedOrderId) {
    try {
      const [existingOrder] = await db
        .select({ notes: allOrders.notes })
        .from(allOrders)
        .where(eq(allOrders.orderId, verifiedOrderId))
        .limit(1);

      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const voiceNoteEntry = `[Voice Note ${timestamp} - ${user?.username || 'unknown'}]: ${cleanedTranscription}`;

      const updatedNotes = existingOrder?.notes
        ? `${existingOrder.notes}\n\n${voiceNoteEntry}`
        : voiceNoteEntry;

      await db
        .update(allOrders)
        .set({ notes: updatedNotes })
        .where(eq(allOrders.orderId, verifiedOrderId));
    } catch (orderNoteError) {
      console.warn('Voice note saved, but order notes update was skipped:', orderNoteError);
    }
  }

  return {
    ...newNote,
    extractedOrderId,
    orderVerified: !!verifiedOrderId,
  };
}

function normalizeVoice(voice: unknown): VoiceName {
  const allowed: VoiceName[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  return allowed.includes(voice as VoiceName) ? voice as VoiceName : 'nova';
}

function normalizeInputFormat(format: unknown): AudioInputFormat {
  return format === 'mp3' || format === 'wav' || format === 'webm' ? format : 'webm';
}

router.get('/', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { orderId, noteType, category, isResolved, limit = String(DEFAULT_LIMIT), offset = '0' } = req.query;
    const username = getCurrentUsername(req);
    
    const conditions = [];
    if (shouldRestrictVoiceNotesToOwner(username)) {
      conditions.push(eq(voiceNotes.recordedByUsername, username));
    }
    
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
    const username = getCurrentUsername(req);
    const orderCondition = eq(voiceNotes.linkedOrderId, orderId);
    
    const notes = await db
      .select()
      .from(voiceNotes)
      .where(
        shouldRestrictVoiceNotesToOwner(username)
          ? and(orderCondition, eq(voiceNotes.recordedByUsername, username))
          : orderCondition
      )
      .orderBy(desc(voiceNotes.recordedAt));
    
    res.json(notes);
  } catch (error) {
    console.error('Error fetching voice notes for order:', error);
    res.status(500).json({ error: 'Failed to fetch voice notes' });
  }
});

router.get('/analytics', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const username = getCurrentUsername(req);
    const ownerCondition = shouldRestrictVoiceNotesToOwner(username)
      ? eq(voiceNotes.recordedByUsername, username)
      : undefined;
    const unresolvedCondition = ownerCondition
      ? and(ownerCondition, eq(voiceNotes.isResolved, false))
      : eq(voiceNotes.isResolved, false);
    const categoryCondition = ownerCondition
      ? and(ownerCondition, isNotNull(voiceNotes.category))
      : isNotNull(voiceNotes.category);
    const linkedOrderCondition = ownerCondition
      ? and(ownerCondition, isNotNull(voiceNotes.linkedOrderId))
      : isNotNull(voiceNotes.linkedOrderId);

    const totalNotes = await db.select({ count: count() }).from(voiceNotes).where(ownerCondition);
    
    const unresolvedNotes = await db
      .select({ count: count() })
      .from(voiceNotes)
      .where(unresolvedCondition);
    
    const notesByCategory = await db
      .select({
        category: voiceNotes.category,
        count: count(),
      })
      .from(voiceNotes)
      .where(categoryCondition)
      .groupBy(voiceNotes.category);
    
    const notesByUser = await db
      .select({
        username: voiceNotes.recordedByUsername,
        count: count(),
      })
      .from(voiceNotes)
      .where(ownerCondition)
      .groupBy(voiceNotes.recordedByUsername);
    
    const recentNotes = await db
      .select()
      .from(voiceNotes)
      .where(ownerCondition)
      .orderBy(desc(voiceNotes.recordedAt))
      .limit(10);
    
    const notesWithOrders = await db
      .select({ count: count() })
      .from(voiceNotes)
      .where(linkedOrderCondition);
    
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
    const { transcription, linkedOrderId, noteType, category, tags } = req.body;
    
    if (!transcription || transcription.trim().length === 0) {
      return res.status(400).json({ error: 'Transcription is required' });
    }

    const newNote = await createVoiceNoteFromTranscript(req, transcription, {
      linkedOrderId,
      noteType,
      category,
      tags,
    });

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error creating voice note:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to create voice note', details: message });
  }
});

router.post('/assistant-capture', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const {
      audio,
      inputFormat,
      voice,
      linkedOrderId,
      noteType,
      category,
      tags,
      speakResponse = true,
    } = req.body;

    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const normalizedFormat = normalizeInputFormat(inputFormat);
    const audioBuffer = Buffer.from(audio, 'base64');
    const transcriptionBuffer = normalizedFormat === 'webm'
      ? await convertWebmToWav(audioBuffer)
      : audioBuffer;
    const transcriptionFormat = normalizedFormat === 'webm' ? 'wav' : normalizedFormat;
    const transcription = await speechToText(transcriptionBuffer, transcriptionFormat);

    if (!transcription || transcription.trim().length === 0) {
      return res.status(422).json({ error: 'Could not detect speech in the recording' });
    }

    const newNote = await createVoiceNoteFromTranscript(req, transcription, {
      linkedOrderId,
      noteType,
      category,
      tags,
    });

    const assistantTranscript = newNote.orderVerified && newNote.linkedOrderId
      ? `Captured and linked to order ${newNote.linkedOrderId}. I also saved the note privately.`
      : `Captured as "${newNote.title || 'a private knowledge note'}." I saved it privately and added follow-up prompts.`;

    let audioResponse: string | null = null;
    let audioFormat: 'mp3' | null = null;
    if (speakResponse) {
      const responseBuffer = await textToSpeech(assistantTranscript, normalizeVoice(voice), 'mp3');
      audioResponse = responseBuffer.toString('base64');
      audioFormat = 'mp3';
    }

    res.status(201).json({
      ...newNote,
      userTranscript: transcription,
      assistantTranscript,
      audioResponse,
      audioFormat,
    });
  } catch (error) {
    if (error instanceof AudioIntegrationUnavailableError) {
      return res.status(503).json({ error: AUDIO_INTEGRATION_UNAVAILABLE });
    }
    console.error('Error creating assistant voice capture:', error);
    res.status(500).json({ error: 'Failed to process assistant voice capture' });
  }
});

router.get('/:id', checkVoiceNoteAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const username = getCurrentUsername(req);
    const noteCondition = eq(voiceNotes.id, id);
    
    const [note] = await db
      .select()
      .from(voiceNotes)
      .where(
        shouldRestrictVoiceNotesToOwner(username)
          ? and(noteCondition, eq(voiceNotes.recordedByUsername, username))
          : noteCondition
      );
    
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
      .where(user?.username ? and(eq(voiceNotes.id, id), eq(voiceNotes.recordedByUsername, user.username)) : eq(voiceNotes.id, id))
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
    const username = getCurrentUsername(req);
    
    const [deletedNote] = await db
      .delete(voiceNotes)
      .where(username ? and(eq(voiceNotes.id, id), eq(voiceNotes.recordedByUsername, username)) : eq(voiceNotes.id, id))
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
