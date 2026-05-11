/**
 * Native EPOCH canonical Zod request/response schemas for timekeeping routes.
 * These schemas are the authoritative source — they are not sourced from or
 * synchronized with any external module. Only the schemas actually used by
 * the absorbed route files are included here.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export const ListEmployeesQueryParams = z.object({
  status: z.enum(["active", "inactive", "all"]).default("active"),
  department: z.coerce.string().nullish(),
});

export const CreateEmployeeBody = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullish(),
  department: z.string().nullish(),
  jobTitle: z.string().nullish(),
  employeeNumber: z.string().nullish(),
  pin: z.string().nullish(),
  hireDate: z.string().nullish(),
  hourlyRate: z.number().nullish(),
  timezone: z.string(),
});

export const GetEmployeeParams = z.object({
  id: z.coerce.number(),
});

export const UpdateEmployeeParams = z.object({
  id: z.coerce.number(),
});

export const UpdateEmployeeBody = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().nullish(),
  department: z.string().nullish(),
  jobTitle: z.string().nullish(),
  employeeNumber: z.string().nullish(),
  pin: z.string().nullish(),
  hireDate: z.string().nullish(),
  hourlyRate: z.number().nullish(),
  timezone: z.string().optional(),
});

export const DeleteEmployeeParams = z.object({
  id: z.coerce.number(),
});

export const UpdateEmployeeStatusParams = z.object({
  id: z.coerce.number(),
});

export const UpdateEmployeeStatusBody = z.object({
  status: z.enum(["active", "inactive"]),
});

// ---------------------------------------------------------------------------
// Punches
// ---------------------------------------------------------------------------

export const ListPunchesQueryParams = z.object({
  employeeId: z.coerce.number().nullish(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  type: z.enum(["clock_in", "clock_out", "break_start", "break_end"]).nullish(),
});

export const CreatePunchBody = z.object({
  employeeId: z.number(),
  type: z.enum(["clock_in", "clock_out", "break_start", "break_end"]),
  punchedAt: z.coerce.date().nullish(),
  timezone: z.string().nullish(),
  note: z.string().nullish(),
  source: z.enum(["kiosk", "web", "admin", "api"]),
  costCode: z.string().nullish(),
  travelerId: z.string().nullish(),
});

export const GetPunchParams = z.object({
  id: z.coerce.number(),
});

export const UpdatePunchParams = z.object({
  id: z.coerce.number(),
});

export const UpdatePunchBody = z.object({
  punchedAt: z.coerce.date().optional(),
  note: z.string().nullish(),
  editNote: z.string().nullish(),
  costCode: z.string().nullish(),
});

export const DeletePunchParams = z.object({
  id: z.coerce.number(),
});

export const GetCurrentPunchStatusParams = z.object({
  employeeId: z.coerce.number(),
});

export const KioskPunchBody = z
  .object({
    employeeId: z.number(),
    timezone: z.string().nullish(),
    requestedAction: z
      .union([
        z.literal("clock_in"),
        z.literal("clock_out"),
        z.literal(null),
      ])
      .nullish(),
    costCode: z.string().nullish(),
    travelerId: z.string().nullish(),
    dailyCertificationConfirmed: z.boolean().optional(),
  })
  .describe("employeeId is required; only clock_in and clock_out are valid kiosk actions");

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export const TIMESHEET_STATUS_VALUES = [
  "draft",
  "submitted",
  "certified",
  "locked",
  "correction_requested",
  "correction_approved",
] as const;

export const ListTimesheetsQueryParams = z.object({
  employeeId: z.coerce.number().nullish(),
  status: z.enum(TIMESHEET_STATUS_VALUES).nullish(),
});

export const CreateTimesheetBody = z.object({
  employeeId: z.number(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodStart must be YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "periodEnd must be YYYY-MM-DD"),
});

export const GetTimesheetParams = z.object({
  id: z.coerce.number(),
});

export const UpdateTimesheetParams = z.object({
  id: z.coerce.number(),
});

export const SubmitTimesheetParams = z.object({
  id: z.coerce.number(),
});

export const ApproveTimesheetParams = z.object({
  id: z.coerce.number(),
});

export const RejectTimesheetParams = z.object({
  id: z.coerce.number(),
});

export const RejectTimesheetBody = z.object({
  rejectionNote: z.string(),
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const GetWeeklyHoursQueryParams = z.object({
  employeeId: z.coerce.number().nullish(),
});
