# EPOCH OFFLINE CAPABILITY AUDIT

**Date:** March 10, 2026
**Scope:** Read-only architectural audit
**Goal:** Determine whether EPOCH can support offline operation for department operators and what is required to implement it safely

---

## 1. CURRENT OFFLINE SUPPORT

### Summary: EFFECTIVELY NONE — PWA infrastructure exists as dead code. The service worker is never registered, precache paths are invalid for the Vite build, and all business operations require a live server connection.

| Capability | Status | Evidence |
|-----------|--------|---------|
| PWA Installation | **Partially wired** | `manifest.json`, `InstallPWAButton.tsx` exist, but `setupInstallPrompt()` is never called — install flow is dead code |
| Service Worker | **Defined but not registered** | `client/public/sw.js` exists, but `registerServiceWorker()` in `pwa.ts` is never called from any component or entry point |
| Static Asset Caching | **Not functional** | `sw.js` caches CRA-style paths (`/static/js/bundle.js`, `/static/css/main.css`) that don't exist in this Vite build — precache would fail even if SW were registered |
| API Data Caching | **Not implemented** | No API response caching in service worker |
| Offline Mutations | **Not implemented** | No mutation queue, no background sync |
| Offline Data Access | **Not implemented** | No IndexedDB, no persistent query cache |
| Offline Indicator | **Implemented** | `OfflineIndicator.tsx` shows connectivity status |
| Form Draft Persistence | **Implemented** | `useFormDraft.ts` saves form state to localStorage |

**Bottom line:** If internet drops, operators see the "Offline Mode" badge (if the page was already loaded), but the app shell does NOT reliably load offline because the service worker is never registered. Form data being entered is preserved in localStorage. But they cannot scan barcodes, progress orders, record QC results, or perform any production action until connectivity returns.

---

## 2. EXISTING INFRASTRUCTURE

### PHASE 1 — PWA / Offline Infrastructure

**Service Worker:** `client/public/sw.js`
```javascript
const CACHE_NAME = 'epoch-v8-cache-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];
```
- Cache-first strategy for static assets
- Network fallback for uncached requests
- **CRITICAL: `registerServiceWorker()` is defined in `pwa.ts` but never called from any component or entry point** — the service worker is never actually registered
- **CRITICAL: Precache paths are CRA-style (`/static/js/bundle.js`) which don't exist in this Vite build** — even if registered, caching would fail
- **No API route interception** — all `/api/*` calls go directly to network
- **No background sync** — failed requests are not queued
- **No Workbox** — hand-written service worker with basic cache logic

**PWA Manifest:** `client/public/manifest.json`
- App name: "EPOCH v8 - Manufacturing ERP"
- Display: standalone
- Icons: 192x192 and 512x512 SVG

**PWA Utilities:** `client/src/utils/pwa.ts`
- `registerServiceWorker()` — registers `sw.js` — **DEFINED BUT NEVER CALLED**
- `setupInstallPrompt()` — captures install prompt event — **DEFINED BUT NEVER CALLED**
- `showInstallPrompt()` — triggers native install dialog — depends on `setupInstallPrompt()` which is never called
- `isAppInstalled()` — checks standalone display mode

**Offline Indicator:** `client/src/components/OfflineIndicator.tsx`
- Monitors `navigator.onLine` events
- Shows "Connected" (green) / "Offline Mode" (red) badge
- Displays "Working offline with cached data" message when offline
- Auto-hides "Connected" status after 3 seconds

### Assessment:
1. **PWA installation:** Infrastructure exists (`manifest.json`, `InstallPWAButton.tsx`) but wiring is incomplete — `setupInstallPrompt()` is never called
2. **Service worker:** File exists (`sw.js`) but is never registered — `registerServiceWorker()` is dead code
3. **Assets cached for offline:** No — SW not registered, and precache paths are incorrect for Vite build
4. **API calls cached or replayed:** No

---

### PHASE 2 — Frontend Data Persistence

| Storage Type | Used | Purpose | Files |
|-------------|------|---------|-------|
| `localStorage` | Yes | Form drafts, auth tokens, notification prefs, audit buffers | `useFormDraft.ts`, `App.tsx`, `timerAuditSink.ts` |
| `sessionStorage` | Yes | Short-lived action tokens | `useActionAuth.ts` |
| TanStack Query (in-memory) | Yes | 60-second stale time cache | `queryClient.ts` |
| IndexedDB | No | Not used for business data | (idb present as Workbox dependency only) |
| Dexie / localforage | No | Not installed | — |
| `persistQueryClient` | No | Query cache not persisted to disk | — |
| Redux / redux-persist | No | Not used | — |

