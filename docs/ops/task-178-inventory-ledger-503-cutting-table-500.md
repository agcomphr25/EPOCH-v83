# Inventory Ledger 503 + Cutting-Table 500 — Production Issue Runbook

**Filed:** May 8, 2026
**Cross-reference:** Tasks #114 (routes-ready gate), #178 (this fix)

## Symptom

On `agcompepoch.xyz` users open the **Inventory Ledger** page and see a
"Failed to load inventory ledger" error toast / empty state. Browser network
tab shows:

- `GET /api/inventory/ledger?page=1&limit=100` → **503**
  `{ "error": "Server starting, please retry" }` with `Retry-After: 2`
- `GET /api/inventory/ledger/locations` → **503** (same body)
- Other unrelated endpoints (e.g. `/api/internal-messages/unread/count/<id>`,
  `/api/traceability/search`) hit the same 503 in the same session.

In the same window the cutting-table list endpoints have historically
returned **500**:

- `GET /api/cutting-table/fabric-items`
- `GET /api/cutting-table/packet-items`
- `GET /api/cutting-table/packet-part-items`
- `GET /api/cutting-table-mfg-queue/cutting-table?status=ACTIVE|ALL`

## Root cause

The 503 comes from the **routes-ready gate** in `server/index.ts` (added in
task #114). While `registerRoutes()` is still mounting routes, every `/api/*`
request short-circuits with `503 + Retry-After: 2` instead of being handed
to the unmounted handler chain.

In production this boot window is unusually long (~3 minutes from process
start to `Routes registered — /api gate lifted` in deployment logs). It is a
**single long boot, not a crash-restart loop** — exactly one
`🚀 EPOCH Server Starting` precedes the gate-lift in the visible window.
The gate itself is working correctly; it's only the user-facing impact
("failed to load") that needed fixing.

The cutting-table 500s have a separate but compounding cause: four list
handlers were calling `storage.getAllInventoryItems()` (which does
`SELECT * FROM inventory_items WHERE is_active`) and then filtering in JS.
On a large `inventory_items` table that reads thousands of rows per request,
holds them in Node memory, and competes with concurrent requests during the
already-tight boot window. A DB hiccup or memory pressure during boot could
turn into an unhandled rejection.

## Fix (task #178)

1. **Cutting-table list endpoints filter at the database**
   (`server/src/routes/cuttingTable.ts`):
   `/fabric-items`, `/packet-items`, `/packet-part-items` now issue targeted
   `SELECT id, ag_part_number, name, sku FROM inventory_items WHERE …`
   queries with the matching boolean / category predicate, ordered by name,
   capped at `CUTTING_LIST_MAX_ROWS = 5000`. They no longer call
   `storage.getAllInventoryItems()`.

2. **Cutting-table queue endpoint is bounded and column-narrowed**
   (`server/src/routes/cuttingTableManufacturingQueue.ts`):
   `/cutting-table-mfg-queue/cutting-table` adds `.limit(5000)` on the
   queue + inventory join and only selects the BOM columns it actually
   uses (`id`, `partNumber`, `inventoryItemId`).

3. **Handlers fail safely**: each catches `error: any` and logs a
   structured payload (`route`, `message`, `code`, plus the `status` query
   for the queue handler) before responding `500 { error: ... }`. No `await`
   path can throw past the try/catch.

4. **Inventory Ledger page tolerates the boot window**
   (`client/src/pages/InventoryLedgerPage.tsx`):
   Both the ledger and `ledger/locations` queries are wrapped in
   `withBootRetry(...)` — up to 6 attempts at 1.5 s intervals (~9 s total)
   that retry **only on `status === 503`**. All other 4xx/5xx errors are
   rethrown immediately so genuine errors still surface. This mirrors the
   `fetchWithBootRetry` pattern introduced in `LoginPage.tsx` for task #114.

## How to recognise this in production logs

- `🚀 EPOCH Server Starting - Build Version: ...` appears, followed by a
  long gap (1–3 minutes), then `✅ Routes registered — /api gate lifted`.
  Any `/api/*` request whose timestamp falls inside that gap will receive
  the gate's 503.
- If the gate-lifted line never appears for a given start, look for a
  subsequent `🚀 EPOCH Server Starting` close behind — that is a true
  crash-restart loop and needs a separate investigation. Most common
  triggers are migration failures (`relation "..." does not exist` followed
  by process exit), capability-validator failures, or unhandled rejections
  in cron startup.
- Repeated cutting-table 500s with `[cutting-table/*] DB error:` log lines
  point at the database (timeouts, connection limits, missing columns).
  After this fix the structured log carries `code` and `message` so the
  Postgres error class is visible directly.

## Out of scope (do not change here)

- The 503 + `Retry-After` contract from task #114 (it's correct).
- The inventory ledger query, filters, pagination, or CSV export beyond
  the retry-on-503 wrapper.
- `storage.getAllInventoryItems()` callers other than the four cutting-table
  endpoints listed above (e.g. `/inventory-audit/packets` still calls it
  intentionally).
- Authentication / sessions / `internal-messages` — they only show up in
  the same session because they share the boot-gate window.
