import { pgSchema, serial, integer, text, timestamp, boolean, doublePrecision, jsonb, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employees, users } from "../../schema";
import type { TimesheetStatus } from "../services/timekeeping/timesheetStateMachine";

export const timekeepingSchema = pgSchema("timekeeping");

export const employeesTable = timekeepingSchema.table("employees", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  department: text("department"),
  jobTitle: text("job_title"),
  status: text("status").notNull().default("active"),
  hireDate: text("hire_date"),
  hourlyRate: doublePrecision("hourly_rate"),
  epochEmployeeId: integer("epoch_employee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export const punchesTable = timekeepingSchema.table("punches", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull().defaultNow(),
  timezone: text("timezone").notNull().default("UTC"),
  note: text("note"),
  source: text("source").notNull().default("web"),
  isEdited: boolean("is_edited").notNull().default(false),
  editNote: text("edit_note"),
  costCode: text("cost_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPunchSchema = createInsertSchema(punchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPunch = z.infer<typeof insertPunchSchema>;
export type Punch = typeof punchesTable.$inferSelect;

export const timesheetsTable = timekeepingSchema.table("timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").$type<TimesheetStatus>().notNull().default("draft"),
  totalHours: doublePrecision("total_hours").notNull().default(0),
  regularHours: doublePrecision("regular_hours").notNull().default(0),
  overtimeHours: doublePrecision("overtime_hours").notNull().default(0),
  rejectionReason: text("rejection_note"),
  employeeAttested: boolean("employee_attested").notNull().default(false),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
  certifiedByUserId: integer("certified_by_user_id"),
  certificationStatement: text("certification_statement"),
  certificationVersion: integer("certification_version").default(1),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: integer("submitted_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
  reviewerEmail: text("reviewer_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Timesheet = typeof timesheetsTable.$inferSelect;

export const leaveEntriesTable = timekeepingSchema.table("leave_entries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  leaveType: text("leave_type").notNull(),
  hours: doublePrecision("hours").notNull(),
  note: text("note"),
  sourceRequestId: integer("source_request_id"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: integer("voided_by"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LeaveEntry = typeof leaveEntriesTable.$inferSelect;

export const certificationsTable = timekeepingSchema.table("certifications", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  issuedBy: text("issued_by"),
  issuedDate: text("issued_date"),
  expiresDate: text("expires_date"),
  certNumber: text("cert_number"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const settingsTable = timekeepingSchema.table("settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default("My Company"),
  timezone: text("timezone").notNull().default("America/New_York"),
  overtimeThresholdDaily: doublePrecision("overtime_threshold_daily").notNull().default(8),
  overtimeThresholdWeekly: doublePrecision("overtime_threshold_weekly").notNull().default(40),
  roundingRuleMinutes: integer("rounding_rule_minutes").notNull().default(0),
  breakDurationMinutes: integer("break_duration_minutes").notNull().default(30),
  requireBreakAfterHours: doublePrecision("require_break_after_hours").notNull().default(6),
  workweekStartDay: integer("workweek_start_day").notNull().default(1),
  kioskRequirePin: boolean("kiosk_require_pin").notNull().default(false),
  kioskTimeoutSeconds: integer("kiosk_timeout_seconds").notNull().default(60),
  standardWorkWeekHours: doublePrecision("standard_work_week_hours").notNull().default(40),
  kioskMessage: text("kiosk_message"),
  dcaaChargeCodeEnforcement: boolean("dcaa_charge_code_enforcement").notNull().default(false),
  salariedTimesheetEnabled: boolean("salaried_timesheet_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Settings = typeof settingsTable.$inferSelect;

export const auditLogTable = timekeepingSchema.table("audit_log", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  actorId: integer("actor_id"),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const laborEntryAuditTable = timekeepingSchema.table("labor_entry_audit", {
  id: serial("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action").notNull(),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  actorId: integer("actor_id"),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timeOffRequestsTable = timekeepingSchema.table("time_off_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  leaveType: text("leave_type").notNull(),
  status: text("status").notNull().default("pending_supervisor"),
  employeeNote: text("employee_note"),
  adminNote: text("admin_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  // Request granularity
  requestUnit: text("request_unit").notNull().default("full_day"),
  requestedHours: doublePrecision("requested_hours"),
  partialDayDate: text("partial_day_date"),
  // Submission tracking
  submittedByUserId: integer("submitted_by_user_id"),
  submittedOnBehalf: boolean("submitted_on_behalf").notNull().default(false),
  // Supervisor stage
  supervisorId: integer("supervisor_id"),
  supervisorDecision: text("supervisor_decision"),
  supervisorNote: text("supervisor_note"),
  supervisorReviewedAt: timestamp("supervisor_reviewed_at", { withTimezone: true }),
  supervisorReviewedBy: integer("supervisor_reviewed_by"),
  // HR stage
  hrDecision: text("hr_decision"),
  hrNote: text("hr_note"),
  hrReviewedAt: timestamp("hr_reviewed_at", { withTimezone: true }),
  hrReviewedBy: integer("hr_reviewed_by"),
  // VP stage
  vpDecision: text("vp_decision"),
  vpNote: text("vp_note"),
  vpReviewedAt: timestamp("vp_reviewed_at", { withTimezone: true }),
  vpReviewedBy: integer("vp_reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequestsTable).omit({
  id: true,
  status: true,
  adminNote: true,
  reviewedAt: true,
  supervisorDecision: true,
  supervisorNote: true,
  supervisorReviewedAt: true,
  supervisorReviewedBy: true,
  hrDecision: true,
  hrNote: true,
  hrReviewedAt: true,
  hrReviewedBy: true,
  vpDecision: true,
  vpNote: true,
  vpReviewedAt: true,
  vpReviewedBy: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequestsTable.$inferSelect;

// ---------------------------------------------------------------------------
// SALARIED TIMESHEET SYSTEM — Phase 1
// All salaried-specific tables live in the timekeeping schema, isolated from
// the hourly punch/timesheet system.  FK to public.employees for employee_id.
// ---------------------------------------------------------------------------

export const indirectCodesTable = timekeepingSchema.table("indirect_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  chargeCodeId: integer("charge_code_id").notNull(),
});

export type IndirectCode = typeof indirectCodesTable.$inferSelect;

export const salariedTimesheetsTable = timekeepingSchema.table("salaried_timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("OPEN"),
  totalActualHours: doublePrecision("total_actual_hours").notNull().default(0),
  certifiedAt: timestamp("certified_at", { withTimezone: true }),
  certifiedBy: integer("certified_by"),
  certificationStatement: text("certification_statement"),
  certificationVersion: integer("certification_version").default(1),
  supervisorApprovedAt: timestamp("supervisor_approved_at", { withTimezone: true }),
  payrollApprovedAt: timestamp("payroll_approved_at", { withTimezone: true }),
  payrollApprovedBy: integer("payroll_approved_by"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalariedTimesheet = typeof salariedTimesheetsTable.$inferSelect;

export const salariedTimesheetLinesTable = timekeepingSchema.table("salaried_timesheet_lines", {
  id: serial("id").primaryKey(),
  timesheetId: integer("timesheet_id").notNull().references(() => salariedTimesheetsTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  lineType: text("line_type").notNull(),
  chargeCodeId: integer("charge_code_id"),
  indirectCodeId: integer("indirect_code_id").references(() => indirectCodesTable.id),
  indirectCodeLegacy: text("indirect_code_legacy"),
  projectId: integer("project_id"),
  travelerId: text("traveler_id"),
  leaveEntryId: integer("leave_entry_id"),
  hours: doublePrecision("hours").notNull().default(0),
  source: text("source").notNull().default("MANUAL"),
  note: text("note"),
  isLocked: boolean("is_locked").notNull().default(false),
  originalNarrative: text("original_narrative"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
  aiSource: boolean("ai_source").notNull().default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SalariedTimesheetLine = typeof salariedTimesheetLinesTable.$inferSelect;

export const salariedTimesheetAuditTable = timekeepingSchema.table("salaried_timesheet_audit", {
  id: serial("id").primaryKey(),
  timesheetId: integer("timesheet_id").notNull(),
  lineId: integer("line_id"),
  action: text("action").notNull(),
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  actorRole: text("actor_role"),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  reason: text("reason"),
  source: text("source"),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export type SalariedTimesheetAudit = typeof salariedTimesheetAuditTable.$inferSelect;

// ---------------------------------------------------------------------------
// LABOR CAPTURE AI SUGGESTION — Phase B Prompt 1
// Stores AI-generated labor suggestion records.  Nothing here touches
// salaried_timesheet_lines until a human explicitly accepts (Prompt 2).
// ---------------------------------------------------------------------------

export const laborCaptureSuggestionsTable = timekeepingSchema.table("labor_capture_suggestions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  timesheetId: integer("timesheet_id").notNull().references(() => salariedTimesheetsTable.id, { onDelete: "cascade" }),
  originalNarrative: text("original_narrative").notNull(),
  parsedJson: jsonb("parsed_json"),
  suggestedLines: jsonb("suggested_lines"),
  overallConfidence: numeric("overall_confidence", { precision: 5, scale: 4 }),
  lowConfidenceFlagged: boolean("low_confidence_flagged").notNull().default(false),
  status: text("status").notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertLaborCaptureSuggestionSchema = createInsertSchema(laborCaptureSuggestionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLaborCaptureSuggestion = z.infer<typeof insertLaborCaptureSuggestionSchema>;
export type LaborCaptureSuggestion = typeof laborCaptureSuggestionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// DCAA TIMESHEET CORRECTION APPROVAL CHAIN
// Corrections to certified/approved timesheets must go through a controlled,
// auditable approval workflow. The original record is never silently overwritten.
// ---------------------------------------------------------------------------

export const timesheetCorrectionsTable = timekeepingSchema.table("timesheet_corrections", {
  id: serial("id").primaryKey(),
  timesheetId: integer("timesheet_id").notNull().references(() => timesheetsTable.id, { onDelete: "cascade" }),
  requestedByEmployeeId: integer("requested_by_employee_id").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reason: text("reason").notNull(),
  originalSnapshot: jsonb("original_snapshot").notNull(),
  proposedChanges: jsonb("proposed_changes").notNull(),
  status: text("status").notNull().default("pending"),
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewerNote: text("reviewer_note"),
  afterSnapshot: jsonb("after_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTimesheetCorrectionSchema = createInsertSchema(timesheetCorrectionsTable).omit({
  id: true,
  requestedAt: true,
  status: true,
  reviewedByUserId: true,
  reviewedAt: true,
  reviewerNote: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTimesheetCorrection = z.infer<typeof insertTimesheetCorrectionSchema>;
export type TimesheetCorrection = typeof timesheetCorrectionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// TIMEKEEPING POLICY SETTINGS
// Centralizes all compliance rules that were previously hardcoded in service
// files. A single company-wide row is created on first access via
// getOrCreatePolicySettings(). Administrators can update these rules at
// runtime without a code deploy.
// ---------------------------------------------------------------------------

export const policySettingsTable = timekeepingSchema.table("policy_settings", {
  id: serial("id").primaryKey(),
  certificationRequired: boolean("certification_required").notNull().default(true),
  correctionApprovalRequired: boolean("correction_approval_required").notNull().default(true),
  minimumHoursPerWeek: doublePrecision("minimum_hours_per_week"),
  lateSubmissionGraceDays: integer("late_submission_grace_days"),
  lateSubmissionBlock: boolean("late_submission_block").notNull().default(false),
  certificationStatement: text("certification_statement").notNull().default(
    "I certify that the time recorded for this period is complete, accurate, and represents work I actually performed."
  ),
  certificationVersion: integer("certification_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPolicySettingsSchema = createInsertSchema(policySettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPolicySettings = z.infer<typeof insertPolicySettingsSchema>;
export type PolicySettings = typeof policySettingsTable.$inferSelect;

// ---------------------------------------------------------------------------
// LABOR ENTRY DRAFTS — Phase 2
// Intermediary layer for all salaried and indirect labor entry.  Every entry
// (manual, conversational, or AI-parsed) lands here first before any rows are
// written to punch_ledger or labor_allocations.  The existing hourly kiosk
// pipeline is completely untouched.
// ---------------------------------------------------------------------------

export const laborEntryDraftsTable = timekeepingSchema.table("labor_entry_drafts", {
  id: serial("id").primaryKey(),

  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "cascade" }),

  entryDate: date("entry_date").notNull(),

  rawInputText: text("raw_input_text"),

  parsedSegmentsJson: jsonb("parsed_segments_json").notNull().default([]),

  status: text("status").notNull().default("DRAFT"),

  source: text("source").notNull(),

  totalHours: numeric("total_hours", { precision: 8, scale: 4 }),

  confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),

  validationErrorsJson: jsonb("validation_errors_json"),

  createdBy: integer("created_by").notNull().references(() => users.id),

  reviewedBy: integer("reviewed_by").references(() => users.id),

  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

  postedAt: timestamp("posted_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

const LABOR_ENTRY_DRAFT_STATUSES = ["DRAFT", "NEEDS_REVIEW", "CONFIRMED", "POSTED", "VOIDED"] as const;
const LABOR_ENTRY_DRAFT_SOURCES = ["MANUAL", "CONVERSATIONAL", "AI"] as const;

export const insertLaborEntryDraftSchema = createInsertSchema(laborEntryDraftsTable)
  .omit({
    id: true,
    reviewedBy: true,
    reviewedAt: true,
    postedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    status: z.enum(LABOR_ENTRY_DRAFT_STATUSES).default("DRAFT"),
    source: z.enum(LABOR_ENTRY_DRAFT_SOURCES),
  });
export type LaborEntryDraftInsert = z.infer<typeof insertLaborEntryDraftSchema>;

export const updateLaborEntryDraftSchema = createInsertSchema(laborEntryDraftsTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.enum(LABOR_ENTRY_DRAFT_STATUSES).optional(),
    source: z.enum(LABOR_ENTRY_DRAFT_SOURCES).optional(),
  })
  .partial();
export type LaborEntryDraftUpdate = z.infer<typeof updateLaborEntryDraftSchema>;

export type LaborEntryDraft = typeof laborEntryDraftsTable.$inferSelect;

// ---------------------------------------------------------------------------
// PAYROLL EXPORT REVISION & ADJUSTMENT MODEL
// Immutable, versioned snapshots of every payroll export with full audit trail.
// See docs/payroll-export-design.md for the complete design document.
// ---------------------------------------------------------------------------

export const PAYROLL_BATCH_STATUSES = ["active", "superseded", "voided", "processed"] as const;
export type PayrollBatchStatus = typeof PAYROLL_BATCH_STATUSES[number];

export const PAYROLL_ADJUSTMENT_STATUSES = ["pending", "approved", "included", "voided"] as const;
export type PayrollAdjustmentStatus = typeof PAYROLL_ADJUSTMENT_STATUSES[number];

export const PAYROLL_ADJUSTMENT_TYPES = ["regular_hours", "overtime_hours", "sick_hours", "vacation_hours"] as const;
export type PayrollAdjustmentType = typeof PAYROLL_ADJUSTMENT_TYPES[number];

export const PAYROLL_DELIVERY_PREFERENCES = ["next_regular", "off_cycle"] as const;
export type PayrollDeliveryPreference = typeof PAYROLL_DELIVERY_PREFERENCES[number];

export const PAYROLL_EVENT_TYPES = [
  "BATCH_CREATED",
  "BATCH_SUPERSEDED",
  "BATCH_VOIDED",
  "BATCH_PROCESSED",
  "BATCH_DOWNLOADED",
  "ADJUSTMENT_CREATED",
  "ADJUSTMENT_APPROVED",
  "ADJUSTMENT_INCLUDED",
  "ADJUSTMENT_VOIDED",
  "CORRECTION_BLOCKED_BY_ACTIVE_EXPORT",
] as const;
export type PayrollEventType = typeof PAYROLL_EVENT_TYPES[number];

export const payrollExportBatchesTable = timekeepingSchema.table("payroll_export_batches", {
  id: serial("id").primaryKey(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  revisionNumber: integer("revision_number").notNull().default(1),
  status: text("status").$type<PayrollBatchStatus>().notNull().default("active"),
  exportFormat: text("export_format").notNull().default("gusto_csv"),
  csvContent: text("csv_content").notNull(),
  csvChecksum: text("csv_checksum").notNull(),
  rowCount: integer("row_count").notNull(),
  employeeCount: integer("employee_count").notNull(),
  totalRegularHours: doublePrecision("total_regular_hours").notNull(),
  totalOvertimeHours: doublePrecision("total_overtime_hours").notNull(),
  totalSickHours: doublePrecision("total_sick_hours").notNull(),
  totalVacationHours: doublePrecision("total_vacation_hours").notNull(),
  includesAdjustments: boolean("includes_adjustments").notNull().default(false),
  adjustmentIds: jsonb("adjustment_ids"),
  supersedesBatchId: integer("supersedes_batch_id"),
  supersededReason: text("superseded_reason"),
  voidedReason: text("voided_reason"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: integer("voided_by"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  processedBy: integer("processed_by"),
  processedConfirmationNote: text("processed_confirmation_note"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPayrollExportBatchSchema = createInsertSchema(payrollExportBatchesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollExportBatch = z.infer<typeof insertPayrollExportBatchSchema>;
export type PayrollExportBatch = typeof payrollExportBatchesTable.$inferSelect;

export const payrollExportRowsTable = timekeepingSchema.table("payroll_export_rows", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => payrollExportBatchesTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull(),
  epochEmployeeId: integer("epoch_employee_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  regularHours: doublePrecision("regular_hours").notNull(),
  overtimeHours: doublePrecision("overtime_hours").notNull(),
  doubleOvertimeHours: doublePrecision("double_overtime_hours").notNull().default(0),
  sickHours: doublePrecision("sick_hours").notNull(),
  vacationHours: doublePrecision("vacation_hours").notNull(),
  sourceTimesheetIds: jsonb("source_timesheet_ids").notNull(),
  sourceLeaveEntryIds: jsonb("source_leave_entry_ids"),
  adjustmentIds: jsonb("adjustment_ids"),
});

export const insertPayrollExportRowSchema = createInsertSchema(payrollExportRowsTable).omit({
  id: true,
});
export type InsertPayrollExportRow = z.infer<typeof insertPayrollExportRowSchema>;
export type PayrollExportRow = typeof payrollExportRowsTable.$inferSelect;

export const payrollAdjustmentsTable = timekeepingSchema.table("payroll_adjustments", {
  id: serial("id").primaryKey(),
  originalBatchId: integer("original_batch_id").notNull().references(() => payrollExportBatchesTable.id),
  employeeId: integer("employee_id").notNull(),
  correctionId: integer("correction_id").references(() => timesheetCorrectionsTable.id),
  adjustmentType: text("adjustment_type").$type<PayrollAdjustmentType>().notNull(),
  originalValue: doublePrecision("original_value").notNull(),
  correctedValue: doublePrecision("corrected_value").notNull(),
  delta: doublePrecision("delta").notNull(),
  reason: text("reason").notNull(),
  status: text("status").$type<PayrollAdjustmentStatus>().notNull().default("pending"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  includedInBatchId: integer("included_in_batch_id").references(() => payrollExportBatchesTable.id),
  deliveryPreference: text("delivery_preference").$type<PayrollDeliveryPreference>().notNull().default("next_regular"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPayrollAdjustmentSchema = createInsertSchema(payrollAdjustmentsTable).omit({
  id: true,
  approvedBy: true,
  approvedAt: true,
  includedInBatchId: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayrollAdjustment = z.infer<typeof insertPayrollAdjustmentSchema>;
export type PayrollAdjustment = typeof payrollAdjustmentsTable.$inferSelect;

export const payrollExportEventsTable = timekeepingSchema.table("payroll_export_events", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => payrollExportBatchesTable.id),
  adjustmentId: integer("adjustment_id").references(() => payrollAdjustmentsTable.id),
  eventType: text("event_type").$type<PayrollEventType>().notNull(),
  actorId: integer("actor_id").notNull(),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPayrollExportEventSchema = createInsertSchema(payrollExportEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPayrollExportEvent = z.infer<typeof insertPayrollExportEventSchema>;
export type PayrollExportEvent = typeof payrollExportEventsTable.$inferSelect;
