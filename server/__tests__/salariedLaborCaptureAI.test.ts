/**
 * salariedLaborCaptureAI.test.ts
 *
 * Unit tests for Phase 5 — Conversational time entry parser.
 * Covers the core behavioral guarantees of parseSalariedNarrative and
 * buildSalariedSystemPrompt without any real OpenAI calls or DB connections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock DB — use vi.fn() inline; access via vi.mocked() after import
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  db: { select: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock resolveChargeCode
// ---------------------------------------------------------------------------
vi.mock("../src/lib/resolveChargeCode", () => ({
  resolveChargeCode: vi.fn().mockResolvedValue({
    chargeCodeId: 42,
    chargeCode: "CC-001",
    resolvedFrom: "wad_default",
  }),
}));

// ---------------------------------------------------------------------------
// Mock the public schema (travelers table reference)
// ---------------------------------------------------------------------------
vi.mock("../schema", () => ({
  travelers: {},
  employees: {},
  users: {},
  chargeCodes: {},
  productionWorkOrders: {},
  travelerSteps: {},
  routingOperations: {},
  trainingCertifications: {},
}));

// ---------------------------------------------------------------------------
// Mock the timekeeping schema
// ---------------------------------------------------------------------------
vi.mock("../src/schema/timekeeping", () => ({
  indirectCodesTable: {},
  laborEntryDraftsTable: {},
  salariedTimesheetsTable: {},
  salariedTimesheetLinesTable: {},
  employeesTable: {},
}));

// ---------------------------------------------------------------------------
// Mock sanitizeNarrative from laborCaptureAI.service
// ---------------------------------------------------------------------------
vi.mock("../src/services/timekeeping/laborCaptureAI.service", () => ({
  sanitizeNarrative: vi.fn((raw: string) => raw.trim()),
}));

// ---------------------------------------------------------------------------
// Mock OpenAI — use vi.fn() inline; access via vi.mocked() after import
// ---------------------------------------------------------------------------
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after all mocks are registered)
// ---------------------------------------------------------------------------
import {
  buildSalariedSystemPrompt,
  parseSalariedNarrative,
} from "../src/services/timekeeping/salariedLaborCaptureAI.service";
import { db } from "../db";
import { sanitizeNarrative } from "../src/services/timekeeping/laborCaptureAI.service";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const REFERENCE_DATE = "2026-05-01";

interface MockIndirectCode {
  id: number;
  code: string;
  label: string;
  chargeCodeId: number | null;
  isActive: boolean;
}

interface MockTravelerRow {
  id: string;
  travelerNumber: string;
  defaultChargeCodeId: number | null;
  productionWorkOrderId: string | null;
  status: string;
}

const INDIRECT_CODES: MockIndirectCode[] = [
  { id: 1, code: "QUOTING", label: "Quoting & Estimating", chargeCodeId: 10, isActive: true },
  { id: 2, code: "MEETINGS", label: "Internal Meetings", chargeCodeId: 11, isActive: true },
  { id: 3, code: "ADMIN", label: "Administrative", chargeCodeId: 12, isActive: true },
  { id: 4, code: "TRAINING", label: "Training", chargeCodeId: 13, isActive: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface MockAISegment {
  date?: string;
  startTime?: string;
  endTime?: string;
  durationHours?: number;
  laborCategory: "DIRECT" | "INDIRECT";
  indirectCodeHint?: string | null;
  travelerHint?: string | null;
  description: string;
  confidence: number;
  needsReview: boolean;
  explanation?: string | null;
}

function makeOpenAIResponse(
  segments: MockAISegment[],
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  return Promise.resolve({
    choices: [{ message: { content: JSON.stringify({ segments }) } }],
  });
}

/**
 * Wire up db.select() to return indirectCodes then travelerRows across the
 * two parallel DB calls performed by parseSalariedNarrative.
 */
function setupDB(
  indirectCodes: MockIndirectCode[] = INDIRECT_CODES,
  travelerRows: MockTravelerRow[] = [],
): void {
  let fromCallCount = 0;

  vi.mocked(db.select).mockImplementation(() => ({
    from: () => {
      const idx = fromCallCount++;
      const data: MockIndirectCode[] | MockTravelerRow[] =
        idx === 0 ? indirectCodes : travelerRows;
      const resolved = Promise.resolve(data);
      return {
        where: () => Promise.resolve(data),
        limit: () => Promise.resolve(data),
        then: resolved.then.bind(resolved),
      };
    },
  }) as ReturnType<typeof db.select>);
}

