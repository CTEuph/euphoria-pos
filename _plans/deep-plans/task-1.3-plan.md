# Bullet-Proof POS — Offline Auth + Lane Sync Implementation  
*A single source-of-truth plan that includes both the architectural “15-Phase” roadmap **and** the granular, junior-friendly task board.*

---

## 1. High-Level Engineering Plan *(Phases 0 → 15)*

> This is the authoritative architecture sequence. **Every numbered step is mandatory** and must be completed in the order shown.  
> (Copied verbatim from the original “Bullet-Proof POS Offline Auth + Sync Implementation Plan”.)

```
PHASE 0 – FOUNDATION
0.1  Create git branch `feat/offline-auth‐lane-sync-v2`.
0.2  Enable WAL on SQLite in all dev machines.

PHASE 1 – DEPENDENCIES & CONFIG
1.1  Add packages …
1.2  Update package.json scripts …
1.3  .env.example additions …
1.4  electron/settings.local.json …

PHASE 2 – LOCAL SQLITE SCHEMA
2.1  Duplicate Postgres schema → drizzle/sqlite-schema.ts … + outbox / inbox_processed
2.2  Commit generated file; NEVER edit manually.

PHASE 3 – DATABASE SERVICE
3.1  NEW electron/services/localDb.ts … withTxn()
3.2  Auto-run migrations on first open.

PHASE 4 – EMPLOYEE MODULE
4.1  NEW employeeService.ts (verifyPin / upsert)
4.2  Seed mock employees on first launch.

PHASE 5 – AUTH IPC
5.1  Modify auth IPC to use employeeService
5.2  Add assertAuthenticated()

PHASE 6 – OUTBOX PUBLISHER
6.1  NEW messageBus.ts (publish / markSent)

PHASE 7 – PEER-LANE WEBSOCKET SYNC
7.1  wsServer.ts
7.2  wsClient.ts
7.3  Retry logic
7.4  sync/index.ts (startLaneSync)

PHASE 8 – SUPABASE CLOUD SYNC
8.1  cloudSync.ts (startCloudSync)
8.2  startCloudSync() handle

PHASE 9 – RECONCILIATION
9.1  reconcile.ts (checksum + diff)
9.2  Schedule every 10 min.

PHASE 10 – MAIN PROCESS BOOTSTRAP
10.1 Wire startLaneSync / startCloudSync in main.ts

PHASE 11 – TRANSACTION WRITE FLOW
11.1  transactionService.ts (completeSale)
11.2  IPC handler uses service.

PHASE 12 – RENDERER UNCHANGED (AUTH)
12.1  No renderer code changes required.

PHASE 13 – CONFIG VALIDATION
13.1  configValidator.ts

PHASE 14 – FALLBACK & EDGE CASES
14.1-14.3  WAL, offline, internet down.

PHASE 15 – DOCUMENTATION
15.1  Update api-principles.md
15.2  Write sync-protocol.md

CRITICAL DECISIONS (locked)
a. Local-first SQLite …
b. Outbox is single source of truth …
c. WebSocket + REST for deterministic ACK …
d. Idempotency via UUID PK everywhere.
```

---

## 2. Detailed Developer Task Board *(Epics A → I)*

> Use this section as your day-to-day checklist.  
> Each **STOP / VERIFY** is a natural pause where the app should compile and a quick sanity test can be performed.

### Legend
• **(F)** = create new file • **(M)** = modify existing file • **(R)** = refactor / move  
⭑ = compile / run checkpoint

---

### EPIC A – Workspace & Dependencies (Phase 1)

| # | Action |
|---|--------|
| **A-1 (M)** | `package.json` – add `better-sqlite3`, `@drizzle-orm/better-sqlite3`, `ws`, `uuid`; add script `"db:generate:sqlite"` |
| **A-2 (M)** | `.env.example` – add `TERMINAL_ID`, `TERMINAL_PORT`, `PEER_TERMINALS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SYNC_BACKOFF_BASE_MS` |
| **A-3 (M)** | `electron/settings.local.json` (git-ignored) – default `{ "terminalId": "L1", "terminalPort": 8123 }` |
| ⭑ **A-4 STOP / VERIFY** | `npm install` then `npm run dev`; React renderer still boots |

---

### EPIC B – Local SQLite Foundation (Phase 2 + 3.1)

| # | Action |
|---|--------|
| **B-1 (F)** | `drizzle/sqlite-schema.ts` – copy PG schema, swap `uuid → text`, add `outbox`, `inbox_processed` tables |
| **B-2 (F)** | `electron/services/localDb.ts` – open DB in `app.getPath('userData')`, enable WAL, export `db` & `withTxn()` |
| **B-3 (M)** | `electron.vite.config.ts` – mark `better-sqlite3` as external |
| ⭑ **B-4 STOP / VERIFY** | `npm run db:generate:sqlite`; ensure schema file builds, app launches |

