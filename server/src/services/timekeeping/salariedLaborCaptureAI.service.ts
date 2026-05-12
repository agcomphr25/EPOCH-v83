/**
 * salariedLaborCaptureAI.service.ts — Phase 5
 *
 * Conversational time-entry parser for salaried employees.
 *
 * Exported functions:
 *   buildSalariedSystemPrompt(indirectCodes, referenceDate)
 *     Builds a narrow, DCAA-aware system prompt that instructs the model to parse
 *     natural-language narratives into the target segment JSON structure.
 *
 *   parseSalariedNarrative(employeeId, narrative, referenceDate)
 *     Sanitizes input, calls OpenAI with the salaried prompt, validates each
 *     segment against live DB data, and returns the full validated segment array.
 *     Never touches labor_entry_drafts — that is the caller's responsibility.
 *
 * Security policy:
 *   - Raw OpenAI response and system prompt content are NEVER echoed to callers.
 *   - All errors surface only safe, generic messages.
 *   - narratives are sanitized before being sent to OpenAI (reuses sanitizeNarrative).
 */

import OpenAI from "openai";
import { db } from "../../../db";
import { eq } from "drizzle-orm";
import { travelers } from "../../../schema";
import {
  indirectCodesTable,
} from "../../schema/timekeeping";
import { sanitizeNarrative } from "./laborCaptureAI.service";
import { resolveChargeCode } from "../../lib/resolveChargeCode";

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI credentials are not configured.");
  }

  openaiClient = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  return openaiClient;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LOW_CONFIDENCE_THRESHOLD = 0.70;
const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MAX_DAILY_HOURS = 24;
const ACTIVE_TRAVELER_STATUSES = ["IN_PROGRESS"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw segment shape returned by OpenAI. */
interface RawAISegment {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
  laborCategory: string;
  indirectCodeHint?: string | null;
  travelerHint?: string | null;
  description: string;
  confidence: number;
  needsReview: boolean;
  explanation?: string | null;
}

/** A fully validated and resolved segment ready for draft storage. */
export interface ConversationalSegment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  laborCategory: "DIRECT" | "INDIRECT" | "AMBIGUOUS";
  chargeCodeId: number | null;
  indirectCodeId: number | null;
  indirectCodeLabel: string | null;
  resolvedTravelerId: string | null;
  resolvedTravelerNumber: string | null;
  description: string;
  confidence: number;
  needsReview: boolean;
  explanation: string | null;
}

/** Validation error flags for segments that cannot be auto-resolved. */
export interface ConversationalValidationError {
  segmentIndex: number;
  segmentDescription: string;
  reason: string;
}

/** Full parse result returned to the route. */
export interface ParsedNarrativeResult {
  segments: ConversationalSegment[];
  validationErrors: ConversationalValidationError[];
  overallConfidence: number;
  hasNeedsReview: boolean;
  totalHours: number;
}

// ---------------------------------------------------------------------------
// Unique ID generator for segments
// ---------------------------------------------------------------------------
function genSegmentId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Convert an HH:MM string to total minutes since midnight.
 */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Normalise a time string from various AI outputs ("9:00", "09:00", "9:00 AM")
 * to strict HH:MM 24-hour format. Returns null if the string cannot be parsed.
 */
function normaliseTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Try HH:MM or H:MM (24h)
  const basic = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (basic) {
    let h = parseInt(basic[1]!, 10);
    const m = parseInt(basic[2]!, 10);
    const meridiem = (basic[3] ?? "").toUpperCase();
    if (meridiem === "PM" && h !== 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Derive start/end times from a duration.
 * Uses a simple sequential strategy: accumulates from 08:00 by default.
 * The caller passes the running offset (minutes since 08:00 for this entry date).
 */
function deriveTimeRange(
  durationHours: number,
  offsetMinutes: number,
): { startTime: string; endTime: string } {
  const baseMinutes = 8 * 60 + offsetMinutes;
  const startH = Math.floor(baseMinutes / 60) % 24;
  const startM = baseMinutes % 60;
  const endMinutes = baseMinutes + Math.round(durationHours * 60);
  const endH = Math.floor(endMinutes / 60) % 24;
  const endM = endMinutes % 60;
  return {
    startTime: `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`,
    endTime: `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`,
  };
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds a DCAA-compliant salaried time-entry system prompt.
 * Exported so tests can inspect the prompt structure independently.
 */
export function buildSalariedSystemPrompt(params: {
  indirectCodes: Array<{ id: number; code: string; label: string }>;
  referenceDate: string;
}): string {
  const { indirectCodes, referenceDate } = params;

  const indirectContext =
    indirectCodes.length > 0
      ? indirectCodes
          .map((ic) => `  - ${ic.code}: ${ic.label}`)
          .join("\n")
      : "  (no active indirect codes)";

  return `You are a DCAA-compliant labor time-entry parsing assistant for a manufacturing company.

Your job is to parse an employee's plain-English narrative about their workday and return a structured segment array.

REFERENCE DATE: ${referenceDate}

STRICT RULES — follow all of these exactly:
1. Return ONLY valid JSON matching the OUTPUT FORMAT below. No prose, no markdown, no explanation text.
2. Resolve relative date references: "today" = ${referenceDate}, "yesterday" = the day before.
3. Each segment must have EITHER a durationHours (positive number) OR a startTime + endTime pair.
   - Prefer explicit start/end times when the employee provides them.
   - Use durationHours when only a duration (e.g. "2 hours") is mentioned.
4. laborCategory must be exactly "DIRECT" (traveler-based) or "INDIRECT" (overhead/indirect code).
5. For INDIRECT labor: indirectCodeHint must be the exact code string from the active indirect code list below.
   If no exact match exists, set indirectCodeHint to your best guess and set needsReview: true, confidence < 0.7.
6. For DIRECT labor: travelerHint must be the traveler number string (e.g. "TR-1042"). If unknown, set needsReview: true.
7. confidence is a decimal 0.0–1.0 representing resolution certainty.
   - 0.9–1.0: exact match, unambiguous
   - 0.7–0.89: likely match, minor uncertainty
   - < 0.7: ambiguous or unresolved — always set needsReview: true for these
8. needsReview must be true when: confidence < 0.7, no matching indirect code, no traveler hint, or the narrative is ambiguous.
9. explanation is required when needsReview is true. Include the reason for ambiguity.
10. Total durationHours across all segments must not exceed 24.
11. Each segment durationHours must be > 0.

ACTIVE INDIRECT CODES:
${indirectContext}

OUTPUT FORMAT (JSON only, no other content):
{
  "segments": [
    {
      "date": "<YYYY-MM-DD resolved date>",
      "startTime": "<HH:MM 24h or null>",
      "endTime": "<HH:MM 24h or null>",
      "durationHours": <positive number or null>,
      "laborCategory": "DIRECT" | "INDIRECT",
      "indirectCodeHint": "<exact indirect code string or null>",
      "travelerHint": "<traveler number string or null>",
      "description": "<brief description of the work performed>",
      "confidence": <0.0 to 1.0>,
      "needsReview": <true | false>,
      "explanation": "<reason string if needsReview is true, else null>"
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Validation helper — resolves one segment against live DB data
// ---------------------------------------------------------------------------

async function validateSegment(
  raw: RawAISegment,
  index: number,
  referenceDate: string,
  travelerByNumber: Map<string, {
    id: string;
    travelerNumber: string;
    defaultChargeCodeId: number | null;
    productionWorkOrderId: string | null;
    status: string;
  }>,
  indirectByCode: Map<string, {
    id: number;
    code: string;
    label: string;
    chargeCodeId: number | null;
    isActive: boolean;
  }>,
  timeOffsetMinutes: number,
): Promise<{
  segment: ConversationalSegment;
  validationError: ConversationalValidationError | null;
  durationHours: number;
  endOffsetMinutes: number;
}> {
  const segId = genSegmentId();
  const description = typeof raw.description === "string" ? raw.description.slice(0, 500) : "";
  const confidence = typeof raw.confidence === "number"
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;
  const needsReview = Boolean(raw.needsReview) || confidence < LOW_CONFIDENCE_THRESHOLD;
  const explanation = typeof raw.explanation === "string" ? raw.explanation : null;

  // Resolve the date — fallback to referenceDate
  const segDate = (raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date))
    ? raw.date
    : referenceDate;

  // Resolve time range
  let startTime: string;
  let endTime: string;
  let durationHours: number;

  const normStart = normaliseTime(raw.startTime);
  const normEnd = normaliseTime(raw.endTime);

  if (normStart && normEnd && toMinutes(normEnd) > toMinutes(normStart)) {
    startTime = normStart;
    endTime = normEnd;
    durationHours = (toMinutes(normEnd) - toMinutes(normStart)) / 60;
  } else if (typeof raw.durationHours === "number" && raw.durationHours > 0) {
    durationHours = raw.durationHours;
    const derived = deriveTimeRange(durationHours, timeOffsetMinutes);
    startTime = derived.startTime;
    endTime = derived.endTime;
  } else {
    // Cannot determine duration
    const derived = deriveTimeRange(1, timeOffsetMinutes);
    startTime = derived.startTime;
    endTime = derived.endTime;
    durationHours = 1;

    const errSeg: ConversationalSegment = {
      id: segId,
      date: segDate,
      startTime,
      endTime,
      durationHours,
      laborCategory: "AMBIGUOUS",
      chargeCodeId: null,
      indirectCodeId: null,
      indirectCodeLabel: null,
      resolvedTravelerId: null,
      resolvedTravelerNumber: null,
      description,
      confidence: 0,
      needsReview: true,
      explanation: "Could not determine time range or duration from the narrative.",
    };
    return {
      segment: errSeg,
      validationError: {
        segmentIndex: index,
        segmentDescription: description,
        reason: "Could not determine time range or duration from the narrative.",
      },
      durationHours,
      endOffsetMinutes: timeOffsetMinutes + Math.round(durationHours * 60),
    };
  }

  const newOffsetMinutes = timeOffsetMinutes + Math.round(durationHours * 60);

  const category = raw.laborCategory === "DIRECT" ? "DIRECT" : "INDIRECT";

  let chargeCodeId: number | null = null;
  let indirectCodeId: number | null = null;
  let indirectCodeLabel: string | null = null;
  let resolvedTravelerId: string | null = null;
  let resolvedTravelerNumber: string | null = null;
  let validationError: ConversationalValidationError | null = null;
  let resolvedNeedsReview = needsReview;
  let resolvedExplanation = explanation;

  if (category === "INDIRECT") {
    const hint = raw.indirectCodeHint?.trim().toLowerCase();
    if (hint) {
      const ic = indirectByCode.get(hint);
      if (ic && ic.isActive) {
        indirectCodeId = ic.id;
        indirectCodeLabel = ic.label;
        if (ic.chargeCodeId) {
          chargeCodeId = ic.chargeCodeId;
        } else {
          resolvedNeedsReview = true;
          resolvedExplanation = resolvedExplanation ?? `Indirect code '${ic.code}' has no charge code mapping. A charge code must be selected before this entry can be confirmed.`;
          validationError = {
            segmentIndex: index,
            segmentDescription: description,
            reason: resolvedExplanation,
          };
        }
      } else {
        // Hint didn't match any active code
        resolvedNeedsReview = true;
        resolvedExplanation = resolvedExplanation ?? `Indirect code '${raw.indirectCodeHint}' not found or inactive. Please select the correct code.`;
        validationError = {
          segmentIndex: index,
          segmentDescription: description,
          reason: resolvedExplanation,
        };
      }
    } else {
      resolvedNeedsReview = true;
      resolvedExplanation = resolvedExplanation ?? "No indirect code could be identified for this segment.";
      validationError = {
        segmentIndex: index,
        segmentDescription: description,
        reason: resolvedExplanation,
      };
    }
  } else {
    // DIRECT labor
    const hint = raw.travelerHint?.trim().toLowerCase();
    if (hint) {
      const traveler = travelerByNumber.get(hint);
      if (!traveler) {
        resolvedNeedsReview = true;
        resolvedExplanation = resolvedExplanation ?? `Traveler number '${raw.travelerHint}' was not found in the system.`;
        validationError = {
          segmentIndex: index,
          segmentDescription: description,
          reason: resolvedExplanation,
        };
      } else if (!ACTIVE_TRAVELER_STATUSES.includes(traveler.status as "IN_PROGRESS")) {
        resolvedNeedsReview = true;
        resolvedExplanation = resolvedExplanation ?? `Traveler '${raw.travelerHint}' is not active (status: ${traveler.status}).`;
        validationError = {
          segmentIndex: index,
          segmentDescription: description,
          reason: resolvedExplanation,
        };
        resolvedTravelerId = traveler.id;
        resolvedTravelerNumber = traveler.travelerNumber;
      } else if (!traveler.productionWorkOrderId) {
        resolvedNeedsReview = true;
        resolvedExplanation = resolvedExplanation ?? `Traveler '${raw.travelerHint}' has no production work order (WAD) — required for direct labor.`;
        validationError = {
          segmentIndex: index,
          segmentDescription: description,
          reason: resolvedExplanation,
        };
        resolvedTravelerId = traveler.id;
        resolvedTravelerNumber = traveler.travelerNumber;
      } else {
        const ccResult = await resolveChargeCode({
          productionWorkOrderId: traveler.productionWorkOrderId,
          travelerId: traveler.id,
          department: null,
        });
        if (ccResult.resolvedFrom === "none") {
          resolvedNeedsReview = true;
          resolvedExplanation = resolvedExplanation ?? `Could not resolve a charge code for traveler '${raw.travelerHint}'.`;
          validationError = {
            segmentIndex: index,
            segmentDescription: description,
            reason: resolvedExplanation,
          };
        } else {
          chargeCodeId = ccResult.chargeCodeId;
        }
        resolvedTravelerId = traveler.id;
        resolvedTravelerNumber = traveler.travelerNumber;
      }
    } else {
      resolvedNeedsReview = true;
      resolvedExplanation = resolvedExplanation ?? "No traveler number identified for direct labor segment.";
      validationError = {
        segmentIndex: index,
        segmentDescription: description,
        reason: resolvedExplanation,
      };
    }
  }

  const segment: ConversationalSegment = {
    id: segId,
    date: segDate,
    startTime,
    endTime,
    durationHours,
    laborCategory: category,
    chargeCodeId,
    indirectCodeId,
    indirectCodeLabel,
    resolvedTravelerId,
    resolvedTravelerNumber,
    description,
    confidence,
    needsReview: resolvedNeedsReview,
    explanation: resolvedExplanation,
  };

  return {
    segment,
    validationError,
    durationHours,
    endOffsetMinutes: newOffsetMinutes,
  };
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------

/**
 * Parse a salaried employee's narrative into validated labor segments.
 *
 * @param employeeId     timekeeping.employees.id (not public.employees.id)
 * @param rawNarrative   The raw text input from the employee
 * @param referenceDate  ISO date string (YYYY-MM-DD) — the "today" for relative date resolution
 */
export async function parseSalariedNarrative(
  employeeId: number,
  rawNarrative: string,
  referenceDate: string,
): Promise<ParsedNarrativeResult> {
  const narrative = sanitizeNarrative(rawNarrative);

  // Pre-load live DB data for validation
  const [allIndirectCodes, allTravelerRows] = await Promise.all([
    db
      .select({
        id: indirectCodesTable.id,
        code: indirectCodesTable.code,
        label: indirectCodesTable.label,
        chargeCodeId: indirectCodesTable.chargeCodeId,
        isActive: indirectCodesTable.isActive,
      })
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.isActive, true)),
    db
      .select({
        id: travelers.id,
        travelerNumber: travelers.travelerNumber,
        defaultChargeCodeId: travelers.defaultChargeCodeId,
        productionWorkOrderId: travelers.productionWorkOrderId,
        status: travelers.status,
      })
      .from(travelers),
  ]);

  const indirectByCode = new Map(
    allIndirectCodes.map((ic) => [ic.code.trim().toLowerCase(), ic]),
  );
  const travelerByNumber = new Map(
    allTravelerRows.map((t) => [t.travelerNumber?.trim().toLowerCase() ?? "", t]),
  );

  const systemPrompt = buildSalariedSystemPrompt({
    indirectCodes: allIndirectCodes.map((ic) => ({
      id: ic.id,
      code: ic.code,
      label: ic.label,
    })),
    referenceDate,
  });

  let rawSegments: RawAISegment[] = [];
  let parseFailureReason: string | null = null;

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: narrative },
      ],
      max_completion_tokens: 2048,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = null;
      parseFailureReason = "AI returned invalid JSON — the narrative could not be parsed. Please try again or use manual entry.";
    }

    if (parsed !== null && parseFailureReason === null) {
      if (
        typeof parsed === "object" &&
        "segments" in parsed &&
        Array.isArray((parsed as Record<string, unknown>)["segments"])
      ) {
        rawSegments = (parsed as { segments: unknown[] }).segments as RawAISegment[];
        if (rawSegments.length === 0) {
          parseFailureReason = "The AI could not identify any time segments in the narrative. Please rephrase or use manual entry.";
        }
      } else {
        parseFailureReason = "AI returned a response in an unexpected format. Please try again or use manual entry.";
        console.warn("[salariedLaborCaptureAI] OpenAI returned non-conforming JSON structure.");
      }
    }
  } catch (aiErr: unknown) {
    const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
    console.error("[salariedLaborCaptureAI] OpenAI call failed:", msg);
    parseFailureReason = "AI service is temporarily unavailable. Please try again shortly or use manual entry.";
  }

  // Validate each segment
  const segments: ConversationalSegment[] = [];
  const validationErrors: ConversationalValidationError[] = [];

  // If the parse itself failed, record a global validation error immediately
  if (parseFailureReason !== null) {
    validationErrors.push({
      segmentIndex: -1,
      segmentDescription: "All segments",
      reason: parseFailureReason,
    });
  }
  let totalHours = 0;
  let timeOffsetMinutes = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i]!;
    const result = await validateSegment(
      raw,
      i,
      referenceDate,
      travelerByNumber,
      indirectByCode,
      timeOffsetMinutes,
    );
    segments.push(result.segment);
    if (result.validationError) {
      validationErrors.push(result.validationError);
    }
    totalHours += result.durationHours;
    timeOffsetMinutes = result.endOffsetMinutes;
  }

  // Enforce total hours cap
  if (totalHours > MAX_DAILY_HOURS) {
    console.warn(
      `[salariedLaborCaptureAI] Total parsed hours (${totalHours}) exceed ${MAX_DAILY_HOURS}; flagging all segments.`,
    );
    for (const seg of segments) {
      seg.needsReview = true;
      seg.confidence = Math.min(seg.confidence, 0.5);
      seg.explanation =
        seg.explanation ??
        `Total hours (${totalHours.toFixed(2)}) across all segments exceed the 24-hour daily maximum.`;
    }
    validationErrors.push({
      segmentIndex: -1,
      segmentDescription: "All segments",
      reason: `Total hours (${totalHours.toFixed(2)}) exceed the 24-hour daily maximum.`,
    });
  }

  const overallConfidence =
    segments.length > 0
      ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      : 0;

  const hasNeedsReview = segments.some((s) => s.needsReview) || validationErrors.length > 0;

  return {
    segments,
    validationErrors,
    overallConfidence,
    hasNeedsReview,
    totalHours,
  };
}
