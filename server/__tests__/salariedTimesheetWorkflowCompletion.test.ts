import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("salaried timesheet workflow completion", () => {
  it("exposes the controlled review and approval lifecycle", () => {
    const routes = read("server/src/routes/timekeeping/salariedTimesheets.ts");
    const panel = read("client/src/components/timekeeping/SalariedTimesheetAdminPanel.tsx");

    expect(routes).toContain('"/salaried-timesheet/:id/review-detail"');
    expect(routes).toContain('"/salaried-timesheet/:id/supervisor-approve"');
    expect(routes).toContain('"/salaried-timesheet/:id/supervisor-reject"');
    expect(routes).toContain('"/salaried-timesheet/:id/payroll-approve"');
    expect(routes).toContain('"/salaried-timesheet/:id/reopen"');

    expect(panel).toContain("Supervisor Approve");
    expect(panel).toContain("Return for Correction");
    expect(panel).toContain("Payroll Final Approve");
    expect(panel).toContain("Controlled Reopen");
    expect(panel).toContain("Audit history");
  });

  it("makes the daily-draft and weekly-record relationship explicit", () => {
    const entry = read("client/src/pages/timekeeping/SalariedTimeEntryPage.tsx");
    const list = read("client/src/pages/timekeeping/SalariedDraftListPage.tsx");

    expect(entry).toContain("Confirming it does not submit time");
    expect(entry).toContain("Confirm Daily Entry");
    expect(list).toContain("weekly timesheet, which is the controlled record");
    expect(list).toContain("Added to Weekly Timesheet");
  });

  it("installs and runs the administratively maintained holiday calendar safely", () => {
    const migration = read("migrations/0236_salaried_holiday_calendar.sql");
    const runner = read("server/scripts/migrations/runSafeBootMigrations.ts");
    const service = read("server/src/services/timekeeping/salariedTimesheet.service.ts");
    const routes = read("server/src/routes/timekeeping/salariedTimesheets.ts");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS timekeeping.salaried_holidays");
    expect(runner.match(/0236_salaried_holiday_calendar\.sql/g)).toHaveLength(2);
    expect(service).toContain(".from(salariedHolidaysTable)");
    expect(service).toContain("if (!isEditable) continue");
    expect(routes).toContain('router.post("/salaried-holidays"');
    expect(routes).toContain('router.patch("/salaried-holidays/:id"');
    expect(routes).toContain('router.delete("/salaried-holidays/:id"');
  });

  it("keeps conversational entry covered by a deterministic OpenAI mock", () => {
    const aiTest = read("server/__tests__/salariedLaborCaptureAI.test.ts");
    expect(aiTest).toContain("vi.hoisted");
    expect(aiTest).toContain('process.env.OPENAI_API_KEY = "test-key"');
  });
});
