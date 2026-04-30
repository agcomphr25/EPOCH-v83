# Charge Code Manager Page — Validation Audit

**Audit Date:** 2026-04-29  
**Audit Type:** Read-only. No code was modified; no charge codes were created, updated, or deactivated.  
**Auditor:** Agent (automated inspection of live source files)

---

## Files Inspected

| File | Purpose |
|---|---|
| `client/src/pages/finance/ChargeCodeManagerPage.tsx` | New page component — full source read |
| `client/src/App.tsx` | Route registration — lines 243, 980–985 |
| `client/src/components/Navigation.tsx` | Finance nav entry — lines 955–962, 1575–1577 |
| `server/src/routes/chargeCodes.ts` | API route handlers — full source read |
| `server/src/routes/index.ts` | Express route mounting — line 10702 |
| `server/middleware/auth.ts` | `authenticateToken` + `requireRole` — lines 59–131 |
| `client/src/components/auth/RouteGuard.tsx` | Frontend auth guard — full source read |
| `client/src/config/userPermissions.ts` | Permission tables + `hasRouteAccess` — lines 60–693 |
| `shared/schema.ts` | Re-export verification — line 2 (`export * from '../server/schema'`) |
| `server/schema.ts` | `chargeCodes` table + `insertChargeCodeSchema` — lines 5296–5317 |

---

## Pass / Fail Checklist

### 1. `/finance/charge-codes` route is registered correctly

**PASS**

- `App.tsx` line 243: `import ChargeCodeManagerPage from './pages/finance/ChargeCodeManagerPage';`
- `App.tsx` lines 982–985: `<Route path="/finance/charge-codes" component={ChargeCodeManagerPage} />`
- Route falls inside the `<RouteGuard>` block (lines 544–1289), meaning it is never reachable without passing auth checks.

---

### 2. Finance navigation entry appears only for authorized users

**PASS**

- `Navigation.tsx` lines 955–962: entry added to `financeItems` array with `Tag` icon and path `/finance/charge-codes`.
- `filteredFinanceItems` is computed at line 1575–1577 via `filterByPermissions(financeItems, currentUser?.username, userRole)`.
- `filterByPermissions` returns an empty array when no user is logged in (line 1518), and otherwise applies the same `hasRouteAccess` logic used for every other finance nav item.
- Result: the nav entry only appears when the user has explicit access — consistent with all other finance items.

---

### 3. Page cannot be accessed by unauthorized users directly by URL

**PASS — with one noted consistency gap (non-blocking)**

`RouteGuard` applies `computeAccess(currentUser, location)` before rendering. Access evaluation:

| User type | Can access `/finance/charge-codes`? | Why |
|---|---|---|
| Unauthenticated | No | `computeAccess` returns `false`, redirect to `/login` |
| Authenticated, unknown username | No | Falls through `DEFAULT_USER_ROUTES` (route not listed) then `hasRoleBasedAccess` → `false` |
| In `USER_PERMISSIONS`, no `fullAccess` | No (unless route is in their `routes[]`) | `hasRoleBasedAccess` returns `false` — route not in `ROLE_ROUTE_ACCESS` |
| In `USER_PERMISSIONS`, `fullAccess: true` | Yes | `hasFullAccess` → `true` |
| `hasFullAccess()` admin users | Yes | Short-circuit at line 93 of RouteGuard |

**Noted gap:** `/finance/charge-codes` is not yet listed in `ROLE_ROUTE_ACCESS` (unlike every other `/finance/*` route). In practice this is restrictive (blocks access rather than granting it), so there is no security risk. However, it means ADMIN/OWNER role users who appear in `USER_PERMISSIONS` without `fullAccess: true` cannot access the page via the role-check path. This is consistent with how new routes land before being formally added to the role map, and is safe to leave as-is. If ADMIN/OWNER role-based access is desired for all such users, `/finance/charge-codes` should be added to `ROLE_ROUTE_ACCESS` and `DEFAULT_USER_ROUTES` in `client/src/config/userPermissions.ts`.

---

### 4. `GET /api/charge-codes` is safe for intended users

**PASS**

- `server/src/routes/chargeCodes.ts` line 26: `router.get('/', authenticateToken, ...)`.
- Requires a valid session token (JWT or cookie); returns 401 for unauthenticated requests, 403 for expired tokens.
- No `requireRole` on GET — intentional design to allow kiosk and timekeeper lookup.
- The timekeeping kiosk also has a separate read-only endpoint at `/api/timekeeping/kiosk/charge-codes` that does not require auth. The manager page uses `/api/charge-codes` (auth-required), which is correct.
- Response is a plain JSON array with no sensitive internal fields beyond what admins need to manage.

