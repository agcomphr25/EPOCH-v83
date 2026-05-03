/**
 * conversationalDraftEndpoint.test.ts
 *
 * Endpoint-level tests for POST /labor-entry-drafts/portal/:portalId/conversational.
 * Verifies that:
 *   - The draft row is persisted with source='CONVERSATIONAL'
 *   - rawInputText is persisted from the original narrative
 *   - parsedSegmentsJson is persisted from the parse result
 *   - validationErrorsJson is populated when there are validation errors
 *   - Status is 'DRAFT' when hasNeedsReview=false
 *   - Status is 'NEEDS_REVIEW' when hasNeedsReview=true
 *   - 400 is returned for missing or oversized narrative
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Set the feature flag env var BEFORE any modules are loaded so featureFlags.ts
// evaluates salariedDraftEntryEnabled = true at module init time.
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  process.env.SALARIED_DRAFT_ENTRY_ENABLED = "true";
});

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock auth middleware — bypass portal auth, inject employee ID
// ---------------------------------------------------------------------------
vi.mock("../middleware/auth", () => ({
  authenticatePortalToken: vi.fn(
    (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as express.Request & { portalEmployeeId: number }).portalEmployeeId = 10;
      next();
    },
  ),
  authenticateToken: vi.fn(
    (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ),
  requireRole: vi.fn(
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  ),
}));

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
vi.mock("../schema", () => ({
  employees: {},
  chargeCodes: {},
  users: {},
}));

vi.mock("../src/schema/timekeeping", () => ({
  laborEntryDraftsTable: {},
  indirectCodesTable: {},
  salariedTimesheetsTable: {},
  salariedTimesheetLinesTable: {},
  employeesTable: {},
}));

// ---------------------------------------------------------------------------
// DB mock — vi.fn() inline so the factory doesn't reference module vars
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  pool: {},
}));

// ---------------------------------------------------------------------------
// Mock parseSalariedNarrative — vi.fn() inline
// ---------------------------------------------------------------------------
vi.mock("../src/services/timekeeping/salariedLaborCaptureAI.service", () => ({
  parseSalariedNarrative: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { db } from "../db";
import { parseSalariedNarrative } from "../src/services/timekeeping/salariedLaborCaptureAI.service";
import laborEntryDraftsRouter from "../src/routes/timekeeping/laborEntryDrafts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
interface ParsedSegmentShape {
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

const RESOLVED_SEGMENT: ParsedSegmentShape = {
  id: "seg-abc1",
  date: "2026-05-01",
  startTime: "09:00",
  endTime: "11:00",
  durationHours: 2,
  laborCategory: "INDIRECT",
  chargeCodeId: 10,
  indirectCodeId: 1,
  indirectCodeLabel: "Quoting & Estimating",
  resolvedTravelerId: null,
  resolvedTravelerNumber: null,
  description: "Wrote a customer quote",
  confidence: 0.95,
  needsReview: false,
  explanation: null,
};

const LOW_CONF_SEGMENT: ParsedSegmentShape = {
  id: "seg-xyz2",
  date: "2026-05-01",
  startTime: "11:00",
  endTime: "12:00",
  durationHours: 1,
  laborCategory: "INDIRECT",
  chargeCodeId: null,
  indirectCodeId: null,
  indirectCodeLabel: null,
  resolvedTravelerId: null,
  resolvedTravelerNumber: null,
  description: "Miscellaneous tasks",
  confidence: 0.45,
  needsReview: true,
  explanation: "Could not identify the activity category.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use("/api/timekeeping", laborEntryDraftsRouter);
  return app;
}

function makeSelectChain(data: Record<string, unknown>[]): ReturnType<typeof db.select> {
  const chain = {
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(data),
    }),
    limit: vi.fn().mockResolvedValue(data),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof db.select>;
}

/**
 * Set up sequential db.select() calls to satisfy:
 *   1. requireSalaryPayType → { payType: 'SALARY' }
 *   2. resolveTimekeepingEmployee → { id: 99 }
 *   3. resolveUserId (optional) → { id: 55 }
 */
