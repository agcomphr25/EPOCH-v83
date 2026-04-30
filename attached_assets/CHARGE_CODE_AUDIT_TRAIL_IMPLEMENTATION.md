# CHARGE CODE AUDIT TRAIL — IMPLEMENTATION RECORD
NO_CHARGE_CODE_AUDIT Resolution

**Date:** 2026-04-25
**Pass:** 3
**Target flag:** `NO_CHARGE_CODE_AUDIT`
**Target domain:** `CHARGE_CODE`

---

## SCOPE

Only one file was modified:

```
server/src/routes/chargeCodes.ts
```

No changes to:
- `server/storage.ts`
- `server/schema.ts`
- `server/src/services/edriDomainScorers.ts`
- Any other file

---

## EXACT LINES CHANGED

### Before (53 lines)

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth';
import { storage } from '../../storage';
import { insertChargeCodeSchema } from '../../schema';
// ... GET / POST / PATCH routes with no audit hooks
```

### After (120 lines)

**New imports added (lines 2–5):**
```typescript
import { db } from '../../db';
import { insertChargeCodeSchema, auditEvents } from '../../schema';
```

**New helper function (lines 16–23):**
```typescript
function extractActor(req: Request): { actorId: number | null; actorName: string; actorRole: string } {
  const user = req.user as any;
  return {
    actorId: user?.id ?? null,
    actorName: user?.username || user?.email || user?.name || 'admin',
    actorRole: user?.role || 'admin',
  };
}
```

**POST route audit block (lines 41–61) — written only after successful DB creation:**
```typescript
const { actorId, actorName, actorRole } = extractActor(req);
await db.insert(auditEvents).values({
  entityType: 'charge_code',
  entityId: String(created.id),
  action: 'CHARGE_CODE_CREATED',
  actorId,
  actorName,
  actorRole,
  fieldsChanged: {
    code: created.code,
    type: created.type,
    active: created.active,
  },
  meta: {
    billable: created.billable,
    requiresApproval: created.requiresApproval,
  },
  ipAddress: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});
```

**PATCH route pre-fetch (line 80) — required for diff and deactivation detection:**
```typescript
const existing = await storage.getChargeCodeById(id);
```

**PATCH route audit block (lines 88–114) — written only after successful DB update:**
```typescript
const { actorId, actorName, actorRole } = extractActor(req);
const isDeactivation = existing?.active === true && parsed.data.active === false;
const action = isDeactivation ? 'CHARGE_CODE_DEACTIVATED' : 'CHARGE_CODE_UPDATED';
const reason: string | null = (req.body as any).reason ?? null;

const fieldsChanged: Record<string, { from: unknown; to: unknown }> = {};
for (const [key, toVal] of Object.entries(parsed.data)) {
  const fromVal = existing ? (existing as Record<string, unknown>)[key] : undefined;
  if (fromVal !== toVal) {
    fieldsChanged[key] = { from: fromVal, to: toVal };
  }
}