**Form Draft System:** `client/src/hooks/useFormDraft.ts`
- Debounced auto-save of form values to localStorage
- Supports draft detection and restoration
- Used by complex forms (e.g., Waste Management)
- **Does NOT queue failed mutations** — only preserves form state for manual resubmission

**Timer Audit Sink:** `client/src/lib/timerAuditSink.ts`
- Buffers audit events in localStorage before clearing
- Not a general-purpose offline queue

**Idempotency Support:** `client/src/lib/queryClient.ts`
- `generateIdempotencyKey()` is defined and `apiRequest` supports `idempotencyKey` option
- Sends via `x-idempotency-key` header when provided
- **HOWEVER: `generateIdempotencyKey()` is never called anywhere in the codebase** — the infrastructure exists but is unused dead code
- If wired up, this would be a useful foundation for offline replay

### Assessment:
1. **Local state persistence:** Minimal — form drafts only, no business data
2. **Failed mutations stored:** No — mutations fail silently or show error toast
3. **Retry mechanism:** Queries retry once (except auth errors); mutations do not retry

---

### PHASE 3 — API Interaction Pattern

**API Client:** `client/src/lib/queryClient.ts`

```typescript
// apiRequest — wrapper around fetch
export async function apiRequest(method, url, data?, options?) {
  // Timeout: 15s production, 120s development
  // Credentials: 'include' (cookie-based sessions)
  // Idempotency key support via x-idempotency-key header
  // Error parsing: JSON body → error message extraction
}

// QueryClient configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,  // 1 minute cache
      retry: (failureCount, error) => {
        if (error includes 'Not authenticated' or 'Session expired') return false;
        if (error.status === 429) return false;
        return failureCount < 1;  // One retry only
      },
    },
    mutations: {
      retry: false,  // No mutation retries
    },
  },
});
```

**Mutation Pattern (typical):**
```typescript
const progressMutation = useMutation({
  mutationFn: (data) => apiRequest('POST', `/api/orders/${orderId}/progress`, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    toast.success('Order progressed');
  },
  onError: (error) => {
    toast.error('Failed to progress order');
  },
});
```

### Assessment:
1. **API calls:** Synchronous only — fire-and-forget with success/error callbacks
2. **Failure handling:** Error toast shown to user; no retry for mutations
3. **Mutation queue:** None — no outbox pattern, no background sync, no deferred execution

---

### PHASE 4 — Department Workflow Risk Analysis

**All critical operator actions require a live API call. Every action listed below would BREAK if internet drops:**

| Operator Action | Endpoint | Risk if Offline |
|----------------|----------|-----------------|
| **Progress order to next department** | `POST /api/orders/:id/progress` | **CRITICAL** — Production stops |
| **Scan barcode / QR code** | `GET /api/barcode/scan/:barcode` | **CRITICAL** — Cannot identify orders |
| **Update P2 production item status** | `PATCH /api/p2/control-center/item-status/:id` | **CRITICAL** — P2 production stops |
| **Record QC pass/fail** | `POST /api/qc-submissions` | **HIGH** — QC backlog builds |
| **Record traveler step completion** | `POST /api/p2-traveler/steps/:id/complete` | **HIGH** — Traveler progression stops |
| **Scan material ICN (traveler)** | `POST /api/p2-traveler/material-consumption` | **HIGH** — Material traceability breaks |
| **Start/stop production timer** | `POST /api/production-timers/runs/start` | **MEDIUM** — Labor tracking inaccurate |
| **Clock in/out (time clock)** | `POST /api/connectors/time-clock/events` | **MEDIUM** — Payroll data incomplete |
| **Assign work / schedule** | `PATCH /api/manufacturing-queue/:id` | **MEDIUM** — Scheduling delayed |
| **Mark order shipped** | `POST /api/shipping/mark-shipped/:id` | **LOW** — Can wait for connectivity |
| **Generate UPS label** | `POST /api/shipping-pdf/ups-shipping-label/:id` | **LOW** — Requires external UPS API regardless |