function setupSelectChain(): void {
  vi.mocked(db.select)
    .mockReturnValueOnce(makeSelectChain([{ payType: "SALARY" }]))
    .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
    .mockReturnValueOnce(makeSelectChain([{ id: 55 }]));
}

function setupInsert(createdRow: Record<string, unknown>): void {
  const returning = vi.fn().mockResolvedValue([createdRow]);
  const values = vi.fn().mockReturnValue({ returning });
  vi.mocked(db.insert).mockReturnValue({ values } as unknown as ReturnType<typeof db.insert>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/timekeeping/labor-entry-drafts/portal/:portalId/conversational", () => {
  beforeEach(() => {
    vi.mocked(parseSalariedNarrative).mockReset();
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
  });

  it("persists source='CONVERSATIONAL' in the created draft row", async () => {
    setupSelectChain();
    setupInsert({ id: 1, status: "DRAFT", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [RESOLVED_SEGMENT],
      validationErrors: [],
      overallConfidence: 0.95,
      hasNeedsReview: false,
      totalHours: 2,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "2 hours on quoting", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["source"]).toBe("CONVERSATIONAL");
  });

  it("persists rawInputText equal to the original narrative", async () => {
    setupSelectChain();
    setupInsert({ id: 2, status: "DRAFT", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [RESOLVED_SEGMENT],
      validationErrors: [],
      overallConfidence: 0.95,
      hasNeedsReview: false,
      totalHours: 2,
    });

    const narrative = "I spent 2 hours on quoting today";
    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative, referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["rawInputText"]).toBe(narrative);
  });

  it("persists parsedSegmentsJson from the parse result", async () => {
    setupSelectChain();
    setupInsert({ id: 3, status: "DRAFT", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [RESOLVED_SEGMENT],
      validationErrors: [],
      overallConfidence: 0.95,
      hasNeedsReview: false,
      totalHours: 2,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "2 hours quoting", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["parsedSegmentsJson"]).toEqual([RESOLVED_SEGMENT]);
  });

  it("persists status='DRAFT' when hasNeedsReview=false", async () => {
    setupSelectChain();
    setupInsert({ id: 4, status: "DRAFT", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [RESOLVED_SEGMENT],
      validationErrors: [],
      overallConfidence: 0.95,
      hasNeedsReview: false,
      totalHours: 2,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "2 hours quoting", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["status"]).toBe("DRAFT");
  });

  it("persists status='NEEDS_REVIEW' when hasNeedsReview=true", async () => {
    setupSelectChain();
    setupInsert({ id: 5, status: "NEEDS_REVIEW", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [LOW_CONF_SEGMENT],
      validationErrors: [{ segmentIndex: 0, segmentDescription: "Misc", reason: "Low confidence" }],
      overallConfidence: 0.45,
      hasNeedsReview: true,
      totalHours: 1,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "some unclear work", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["status"]).toBe("NEEDS_REVIEW");
  });

  it("persists validationErrorsJson when validation errors are present", async () => {
    setupSelectChain();
    setupInsert({ id: 6, status: "NEEDS_REVIEW", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [LOW_CONF_SEGMENT],
      validationErrors: [
        { segmentIndex: 0, segmentDescription: "Misc tasks", reason: "Low confidence score" },
      ],
      overallConfidence: 0.45,
      hasNeedsReview: true,
      totalHours: 1,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "some unclear work", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["validationErrorsJson"]).toBeDefined();
    const errJson = insertArg["validationErrorsJson"] as {
      global: string[];
      segments: Record<string, string[]>;
    };
    expect(errJson.segments["segment_0"]).toContain("Low confidence score");
  });

  it("persists validationErrorsJson=null when there are no validation errors", async () => {
    setupSelectChain();
    setupInsert({ id: 7, status: "DRAFT", source: "CONVERSATIONAL" });
    vi.mocked(parseSalariedNarrative).mockResolvedValue({
      segments: [RESOLVED_SEGMENT],
      validationErrors: [],
      overallConfidence: 0.95,
      hasNeedsReview: false,
      totalHours: 2,
    });

    await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: "2 hours quoting", referenceDate: "2026-05-01" })
      .expect(201);

    const insertMock = vi.mocked(db.insert);
    const valuesMock = insertMock.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertArg = valuesMock.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArg["validationErrorsJson"]).toBeNull();
  });

  it("returns 400 when narrative is missing", async () => {
    setupSelectChain();
    const res = await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({})
      .expect(400);

    expect(res.body.error).toMatch(/[Vv]alidation/);
  });

  it("returns 400 when narrative exceeds 2000 characters", async () => {
    setupSelectChain();
    const longNarrative = "a".repeat(2001);
    const res = await request(makeApp())
      .post("/api/timekeeping/labor-entry-drafts/portal/portal-abc/conversational")
      .send({ narrative: longNarrative })
      .expect(400);

    expect(res.body.error).toMatch(/[Vv]alidation/);
  });
});

// ---------------------------------------------------------------------------
// PATCH traceability preservation tests
// ---------------------------------------------------------------------------
describe("PATCH /api/timekeeping/labor-entry-drafts/portal/:portalId/:id — conversational metadata", () => {
  const SEGMENT_WITH_EXPLANATION: ParsedSegmentShape = {
    id: "seg-trace1",
    date: "2026-05-01",
    startTime: "09:00",
    endTime: "11:00",
    durationHours: 2,
    laborCategory: "INDIRECT",
    chargeCodeId: null,
    indirectCodeId: null,
    indirectCodeLabel: null,
    resolvedTravelerId: null,
    resolvedTravelerNumber: null,
    description: "Quoting support work",
    confidence: 0.72,
    needsReview: true,
    explanation: "Code could not be resolved from hint 'QUOTING_SUPPORT'",
  };

  function setupPatchSelectChain(): void {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([{ payType: "SALARY" }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 99 }]))
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: 8,
            status: "NEEDS_REVIEW",
            source: "CONVERSATIONAL",
            employeeId: 99,
            parsedSegmentsJson: [SEGMENT_WITH_EXPLANATION],
          },
        ]),
      );
  }

  function setupUpdateChain(): ReturnType<typeof vi.fn> {
    const returning = vi.fn().mockResolvedValue([{ id: 8, status: "DRAFT" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    vi.mocked(db.update).mockReturnValue({ set } as unknown as ReturnType<typeof db.update>);
    return set;
  }

  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.update).mockReset();
  });

  it("preserves confidence, needsReview, and explanation when user updates chargeCodeId on CONVERSATIONAL draft", async () => {
    setupPatchSelectChain();
    const set = setupUpdateChain();

    await request(makeApp())
      .patch("/api/timekeeping/labor-entry-drafts/portal/portal-abc/8")
      .send({
        segments: [
          {
            id: "seg-trace1",
            startTime: "09:00",
            endTime: "11:00",
            chargeCodeId: 10,
            indirectCodeId: 1,
            notes: null,
          },
        ],
      })
      .expect(200);

    const setCall = set.mock.calls[0]?.[0] as {
      parsedSegmentsJson: ParsedSegmentShape[];
      status: string;
    };
    expect(setCall).toBeDefined();

    const mergedSegments = setCall.parsedSegmentsJson;
    expect(mergedSegments).toHaveLength(1);

    const seg = mergedSegments[0]!;
    expect(seg.chargeCodeId).toBe(10);
    expect(seg.indirectCodeId).toBe(1);
    expect(seg.confidence).toBe(0.72);
    expect(seg.needsReview).toBe(true);
    expect(seg.explanation).toBe("Code could not be resolved from hint 'QUOTING_SUPPORT'");
    expect(seg.laborCategory).toBe("INDIRECT");
    expect(seg.durationHours).toBe(2);
  });
});