/**
 * Get the mock `create` fn from the OpenAI instance that was constructed when
 * the service was first imported.
 */
function getOpenAICreate(): ReturnType<typeof vi.fn> {
  const OpenAIConstructor = vi.mocked(OpenAI);
  const instance = OpenAIConstructor.mock.results[0]?.value as {
    chat: { completions: { create: ReturnType<typeof vi.fn> } };
  };
  return instance.chat.completions.create;
}

// ---------------------------------------------------------------------------
// Tests — buildSalariedSystemPrompt
// ---------------------------------------------------------------------------
describe("buildSalariedSystemPrompt", () => {
  it("includes the reference date in the prompt", () => {
    const prompt = buildSalariedSystemPrompt({
      indirectCodes: INDIRECT_CODES,
      referenceDate: REFERENCE_DATE,
    });
    expect(prompt).toContain(REFERENCE_DATE);
  });

  it("lists all provided indirect codes", () => {
    const prompt = buildSalariedSystemPrompt({
      indirectCodes: INDIRECT_CODES,
      referenceDate: REFERENCE_DATE,
    });
    for (const ic of INDIRECT_CODES) {
      expect(prompt).toContain(ic.code);
      expect(prompt).toContain(ic.label);
    }
  });

  it("instructs the model to return JSON only", () => {
    const prompt = buildSalariedSystemPrompt({
      indirectCodes: [],
      referenceDate: REFERENCE_DATE,
    });
    expect(prompt).toContain("Return ONLY valid JSON");
  });

  it("mentions DCAA compliance", () => {
    const prompt = buildSalariedSystemPrompt({
      indirectCodes: [],
      referenceDate: REFERENCE_DATE,
    });
    expect(prompt).toMatch(/DCAA/i);
  });

  it("shows a placeholder when no indirect codes are available", () => {
    const prompt = buildSalariedSystemPrompt({
      indirectCodes: [],
      referenceDate: REFERENCE_DATE,
    });
    expect(prompt).toContain("(no active indirect codes)");
  });
});

