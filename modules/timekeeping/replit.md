# Timekeeper

## Overview

A standalone, modular timekeeping web app built as a greenfield rebuild. Designed to be embedded into EPOCH in the future. Serves three distinct user surfaces (Kiosk, Employee, Admin) with a shared backend domain layer and clean service/router/domain separation.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (Tailwind CSS, shadcn/ui, Wouter router, React Query)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- **Build**: esbuild

## Architecture

### Three Surfaces (Frontend)

- **Kiosk** (`/kiosk`) — Full-screen terminal for shared clock-in/out. Dark theme, large buttons. Supports name selection or PIN. Correctly handles all punch states: Clock In, Clock Out, Take Break, End Break. Auto-timeout resets kiosk to login after configurable idle period (default 60s); countdown warning shown in last 10 seconds; timer pauses during punch requests.
- **Employee** (`/employee/:id`) — Personal portal: punch status, timesheets, weekly hours.
- **Admin** (`/admin`) — Full workforce management: employees, punches, timesheets (approve/reject), certifications, settings, dashboard with Recharts.

### Backend — Three-Layer Architecture

```
Routes (thin)         → validate request, call service, respond
Services              → DB queries, business orchestration
Domain Lib            → pure computation, no DB access (portable to EPOCH)
```

**Domain lib** (`artifacts/api-server/src/lib/timekeeping.ts`) — pure functions, no DB imports:
- `computeHoursFromPunches(punches, roundingMinutes)` — raw punch events → worked hours, with break deduction and rounding
- `derivePunchStatus(punches, timezone)` — determines clocked_out/clocked_in/on_break from punch list
- `resolveNextPunchType(status)` — pure action resolver for kiosk
- `computeTimesheetHours(punches, opts)` — timezone-aware daily bucketing + daily/weekly overtime
- `computeCertStatus(expiresDate)` — active/expiring_soon/expired
- `toTZDateStr(date, tz)` — timezone-aware date string (YYYY-MM-DD)
- `startOfWeekInTZ(tz, startDay, refDate)` — config-driven week start (uses `workweekStartDay` from settings)
- `midnightInTZ(dateStr, tz)` — UTC timestamp for local midnight (uses native Intl, no external deps)

**Services** (`artifacts/api-server/src/services/`):
- `settings.service.ts` — `getOrCreateSettings()`, `updateSettings()`
- `employees.service.ts` — CRUD for employees
- `punches.service.ts` — CRUD + `getEmployeePunchStatus(id, timezone)` + `kioskPunch()` — punches in approved periods are locked from edit/delete; punches carry optional `costCode` field
- `cost-codes.service.ts` — CRUD for cost code reference table; supports active-only filtering
- `timesheets.service.ts` — CRUD + `recalculateTimesheetHours()` (draft only) + `attestTimesheet()` + `submitTimesheet()` + `approveTimesheet()` + `rejectTimesheet()`; approved timesheets are fully locked
- `certifications.service.ts` — CRUD with computed status
- `dashboard.service.ts` — aggregated stats, clocked-in list, weekly hours chart data
- `auth.service.ts` — user management: `validateCredentials(email, password)`, `createUser()`, `getUserById()`, `getUserByEmail()`
- `leave.service.ts` — leave entry CRUD + `getLeaveHoursForPeriod()` for timesheet leave aggregation
- `audit.service.ts` — `logAction()` writes every mutation to audit_log with actor identity and IP

**Auth Middleware** (`artifacts/api-server/src/middlewares/auth.ts`):
- `populateUser` — runs on every request, attaches `req.user` from session
- `requireAuth` — returns 401 if no valid session
- `requireAdmin` — returns 401/403 if not admin role

**Surface Middleware** (`artifacts/api-server/src/middlewares/surface.ts`):
- Attaches `req.surface` = `'kiosk' | 'employee' | 'admin' | 'internal'` to every request
- Kiosk surface is open (no session required) — PIN/name auth only
- All other surfaces require `requireAuth` or `requireAdmin`

### Backend Routes (all under `/api`)

- `/auth/login` — POST email+password → session cookie
- `/auth/logout` — POST → destroy session
- `/auth/me` — GET → current user (requireAuth)
- `/employees` — CRUD + status toggle  (requireAdmin)
- `/punches` — CRUD + `/employee/:id/current` status  (requireAdmin)
- `/cost-codes` — CRUD for cost code reference table  (requireAdmin)
- `/kiosk/cost-codes` — GET active cost codes for kiosk display  (open/kiosk surface)
- `/kiosk/punch` — smart punch (resolves action, accepts PIN or employeeId, supports `requestedAction` override, optional `costCode`)  (open/kiosk surface)
- `/timesheets` — CRUD + attest/submit/approve/reject + `/recalculate` for draft timesheets  (requireAuth; approve/reject service-enforced admin-only by design)
- `/certifications` — CRUD with auto-computed status  (requireAdmin)
- `/settings` — singleton settings read/write  (requireAdmin)
- `/leave-entries` — CRUD for leave entries (requireAuth; employees see own only; admin can create/update/delete any)
- `/timesheets/:id/leave-summary` — leave hours aggregation for a timesheet period (requireAuth; admin-or-owner)
- `/dashboard/*` — summary, clocked-in list, weekly hours, pending timesheets, expiring certs  (requireAdmin)

### Database Schema (`lib/db/src/schema/`)

