import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db';
import {
  buildReviewSummary,
  calculateRiskScore,
  createEmptyRiskFields,
  RISK_FIELD_DEFINITIONS,
  RISK_VALUES,
  type MemorySuggestion,
  type RFQRiskSession,
  type RiskAssessmentFields,
  type RiskFieldKey,
  type RiskValue,
} from '../../../shared/rfqRiskAssessment';
import {
  applyFieldOverride,
  extractRiskFields,
  parseVoiceCommand,
} from '../services/rfqRiskExtraction';

const router = Router();

type ConversationEvent = {
  id: string;
  text: string;
  createdAt: string;
  ignored?: boolean;
};

const startSessionSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().optional().nullable(),
  rfqId: z.string().optional(),
});

const utteranceSchema = z.object({
  text: z.string().min(1),
  targetField: z.string().optional(),
});

const overrideSchema = z.object({
  field: z.enum(RISK_FIELD_DEFINITIONS.map((field) => field.key) as [RiskFieldKey, ...RiskFieldKey[]]),
  value: z.enum(RISK_VALUES),
  notes: z.string().optional(),
});

function serialize(row: any, includeTranscript = false): RFQRiskSession & { conversationEvents?: ConversationEvent[] } {
  const fields = (row.fields ?? createEmptyRiskFields()) as RiskAssessmentFields;
  return {
    id: row.id,
    rfqId: row.rfq_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    status: row.status,
    fields,
    scoreSummary: row.score_summary ?? calculateRiskScore(fields),
    reviewSummary: row.review_summary ?? buildReviewSummary(fields),
    reasoningLog: row.reasoning_log ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(includeTranscript ? { conversationEvents: row.conversation_events ?? [] } : {}),
  };
}

async function getCustomerName(customerId: string, fallback?: string | null): Promise<string | null> {
  if (fallback) return fallback;
  const rows = await pool.query(
    `SELECT customer_name FROM p2_customers WHERE customer_id = $1 LIMIT 1`,
    [customerId]
  );
  return rows[0]?.customer_name ?? null;
}

async function getSession(id: string) {
  const rows = await pool.query(`SELECT * FROM rfq_risk_sessions WHERE id = $1 LIMIT 1`, [id]);
  return rows[0];
}

async function updateSessionState(
  id: string,
  patch: {
    status?: string;
    fields?: RiskAssessmentFields;
    conversationEvents?: ConversationEvent[];
    reasoningLog?: string[];
    reviewSummary?: unknown;
  }
) {
  const fields = patch.fields;
  const scoreSummary = fields ? calculateRiskScore(fields) : undefined;
  const reviewSummary = patch.reviewSummary ?? (fields ? buildReviewSummary(fields) : undefined);

  const rows = await pool.query(
    `UPDATE rfq_risk_sessions
     SET status = COALESCE($2, status),
         fields = COALESCE($3::jsonb, fields),
         score_summary = COALESCE($4::jsonb, score_summary),
         review_summary = COALESCE($5::jsonb, review_summary),
         conversation_events = COALESCE($6::jsonb, conversation_events),
         reasoning_log = COALESCE($7::jsonb, reasoning_log),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.status ?? null,
      fields ? JSON.stringify(fields) : null,
      scoreSummary ? JSON.stringify(scoreSummary) : null,
      reviewSummary ? JSON.stringify(reviewSummary) : null,
      patch.conversationEvents ? JSON.stringify(patch.conversationEvents) : null,
      patch.reasoningLog ? JSON.stringify(patch.reasoningLog) : null,
    ]
  );

  return rows[0];
}

function getConversationTexts(events: ConversationEvent[]): string[] {
  return events.filter((event) => !event.ignored).map((event) => event.text);
}

function getOverrides(fields: RiskAssessmentFields): Partial<RiskAssessmentFields> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, field]) => field.source === 'user_override')
  ) as Partial<RiskAssessmentFields>;
}

function mergeOverrides(fields: RiskAssessmentFields, overrides: Partial<RiskAssessmentFields>): RiskAssessmentFields {
  return { ...fields, ...overrides };
}

router.get('/', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT * FROM rfq_risk_sessions
       WHERE ($1::text IS NULL OR customer_id = $1)
       ORDER BY updated_at DESC
       LIMIT 50`,
      [typeof req.query.customerId === 'string' ? req.query.customerId : null]
    );
    res.json(rows.map((row: any) => serialize(row)));
  } catch (error: any) {
    console.error('Failed to list RFQ risk sessions:', error);
    res.status(500).json({ error: 'Failed to list RFQ risk sessions' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = startSessionSchema.parse(req.body);
    const id = randomUUID();
    const rfqId = parsed.rfqId || `RFQ-DRAFT-${new Date().getFullYear()}-${id.slice(0, 8).toUpperCase()}`;
    const customerName = await getCustomerName(parsed.customerId, parsed.customerName);
    const fields = createEmptyRiskFields();
    const scoreSummary = calculateRiskScore(fields);
    const reviewSummary = buildReviewSummary(fields);

    const rows = await pool.query(
      `INSERT INTO rfq_risk_sessions
       (id, rfq_id, customer_id, customer_name, status, fields, score_summary, review_summary, reasoning_log)
       VALUES ($1, $2, $3, $4, 'draft', $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
       RETURNING *`,
      [
        id,
        rfqId,
        parsed.customerId,
        customerName,
        JSON.stringify(fields),
        JSON.stringify(scoreSummary),
        JSON.stringify(reviewSummary),
        JSON.stringify(['Session started. Draft RFQ record created.']),
      ]
    );

    res.status(201).json(serialize(rows[0]));
  } catch (error: any) {
    console.error('Failed to start RFQ risk session:', error);
    res.status(400).json({ error: error?.message || 'Failed to start RFQ risk session' });
  }
});

