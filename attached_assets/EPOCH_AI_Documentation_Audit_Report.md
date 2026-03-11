# EPOCH Forensic Architecture Audit
## AI Documentation From Audit Trails — Implementation Feasibility Report

**Date:** March 11, 2026
**Scope:** Read-only forensic analysis of EPOCH v8 codebase
**Purpose:** Determine feasibility and architecture for an AI-powered documentation generation system built on existing audit trails

---

## 1. Existing Audit Infrastructure

EPOCH has a mature, multi-layered audit logging system with **6 dedicated audit tables** and robust service infrastructure.

### 1.1 Audit Tables

#### `audit_events` (Primary Audit Log)
**Location:** `server/schema.ts` line 9895
| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-incrementing ID |
| entity_type | text | `p1_order`, `p2_order`, `p2_serialized_item`, `p2_project` |
| entity_id | text | The ID of the tracked entity |
| action | text | Event type: `ORDER_CREATED`, `DEPARTMENT_CHANGE`, etc. |
| actor_id | integer FK → employees | Who made the change |
| actor_name | text | Denormalized actor name |
| actor_role | text | Actor's role at time of action |
| reason | text | Optional description |
| fields_changed | jsonb | `{ fieldName: { before, after } }` |
| meta | jsonb | Additional context data |
| ip_address | text | Client IP |
| user_agent | text | Browser/client info |
| timestamp | timestamp | When the action occurred |
| created_at | timestamp | Record creation time |

**Indexes:** entity_type, entity_id, action, actor_id, created_at

#### `order_department_transitions` (Production Stage Tracking)
**Location:** `server/schema.ts` line 9928
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Random UUID |
| entity_type | text | `p1_order`, `p2_serialized_item` |
| entity_id | text | Order or item ID |
| cycle_number | integer | Restart cycle (1 = original, 2+ = after scrap) |
| department | text | Department name |
| entered_at | timestamp | When entity entered department |
| exited_at | timestamp | When entity left (null if still there) |
| duration_minutes | integer | Calculated on exit |
| entered_by_user_id | integer FK → employees | Who moved it in |
| exited_by_user_id | integer FK → employees | Who moved it out |
| exit_reason | text | `completed`, `scrap`, `hold`, `skip` |
| metadata | jsonb | Additional context |

**Indexes:** entity_type, entity_id, department, cycle_number, entered_at

#### `order_scrap_cycles` (Scrap & Restart Tracking)
**Location:** `server/schema.ts` line 9959
| Column | Type | Description |
|--------|------|-------------|
| id | uuid PK | Random UUID |
| entity_type | text | `p1_order`, `p2_serialized_item` |
| original_entity_id | text | Original order/item ID |
| cycle_number | integer | Which cycle this scrap ended |
| scrap_event_id | integer FK → audit_events | Link to scrap audit event |
| scrap_reason | text | Why it was scrapped |
| scrap_department | text | Where scrap occurred |
| scrap_authorized_by | integer FK → employees | Who authorized |
| restart_entity_id | text | New order ID after restart |
| restarted_at / scrapped_at | timestamp | Timing data |

#### `admin_audit_log` (Admin Panel Changes)
**Location:** `server/schema.ts` line 1093
| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-incrementing ID |
| order_id | text | Order being modified |
| field_name | text | Database field changed |
| field_label | text | Human-readable field name |
| old_value | jsonb | Previous value |
| new_value | jsonb | New value |
| changed_by | text | Username |
| user_role | text | `ADMIN`, `OWNER`, `EMPLOYEE` |
| change_type | text | `INLINE`, `SIDE_PANEL`, `BULK` |
| timestamp | timestamp | When change occurred |

#### `employee_audit_log` (Employee Activity)
**Location:** `server/schema.ts` line 1077
| Column | Type | Description |
|--------|------|-------------|
| id | serial PK | Auto-incrementing ID |
| employee_id | integer FK → employees | Which employee |
| action | text | `LOGIN`, `LOGOUT`, `DOCUMENT_VIEW`, etc. |
| resource_type | text | `DOCUMENT`, `EVALUATION`, `CERTIFICATION` |
| resource_id | text | Which resource |
| details | jsonb | Additional info |
| timestamp | timestamp | When it happened |