---

### 5. `POST /api/charge-codes` is admin-only

**PASS**

- `server/src/routes/chargeCodes.ts` line 33: `router.post('/', authenticateToken, requireRole('ADMIN'), ...)`.
- Two-layer protection: session must be valid AND role must be exactly `'ADMIN'`.
- `requireRole` (middleware/auth.ts line 119–131) returns `401` if no user on request, `403` if role mismatch — no silent fallthrough.
- Request body is validated with `insertChargeCodeSchema.safeParse(req.body)` before any DB write. Invalid payloads return 400 with structured error details.

---

### 6. `PATCH /api/charge-codes/:id` is admin-only

**PASS**

- `server/src/routes/chargeCodes.ts` line 67: `router.patch('/:id', authenticateToken, requireRole('ADMIN'), ...)`.
- Same two-layer protection as POST.
- `id` parameter is validated with `parseInt` + `isNaN` guard — non-numeric IDs return 400.
- Body validated with `insertChargeCodeSchema.partial().safeParse(req.body)` — partial schema allows partial updates while still rejecting invalid field values.
- 404 returned when the record does not exist after update attempt.

---

### 7. Create/edit/deactivate flows use the backend API, not local-only state

**PASS**

- Create: `apiRequest('/api/charge-codes', { method: 'POST', body: payload })` — line 89.
- Edit/deactivate: `apiRequest('/api/charge-codes/${editTarget!.id}', { method: 'PATCH', body: payload })` — line 102.
- Both calls use the correct `apiRequest(url, options)` signature (verified against `client/src/lib/queryClient.ts` line 45).
- On success, both mutations call `queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] })` to force a fresh fetch — ensuring the UI reflects the true server state immediately.
- No optimistic local-state mutations; all displayed data comes from the server.

---

### 8. Mutations trigger existing audit_events hooks

**PASS**

Server-side audit trail is embedded directly in both write handlers:

**POST (create):**
```
entityType: 'charge_code'
action:     'CHARGE_CODE_CREATED'
fieldsChanged: { code, type, active }
meta: { billable, requiresApproval }
ipAddress, userAgent captured
```
Audit is only written *after* the successful DB insert (line 43 follows `storage.createChargeCode`).

**PATCH (update / deactivate):**
```
entityType: 'charge_code'
action:     'CHARGE_CODE_UPDATED' or 'CHARGE_CODE_DEACTIVATED'
fieldsChanged: before/after diff keyed by field name
meta: { isDeactivation }
reason: optional free-text from request body
ipAddress, userAgent captured
```
Deactivation is specifically detected by `existing.active === true && parsed.data.active === false` (line 90). The pre-update `existing` record is fetched before the PATCH is applied (line 80) to enable accurate before/after diffing.

---

### 9. Deactivation uses `PATCH active=false`, not delete

**PASS**

- There is no DELETE handler in `server/src/routes/chargeCodes.ts`. The router exposes only GET, POST, and PATCH.
- The frontend form renders the `active` toggle **only in edit mode** (controlled by `{isEdit && (...)}` at line 272 of the page component).
- When the toggle is turned off, `onSubmit` sends `active: false` in the PATCH payload.
- The server detects this as a deactivation event and writes the appropriate audit trail entry.
- Charge codes can never be permanently deleted through this UI or API.

---

### 10. Form validation uses shared `insertChargeCodeSchema` correctly

**PASS**

- `ChargeCodeManagerPage.tsx` line 9: `import { insertChargeCodeSchema, type ChargeCode } from '@shared/schema';`
- `shared/schema.ts` line 2: `export * from '../server/schema';` — confirms `insertChargeCodeSchema` originates in `server/schema.ts`.
- `server/schema.ts` lines 5311–5315: `insertChargeCodeSchema = createInsertSchema(chargeCodes).omit({ id, createdAt, updatedAt })`.
- Page extends the shared schema (not replaces it):
  ```ts
  const chargeCodeFormSchema = insertChargeCodeSchema.extend({
    code: z.string().min(1, 'Code is required'),
    type: z.enum(['DIRECT', 'OVERHEAD', 'G_AND_A']),
    maxHoursPerDay: z.string().optional(),
    active: z.boolean().optional(),
  });
  ```
- The `.extend()` approach correctly overrides only the fields needing stricter client constraints (non-empty code, explicit enum for type). All other fields inherit their validation from the shared schema.
- `zodResolver(chargeCodeFormSchema)` is applied in `useForm` (line 83) so validation runs on submit before any API call is made.
- Server independently re-validates with the same `insertChargeCodeSchema` (or `.partial()` for PATCH), providing defense in depth.

