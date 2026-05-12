# Salaried Timesheet Audit Capture Plan

Date: 2026-05-12

## Purpose

Salaried employees must record actual hours worked, including hours over 40, and allocate those hours to both direct and indirect cost objectives. The record must support employee certification, assigned-supervisor approval, payroll approval, correction control, payroll export reconciliation, and future natural-language or voice-assisted entry without weakening the audit trail.

## Guiding Rules

- Only employees with `public.employees.pay_type = SALARY` may use salaried timesheet, natural-language, or future voice capture.
- Salaried employees record actual daily hours, not just an assumed 40-hour week.
- PTO and holiday lines count toward required weekly accounted hours.
- Direct labor must resolve to a cost objective through traveler, project, WAD, and charge code linkage where available.
- Indirect labor must resolve through active indirect codes mapped to `charge_codes`.
- Employee certification is required before supervisor approval.
- Assigned-supervisor approval is required before payroll approval.
- Payroll approval remains the final gate and creates the accounting trace.
- Certified or approved time is not silently edited. Corrections require reopen/correction reason, recertification, and reapproval.

## Capture Model

### Weekly Header

`timekeeping.salaried_timesheets` is the weekly header of record.

Required audit fields:

- Employee ID and pay-type snapshot or resolvable employee history.
- Period start/end.
- Status: `OPEN`, `SUBMITTED`, `SUPERVISOR_APPROVED`, `PAYROLL_APPROVED`, `REOPENED`.
- Total actual/accounted hours.
- Certification statement, version, certifier, and timestamp.
- Supervisor assigned at certification time.
- Supervisor approver, timestamp, and note.
- Payroll approver and timestamp.
- Reopen timestamp and reason.

### Daily Lines

`timekeeping.salaried_timesheet_lines` is the daily allocation record.

Required audit fields:

- Date.
- Hours.
- Line type: `DIRECT`, `INDIRECT`, `PTO`, `HOLIDAY`.
- Charge code ID.
- Traveler/project/WAD linkage when direct.
- Indirect code ID when indirect.
- Leave entry ID for PTO or holiday-derived rows.
- Source: `MANUAL`, `CONVERSATIONAL`, `VOICE_TRANSCRIPT`, `PTO_IMPORT`, `HOLIDAY_AUTO`, or admin equivalent.
- Original narrative or transcript reference when produced from natural language or voice.
- Confidence score and AI-source flag when AI-assisted.
- Created/updated actor.
- Lock state for PTO/holiday/imported lines.

### Draft Layer

`timekeeping.labor_entry_drafts` is the review buffer for manual, conversational, and future voice input.

The draft layer must preserve:

- Raw input text.
- Future raw transcript text and audio metadata.
- Parsed segments JSON.
- Source: `MANUAL`, `CONVERSATIONAL`, `AI`, and future `VOICE`.
- Confidence score.
- Validation errors.
- Human edits.
- Confirmation/posting trail.

Natural-language and voice input must never post directly to a final certified timesheet. The employee or authorized admin reviews structured lines first.

## UX Plan

### Employee Portal

The salaried employee should see a weekly work surface with:

- A day-by-day grid for actual hours.
- Direct and indirect line entry.
- Suggested recent travelers.
- Active indirect codes.
- PTO/holiday locked rows.
- Weekly totals, daily totals, and over-40 visibility.
- Missing charge-code and incomplete-day warnings.
- A natural-language entry box for salaried employees only.
- Future voice input feeding the same draft review panel.
- Required certification checkbox showing the exact stored certification statement.

The employee certifies the final structured timesheet, not the AI interpretation.

### Supervisor Review

The supervisor queue should show:

- Only assigned employees for non-admin supervisors.
- Certified submitted timesheets only.
- Daily and weekly totals.
- Direct/indirect/PTO/holiday breakdown.
- Charge-code and traveler/project summary.
- Drafts needing review.
- Exceptions: missing supervisor, insufficient accounted hours, missing charge codes, late submission, reopened period.
- Approval/rejection note.

Supervisors cannot approve their own timesheets.