#### `communication_logs` (Email/SMS Tracking)
**Location:** `server/schema.ts` line 3588
- Tracks all outbound emails (SendGrid/Microsoft Graph) and SMS (Twilio)
- Records inbound messages via webhooks
- Includes template version, recipient, status, provider message IDs

### 1.2 Audit Service Infrastructure

**Primary Service:** `server/src/services/auditService.ts`

| Method | Purpose |
|--------|---------|
| `logEvent()` | Manual event logging to `audit_events` |
| `logFieldChanges()` | Auto-compares before/after states, logs changed fields |
| `recordDepartmentEntry()` | Records department entry in `order_department_transitions` |
| `closeDepartmentTransition()` | Closes a department transition with exit time and duration |
| `recordScrapCycle()` | Records scrap events in `order_scrap_cycles` |

**Audit API:** `server/src/routes/audit.ts`
- `/api/audit/timeline/:entityType/:entityId` — Unified chronological timeline
- Aggregates audit events, department transitions, and scrap cycles

**Where Records Are Written:**
- `server/src/services/auditService.ts` — Central audit engine
- `server/storage.ts` — Admin audit log writes
- `server/src/routes/index.ts` — Order movement and status changes
- `server/src/routes/orders.ts` — Order creation and updates
- `server/src/routes/admin.ts` — Admin panel changes
- `server/communication/audit.ts` — Communication logging

### 1.3 Additional Logging

| System | Location | Purpose |
|--------|----------|---------|
| Request/Response Middleware | `server/index.ts` lines 162-190 | Logs all API calls with method, path, status, duration |
| Human Events Emitter | `server/src/events/humanEvents.ts` | Emits `HUMAN_UPSERTED` events with dedup |
| WebSocket Notifications | `server/src/services/notificationManager.ts` | Real-time push notifications |
| Attention/Staleness System | `auditService.ts` | Tracks `ENTITY_VIEWED`, `ENTITY_CONFIRMED` |

---

## 2. Workflow Event Sources

### 2.1 Order Movement Events
**Source:** `server/src/routes/index.ts` — `/api/orders/progress-department`

When an order moves departments:
1. `currentDepartment` field updated on `all_orders`
2. Completion timestamp set (e.g., `cncCompletedAt`)
3. `departmentHistory` JSONB array appended with `{ fromDepartment, toDepartment, timestamp, progressedBy }`
4. `AuditService.logFieldChanges()` called
5. `AuditService.recordDepartmentEntry()` called for new department
6. `AuditService.closeDepartmentTransition()` called for old department

### 2.2 Order Creation Events
**Source:** `server/src/routes/orders.ts` — `POST /finalized`

Events logged:
- `ORDER_CREATED` action in `audit_events`
- Status determination: `PENDING_SIGNATURE` (if stock model) or `IN_PROGRESS`
- Initial department assignment

### 2.3 Admin Panel Changes
**Source:** `server/src/routes/admin.ts` and `server/storage.ts`

Every field edit from the admin panel creates an `admin_audit_log` entry with old/new values.

### 2.4 Communication Events
**Source:** `server/communication/audit.ts` and `server/src/routes/communications.ts`

All emails and SMS tracked with template, recipient, status, and provider IDs. Inbound messages captured via webhooks.

---

## 3. Lifecycle Models

### 3.1 Sales Order (P1) Lifecycle

```
CREATE_ORDER (Draft)
    → FINALIZED
    → PENDING_SIGNATURE (if stock model selected)
    → P1 Production Queue
    → Layup/Plugging
    → Barcode
    → CNC
    → Finish
    → Gunsmith
    → Paint
    → QC
    → Shipping QC
    → Shipping
    → SHIPPED / DELIVERED
```