**Critical finding:** The two most frequent operator actions — **barcode scanning** and **order progression** — both require real-time server round-trips. These are the actions that happen hundreds of times per day on the production floor.

---

### PHASE 5 — Sync Safety

| Pattern | Present | Implementation |
|---------|---------|---------------|
| `updated_at` timestamps | **Yes** | On most core tables (`all_orders`, `inventory_items`, `production_orders`, etc.) |
| `created_at` timestamps | **Yes** | Universal across all tables |
| Optimistic updates | **Minimal** | Only found in `CustomerManagement.tsx`; core production hooks (`useOrderActions`, `useInventory`) do NOT use `onMutate` optimistic updates |
| Record versioning (`version` column) | **Minimal** | Only on `enhanced_forms` table — not on core production tables |
| ETag / conditional requests | **No** | Not implemented |
| Last-write-wins | **Yes** | Default behavior for all update operations |
| Merge logic | **No** | No general-purpose merge — only specific dedup scripts |
| Conflict detection | **Partial** | PostgreSQL `ON CONFLICT DO UPDATE` used in upserts; no application-level conflict detection |
| Event sourcing / audit log | **Partial** | `employee_audit_log`, `admin_audit_log`, `department_history` (jsonb), `material_lot_transactions` |

### Assessment:
- **Can the system detect conflicting updates?** Only at the database level via UPSERT conflict targets — not at the application level
- **Would offline replay be safe?** Risky without additional safeguards. Last-write-wins means an offline action replayed 30 minutes late could overwrite a more recent change made by another user
- **Missing for safe offline sync:** Per-record version numbers, conflict detection middleware, and merge resolution UI

---

### PHASE 6 — Data Model Readiness

| Table | `created_at` | `updated_at` | `version` | Event Log | Replay Ready |
|-------|:---:|:---:|:---:|:---:|:---:|
| `all_orders` | Yes | Yes | No | `department_history` (jsonb) | Partial |
| `production_orders` | Yes | Yes | No | `department_history` (jsonb) | Partial |
| `p2_production_orders` | Yes | Yes | No | No | No |
| `inventory_items` | Yes | Yes | No | No | No |
| `inventory_transactions` | Yes | — | No | Is the event log itself | Yes |
| `material_lot_transactions` | Yes | — | No | Is the event log itself | Yes |
| `travelers` | Yes | Yes | No | Via `traveler_steps` | Partial |
| `traveler_steps` | No | No | No | Via `traveler_tasks` | Partial |
| `time_clock_entries` | Yes | No | No | No | No |
| `manufacturing_queue` | Yes | Yes | No | No | No |

**Transaction tables (`inventory_transactions`, `material_lot_transactions`) are append-only and replay-safe.** These are the strongest candidates for offline event collection.

**Status-based tables (`all_orders`, `production_orders`) use mutable state updates.** Replaying these requires version checking or idempotent status transitions to prevent conflicts.

---

### PHASE 7 — Infrastructure Compatibility

| Component | Technology | Offline Compatibility |
|-----------|-----------|----------------------|
| Frontend Framework | React 18 | Good — supports service workers and IndexedDB |
| State Management | TanStack Query v5 | Good — supports `persistQueryClient` and offline mutation plugins |
| API Structure | REST via `fetch` | Good — mutations can be serialized to outbox |
| Build Tool | Vite | Good — supports PWA plugins (vite-plugin-pwa already present) |
| Auth System | Custom (session + JWT) | **Problematic** — sessions expire in 8 hours, JWT in 2 hours |
| Auth Storage | Cookies (`sessionToken`) + localStorage (`jwtToken`) | Partial — tokens available locally but unverifiable offline |

### Authentication During Outages:

**Session expiry:** 8 hours (database-backed, sliding window)
**JWT expiry:** 2 hours (no refresh token rotation)

**Problem:** The `authenticateToken` middleware validates every request against the database. Offline, this validation cannot occur. Even with a cached JWT, the server will reject it when connectivity returns if the JWT has expired.

**Mitigation needed:**
- Cache the authenticated user identity locally
- Allow offline actions to be collected without per-action auth validation
- Re-authenticate and replay queued actions when connectivity returns
- Extend JWT lifetime or implement offline-aware token caching

---

## 3. CRITICAL GAPS