router.get('/:id', async (req, res) => {
  const row = await getSession(req.params.id);
  if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });
  res.json(serialize(row, req.query.includeTranscript === 'true'));
});

router.post('/:id/utterances', async (req, res) => {
  try {
    const row = await getSession(req.params.id);
    if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });

    const parsed = utteranceSchema.parse(req.body);
    const command = parseVoiceCommand(parsed.text);
    const currentEvents = (row.conversation_events ?? []) as ConversationEvent[];
    const currentFields = (row.fields ?? createEmptyRiskFields()) as RiskAssessmentFields;
    let events = currentEvents;
    let fields = currentFields;
    let status = row.status === 'draft' ? 'in_progress' : row.status;
    let reasoningLog = (row.reasoning_log ?? []) as string[];

    if (command?.type === 'pause') status = 'paused';
    else if (command?.type === 'resume') status = 'in_progress';
    else if (command?.type === 'finish') status = 'review';
    else if (command?.type === 'ignore') {
      const index = [...events].reverse().findIndex((event) => !event.ignored);
      if (index >= 0) {
        const actualIndex = events.length - 1 - index;
        events = events.map((event, eventIndex) =>
          eventIndex === actualIndex ? { ...event, ignored: true } : event
        );
        const overrides = getOverrides(fields);
        const extracted = extractRiskFields(getConversationTexts(events), createEmptyRiskFields());
        fields = mergeOverrides(extracted.fields, overrides);
        reasoningLog = [...reasoningLog, 'Ignored last utterance and recomputed conversation-derived risk fields.'];
      }
    } else if (command?.type === 'mark_risk' && parsed.targetField) {
      fields = applyFieldOverride(fields, parsed.targetField as RiskFieldKey, command.value);
      reasoningLog = [...reasoningLog, `${parsed.targetField}: ${command.value} set by voice override.`];
    } else if (status !== 'paused') {
      events = [
        ...events,
        {
          id: randomUUID(),
          text: parsed.text,
          createdAt: new Date().toISOString(),
        },
      ];
      const overrides = getOverrides(fields);
      const extracted = extractRiskFields(getConversationTexts(events), createEmptyRiskFields());
      fields = mergeOverrides(extracted.fields, overrides);
      reasoningLog = [...reasoningLog, ...extracted.reasoningNotes].slice(-100);
    }

    const updated = await updateSessionState(req.params.id, {
      status,
      fields,
      conversationEvents: events,
      reasoningLog,
    });

    res.json({ ...serialize(updated), command });
  } catch (error: any) {
    console.error('Failed to process RFQ risk utterance:', error);
    res.status(400).json({ error: error?.message || 'Failed to process utterance' });
  }
});

router.patch('/:id/fields', async (req, res) => {
  try {
    const row = await getSession(req.params.id);
    if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });
    const parsed = overrideSchema.parse(req.body);
    const fields = applyFieldOverride(
      (row.fields ?? createEmptyRiskFields()) as RiskAssessmentFields,
      parsed.field,
      parsed.value as RiskValue,
      parsed.notes || 'Set by user in review screen.'
    );
    const updated = await updateSessionState(req.params.id, {
      fields,
      reasoningLog: [...(row.reasoning_log ?? []), `${parsed.field}: ${parsed.value} set by user override.`],
    });
    res.json(serialize(updated));
  } catch (error: any) {
    console.error('Failed to update RFQ risk field:', error);
    res.status(400).json({ error: error?.message || 'Failed to update field' });
  }
});

router.post('/:id/:action(pause|resume|save|finish)', async (req, res) => {
  const row = await getSession(req.params.id);
  if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });

  const statusByAction: Record<string, string> = {
    pause: 'paused',
    resume: 'in_progress',
    save: 'saved',
    finish: 'review',
  };

  const fields = (row.fields ?? createEmptyRiskFields()) as RiskAssessmentFields;
  const updated = await updateSessionState(req.params.id, {
    status: statusByAction[req.params.action],
    fields,
    reviewSummary: buildReviewSummary(fields),
    reasoningLog: [...(row.reasoning_log ?? []), `Session ${req.params.action} requested.`],
  });

  res.json(serialize(updated));
});

router.get('/:id/review', async (req, res) => {
  const row = await getSession(req.params.id);
  if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });
  const fields = (row.fields ?? createEmptyRiskFields()) as RiskAssessmentFields;
  const reviewSummary = buildReviewSummary(fields);
  res.json({
    completedFields: reviewSummary.completedFields,
    lowConfidenceFields: reviewSummary.lowConfidenceFields,
    missingFields: reviewSummary.missingFields,
    prompts: reviewSummary.prompts,
  });
});

router.get('/:id/memory-suggestions', async (req, res) => {
  const row = await getSession(req.params.id);
  if (!row) return res.status(404).json({ error: 'RFQ risk session not found' });

  const suggestions: MemorySuggestion[] = [];
  const legacyRows = await pool.query(
    `SELECT form_data
     FROM rfq_risk_assessments
     WHERE customer_id = $1 AND status = 'submitted'
     ORDER BY submitted_at DESC NULLS LAST, created_at DESC
     LIMIT 10`,
    [row.customer_id]
  );

  const cncSignals = legacyRows.filter((legacy: any) =>
    JSON.stringify(legacy.form_data ?? {}).toLowerCase().includes('cnc')
  );

  if (cncSignals.length > 0) {
    suggestions.push({
      field: 'equipment_requirements',
      value: 'LOW',
      confidence: 0.7,
      note: 'Previous CNC jobs were rated LOW risk. Apply?',
    });
  }

  res.json({ suggestions });
});

export default router;