---

### EPIC C – Employee Auth (offline first) (Phase 4 + 5)

| # | Action |
|---|--------|
| **C-1 (F)** | `electron/services/employeeService.ts` – `verifyPin`, `upsert` |
| **C-2 (M)** | `electron/ipc/handlers/auth.ts` – call `employeeService.verifyPin`, add `assertAuthenticated()` |
| **C-3 (F)** | `electron/services/seedInitialData.ts` – seed `mockEmployees` if table empty |
| **C-4 (M)** | `electron/main.ts` – invoke `seedInitialData()` inside `app.whenReady()` |
| ⭑ **C-5 STOP / VERIFY** | Launch app → in DevTools: `window.electron.auth.verifyPin('1234')` returns employee object |

---

### EPIC D – Outbox Pattern (Phase 6)

| # | Action |
|---|--------|
| **D-1 (F)** | `electron/services/messageBus.ts` – `publish(topic, payload) → id`, `markSent(id, stage)` |
| **D-2 (M)** | Add outbox helpers to `localDb.ts` |
| ⭑ **D-3 STOP / VERIFY** | Call `publish('test', {foo:1})`; check SQLite – row status `'pending'` |

---

### EPIC E – Peer-Lane Sync (Phase 7)

| # | Action |
|---|--------|
| **E-1 (F)** | `electron/services/sync/wsServer.ts` – `startPeerServer(port)` |
| **E-2 (F)** | `electron/services/sync/wsClient.ts` – `connectToPeers(urls)`; send pending outbox rows; await `{ack}` |
| **E-3 (F)** | `electron/services/sync/index.ts` – exports `startLaneSync()` |
| **E-4 (M)** | `electron/main.ts` – call `startLaneSync()`; stop on `before-quit` |
| ⭑ **E-5 STOP / VERIFY** | Run two app instances with different ports → publish msg on Lane 1 → becomes `peer_ack`; row appears in Lane 2’s `inbox_processed` |

---

### EPIC F – Cloud Sync (Phase 8)

| # | Action |
|---|--------|
| **F-1 (F)** | `electron/services/sync/cloudSync.ts` – `startCloudSync()` reads `peer_ack` rows, POSTs to Supabase Edge function |
| **F-2 (M)** | `electron/main.ts` – invoke `startCloudSync()` |
| ⭑ **F-3 STOP / VERIFY** | Point Edge URL to local http-server returning 200; rows transition to `cloud_ack` |

---

### EPIC G – Transaction Write Flow (Phase 11)

| # | Action |
|---|--------|
| **G-1 (F)** | `electron/services/transactionService.ts` – `completeSale(dto)`; insert DB rows & publish messages |
| **G-2 (F/M)** | `electron/ipc/handlers/transaction.ts` – IPC channel `transaction:complete` that calls `transactionService` after `assertAuthenticated()` |
| **G-3 (M)** | React checkout feature – wire “Complete” button to `window.electron.transaction.complete(dto)` |
| ⭑ **G-4 STOP / VERIFY** | Run sale → DB rows created; outbox rows `pending` |

---

### EPIC H – Inventory Reconciliation (Phase 9)

| # | Action |
|---|--------|
| **H-1 (F)** | `electron/services/sync/reconcile.ts` – checksum & diff |
| **H-2 (M)** | Schedule reconcile every 10 min in `sync/index.ts` |
| ⭑ **H-3 STOP / VERIFY** | Tamper inventory on Lane 2 → reconcile → counts match Lane 1 |

---

### EPIC I – Config & Hardening (Phases 10, 12–15)

| # | Action |
|---|--------|
| **I-1 (F)** | `electron/services/configValidator.ts` – validate env & unique `TERMINAL_ID` |
| **I-2 (M)** | `electron/main.ts` – execute `configValidator()` before anything else |
| **I-3 (DOC)** | Update `/ai-docs/sync-protocol.md` & `_context/api-principles.md` with Outbox-Inbox pattern |
| ⭑ **I-4 STOP / VERIFY** | Start app with bad env → app exits with readable error message |

---

## 3. Side-Effect & Risk Notes

* Native module (`better-sqlite3`) increases bundle size – ensure `external` in electron-vite.  
* If `TERMINAL_PORT` in use, wsServer should increment `+1` and log warning.  
* Add future cron to purge `outbox` rows with `cloud_ack` older than 30 days.

---

## 4. Hand-Off Instructions

1. **Work top-to-bottom.** Complete all tasks within an EPIC before moving on.  
2. **Commit after every STOP / VERIFY checkpoint** using Conventional Commits (e.g., `feat(auth): implement employeeService`).  
3. Request code review at the end of each EPIC (A → I).  
4. Do **not** change React renderer logic unless the task explicitly says so.  
5. Keep this document open—tick items as you go.

Good luck, and remember: **local commit first, sync second, cloud third.**