| Gap | Severity | Description |
|-----|----------|-------------|
| No API response caching | **CRITICAL** | Service worker doesn't intercept or cache `/api/*` responses; operators cannot read any data offline |
| No mutation queue | **CRITICAL** | Failed mutations are lost; no outbox pattern to store and replay actions |
| No IndexedDB usage | **HIGH** | No local database for offline data storage; localStorage is limited to 5-10MB |
| No barcode lookup cache | **CRITICAL** | Every barcode scan requires a server round-trip; scanning stops when offline |
| No persistent query cache | **HIGH** | TanStack Query cache is in-memory only; lost on page reload |
| Auth blocks offline use | **HIGH** | Session/JWT validation requires server; operators locked out during outage |
| No conflict resolution | **HIGH** | No version columns on core tables; last-write-wins is unsafe for concurrent offline edits |
| No sync engine | **HIGH** | No mechanism to detect, queue, or replay offline changes |
| No admin reconciliation | **MEDIUM** | No tools for admins to review/resolve conflicts from offline sync |

---

## 4. RISK ANALYSIS

### Risk Level by Department Action:

| Action | Frequency | Offline Risk | Data Loss Risk | Conflict Risk |
|--------|-----------|-------------|----------------|---------------|
| Barcode scanning | Very High (100s/day) | **CRITICAL** | None (read-only) | None |
| Order progression | Very High | **CRITICAL** | **HIGH** | **HIGH** (two operators could progress same order) |
| QC recording | High | **HIGH** | **HIGH** | Low (usually one inspector per order) |
| Material scanning (ICN) | High (P2) | **HIGH** | **HIGH** | **MEDIUM** (lot quantity conflicts) |
| Timer start/stop | Medium | **MEDIUM** | **MEDIUM** | Low |
| Time clock | Medium | **MEDIUM** | **MEDIUM** | Low |
| Scheduling/assignment | Low | **LOW** | Low | **MEDIUM** |

### Worst-Case Scenario:
Internet drops for 2 hours during a production shift. Result with current architecture:
- All scanning stops — operators cannot identify orders
- No orders progress through departments — production line backs up
- QC results cannot be recorded — completed items pile up
- Material consumption not tracked — traceability chain breaks
- Timer/time-clock data lost — labor cost reporting inaccurate
- **Estimated production impact: 50-100% work stoppage**

---

## 5. RECOMMENDED ARCHITECTURE

### Three Options Evaluated:

### Option A — Simple Retry Queue
**How it works:** Failed API calls are saved to an in-memory queue and retried when connectivity returns.

| Aspect | Assessment |
|--------|-----------|
| Complexity | Low |
| Implementation Effort | 1-2 weeks |
| Offline Duration Supported | Minutes (tab must stay open) |
| Data Safety | Low — queue lost on page refresh |
| Conflict Handling | None |
| **Verdict** | **Insufficient for manufacturing floor** |

### Option B — Local Mutation Queue + Sync (RECOMMENDED)
**How it works:** Operator actions are stored in IndexedDB as an "outbox." When connectivity returns, a sync engine replays them in order against the server. The barcode/order lookup database is cached locally for reads.

| Aspect | Assessment |
|--------|-----------|
| Complexity | Medium |
| Implementation Effort | 4-6 weeks |
| Offline Duration Supported | Hours (persists across tab close/reopen) |
| Data Safety | High — IndexedDB survives refresh |
| Conflict Handling | Timestamp-based + version checking |
| **Verdict** | **Best fit for manufacturing floor** |

### Option C — Full Offline-First Architecture
**How it works:** Complete local database replica (CouchDB/PouchDB pattern). All reads and writes happen locally first. Background sync keeps local and server in eventual consistency.

| Aspect | Assessment |
|--------|-----------|
| Complexity | Very High |
| Implementation Effort | 3-6 months |
| Offline Duration Supported | Days/weeks |
| Data Safety | Very high |
| Conflict Handling | Full CRDT or custom merge |
| **Verdict** | **Over-engineered for current needs** |

### Recommendation: Option B — Local Mutation Queue + Sync

**Why this is best for a manufacturing floor:**
1. Outages are typically minutes to a few hours, not days
2. Operators perform well-defined, sequential actions (scan → progress → scan → progress)
3. Most actions are single-user-per-order, reducing conflict risk
4. The existing idempotency key infrastructure provides a foundation for safe replay
5. TanStack Query already supports offline persistence plugins
6. The PWA shell is already in place — extending it is incremental, not greenfield