await db.insert(auditEvents).values({
  entityType: 'charge_code',
  entityId: String(id),
  action,
  actorId,
  actorName,
  actorRole,
  reason,
  fieldsChanged,
  meta: { isDeactivation },
  ipAddress: req.ip ?? null,
  userAgent: req.headers['user-agent'] ?? null,
});
```

---

## AUDIT ROWS CREATED BY EACH MUTATION PATH

### POST /api/charge-codes → `CHARGE_CODE_CREATED`

| Column | Value |
|---|---|
| `entity_type` | `'charge_code'` |
| `entity_id` | ID of newly created record (string) |
| `action` | `'CHARGE_CODE_CREATED'` |
| `actor_id` | From `req.user.id` |
| `actor_name` | From `req.user.username / email / name` |
| `actor_role` | From `req.user.role` |
| `fields_changed` | `{ code, type, active }` snapshot |
| `meta` | `{ billable, requiresApproval }` |
| `ip_address` | `req.ip` |
| `user_agent` | `req.headers['user-agent']` |

### PATCH /api/charge-codes/:id (update) → `CHARGE_CODE_UPDATED`

| Column | Value |
|---|---|
| `entity_type` | `'charge_code'` |
| `entity_id` | ID of updated record (string) |
| `action` | `'CHARGE_CODE_UPDATED'` |
| `fields_changed` | `{ field: { from, to } }` for each changed key |
| `reason` | `req.body.reason` or `null` |
| `meta` | `{ isDeactivation: false }` |

### PATCH /api/charge-codes/:id with `{ active: false }` → `CHARGE_CODE_DEACTIVATED`

| Column | Value |
|---|---|
| `entity_type` | `'charge_code'` |
| `entity_id` | ID of deactivated record (string) |
| `action` | `'CHARGE_CODE_DEACTIVATED'` |
| `fields_changed` | `{ active: { from: true, to: false }, ... }` |
| `reason` | `req.body.reason` or `null` |
| `meta` | `{ isDeactivation: true }` |

---

## SAFETY GUARANTEES

- Audit row is written **only** after successful storage operation — failed writes produce no audit event.
- No duplicate rows possible — single `db.insert` per request.
- `entity_type` is always lowercase `'charge_code'` — matches scorer `WHERE entity_type = 'charge_code' OR entity_type LIKE '%charge%'`.
- Failed mutations return early before the audit block is reached.
- No fake or seeded rows were inserted.

---

## SCORER QUERY (from edriDomainScorers.ts lines 357–362)

```sql
SELECT COUNT(*) as count
FROM audit_events
WHERE entity_type = 'charge_code'
   OR entity_type LIKE '%charge%'
LIMIT 1000
```

| State | COUNT | `SUPERVISOR_OVERRIDE_TRAIL` score |
|---|---|---|
| Before | 0 | 0 |
| After first API call | ≥ 1 | 1 |

---

## BEFORE / AFTER SCORE

| Metric | Before | After (first API call) |
|---|---|---|
| CHARGE_CODE domain raw | 80 / 100 | 100 / 100 |
| CHARGE_CODE weighted (× 0.20) | 16.0 | 20.0 |
| Composite EDRI score | ~85.38 | ~89.38 |
| `NO_CHARGE_CODE_AUDIT` flag | ACTIVE | CLEARED |

---

## VALIDATION CHECKLIST

- [x] POST writes `CHARGE_CODE_CREATED` with `entity_type = 'charge_code'`
- [x] PATCH (field change) writes `CHARGE_CODE_UPDATED` with field diff
- [x] PATCH (`active: false`) writes `CHARGE_CODE_DEACTIVATED` with `isDeactivation: true`
- [x] `entity_type` is exactly `'charge_code'` (lowercase) in all three paths
- [x] Audit rows written only after successful DB operation
- [x] No storage interface modified
- [x] No scorer logic modified
- [x] No fake rows seeded
- [x] Server compiles and starts cleanly (confirmed in logs)
- [ ] Scorer clears `NO_CHARGE_CODE_AUDIT` — triggers on next charge code API call
- [ ] Composite score reaches ~89.38 — triggers on next charge code API call

---

## REMAINING TOP SCORE BLOCKERS

| Flag | Domain | Weight | Potential Recovery |
|---|---|---|---|
| `WAD_GL_LINK_BROKEN` | CHARGE_CODE | 0.20 | ~12 pts |
| `NO_BURDEN_RATES` | ACCOUNTING | 0.20 | ~12 pts |
| `AUTO_APPROVAL_BYPASS` | TIMEKEEPING | 0.30 | ~10 pts |
| `NO_FRINGE_POOL` | CHARGE_CODE | 0.20 | ~5 pts |
| `NO_GA_OVERHEAD_POOL` | CHARGE_CODE | 0.20 | ~5 pts |

WAD_GL_LINK_BROKEN and NO_BURDEN_RATES represent the highest available recovery.