### Payroll Review

Payroll approval should show:

- Supervisor approval evidence.
- Cost-code completeness.
- Labor-cost preview by cost type.
- PTO/holiday inclusion.
- Any unresolved natural-language/voice drafts.
- Payroll export readiness.
- Blocking exceptions before approval.

Payroll approval creates or refreshes `labor_cost_records` and preserves deterministic trace IDs.

### Admin-On-Behalf Entry

Admins may create draft lines on behalf of salaried employees. This should be explicit, not hidden as employee self-entry.

Required controls:

- Target employee must be `SALARY`.
- Actor is the admin user, target employee is separate.
- Reason is required.
- Draft source should distinguish admin entry, for example `ADMIN_MANUAL`.
- Employee still certifies the resulting weekly timesheet unless an audited admin override certification is used.

## Natural Language And Voice Path

### Text Flow

1. Employee enters a prompt such as: `Monday 6 hours AG123 layup, 2 hours engineering meeting`.
2. System stores raw text in a draft.
3. Parser proposes structured segments.
4. Employee reviews and edits the segments.
5. Employee confirms the draft.
6. Confirmed draft contributes to the weekly timesheet.
7. Employee certifies the weekly timesheet.
8. Supervisor and payroll approve.

### Voice Flow

Voice should use the same draft path:

1. Capture audio.
2. Transcribe to text.
3. Store transcript and metadata.
4. Parse transcript into draft segments.
5. Require human review before confirmation.
6. Preserve transcript-to-segment trace in the audit packet.

Voice is a capture convenience, not a separate timekeeping system.

## Overdue And Blocking Controls

For late submissions:

- Reminder to employee after the configured deadline.
- Escalation to assigned supervisor after grace period.
- Payroll block while the period has uncertified, unapproved, or unresolved salaried timesheets.

These controls should be driven by policy settings, not hardcoded dates.

## Audit Packet

Build an auditor view/export that answers:

- Who recorded the time?
- Was the employee salaried during the period?
- What exact hours were recorded each day?
- What cost objectives were charged?
- What was entered manually, imported, or AI-assisted?
- What raw prompt or transcript produced AI-assisted entries?
- What did the employee certify?
- Who approved as supervisor?
- Who approved for payroll?
- What corrections or reopens occurred?
- Which labor cost records and GL entries resulted?
- Which payroll export batch included the approved record?

Minimum joins:

- `salaried_timesheets`
- `salaried_timesheet_lines`
- `salaried_timesheet_audit`
- `labor_entry_drafts`
- `leave_entries`
- `public.employees`
- `charge_codes`
- `travelers`, `projects`, WAD/production work order tables as applicable
- `labor_cost_records`
- `journal_entries`
- `payroll_export_batches` and `payroll_export_rows`

## Implementation Phases

### Phase 1: Hardening

- Fix import/runtime defects in salaried review routes.
- Enforce salary-only access on all salaried writes.
- Keep `total_actual_hours` synchronized.
- Correct certification audit snapshots to store line `hours`.
- Freeze supervisor assignment during portal certification.
- Add unique/idempotency constraints for weekly headers and leave-imported lines.

### Phase 2: Admin-On-Behalf

- Add admin draft creation route with target employee and reason.
- Add audit events for admin draft creation and edits.
- Add admin UI entry point in the review queue.

### Phase 3: Overdue Controls

- Add policy settings for submission deadline, reminder delay, escalation delay, and payroll block.
- Add scheduled detection/reminder/escalation job.
- Add payroll export block for unresolved salaried timesheets.

### Phase 4: Audit Packet

- Add joined backend service and route.
- Add admin auditor UI.
- Add CSV/PDF export if needed.

### Phase 5: Natural Language

- Expand the existing conversational draft flow.
- Require salaried-only access.
- Preserve raw prompt, parsed result, confidence, and human edits.
- Add UX review panel before confirmation.

### Phase 6: Voice

- Add transcript capture.
- Store transcript metadata and source.
- Feed transcript into the same draft/parser/review path.
- Include transcript evidence in the audit packet.
