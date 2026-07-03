/**
 * productionControlAI.service.ts — WAD Step 6
 *
 * Accepts WAD context + list of APPROVED template summaries, calls GPT-4o,
 * returns structured control flags with confidence and risk.
 */

import OpenAI from 'openai';
import { z } from 'zod';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI credentials are not configured.');
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface WadContext {
  workOrderId: string;
  workOrderNumber: string;
  partNumber: string;
  description?: string | null;
  quantity?: number | null;
  revision?: string | null;
  customer?: string | null;
  partType: string;
  productionType: string;
  riskAssessmentSummary?: string | null;
}

export interface ApprovedTemplateSummary {
  id: string;
  name: string;
  templateType: string;
  routingType?: string | null;
  version: number;
}

// ---------------------------------------------------------------------------
// Output schema (Zod-validated)
// ---------------------------------------------------------------------------

const ControlFlagsSchema = z.object({
  routingRequired: z.boolean(),
  travelerRequired: z.boolean(),
  workInstructionRequired: z.boolean(),
  specSheetRequired: z.boolean(),
  finalQcOnly: z.boolean(),
  inProcessInspectionRequired: z.boolean(),
  spotCheckPlanRequired: z.boolean(),
  certRequired: z.boolean(),
});

const SuggestedTemplatesSchema = z.record(z.string(), z.string().nullable());

export const AIRecommendationSchema = z.object({
  flags: ControlFlagsSchema,
  reason: z.string(),
  suggestedTemplates: SuggestedTemplatesSchema,
  confidenceScore: z.number().min(0).max(1),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export type AIRecommendation = z.infer<typeof AIRecommendationSchema>;
export type ControlFlags = z.infer<typeof ControlFlagsSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(templates: ApprovedTemplateSummary[]): string {
  const templateList =
    templates.length > 0
      ? templates
          .map(
            (t) =>
              `  - id: ${t.id} | name: "${t.name}" | type: ${t.templateType}` +
              (t.routingType ? ` | routingType: ${t.routingType}` : '') +
              ` | version: ${t.version}`,
          )
          .join('\n')
      : '  (no approved templates available)';

  return `You are a production control requirements advisor for an AS9100/ITAR aerospace manufacturing company.

Given a WAD (Work Authorization Document) context, you must determine which production control artifacts are required and suggest the best matching approved templates.

CONTROL RULES BY PART TYPE:
- Composite: routingRequired=true, travelerRequired=true, inProcessInspectionRequired=true, certRequired=true
- CNC Machined: routingRequired=true, travelerRequired=true, finalQcOnly=true
- Assembly / Sub-Assembly: routingRequired=true, travelerRequired=true, workInstructionRequired=true, specSheetRequired=true
- Paint / Finish: routingRequired=true, travelerRequired=true, spotCheckPlanRequired=true
- Special Process: routingRequired=true, travelerRequired=true, certRequired=true, inProcessInspectionRequired=true
- Shipping / Final Inspection Only: finalQcOnly=true

ADDITIONAL RULES BY PRODUCTION TYPE:
- First Article: inProcessInspectionRequired=true, certRequired=true
- Rework: workInstructionRequired=true, inProcessInspectionRequired=true
- Revision Change: workInstructionRequired=true
- Prototype: spotCheckPlanRequired=true

RISK RULES:
- HIGH: First Article + Composite, or Special Process, or certRequired=true + quantity>50
- MEDIUM: any inProcessInspectionRequired or travelerRequired with Rework/Revision
- LOW: everything else

TEMPLATE MATCHING:
For each required artifact type (routing, traveler, qc, work_instruction, spec_sheet), suggest the best matching approved template id from the list.
Map control type strings to template types: routing→ROUTING, traveler→TRAVELER, qc→QC, work_instruction→WORK_INSTRUCTION, spec_sheet→SPEC_SHEET
Use null if no suitable template exists for that artifact.

APPROVED TEMPLATES:
${templateList}

OUTPUT FORMAT (strict JSON, no other content):
{
  "flags": {
    "routingRequired": <bool>,
    "travelerRequired": <bool>,
    "workInstructionRequired": <bool>,
    "specSheetRequired": <bool>,
    "finalQcOnly": <bool>,
    "inProcessInspectionRequired": <bool>,
    "spotCheckPlanRequired": <bool>,
    "certRequired": <bool>
  },
  "reason": "<plain-English explanation of why these controls were chosen>",
  "suggestedTemplates": {
    "routing": "<template-id or null>",
    "traveler": "<template-id or null>",
    "qc": "<template-id or null>",
    "work_instruction": "<template-id or null>",
    "spec_sheet": "<template-id or null>"
  },
  "confidenceScore": <0.0 to 1.0>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH"
}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function getProductionControlRecommendation(
  wadContext: WadContext,
  approvedTemplates: ApprovedTemplateSummary[],
): Promise<AIRecommendation> {
  const systemPrompt = buildSystemPrompt(approvedTemplates);

  const userMessage = `WAD Context:
- Work Order: ${wadContext.workOrderNumber}
- Part Number: ${wadContext.partNumber}
- Description: ${wadContext.description ?? 'N/A'}
- Quantity: ${wadContext.quantity ?? 1}
- Customer: ${wadContext.customer ?? 'N/A'}
- Part Type: ${wadContext.partType}
- Production Type: ${wadContext.productionType}
${wadContext.riskAssessmentSummary ? `- Risk Assessment: ${wadContext.riskAssessmentSummary}` : ''}`;

  let rawContent = '{}';

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: 1024,
    });
    rawContent = completion.choices[0]?.message?.content ?? '{}';
  } catch (err: unknown) {
    console.error('[productionControlAI] OpenAI call failed:', err instanceof Error ? err.message : err);
    return buildFallbackRecommendation(wadContext);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    console.warn('[productionControlAI] Failed to parse AI response JSON');
    return buildFallbackRecommendation(wadContext);
  }

  const result = AIRecommendationSchema.safeParse(parsed);
  if (!result.success) {
    console.warn('[productionControlAI] AI response failed Zod validation:', result.error.message);
    return buildFallbackRecommendation(wadContext);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Fallback when AI is unavailable
// ---------------------------------------------------------------------------

function buildFallbackRecommendation(ctx: WadContext): AIRecommendation {
  const pt = ctx.partType.toLowerCase();
  const isComposite = pt.includes('composite');
  const isSpecial = pt.includes('special');
  const isCNC = pt.includes('cnc');
  const isFirstArticle = ctx.productionType === 'First Article';

  const flags: ControlFlags = {
    routingRequired: true,
    travelerRequired: true,
    workInstructionRequired: false,
    specSheetRequired: false,
    finalQcOnly: isCNC,
    inProcessInspectionRequired: isComposite || isSpecial || isFirstArticle,
    spotCheckPlanRequired: false,
    certRequired: isComposite || isSpecial || isFirstArticle,
  };

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (isSpecial || (isFirstArticle && isComposite)) riskLevel = 'HIGH';
  else if (flags.inProcessInspectionRequired) riskLevel = 'MEDIUM';

  return {
    flags,
    reason: 'AI service unavailable — default controls applied based on part type rules.',
    suggestedTemplates: {
      routing: null,
      traveler: null,
      qc: null,
      work_instruction: null,
      spec_sheet: null,
    },
    confidenceScore: 0.5,
    riskLevel,
  };
}
