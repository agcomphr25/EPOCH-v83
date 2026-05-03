/**
 * laborCaptureAI.service.ts — Phase B Prompt 1
 *
 * "AI Suggests, Human Approves, System Audits"
 *
 * Exported functions:
 *   generateSuggestions(employeeId, timesheetId, narrative)
 *     Sanitizes input, builds a narrow OpenAI context, calls OpenAI in JSON
 *     mode, validates every returned hint against the live DB, persists the
 *     suggestion record, and returns the row.  Never touches
 *     salaried_timesheet_lines.
 *
 *   rejectSuggestion(suggestionId, actorId)
 *     Confirms ownership + DRAFT status then marks REJECTED.
 *
 *   expireStaleDrafts()
 *     Marks DRAFT suggestions EXPIRED when expires_at < now().
 *
 * Security policy:
 *   - Raw OpenAI response, system prompt content, and narratives are NEVER
 *     echoed back to callers.
 *   - All errors surface only safe, generic messages.
 */

import { db } from "../../../db";
import OpenAI from "openai";
import { eq, and, lt } from "drizzle-orm";
import { travelers } from "../../../schema";
import {
  laborCaptureSuggestionsTable,
  salariedTimesheetsTable,
  indirectCodesTable,
  type LaborCaptureSuggestion,
} from "../../schema/timekeeping";
import { getSuggestedTravelers, requireEditableState } from "./salariedTimesheet.service";
import { resolveChargeCode } from "../../lib/resolveChargeCode";

// ---------------------------------------------------------------------------
// OpenAI client — uses Replit-managed integration credentials
// ---------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SUGGESTION_TTL_HOURS = 4;
const LOW_CONFIDENCE_THRESHOLD = 0.70;
const MAX_NARRATIVE_CHARS = 2000;
const MAX_DAILY_HOURS = 24;