// ---------------------------------------------------------------------------
// Tests — parseSalariedNarrative
// ---------------------------------------------------------------------------
describe("parseSalariedNarrative", () => {
  beforeEach(() => {
    getOpenAICreate().mockReset();
  });

  it("returns hasNeedsReview=false when all segments are high-confidence and fully resolved", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          startTime: "09:00",
          endTime: "11:00",
          durationHours: 2,
          laborCategory: "INDIRECT",
          indirectCodeHint: "QUOTING",
          travelerHint: null,
          description: "Wrote a quote for customer",
          confidence: 0.95,
          needsReview: false,
          explanation: null,
        },
      ]),
    );

    const result = await parseSalariedNarrative(1, "2 hours on quoting", REFERENCE_DATE);
    expect(result.hasNeedsReview).toBe(false);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.indirectCodeId).toBe(1);
    expect(result.segments[0]!.chargeCodeId).toBe(10);
    expect(result.segments[0]!.needsReview).toBe(false);
  });

  it("sets needsReview=true on segments with confidence below 0.7", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          durationHours: 1.5,
          laborCategory: "INDIRECT",
          indirectCodeHint: "QUOTING",
          description: "Ambiguous work",
          confidence: 0.5,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(1, "some ambiguous work", REFERENCE_DATE);
    expect(result.hasNeedsReview).toBe(true);
    expect(result.segments[0]!.needsReview).toBe(true);
  });

  it("sets needsReview=true for unresolved indirect code hints and adds a validationError", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          durationHours: 1,
          laborCategory: "INDIRECT",
          indirectCodeHint: "NONEXISTENT_CODE",
          description: "Unknown activity",
          confidence: 0.8,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(1, "some unknown activity", REFERENCE_DATE);
    expect(result.hasNeedsReview).toBe(true);
    expect(result.segments[0]!.needsReview).toBe(true);
    expect(result.validationErrors).toHaveLength(1);
  });

  it("surfaces missing indirect code charge code mappings in validationErrors", async () => {
    const codesWithoutMapping: MockIndirectCode[] = [
      { id: 5, code: "UNMAPPED", label: "Unmapped Code", chargeCodeId: null, isActive: true },
    ];
    setupDB(codesWithoutMapping, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          durationHours: 1,
          laborCategory: "INDIRECT",
          indirectCodeHint: "UNMAPPED",
          description: "Unmapped code work",
          confidence: 0.9,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(1, "work on unmapped code", REFERENCE_DATE);
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]!.reason).toContain("no charge code mapping");
  });

  it("always calls sanitizeNarrative with the raw input (DCAA traceability)", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockResolvedValue({
      choices: [{ message: { content: '{"segments":[]}' } }],
    });

    const theNarrative = "Yesterday I spent 3 hours on admin work";
    await parseSalariedNarrative(1, theNarrative, REFERENCE_DATE);
    expect(vi.mocked(sanitizeNarrative)).toHaveBeenCalledWith(theNarrative);
  });

  it("correctly sums total hours across parsed segments", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          startTime: "09:00",
          endTime: "11:00",
          durationHours: 2,
          laborCategory: "INDIRECT",
          indirectCodeHint: "QUOTING",
          description: "Quoting",
          confidence: 0.9,
          needsReview: false,
        },
        {
          date: REFERENCE_DATE,
          startTime: "13:00",
          endTime: "14:30",
          durationHours: 1.5,
          laborCategory: "INDIRECT",
          indirectCodeHint: "MEETINGS",
          description: "Production meeting",
          confidence: 0.88,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(
      1,
      "2 hours on quoting and 1.5 hours in a meeting",
      REFERENCE_DATE,
    );

    expect(result.segments).toHaveLength(2);
    expect(result.totalHours).toBeCloseTo(3.5, 1);
  });

  it("sets hasNeedsReview=true and includes a validationError when OpenAI returns malformed JSON", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockResolvedValue({
      choices: [{ message: { content: "not valid json {{" } }],
    });

    const result = await parseSalariedNarrative(1, "some narrative", REFERENCE_DATE);
    expect(result.segments).toHaveLength(0);
    expect(result.hasNeedsReview).toBe(true);
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it("sets hasNeedsReview=true and includes a validationError when the AI call fails", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockRejectedValue(new Error("OpenAI network error"));

    const result = await parseSalariedNarrative(1, "some narrative", REFERENCE_DATE);
    expect(result.hasNeedsReview).toBe(true);
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0]!.reason).toMatch(/unavailable/i);
  });

  it("sets hasNeedsReview=true when AI returns an empty segments array", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockResolvedValue({
      choices: [{ message: { content: '{"segments":[]}' } }],
    });

    const result = await parseSalariedNarrative(1, "some narrative", REFERENCE_DATE);
    expect(result.hasNeedsReview).toBe(true);
    expect(result.validationErrors.some((e) => e.segmentIndex === -1)).toBe(true);
  });

  it("flags all segments when total hours exceed 24", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          durationHours: 13,
          laborCategory: "INDIRECT",
          indirectCodeHint: "QUOTING",
          description: "Quoting block 1",
          confidence: 0.9,
          needsReview: false,
        },
        {
          date: REFERENCE_DATE,
          durationHours: 13,
          laborCategory: "INDIRECT",
          indirectCodeHint: "ADMIN",
          description: "Admin block",
          confidence: 0.9,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(
      1,
      "13 hours on quoting and 13 hours on admin",
      REFERENCE_DATE,
    );
    expect(result.totalHours).toBe(26);
    for (const seg of result.segments) {
      expect(seg.needsReview).toBe(true);
    }
    expect(result.hasNeedsReview).toBe(true);
    expect(result.validationErrors.some((e) => e.segmentIndex === -1)).toBe(true);
  });

  it("computes overallConfidence as the mean of segment confidences", async () => {
    setupDB(INDIRECT_CODES, []);
    getOpenAICreate().mockReturnValue(
      makeOpenAIResponse([
        {
          date: REFERENCE_DATE,
          durationHours: 2,
          laborCategory: "INDIRECT",
          indirectCodeHint: "QUOTING",
          description: "Quoting",
          confidence: 0.8,
          needsReview: false,
        },
        {
          date: REFERENCE_DATE,
          durationHours: 2,
          laborCategory: "INDIRECT",
          indirectCodeHint: "MEETINGS",
          description: "Meetings",
          confidence: 0.6,
          needsReview: false,
        },
      ]),
    );

    const result = await parseSalariedNarrative(
      1,
      "narrative with two segments",
      REFERENCE_DATE,
    );
    expect(result.overallConfidence).toBeCloseTo(0.7, 2);
  });
});