**Alternative paths:**
- No-stock-model orders skip to `Shipping QC` directly
- Kickbacks can return orders to any previous department
- Scrap cycles restart the production flow

**States stored in:** `all_orders.status`, `all_orders.current_department`, `all_orders.department_history`

### 3.2 P2 Purchase Order Lifecycle

```
PO Created (OPEN)
    → PO Locked (locked_at set)
    → BOM Configured (bom_configured = true)
    → Production Scheduled
    → Manufacturing (per serialized item):
        → Cutting Table → CNC → Cores → Assembly → QC → Shipping
    → PO CLOSED
```

**States:** `OPEN`, `CLOSED`, `CANCELED`
**Stored in:** `p2_purchase_orders` table

### 3.3 Traveler Workflow Lifecycle

```
DRAFT
    → Steps assigned (NOT_STARTED)
    → Step IN_PROGRESS (tasks being worked)
        → Task phases: SETUP → WORK → QC → CLEANUP
    → Step COMPLETED
    → All steps complete → Traveler COMPLETED
```

**States:** Traveler: `DRAFT`; Steps: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED`; Tasks: `NOT_STARTED`, `STARTED`, `COMPLETED`

### 3.4 Refund Process Lifecycle

```
Request Created (PENDING)
    → APPROVED / REJECTED (management review)
    → PROCESSED (payment issued)
```

**Transaction states:** `pending`, `completed`, `failed`, `refunded`, `voided`

### 3.5 RMA/Nonconformance Lifecycle

```
Opened (Open)
    → Investigation
    → Ready to Ship
    → Shipped
    → Resolved
```

**Conformance states:** `PENDING`, `CONFORMING`, `NON_CONFORMING`

### 3.6 Ticket/Customer Service Lifecycle

```
new → in_progress → waiting_on_customer / waiting_on_production → resolved → closed
```

### 3.7 Kickback Lifecycle

```
OPEN → IN_PROGRESS → RESOLVED → CLOSED
```

---

## 4. Process Mining Feasibility

### 4.1 Assessment: STRONG FEASIBILITY

EPOCH's audit infrastructure is **exceptionally well-suited** for process mining. Here's why:

| Requirement | Status | Source |
|------------|--------|--------|
| Timestamp | Present | All audit tables have `timestamp`/`created_at` |
| Actor (user or system) | Present | `actor_id`, `actor_name`, `actor_role` in `audit_events` |
| Entity ID | Present | `entity_id` in all audit tables |
| Event type | Present | `action` field with structured types |
| Before/After state | Present | `fields_changed` JSONB with `{ before, after }` |
| Department stage | Present | `department` in `order_department_transitions` |
| Duration tracking | Present | `duration_minutes` calculated in transitions |
| Cycle tracking | Present | `cycle_number` for scrap/restart flows |

### 4.2 Workflow Reconstruction Queries

**Reconstruct a single order's journey:**
```sql
SELECT department, entered_at, exited_at, duration_minutes, exit_reason
FROM order_department_transitions
WHERE entity_id = 'EL065'
ORDER BY entered_at;
```

**Find most common workflow patterns:**
```sql
SELECT workflow_path, COUNT(*) as frequency
FROM (
  SELECT entity_id,
    STRING_AGG(department, ' → ' ORDER BY entered_at) as workflow_path
  FROM order_department_transitions
  WHERE entity_type = 'p1_order'
  GROUP BY entity_id
) paths
GROUP BY workflow_path
ORDER BY frequency DESC
LIMIT 20;
```

**Average time per department:**
```sql
SELECT department,
  AVG(duration_minutes) as avg_minutes,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_minutes) as median_minutes,
  MAX(duration_minutes) as max_minutes
FROM order_department_transitions
WHERE exited_at IS NOT NULL
GROUP BY department
ORDER BY avg_minutes DESC;
```

**Detect process variants:**
```sql
SELECT workflow_path, COUNT(*) as count,
  AVG(total_duration) as avg_duration