---

### 11. The UI does not expose unsafe fields or allow invalid types

**PASS**

Field-by-field inspection of the rendered form:

| Field | Control | Constraint |
|---|---|---|
| `code` | `<Input type="text">` | `z.string().min(1)` — required |
| `type` | `<Select>` with 3 options | Enum-constrained: DIRECT, OVERHEAD, G_AND_A only |
| `description` | `<Textarea>` | Optional string |
| `department` | `<Input type="text">` | Optional string |
| `contractReference` | `<Input type="text">` | Optional string |
| `maxHoursPerDay` | `<Input type="number" min="0" step="0.5">` | HTML min attr; `parseFloat` with falsy-guard at submit |
| `billable` | `<Switch>` | Boolean only |
| `requiresApproval` | `<Switch>` | Boolean only |
| `active` | `<Switch>` (edit mode only) | Boolean only; hidden during create |

- No internal fields exposed: `id`, `createdAt`, `updatedAt` are never rendered or submitted.
- `type` field cannot accept arbitrary text — it uses a shadcn `<Select>` with hard-coded options; the Zod enum validates on the frontend and the backend accepts only what the DB schema allows.
- The `maxHoursPerDay` submit handler (`values.maxHoursPerDay ? parseFloat(values.maxHoursPerDay) : null`) correctly sends `null` for an empty string, avoiding a `NaN` being written to the database. The HTML `type="number"` constraint and `min="0"` step provide additional UX guardrails.

**Minor advisory (non-blocking):** A Zod `.refine()` or `.transform()` on `maxHoursPerDay` would provide an inline error message if the user types a non-numeric string before clicking save, rather than relying solely on the HTML input type enforcement.

---

### 12. Pre-existing migration safety failures are unrelated

**PASS**

Inspection of the `migrations/` directory confirms that the following duplicate-prefix files predate this task entirely:

| Conflict | Files |
|---|---|
| Prefix `0075` | `0075_cutting_documents_table.sql` and `0075_time_off_requests.sql` |
| Prefix `0077` | `0077_compliance_requires_attention.sql` and `0077_phase_a_salaried_labor_capture.sql` |
| Prefix `0086` | `0086_p2_serialized_items_barcode_printed_at.sql` and `0086_pin_rate_limit.sql` |

This task created zero migration files. The only files touched were:
- `client/src/pages/finance/ChargeCodeManagerPage.tsx` (new)
- `client/src/App.tsx` (import + route added)
- `client/src/components/Navigation.tsx` (Tag import + nav entry added)

The migration safety test failure is therefore unrelated to the Charge Code Manager implementation.

---

## Security & Compliance Summary

| Concern | Verdict | Notes |
|---|---|---|
| Unauthenticated read of charge codes | Not possible | `authenticateToken` required on GET |
| Unauthenticated create/update | Not possible | `authenticateToken` + `requireRole('ADMIN')` |
| Non-admin create/update | Not possible | 403 returned by `requireRole` |
| Client-side bypass of write protection | Not possible | Server independently validates role and schema |
| Code injection via `type` field | Not possible | Enum enforced on frontend (Select) and Zod schema |
| Code injection via free-text fields | Low risk | Fields are stored as-is but rendered as text, not HTML |
| Audit trail bypass | Not possible | Audit written server-side after successful DB ops only |
| Permanent deletion of charge codes | Not possible | No DELETE route exists; deactivation only |
| Stale data after mutation | Not possible | `queryClient.invalidateQueries` forces fresh fetch |
| DCAA before/after diff accuracy | Confirmed correct | Pre-update record fetched before PATCH is applied |

---

## Overall Verdict

**The page is safe to keep live.**

All 12 checklist items pass. The implementation correctly uses the existing API, enforces server-side admin-only access on write endpoints, records full DCAA-compliant audit trail entries for every create/update/deactivation, and never permanently deletes charge codes. The one noted non-blocking item (route not yet in `ROLE_ROUTE_ACCESS`) makes the page *more* restrictive than intended for role-based users — it is a UX gap, not a security gap.

### Recommended follow-up (low priority, no security urgency)

Add `/finance/charge-codes` to `ROLE_ROUTE_ACCESS` and `DEFAULT_USER_ROUTES` in `client/src/config/userPermissions.ts` so that ADMIN/OWNER role users in the explicit permissions list can also navigate to the page without needing `fullAccess: true`.

```ts
// In ROLE_ROUTE_ACCESS:
'/finance/charge-codes': ['ADMIN', 'OWNER'],
```

```ts
// In DEFAULT_USER_ROUTES array (alongside other /finance/* entries around line 87):
'/finance/charge-codes',
```