---

## 6. IMPLEMENTATION PLAN

### Phase 1: Service Worker Enhancement (Week 1)

**Goal:** Cache API responses for read-heavy endpoints so operators can view production data offline.

**Steps:**
1. Replace hand-written `sw.js` with Workbox (via `vite-plugin-pwa` already installed)
2. Add runtime caching strategies:
   - **Cache-first** for static assets (already done)
   - **Stale-while-revalidate** for read endpoints:
     - `GET /api/orders` (production queue)
     - `GET /api/barcode/scan/*` (barcode lookups)
     - `GET /api/manufacturing-queue` (department queues)
     - `GET /api/p2/control-center/items` (P2 production items)
   - **Network-only** for auth endpoints
3. Implement cache versioning and invalidation
4. Pre-cache critical lookup data on login

### Phase 2: Local Database — IndexedDB (Week 2)

**Goal:** Create a persistent local store for offline data and the mutation outbox.

**Steps:**
1. Install Dexie.js (IndexedDB wrapper)
2. Create local database schema:
   ```
   offlineDb
   ├── outbox          // Pending mutations
   │   ├── id
   │   ├── method (POST/PATCH/DELETE)
   │   ├── url
   │   ├── body
   │   ├── idempotencyKey
   │   ├── timestamp
   │   ├── userId
   │   ├── status (PENDING/SYNCING/SYNCED/FAILED)
   │   └── retryCount
   ├── barcodeCache    // Local barcode → order mapping
   │   ├── barcode
   │   ├── orderId
   │   ├── modelName
   │   ├── currentDepartment
   │   └── cachedAt
   └── syncMeta        // Sync state tracking
       ├── lastSyncAt
       ├── lastSyncStatus
       └── pendingCount
   ```
3. Populate `barcodeCache` on login from `/api/orders` bulk endpoint
4. Add periodic background refresh of barcode cache when online

### Phase 3: Mutation Queue / Outbox Pattern (Weeks 2-3)

**Goal:** Capture failed mutations and replay them when online.

**Steps:**
1. Create `OfflineMutationManager` class:
   - Wraps `apiRequest` — tries network first, falls back to outbox
   - Generates idempotency key per mutation (already supported)
   - Stores mutation in IndexedDB outbox on network failure
   - Emits events for UI sync status indicators
2. Integrate with TanStack Query `MutationCache`:
   - Use `onMutate` for optimistic UI updates
   - Use `onError` to store mutation in outbox
   - Use `onSettled` to update outbox status after sync
3. Priority mutations (must queue for offline):
   - `POST /api/orders/:id/progress` — department progression
   - `POST /api/qc-submissions` — QC results
   - `PATCH /api/p2/control-center/item-status/:id` — P2 status
   - `POST /api/production-timers/runs/start|stop` — timer events
   - `POST /api/connectors/time-clock/events` — clock in/out
4. Non-queueable mutations (require live connection):
   - `POST /api/shipping-pdf/ups-shipping-label/:id` — external API
   - Order creation/deletion — too complex for offline
   - Financial transactions — too risky for offline

### Phase 4: Sync Engine (Week 3-4)

**Goal:** Reliably replay outbox mutations when connectivity returns.

**Steps:**
1. Create `SyncEngine` class:
   ```
   SyncEngine
   ├── start()          // Begin watching online/offline events
   ├── syncAll()        // Replay all PENDING outbox items in order
   ├── syncOne(id)      // Replay single outbox item
   ├── handleConflict() // Resolve sync failures
   └── getStatus()      // Return sync progress
   ```
2. Sync rules:
   - Replay mutations in chronological order (FIFO)
   - Use idempotency keys to prevent duplicate execution
   - Retry failed syncs up to 3 times with exponential backoff
   - Move permanently failed items to FAILED status for admin review
3. Trigger sync on:
   - `online` event detected
   - User manually triggers sync
   - Periodic check every 30 seconds when online
4. Server-side support:
   - Idempotency middleware (leverage existing `x-idempotency-key`)
   - Add `version` column to `all_orders` and `production_orders`
   - Add conflict detection: reject mutation if `version` doesn't match

### Phase 5: Conflict Resolution (Week 4-5)

**Goal:** Detect and safely resolve conflicts from offline mutations.

**Steps:**
1. Add `version` integer column to critical tables:
   - `all_orders`
   - `production_orders`
   - `p2_production_orders`
   - `manufacturing_queue`