FROM (
  SELECT entity_id,
    STRING_AGG(department, ' → ' ORDER BY entered_at) as workflow_path,
    SUM(duration_minutes) as total_duration
  FROM order_department_transitions
  WHERE entity_type = 'p1_order' AND exited_at IS NOT NULL
  GROUP BY entity_id
) variants
GROUP BY workflow_path
ORDER BY count DESC;
```

### 4.3 What the Data Can Tell Us

- **Happy path:** The most common department sequence orders follow
- **Variants:** How often orders deviate (kickbacks, skipped stages)
- **Bottlenecks:** Which departments have the longest dwell times
- **Scrap patterns:** Which departments generate the most scrap events
- **User behavior:** Which employees handle the most transitions
- **Time-of-day patterns:** When transitions peak

---

## 5. Required Schema Improvements

While the existing schema is strong, these additions would enhance process mining:

### 5.1 Recommended New Columns/Tables

| Addition | Where | Why |
|----------|-------|-----|
| `process_instance_id` | `audit_events` | Group events across tables into a single process instance |
| `previous_department` | `order_department_transitions` | Quick lookup without self-join |
| `is_standard_path` | `order_department_transitions` | Flag whether this transition follows the expected route |
| `batch_id` | `audit_events` | Link related events from a single user action |

### 5.2 Recommended New Table: `process_documentation`

```sql
CREATE TABLE process_documentation (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,          -- 'p1_order', 'p2_order', etc.
  doc_type TEXT NOT NULL,             -- 'workflow', 'guide', 'faq', 'drift_report'
  title TEXT NOT NULL,
  content TEXT NOT NULL,              -- Markdown content
  generated_from JSONB,              -- { query, sample_size, date_range }
  confidence_score REAL,             -- 0-1 based on sample size and consistency
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  generated_at TIMESTAMP DEFAULT NOW(),
  reviewed_by INTEGER REFERENCES employees(id),
  reviewed_at TIMESTAMP,
  supersedes_id INTEGER REFERENCES process_documentation(id)
);
```

### 5.3 Recommended New Table: `process_drift_events`

```sql
CREATE TABLE process_drift_events (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  drift_type TEXT NOT NULL,           -- 'new_path', 'removed_step', 'added_step', 'order_change'
  old_pattern TEXT NOT NULL,          -- e.g., 'Layup → CNC → Finish'
  new_pattern TEXT NOT NULL,          -- e.g., 'Layup → QC → CNC → Finish'
  first_seen_at TIMESTAMP,
  occurrence_count INTEGER DEFAULT 1,
  sample_entity_ids JSONB,           -- Example orders that follow the new pattern
  severity TEXT DEFAULT 'info',       -- 'info', 'warning', 'critical'
  acknowledged_by INTEGER REFERENCES employees(id),
  acknowledged_at TIMESTAMP,
  detected_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. Proposed Architecture

### 6.1 New Services

#### `server/src/services/processMiner.ts`
**Purpose:** Extract workflow patterns from audit data

**Responsibilities:**
- Query `order_department_transitions` to build event sequences per entity
- Group sequences into workflow patterns (using string comparison)
- Calculate frequency, average duration, and variance for each pattern
- Identify the "canonical" (most common) workflow for each entity type
- Detect variants and outliers
- Cache results with TTL for performance

**Key Methods:**
- `mineWorkflows(entityType, dateRange)` → returns ranked workflow patterns
- `getEntityJourney(entityId)` → returns full timeline for one entity
- `getDepartmentMetrics(dateRange)` → returns avg/median/max per department
- `getBottlenecks(dateRange)` → identifies departments with longest wait times

#### `server/src/services/processDocGenerator.ts`
**Purpose:** Convert mined workflows into human-readable documentation

**Responsibilities:**
- Take workflow patterns from `processMiner` and generate Markdown content
- Create "How It Works" guides from canonical workflows
- Create FAQ entries from common variants ("Why does my order go through QC twice?")
- Generate process explanations with timing expectations
- Optionally use OpenAI (already integrated) to polish natural language

**Key Methods:**
- `generateWorkflowGuide(entityType)` → Markdown guide
- `generateFAQs(entityType)` → Array of Q&A pairs from observed patterns
- `generateProcessSummary(entityType, dateRange)` → Executive summary
- `regenerateAll()` → Refresh all generated documentation

#### `server/src/services/processDriftDetector.ts`
**Purpose:** Detect when real workflows diverge from documented patterns

**Responsibilities:**
- Compare recent workflow patterns against the established canonical pattern
- Detect new steps, removed steps, reordered steps
- Track when drift started and how frequent it is
- Generate alerts for significant drift
- Store findings in `process_drift_events`

**Key Methods:**
- `detectDrift(entityType, lookbackDays)` → Array of drift events
- `comparePatterns(baseline, current)` → Diff analysis
- `getDriftHistory(entityType)` → Timeline of detected changes

### 6.2 New API Routes

#### `server/src/routes/processDocumentation.ts`

```
GET  /api/process-docs                          — List all generated docs
GET  /api/process-docs/:entityType              — Docs for a specific entity type
GET  /api/process-docs/workflows/:entityType    — Mined workflow patterns
GET  /api/process-docs/metrics/:entityType      — Department timing metrics
GET  /api/process-docs/drift/:entityType        — Drift detection results
GET  /api/process-docs/bottlenecks              — Current bottleneck analysis
POST /api/process-docs/regenerate               — Trigger doc regeneration
POST /api/process-docs/:id/review               — Mark doc as reviewed
```

### 6.3 New UI Components

#### Page: `/help/processes`

**Components needed:**

| Component | Purpose |
|-----------|---------|
| `ProcessDocumentationPage.tsx` | Main page container with tabs |
| `ObservedWorkflows.tsx` | Visual workflow diagrams from mined data |
| `OperationalGuides.tsx` | Auto-generated step-by-step guides |
| `ProcessVariants.tsx` | Shows workflow variations with frequency |
| `DriftAlerts.tsx` | Highlights detected process changes |
| `BottleneckDashboard.tsx` | Department timing charts and delays |
| `WorkflowDiagram.tsx` | Reusable component for rendering flow diagrams |

**Page sections:**
1. **Observed Workflows** — Visual diagram of the canonical workflow for each entity type, with frequency counts on each path
2. **Operational Guides** — Auto-generated How-To guides (like the P2 guide, but built from data)
3. **Process Variants** — Table of workflow variations ranked by frequency, with "View Examples" links
4. **Common Delays** — Bar charts of average department dwell time, highlighting outliers
5. **Drift Detection** — Alert cards showing recent workflow changes vs. baseline

---

## 7. Implementation Roadmap

### Stage 1: Audit Logging Improvements (1-2 weeks)
**Risk: Low | Impact: Foundation**

- Add `process_instance_id` to `audit_events` for grouping
- Ensure all department transitions call `AuditService.recordDepartmentEntry()` consistently (audit existing routes for gaps)
- Add `previous_department` to `order_department_transitions` for easier querying
- Verify P2 serialized item transitions are being captured with the same fidelity as P1 orders
- Create `process_documentation` and `process_drift_events` tables

### Stage 2: Process Mining Engine (2-3 weeks)
**Risk: Medium | Impact: Core**

- Build `processMiner.ts` service
- Implement workflow pattern extraction from `order_department_transitions`
- Build department metrics calculator (avg/median/max times)
- Add caching layer (results can be expensive to compute)
- Create API endpoints for workflow data
- Add date range filtering and entity type filtering

### Stage 3: Documentation Generator (2-3 weeks)
**Risk: Medium | Impact: High Visibility**

- Build `processDocGenerator.ts` service
- Implement template-based guide generation (Markdown)
- Integrate with OpenAI (already available via integration) for natural language polish
- Store generated docs in `process_documentation` table
- Add version tracking and "reviewed by" workflow
- Create regeneration scheduler (daily/weekly)

### Stage 4: Knowledge Base UI (2-3 weeks)
**Risk: Low | Impact: High Visibility**

- Create `/help/processes` page
- Build workflow visualization component (could use simple SVG/CSS or a library like Mermaid)
- Build guide rendering component (Markdown → React)
- Add to navigation under Help or as a standalone section
- Link from existing Help Center page
- Add search/filter functionality

### Stage 5: Drift Detection (1-2 weeks)
**Risk: Low | Impact: Operational**

- Build `processDriftDetector.ts` service
- Implement pattern comparison algorithm
- Create drift event storage and history
- Add notification integration (WebSocket alerts via existing `notificationManager`)
- Build drift alert UI component

### Stage 6: AI Explanations (2-3 weeks)
**Risk: Medium | Impact: Premium Feature**

- Use OpenAI integration to generate natural language explanations of:
  - Why a specific order took an unusual path
  - What bottlenecks mean for delivery timelines
  - Recommended process improvements based on data patterns
- Add conversational interface ("Ask about this workflow")
- Generate weekly/monthly process health summaries

**Total estimated timeline: 10-16 weeks for full implementation**

---

## 8. Risks & Limitations

### 8.1 Data Quality Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Not all transitions may be logged consistently | Medium | Stage 1 audit of all route handlers |
| `departmentHistory` JSONB may have format inconsistencies | Low | Use `order_department_transitions` table as source of truth (structured) |
| Historical data before audit system was added won't be available | Medium | Set a baseline date; don't mine older data |
| Clock drift between servers could affect duration calculations | Low | All timestamps from single DB server |

### 8.2 Performance Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Mining queries on large datasets could be slow | Medium | Cache results, add materialized views, run off-hours |
| Real-time drift detection could add latency | Low | Run on schedule (hourly/daily), not per-request |
| Generated docs could become stale | Low | Add staleness indicators, auto-regenerate on schedule |

### 8.3 Accuracy Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI-generated text could be inaccurate | Medium | Require human review before publishing; show confidence scores |
| Rare but valid workflow variants could be flagged as "drift" | Low | Set occurrence thresholds before alerting |
| Process documentation might not match *intended* process, only *observed* | Medium | Allow manual overrides and annotations |

### 8.4 Architectural Considerations

- **OpenAI dependency:** The system should function without AI (templates/patterns only) and use AI as an enhancement layer
- **Storage growth:** `audit_events` will grow continuously; plan for archiving strategy
- **Multi-entity correlation:** Some processes span multiple entity types (e.g., P2 PO → serialized items → travelers); the mining engine should handle cross-entity correlation via `process_instance_id`

---

## Summary

EPOCH's existing audit infrastructure is **production-grade and well-designed** for process mining. The `audit_events` table with before/after tracking, `order_department_transitions` with duration calculations, and the centralized `AuditService` provide a strong foundation.

The most impactful quick win would be **Stage 2 (Process Mining)** — even without AI, simply showing teams the *actual* workflow patterns their orders follow (vs. the assumed workflow) would deliver immediate operational value.

The full AI documentation system is feasible and would make EPOCH's Help Center self-maintaining over time, with guides that update themselves as processes evolve.

### Key File References

| Purpose | File |
|---------|------|
| Audit event schema | `server/schema.ts` line 9895 |
| Transition schema | `server/schema.ts` line 9928 |
| Scrap cycle schema | `server/schema.ts` line 9959 |
| Admin audit schema | `server/schema.ts` line 1093 |
| Employee audit schema | `server/schema.ts` line 1077 |
| Audit service | `server/src/services/auditService.ts` |
| Audit API routes | `server/src/routes/audit.ts` |
| Order progression | `server/src/routes/index.ts` |
| Department constants | `client/src/constants/pipelineDepartments.ts` |
| Help Center (existing) | `client/src/pages/HelpCenter.tsx` |
| P2 Order Guide (existing) | `client/src/pages/P2OrderGuide.tsx` |
| OpenAI integration | Already installed (`javascript_openai_ai_integrations==2.0.0`) |
| Notification system | `server/src/services/notificationManager.ts` |