// Active traveler statuses — only these may be used for direct labor entry
const ACTIVE_TRAVELER_STATUSES = ["IN_PROGRESS"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single suggestion hint returned by OpenAI. */
interface RawAISuggestionHint {
  type: string;
  hours: number;
  description: string;
  confidence: number;
  travelerHint: string | null;
  indirectCodeHint: string | null;
  ambiguityReason: string | null;
}

/** Shape of the full OpenAI response body (JSON mode). */
interface RawAIResponse {
  suggestions: RawAISuggestionHint[];
}

/** A suggestion line after full server-side validation. */
export interface ValidatedSuggestedLine {
  type: "DIRECT" | "INDIRECT";
  hours: number;
  description: string;
  confidence: number;
  travelerHint: string | null;
  indirectCodeHint: string | null;
  ambiguityReason: string | null;
  ambiguous: boolean;
  resolvedTravelerId: string | null;
  resolvedTravelerNumber: string | null;
  resolvedIndirectCodeId: number | null;
  resolvedIndirectCodeLabel: string | null;
  chargeCodeId: number | null;
}

// ---------------------------------------------------------------------------
// Narrative sanitization
// ---------------------------------------------------------------------------

const HTML_TAG_RE = /<[^>]*>/g;
const SCRIPT_LIKE_RE = /<script|javascript:|onerror=|onload=|data:/i;

/**
 * Sanitizes a raw narrative string.
 * Throws a 400 with a safe user-facing message on violation.
 */
export function sanitizeNarrative(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.length > MAX_NARRATIVE_CHARS) {
    const err = new Error(`Narrative exceeds maximum length of ${MAX_NARRATIVE_CHARS} characters.`);
    (err as NodeJS.ErrnoException).code = "400";
    (err as Record<string, unknown>)["statusCode"] = 400;
    throw err;
  }

  if (SCRIPT_LIKE_RE.test(trimmed)) {
    const err = new Error("Narrative contains disallowed content.");
    (err as Record<string, unknown>)["statusCode"] = 400;
    throw err;
  }

  if (HTML_TAG_RE.test(trimmed)) {
    const err = new Error("Narrative contains disallowed HTML content.");
    (err as Record<string, unknown>)["statusCode"] = 400;
    throw err;
  }

  return trimmed;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(params: {
  employeeId: number;
  recentTravelers: Array<{
    travelerId: string;
    travelerNumber: string;
    chargeCodeLabel: string | null;
    projectName: string | null;
  }>;
  activeIndirectCodes: Array<{ id: number; code: string; label: string }>;
}): string {
  const travelerContext =
    params.recentTravelers.length > 0
      ? params.recentTravelers
          .map(
            (t) =>
              `  - Traveler ${t.travelerNumber}` +
              (t.projectName ? ` (Project: ${t.projectName})` : "") +
              (t.chargeCodeLabel ? `, Charge Code: ${t.chargeCodeLabel}` : ""),
          )
          .join("\n")
      : "  (no recent travelers available)";

  const indirectContext =
    params.activeIndirectCodes.length > 0
      ? params.activeIndirectCodes
          .map((ic) => `  - ${ic.code}: ${ic.label}`)
          .join("\n")
      : "  (no active indirect codes)";

  return `You are a labor-entry assistant for a manufacturing company's DCAA-compliant timekeeping system.

Your job is to parse an employee's plain-English narrative about their workday and return a structured list of labor hints.

STRICT RULES — you MUST follow all of these:
1. Return ONLY the JSON structure specified below. No prose, no markdown, no explanation.
2. Return HINTS ONLY — never actual database IDs, never internal keys, only traveler numbers as text strings.
3. Do NOT invent traveler numbers that are not in the "Recent Travelers" list. If the narrative mentions a traveler not in the list, set travelerHint to the number mentioned and note the ambiguity in ambiguityReason.
4. Do NOT post labor. Do NOT modify any records. You are a read-only suggestion engine.
5. Every suggestion must specify either a travelerHint (for DIRECT labor) or an indirectCodeHint (for INDIRECT labor), never both.
6. For INDIRECT labor, the indirectCodeHint must exactly match one of the active indirect code strings listed below.
7. Confidence must be a decimal between 0.0 and 1.0 representing how certain you are about this classification.
8. If you cannot resolve a hint, explain why in ambiguityReason.
9. Hours per line must be > 0. Total hours across all suggestions must be ≤ 24.

EMPLOYEE CONTEXT:
  Employee ID: ${params.employeeId}

RECENT TRAVELERS (most recent first):
${travelerContext}

ACTIVE INDIRECT CODES:
${indirectContext}

OUTPUT FORMAT (JSON only, no other content):
{
  "suggestions": [
    {
      "type": "DIRECT" | "INDIRECT",
      "hours": <positive number>,
      "description": "<brief description of the work>",
      "confidence": <0.0 to 1.0>,
      "travelerHint": "<traveler number string or null>",
      "indirectCodeHint": "<indirect code string or null>",
      "ambiguityReason": "<reason string if unresolvable, else null>"
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Type guard for raw AI response
// ---------------------------------------------------------------------------

function isRawAIResponse(val: unknown): val is RawAIResponse {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["suggestions"]);
}

// ---------------------------------------------------------------------------
// Validation engine — full server-side validation per spec
// ---------------------------------------------------------------------------

async function validateSuggestedLines(
  rawHints: RawAISuggestionHint[],
): Promise<ValidatedSuggestedLine[]> {
  const { inArray } = await import("drizzle-orm");

  // Pre-load all travelers (number → row) for fast lookup
  const allTravelerRows = await db
    .select({
      id: travelers.id,
      travelerNumber: travelers.travelerNumber,
      defaultChargeCodeId: travelers.defaultChargeCodeId,
      productionWorkOrderId: travelers.productionWorkOrderId,
      status: travelers.status,
    })
    .from(travelers);

  const travelerByNumber = new Map(
    allTravelerRows.map((t) => [t.travelerNumber?.trim().toLowerCase(), t]),
  );

  // Pre-load all active indirect codes (code → row)
  const allIndirectCodes = await db
    .select({
      id: indirectCodesTable.id,
      code: indirectCodesTable.code,
      label: indirectCodesTable.label,
      chargeCodeId: indirectCodesTable.chargeCodeId,
      isActive: indirectCodesTable.isActive,
    })
    .from(indirectCodesTable)
    .where(eq(indirectCodesTable.isActive, true));

  const indirectByCode = new Map(
    allIndirectCodes.map((ic) => [ic.code.trim().toLowerCase(), ic]),
  );

  const validated: ValidatedSuggestedLine[] = [];
  let totalHours = 0;

  for (const raw of rawHints) {
    if (raw.type !== "DIRECT" && raw.type !== "INDIRECT") {
      validated.push({
        type: "INDIRECT",
        hours: typeof raw.hours === "number" ? raw.hours : 0,
        description: typeof raw.description === "string" ? raw.description : "",
        confidence: 0,
        travelerHint: null,
        indirectCodeHint: typeof raw.indirectCodeHint === "string" ? raw.indirectCodeHint : null,
        ambiguityReason: `AI returned an unrecognized line type '${raw.type}'. Expected DIRECT or INDIRECT.`,
        ambiguous: true,
        resolvedTravelerId: null,
        resolvedTravelerNumber: null,
        resolvedIndirectCodeId: null,
        resolvedIndirectCodeLabel: null,
        chargeCodeId: null,
      });
      continue;
    }

    const lineType: "DIRECT" | "INDIRECT" = raw.type;

    const line: ValidatedSuggestedLine = {
      type: lineType,
      hours: typeof raw.hours === "number" ? raw.hours : 0,
      description: typeof raw.description === "string" ? raw.description : "",
      confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0,
      travelerHint: typeof raw.travelerHint === "string" ? raw.travelerHint : null,
      indirectCodeHint: typeof raw.indirectCodeHint === "string" ? raw.indirectCodeHint : null,
      ambiguityReason: typeof raw.ambiguityReason === "string" ? raw.ambiguityReason : null,
      ambiguous: false,
      resolvedTravelerId: null,
      resolvedTravelerNumber: null,
      resolvedIndirectCodeId: null,
      resolvedIndirectCodeLabel: null,
      chargeCodeId: null,
    };

    if (!Number.isFinite(line.hours) || line.hours <= 0) {
      line.ambiguous = true;
      line.ambiguityReason = "Hours must be a positive finite number greater than 0.";
      validated.push(line);
      continue;
    }

    totalHours += line.hours;

    if (lineType === "DIRECT") {
      // ── DIRECT validation ────────────────────────────────────────────────
      const hint = line.travelerHint?.trim().toLowerCase();
      if (!hint) {
        line.ambiguous = true;
        line.ambiguityReason = "DIRECT labor line has no travelerHint.";
        validated.push(line);
        continue;
      }

      const traveler = travelerByNumber.get(hint);
      if (!traveler) {
        line.ambiguous = true;
        line.ambiguityReason = `Traveler number '${line.travelerHint}' not found in the database.`;
        validated.push(line);
        continue;
      }

      // Traveler must be active (IN_PROGRESS)
      if (!ACTIVE_TRAVELER_STATUSES.includes(traveler.status as "IN_PROGRESS")) {
        line.ambiguous = true;
        line.ambiguityReason = `Traveler '${line.travelerHint}' is not active (current status: ${traveler.status}).`;
        line.resolvedTravelerId = traveler.id;
        line.resolvedTravelerNumber = traveler.travelerNumber;
        validated.push(line);
        continue;
      }

      // Traveler must be owned by a valid WAD (productionWorkOrderId required)
      if (!traveler.productionWorkOrderId) {
        line.ambiguous = true;
        line.ambiguityReason = `Traveler '${line.travelerHint}' is not linked to a production work order (WAD). A WAD is required for direct labor.`;
        line.resolvedTravelerId = traveler.id;
        line.resolvedTravelerNumber = traveler.travelerNumber;
        validated.push(line);
        continue;
      }

      // Must pass resolveChargeCode with resolvedFrom !== 'none'
      const ccResult = await resolveChargeCode({
        productionWorkOrderId: traveler.productionWorkOrderId,
        travelerId: traveler.id,
        department: null,
      });

      if (ccResult.resolvedFrom === "none") {
        line.ambiguous = true;
        line.ambiguityReason = `Charge code could not be resolved for traveler '${line.travelerHint}': ${"error" in ccResult ? ccResult.error : "unknown error"}.`;
        line.resolvedTravelerId = traveler.id;
        line.resolvedTravelerNumber = traveler.travelerNumber;
        validated.push(line);
        continue;
      }

      line.resolvedTravelerId = traveler.id;
      line.resolvedTravelerNumber = traveler.travelerNumber;
      line.chargeCodeId = ccResult.chargeCodeId;
    } else {
      // ── INDIRECT validation ──────────────────────────────────────────────
      const hint = line.indirectCodeHint?.trim().toLowerCase();
      if (!hint) {
        line.ambiguous = true;
        line.ambiguityReason = "INDIRECT labor line has no indirectCodeHint.";
        validated.push(line);
        continue;
      }

      const ic = indirectByCode.get(hint);
      if (!ic) {
        line.ambiguous = true;
        line.ambiguityReason = `Indirect code '${line.indirectCodeHint}' not found or inactive.`;
        validated.push(line);
        continue;
      }

      if (!ic.chargeCodeId) {
        line.ambiguous = true;
        line.ambiguityReason = `Indirect code '${line.indirectCodeHint}' has no charge code mapping.`;
        line.resolvedIndirectCodeId = ic.id;
        line.resolvedIndirectCodeLabel = ic.label;
        validated.push(line);
        continue;
      }

      line.resolvedIndirectCodeId = ic.id;
      line.resolvedIndirectCodeLabel = ic.label;
      line.chargeCodeId = ic.chargeCodeId;
    }

    validated.push(line);
  }

  if (totalHours > MAX_DAILY_HOURS) {
    console.warn(
      `[laborCaptureAI] Total suggested hours (${totalHours}) exceed ${MAX_DAILY_HOURS}; flagging all lines.`,
    );
    return validated.map((l) => ({
      ...l,
      ambiguous: true,
      ambiguityReason:
        l.ambiguityReason ??
        `Total hours (${totalHours}) across all lines exceed the ${MAX_DAILY_HOURS}-hour daily maximum.`,
    }));
  }

  return validated;
}

// ---------------------------------------------------------------------------
// generateSuggestions
// ---------------------------------------------------------------------------

export async function generateSuggestions(
  employeeId: number,
  timesheetId: number,
  rawNarrative: string,
): Promise<LaborCaptureSuggestion> {
  const narrative = sanitizeNarrative(rawNarrative);

  const [ts] = await db
    .select()
    .from(salariedTimesheetsTable)
    .where(eq(salariedTimesheetsTable.id, timesheetId))
    .limit(1);

  if (!ts) {
    const err = new Error("Timesheet not found.");
    (err as Record<string, unknown>)["statusCode"] = 404;
    throw err;
  }

  if (ts.employeeId !== employeeId) {
    const err = new Error("Forbidden: timesheet does not belong to this employee.");
    (err as Record<string, unknown>)["statusCode"] = 403;
    throw err;
  }

  // Reuse the canonical guard from salariedTimesheet.service — no duplication
  requireEditableState(ts);

  const [travelersResult, activeIndirectCodes] = await Promise.all([
    getSuggestedTravelers(employeeId, 5),
    db
      .select({
        id: indirectCodesTable.id,
        code: indirectCodesTable.code,
        label: indirectCodesTable.label,
      })
      .from(indirectCodesTable)
      .where(eq(indirectCodesTable.isActive, true)),
  ]);

  const systemPrompt = buildSystemPrompt({
    employeeId,
    recentTravelers: travelersResult.suggestions.map((s) => ({
      travelerId: s.travelerId,
      travelerNumber: s.travelerNumber,
      chargeCodeLabel: s.chargeCodeLabel,
      projectName: s.projectName,
    })),
    activeIndirectCodes,
  });

  let parsedResponse: RawAIResponse | null = null;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: narrative },
      ],
      max_completion_tokens: 1024,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = null;
    }

    if (isRawAIResponse(parsed)) {
      parsedResponse = parsed;
    } else {
      console.warn("[laborCaptureAI] OpenAI returned non-conforming JSON structure.");
    }
  } catch (aiCallErr: unknown) {
    const msg = aiCallErr instanceof Error ? aiCallErr.message : String(aiCallErr);
    console.error("[laborCaptureAI] OpenAI call failed:", msg);
    // Continue — persists a suggestion record with empty lines so employee sees what happened
  }

  const rawHints: RawAISuggestionHint[] = parsedResponse?.suggestions ?? [];
  const validatedLines = await validateSuggestedLines(rawHints);

  const hasLowConfidence = validatedLines.some(
    (l) => l.ambiguous || l.confidence < LOW_CONFIDENCE_THRESHOLD,
  );

  const overallConfidence =
    validatedLines.length > 0
      ? validatedLines.reduce((sum, l) => sum + l.confidence, 0) / validatedLines.length
      : null;

  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_HOURS * 60 * 60 * 1000);

  const [row] = await db
    .insert(laborCaptureSuggestionsTable)
    .values({
      employeeId,
      timesheetId,
      originalNarrative: narrative,
      parsedJson: parsedResponse,
      suggestedLines: validatedLines,
      overallConfidence: overallConfidence !== null ? overallConfidence.toFixed(4) : null,
      lowConfidenceFlagged: hasLowConfidence,
      status: "DRAFT",
      expiresAt,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to persist suggestion record.");
  }

  return row;
}

// ---------------------------------------------------------------------------
// rejectSuggestion
// ---------------------------------------------------------------------------

export async function rejectSuggestion(
  suggestionId: number,
  actorId: number,
): Promise<LaborCaptureSuggestion> {
  const [suggestion] = await db
    .select()
    .from(laborCaptureSuggestionsTable)
    .where(eq(laborCaptureSuggestionsTable.id, suggestionId))
    .limit(1);

  if (!suggestion) {
    const err = new Error("Suggestion not found.");
    (err as Record<string, unknown>)["statusCode"] = 404;
    throw err;
  }

  if (suggestion.employeeId !== actorId) {
    const err = new Error("Forbidden: suggestion does not belong to this employee.");
    (err as Record<string, unknown>)["statusCode"] = 403;
    throw err;
  }

  if (suggestion.status !== "DRAFT") {
    const err = new Error(
      `Cannot reject a suggestion in status '${suggestion.status}'. Only DRAFT suggestions may be rejected.`,
    );
    (err as Record<string, unknown>)["statusCode"] = 409;
    throw err;
  }

  const [updated] = await db
    .update(laborCaptureSuggestionsTable)
    .set({ status: "REJECTED", rejectedAt: new Date() })
    .where(eq(laborCaptureSuggestionsTable.id, suggestionId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update suggestion record.");
  }

  return updated;
}

// ---------------------------------------------------------------------------
// expireStaleDrafts
// ---------------------------------------------------------------------------

export async function expireStaleDrafts(): Promise<{ expired: number }> {
  const now = new Date();

  const result = await db
    .update(laborCaptureSuggestionsTable)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(laborCaptureSuggestionsTable.status, "DRAFT"),
        lt(laborCaptureSuggestionsTable.expiresAt, now),
      ),
    )
    .returning({ id: laborCaptureSuggestionsTable.id });

  return { expired: result.length };
}