2. Server-side conflict detection:
   ```
   // On update:
   UPDATE all_orders
   SET status = $newStatus, version = version + 1
   WHERE id = $id AND version = $expectedVersion
   // If rows affected = 0 → conflict detected
   ```
3. Conflict resolution rules:
   - **Department progression:** If order already progressed past the queued department, skip (idempotent)
   - **QC submission:** Accept if no conflicting submission exists; flag for review if duplicate
   - **Timer events:** Merge by timestamps — local timestamp takes precedence for start/stop
   - **Material consumption:** Accept if lot has sufficient quantity; reject and alert if depleted
4. Conflict notification:
   - Toast notification to operator: "X actions synced, Y need review"
   - Admin dashboard showing unresolved conflicts

### Phase 6: UI Indicators (Week 5)

**Goal:** Operators always know their connectivity and sync status.

**Steps:**
1. Enhance `OfflineIndicator.tsx`:
   - Show pending outbox count: "3 actions pending sync"
   - Show sync progress: "Syncing 2/5..."
   - Show last sync time: "Last synced 5 min ago"
2. Add per-action offline indicators:
   - Green dot = synced to server
   - Yellow dot = pending sync
   - Red dot = sync failed — needs review
3. Add "Force Sync" button for manual trigger
4. Add "Offline Mode" banner on department pages explaining capabilities
5. Disable non-queueable actions when offline (shipping labels, order creation) with explanatory message

### Phase 7: Admin Reconciliation Tools (Week 5-6)

**Goal:** Admins can review and resolve sync conflicts.

**Steps:**
1. Create `/admin/offline-sync` page:
   - View all FAILED outbox items across all users
   - See conflict details (what was attempted vs current server state)
   - Actions: Retry, Accept, Reject, Merge
2. Sync audit log:
   - Record all offline→online sync events
   - Track: userId, action, timestamp (offline), timestamp (synced), result
3. Dashboard metrics:
   - Average offline duration per shift
   - Number of offline actions per department
   - Conflict rate
   - Data loss incidents (zero target)

---

## 7. ESTIMATED COMPLEXITY

| Phase | Effort | Complexity | Dependencies |
|-------|--------|-----------|-------------|
| 1. Service Worker Enhancement | 1 week | Low | vite-plugin-pwa (installed) |
| 2. Local Database (IndexedDB) | 1 week | Low-Medium | Dexie.js (new dependency) |
| 3. Mutation Queue / Outbox | 1-2 weeks | Medium | Phases 1-2 |
| 4. Sync Engine | 1-2 weeks | Medium-High | Phase 3 |
| 5. Conflict Resolution | 1-2 weeks | High | Phase 4 + schema migration |
| 6. UI Indicators | 1 week | Low | Phases 3-4 |
| 7. Admin Reconciliation | 1-2 weeks | Medium | Phases 4-5 |

**Total estimated effort: 6-10 weeks**

**Overall complexity: MEDIUM-HIGH**

### Risk Mitigations:
- **Phase 1-2 can be deployed immediately** — adds value even without full sync
- **Phase 3 covers 80% of offline use cases** — barcode scanning + order progression
- **Phase 5 is the hardest** — requires schema changes and careful conflict logic
- **Incremental deployment** — each phase provides standalone value
- **Rollback safe** — outbox pattern doesn't modify existing API contracts

### Existing Assets That Accelerate Implementation:
1. PWA manifest and `InstallPWAButton.tsx` component exist (need wiring)
2. Service worker file exists (needs rewrite for Vite + registration call)
3. Offline indicator component already exists and works
4. Idempotency key infrastructure exists in `apiRequest` (needs first caller)
5. Form draft persistence pattern (`useFormDraft`) demonstrates localStorage approach
6. TanStack Query supports `persistQueryClient` and offline plugins out of the box
7. `updated_at` timestamps exist on most core tables
8. Transaction tables (`inventory_transactions`, `material_lot_transactions`) are already append-only and replay-safe

### Security Consideration for Implementation:
**Shared manufacturing floor devices** are common. The offline implementation must include:
- User-scoped cache keys (partition cached data by authenticated user)
- Cache purge on logout or user switch
- No cross-user data leakage from IndexedDB or cached API responses
- Session token handling that prevents one user's offline actions from replaying under another user's identity