- `employees` — profile, status, timezone (default UTC), hourly rate, PIN
- `punches` — raw punch events (type: clock_in | clock_out | break_start | break_end), source, isEdited, timezone (default UTC), optional `costCode` (text, nullable)
- `cost_codes` — reference table: code (unique), description, active flag; ERP populates this later
- `timesheets` — period-based (draft → submitted → approved/rejected); includes `employeeAttested`, `attestedAt`, `submittedBy`, `reviewedBy`, `reviewerEmail`; approved timesheets are immutable
- `amendments` — post-approval corrections: timesheetId, fieldChanged, oldValue, newValue, justification, status (pending/approved/rejected), createdBy, approvedBy, timestamps; FK cascade to timesheets
- `certifications` — name, expiration, status
- `leave_entries` — per-employee leave records: employeeId, date, leaveType (pto/sick/holiday/bereavement/other), hours, note; FK cascade to employees
- `settings` — singleton: company name, timezone, overtime thresholds (daily/weekly), rounding rule, break policy, workweek start day, standardWorkWeekHours (default 40), kiosk PIN requirement, kioskTimeoutSeconds (default 60)
- `users` — authentication table: email, password_hash (bcrypt), role (admin|employee), employeeId FK
- `audit_log` — immutable record of every INSERT/UPDATE/DELETE: table_name, record_id, action, old/new values (jsonb), actorId, actorEmail, actorRole, ipAddress, timestamp
- `user_sessions` — PostgreSQL-backed express-session store (managed by connect-pg-simple)

### Timezone / Config Handling

All time math is timezone-aware using the company `settings.timezone`:
- Day boundaries for "today" and "this week" computed via IANA timezone (no hardcoded `setHours(0,0,0,0)`)
- Week start driven by `settings.workweekStartDay` (0=Sun … 6=Sat)
- Overtime thresholds read from settings, not hardcoded
- Punch rounding applied via `settings.roundingRuleMinutes`
- Employee/punch timezone defaults changed from "America/New_York" to "UTC"

## DCAA Compliance Hardening (Complete — Post Audit v3)

All DCAA controls implemented including floor check, gap detection, and amendment workflow:

1. **Authentication** — bcrypt+session auth; `SESSION_SECRET` env required (set in Replit Secrets)
2. **Immutable audit log** — every service mutation writes to `audit_log`: timesheets, punches, employees (create/update/delete/status), and settings; includes actor identity, IP, old/new values
3. **Approved-record locks** — approved timesheets: no edits; punches in approved periods: no edit/delete; kiosk punches also checked against approved periods before insert
4. **Approver identity capture** — `reviewedBy` (user ID) + `reviewerEmail` stored on approve/reject; self-approval blocked; approval requires non-null `submittedBy` identity
5. **Employee attestation** — employee must attest before submit; attestation reset on rejection; re-attestation required

6. **Floor check** — `/admin/floor-check` page showing all clocked-in employees with department, status, hours, printable for DCAA on-site verification
7. **Gap detection** — `GET /timesheets/:id/gaps` identifies days with zero punches within a timesheet period; admin timesheet detail shows amber warning banner with missing days listed
8. **Timesheet amendments** — full workflow for post-approval corrections: `amendments` table, create/approve/reject endpoints, justification required, dual-control (creator cannot approve own amendment), transactional approval applies changes atomically, field validation restricts to allowed fields with type checking

9. **Leave & absence tracking** — `leave_entries` table with full CRUD; types: PTO, sick, holiday, bereavement, other; `standardWorkWeekHours` setting (default 40); leave summary endpoint for timesheets shows worked + leave = total accounted; gap detection excludes leave days; admin leave management tab on employee detail; leave breakdown on both admin and employee timesheet detail views

**Bypass closures (Post-Audit v2+v3):**
- `PATCH /timesheets/:id` now uses strict Zod whitelist — only `periodStart`/`periodEnd` allowed directly; any attempt to write `status`, `employeeAttested`, `reviewedBy`, `submittedBy`, or other lifecycle fields returns 400
- `/timesheets/:id/approve` and `/timesheets/:id/reject` now require `requireAdmin` middleware (previously only `requireAuth`)
- `kioskPunch` now calls `isInApprovedTimesheetPeriod` before inserting; returns 409 if date is in a locked period
- `employees.service.ts` — `createEmployee`, `updateEmployee`, `deleteEmployee` now all call `logAction`
- `settings.service.ts` — `updateSettings` now calls `logAction`
- Self-approval guard hardened: approval fails with 422 if `submittedBy` is null (missing identity), not just when it matches actor
- Amendment routes have inline `requireAdmin` on every endpoint; gap detection has admin-or-owner authz check
- Dashboard clocked-in endpoint now strips PIN hash from employee records

**Default admin account** (created via seed):
- Email: `admin@timekeeper.local`
- Password: `Change-Me-Now!`
- Change immediately in production

**Required environment variables**:
- `SESSION_SECRET` — must be set as a Replit Secret; server throws on startup without it

## Key Commands

- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/api-server run build` — build API server
- `pnpm --filter @workspace/api-server run dev` — run API server
- `pnpm --filter @workspace/timekeeper run dev` — run frontend

## EPOCH Portability Notes

- `lib/timekeeping.ts` is pure computation with no runtime DB dependency — copy it directly into EPOCH
- Services isolate all DB access — swapping Drizzle for another ORM only touches the service layer
- Surface middleware provides the hooks for EPOCH's auth system to plug into
- Three surface route prefixes (`/kiosk`, `/employee`, `/admin`) match EPOCH's expected surface separation
- Settings-driven: all rules (timezone, OT thresholds, rounding, break policy) are config, not code

## Seed Data

- Company: Acme Corp (America/New_York timezone, Monday workweek start)
- 4 active employees: Sarah Martinez, James Chen, Priya Patel, Marcus Thompson
- 1 inactive: Elena Rodriguez
- Sample punches across recent days; Marcus Thompson currently on break
- Timesheets in draft/submitted/approved states
- Certifications: one expiring soon (Forklift), one expired (First Aid), one active (Hazmat)
