<chatName="Bullet-Proof POS Offline Auth + Sync Implementation Plan"/>

Below is a COMPLETE, no-gaps, step-by-step engineering plan that turns the previous high-level design into code.  
Follow every numbered action in order. Do not skip or merge steps.

────────────────────────────────────────
PHASE 0 - FOUNDATION
────────────────────────────────────────
0.1  Create git branch `feat/offline-auth‐lane-sync`.

0.2  Enable WAL on SQLite in all dev machines  
     (macOS ≥10.15 ships it on by default; nothing to install).

────────────────────────────────────────
PHASE 1 - DEPENDENCIES & CONFIG
────────────────────────────────────────
1.1  Add packages  
     npm i better-sqlite3 @drizzle-orm/better-sqlite3 ws uuid

1.2  Update `package.json` scripts  
     "preelectron": "npm run db:generate:sqlite",
     "db:generate:sqlite": "drizzle-kit generate:sqlite"

1.3  `.env.example` additions  
     TERMINAL_ID=L1
     TERMINAL_PORT=8123
     PEER_TERMINALS=ws://192.168.1.42:8123
     SUPABASE_URL=https://xxxx.supabase.co  
     SUPABASE_SERVICE_KEY=xxxxxxxx  
     SYNC_BACKOFF_BASE_MS=2000

1.4  `electron/settings.local.json`  (git-ignored)  
     { "terminalId": "L1", "terminalPort": 8123 }

────────────────────────────────────────
PHASE 2 - LOCAL SQLITE SCHEMA
────────────────────────────────────────
2.1  Duplicate Postgres schema → `drizzle/sqlite-schema.ts`
     • Run `drizzle-kit` with SQLite driver.  
     • Remove Postgres-only types (uuid stays as TEXT).  
     • Add new tables:

     a. outbox  
        id TEXT PK, type TEXT, payload JSON, status TEXT, retries INT, createdAt DATETIME
     b. inbox_processed  
        id TEXT PK, createdAt DATETIME

     b.1  Outbox status enum: 'pending' | 'sent' | 'peer_ack' | 'cloud_ack' | 'error'

2.2  Commit generated file; NEVER edit manually.

────────────────────────────────────────
PHASE 3 - DATABASE SERVICE
────────────────────────────────────────
3.1  NEW  `electron/services/localDb.ts`
     • Opens `app.getPath('userData') + /pos.sqlite`  
     • Enables WAL (`PRAGMA journal_mode = WAL`)  
     • Exports:
       - db: Drizzle<typeof schema>  
       - withTxn<T>(fn: (tx) => T): Promise<T>

3.2  Ensure migrations run on first open  
     call `db.run(sql)` per generated migration list.

────────────────────────────────────────
PHASE 4 - EMPLOYEE MODULE
────────────────────────────────────────
4.1  NEW  `electron/services/employeeService.ts`
     ```ts
     export async function verifyPin(pin: string): Promise<Employee | null>
     export async function upsert(employees: Employee[]): Promise<void>
     ```
     • `verifyPin` hashes plain PIN with bcrypt.compareSync against stored hash.  
     • Throws `EMPLOYEE_INACTIVE` if `isActive = false`.

4.2  Insert mock employees on first launch  
     if `select count(*) from employees` === 0 → insert `mockEmployees` (already in context).

────────────────────────────────────────
PHASE 5 - AUTH IPC
────────────────────────────────────────
5.1  MODIFY  `electron/ipc/handlers/auth.ts`

     Replace demo handler with:
     ```ts
     ipcMain.handle('auth:verify-pin', async (_, pin) => {
       const emp = await employeeService.verifyPin(pin)
       if (!emp) return null
       currentEmployee = emp
       return { id: emp.id, firstName: emp.firstName, lastName: emp.lastName }
     })
     ```

5.2  Add IMPERATIVE guard util  
     `assertAuthenticated()` throws if `currentEmployee == null`.  
     Use in every transactional IPC handler.

────────────────────────────────────────
PHASE 6 - OUTBOX PUBLISHER
────────────────────────────────────────
6.1  NEW  `electron/services/messageBus.ts`
     • Function `publish(topic: string, payload: unknown): Promise<void>`  
       - INSERT row into outbox with UUID, status = 'pending'.  
       - Call in same SQLite transaction that modifies business tables.

6.2  Function `markSent(id: string, peer?: 'lane'|'cloud'): Promise<void>`  
     • Updates status accordingly.

────────────────────────────────────────
PHASE 7 - PEER-LANE WEBSOCKET SYNC
────────────────────────────────────────
7.1  NEW  `electron/services/sync/wsServer.ts`
     • Starts WebSocket server on `TERMINAL_PORT`.  
     • On message: UPSERT payload in local DB inside a tx; INSERT `inbox_processed` row; reply `{"ack": <uuid>}`.

7.2  NEW  `electron/services/sync/wsClient.ts`
     • Connects to every URI in `PEER_TERMINALS`.  
     • Reads `outbox` rows with `status='pending'` every 200 ms.  
     • Sends JSON:
       { id, topic, payload, origin, ts }  
     • On `{ack}` mark row `'peer_ack'`.

7.3  Retry logic  
     • If no ack in BACKOFF (exponential: base from env) → resend, increment retries.  
     • After 10 retries mark `'error'` and keep moving; nightly reconciliation will fix.

7.4  NEW  `electron/services/sync/index.ts`
     ```ts
     export function startLaneSync(): SyncHandle
     interface SyncHandle { stop(): void }
     ```

────────────────────────────────────────
PHASE 8 - SUPABASE CLOUD SYNC
────────────────────────────────────────
8.1  NEW  `electron/services/sync/cloudSync.ts`
     • Poll outbox rows where `status='peer_ack'`.  
     • For each topic:

       a. transaction:new → POST to edge function `/ingest/transaction`  
       b. inventory:update → `/ingest/inventory`  
       c. employee:upsert → `/ingest/employee`

     • 200 OK → `status='cloud_ack'`  
     • Non-200 → leave as is; retries apply same BACKOFF.

8.2  Function `startCloudSync(): SyncHandle`.

────────────────────────────────────────
PHASE 9 - RECONCILIATION
────────────────────────────────────────
9.1  NEW  nightly job `electron/services/sync/reconcile.ts`
     • `compareChecksums()` : each lane calculates
       SELECT count(*), sum(changeAmount) FROM inventory_changes  
     • Exchange over WebSocket special topic `inventory:checksum`.  
     • If mismatch → request `inventory_changes` rows by id > LAST_TS.

9.2  `startLaneSync()` schedules `setInterval(reconcile, 600000)`.

────────────────────────────────────────
PHASE 10 - MAIN PROCESS BOOTSTRAP
────────────────────────────────────────
10.1  MODIFY  `electron/main.ts`

     ```ts
     import { startLaneSync } from './services/sync'
     import { startCloudSync } from './services/sync/cloudSync'
     let laneSync: SyncHandle, cloudSync: SyncHandle

     app.whenReady().then(() => {
       setupAuthHandlers()
       laneSync = startLaneSync()
       cloudSync = startCloudSync()
       createWindow()
     })

     app.on('before-quit', () => {
       laneSync.stop()
       cloudSync.stop()
     })
     ```

────────────────────────────────────────
PHASE 11 - TRANSACTION WRITE FLOW
────────────────────────────────────────
11.1  NEW  `electron/services/transactionService.ts`
     ```ts
     export async function completeSale(dto: CompleteSaleDTO): Promise<void>
     ```
     Steps inside `withTxn`:
       1. Insert `transactions`, `transaction_items`, `inventory_changes`.
       2. `publish('transaction:new', { ...dto, id })`
       3. For each inventory deduction `publish('inventory:update', {productId, change})`

11.2  UPDATE  any existing IPC handler that processes checkout completion to call the service.

────────────────────────────────────────
PHASE 12 - RENDERER UNCHANGED (AUTH)
────────────────────────────────────────
12.1  No code modifications required in `src/features/auth/**` or stores; they already call IPC.

────────────────────────────────────────
PHASE 13 - CONFIG VALIDATION ON BOOT
────────────────────────────────────────
13.1  NEW  `electron/services/configValidator.ts`
     • Verifies `TERMINAL_ID` uniqueness (not 'UNSET').  
     • Verifies `.env` required keys; throw on missing to prevent corrupt sync.

────────────────────────────────────────
PHASE 14 - FALLBACK & EDGE CASES
────────────────────────────────────────
14.1  Power failure mid-commit handled by SQLite WAL (automatic).  
14.2  Peer lane offline → rows stay `pending` until socket reconnects.  
14.3  Internet offline → rows stay `'peer_ack'`, retried indefinitely.
14.4 nightly backup to a third party service 

────────────────────────────────────────
PHASE 15 - DOCUMENTATION
────────────────────────────────────────
15.1  Update `_context/api-principles.md` with Outbox-Inbox pattern.  
15.2  Create `/ai-docs/sync-protocol.md` describing JSON envelope, ack rules, retry constants.

────────────────────────────────────────
POTENTIAL SIDE-EFFECTS & MITIGATIONS
────────────────────────────────────────
• Native `better-sqlite3` module increases app size → ensure electron-vite “external” config includes it.  
• Port collisions → expose `terminalPort` in settings & fallback to +1 if `EADDRINUSE`.  
• Large outbox growth if cloud offline for days → background task deletes rows where `status='cloud_ack' AND age>30d`.

────────────────────────────────────────
CRITICAL ARCHITECTURAL DECISIONS (locked)
────────────────────────────────────────
a. Local-first SQLite per lane (immutable).  
b. Outbox table is single source of replication truth.  
c. WebSocket + REST (Supabase Edge Function) chosen for deterministic ACK semantics; webhooks rejected.  
d. Idempotency via UUID PK on every business row and message.

Follow EXACTLY the 15 phases above and your POS will:  
• Log in employees in <100 ms offline.  
• Never lose a sale (ACID local commit).  
• Keep both lanes’ inventory & employees in eventual (sub-second) sync.  
• Seamlessly push to Supabase when the Internet returns—without touching the renderer code.



<chatName="Early-Auth_vs_Local_Data_Decisions"/>

Below is a focused add-on plan that answers all of your questions while extending the previously-approved lane-sync architecture.  
It is intentionally exhaustive and split into three sections:

A. Should we add PIN auth now?  
B. Where do products / discounts / business settings live?  
C. Granular implementation tasks to integrate those data domains into the same local-first, synced design.

────────────────────────────────────────
A. Timing – is it “too early” for auth?
────────────────────────────────────────
• No. Authentication touches virtually every IPC handler (each must assert an employee session) and will shape the UX navigation tree.  
• Bringing it in now eliminates later rewrites of transaction code, price overrides, discount approvals, etc.  
• The cost is low because the auth slice is self-contained (store + IPC handler) and already partially scaffolded.

***Decision:*** Go ahead and merge the PIN login work **before** adding more checkout or discount logic.

────────────────────────────────────────
B. Local database scope & security
────────────────────────────────────────
1. Data to persist locally TODAY  
   • employees (already covered)  
   • products (read-only cache)  
   • product_barcodes  
   • inventory  
   • discount rules (case, item, order)  
   • pos_config (tax rate, loyalty points, etc.)  
   • everything needed to complete a sale offline

2. Why not keep “business settings elsewhere”?  
   • POS must operate during WAN outages; therefore tax rate, discount thresholds, etc. must be available locally.  
   • We still receive authoritative updates from Supabase; the **outbox / inbox** pattern guarantees eventual consistency.

3. Security of the SQLite file  
   • File lives under `app.getPath('userData')` (macOS = `~/Library/Application Support/euphoria-pos`).  
   • macOS sandbox + default file permissions make it readable/writable only by the current user account running Electron.  
   • Sensitive values (Supabase service key, Stripe secret) are **NOT** stored in SQLite.  They stay in the OS keychain (Keytar helper) or `.env`.  
   • Optional: turn on SQLCipher (AES-256 at rest). Adds one build flag; defer until payment integration phase.

4. Future separation of concerns  
   • Long-lived secret credentials → OS Keychain  
   • Short-lived session tokens → memory only  
   • Business knobs (tax rate, loyalty multiplier) → `pos_config` table (synced)  
   • Highly sensitive data (card tokens) → never stored; only streamed to payment SDK

────────────────────────────────────────
C. Step-by-Step Extension Plan
────────────────────────────────────────
(Only the delta compared to the 15-phase plan.  Follow those steps first, then execute the items below.)

C-1  Schema Extension  
• File: `drizzle/sqlite-schema.ts` (regenerate)  
  a. Ensure the following existing Postgres tables are included:  
     - products, product_barcodes, inventory  
  b. Add new tables if not already present:  
     1) discount_rules  
        • id TEXT PK  
        • scope TEXT  -- 'item' | 'order' | 'case'  
        • category TEXT NULL  
        • size TEXT NULL  
        • percent NUMERIC(5,2)  
        • fixedAmount NUMERIC(10,2)  
        • employeeApprovalRequired BOOLEAN  
        • isActive BOOLEAN  
        • updatedAt DATETIME  
     2) pos_config (already defined in Postgres schema)  
        • key TEXT PK  
        • value JSON  
        • updatedAt DATETIME

C-2  Local seed scripts  
• File: `electron/services/seedInitialData.ts` (NEW)  
  – On first launch, populate `pos_config` with defaults:  
      {key:'tax_rate', value:{percent:8.0}}  
      {key:'loyalty_points_per_dollar', value:1}  
      {key:'terminal_sequence', value:0}  
  – Insert an empty row into `discount_rules` so UI shows something.

C-3  Product cache loader  
• File: `electron/services/productSyncService.ts` (NEW)  
  Exports:  
  ```ts
  export async function refreshProductsFromCloud(): Promise<void>
  ```  
  Steps:  
  1. Call Supabase Edge Function `/pull/products?since=<lastUpdated>`  
  2. UPSERT into `products`, `product_barcodes`, `inventory`, `discount_rules`, `pos_config` in a single SQLite tx.  
  3. Publish `product:bulk_upsert` message (so peer lane updates too).

C-4  Sync message set additions  
• Update `electron/services/sync/messageTypes.ts`  
  Add:  
  - 'product:upsert'  
  - 'discount_rule:upsert'  
  - 'pos_config:update'

• Update WebSocket server/client switch statements to route new types to UPSERT handlers.  
  (Exact file sections: `wsServer.on('message', ...)` and `wsClient.sendPending()`.)

C-5  Discount rule access in renderer  
• File: `src/features/checkout/store/checkout.store.ts` (MODIFY)  
  Add selector  
  ```ts
  export const useDiscountRules = () => useCheckoutStore(s => s.discountRules)
  ```  
  Add slice field `discountRules: DiscountRule[]` populated via IPC:  
  ```ts
  const rules = await window.electron.database.getDiscountRules()
  set({ discountRules: rules })
  ```

• Preload addition (`electron/preload.ts`)  
  ```ts
  database: {
     ...,
     getDiscountRules: () => ipcRenderer.invoke('db:get-discount-rules'),
  }
  ```

• IPC handler (`electron/ipc/handlers/database.ts`)  
  ```ts
  ipcMain.handle('db:get-discount-rules', () => db.select().from(discountRules).where(eq(isActive,true)))
  ```

C-6  Secure config reader  
• File: `electron/services/configService.ts` (NEW)  
  ```ts
  export async function getConfig<T = unknown>(key: string): Promise<T>
  export async function setConfig<T>(key: string, value: T): Promise<void>
  ```  
  Internally implements SQLite CRUD + `publish('pos_config:update', {key,value})`

  Renderer helper (for read-only values like tax):  
  ```ts
  window.electron.config.get('tax_rate')  // exposed via preload
  ```

C-7  Access control for sensitive config  
• Modify `getConfig/setConfig` to check currentEmployee.isManager if `key` is in a protected allow-list (tax_rate, loyalty_points…).  
  Throw `FORBIDDEN` otherwise.

C-8  Outbox topic list in codebase rules  
• File: `_rules/codebase-rules.md`  
  Add bullet under “Common IPC channels”:  
  - `config:*` – Terminal/business configuration

C-9  Security hardening checklist  
• File: `electron/services/localDb.ts`  
  Add comment and code toggle:  
  ```ts
  if (process.env.SQLCIPHER_PASSPHRASE) {
      db.exec(`PRAGMA key='${process.env.SQLCIPHER_PASSPHRASE}';`)
  }
  ```  
  (Do not implement SQLCipher now; hook is placeholder.)

• Information leakage audit  
  – Search for `console.log` that dumps entire employee or config objects; strip or red-level guard in production.

C-10  Documentation updates  
• `ai-docs/sync-protocol.md` – add new message types.  
• `ai-docs/offline-data-model.md` – ERD of local SQLite, explain why tax/discount live there.

────────────────────────────────────────
Potential Pitfalls & Mitigations
────────────────────────────────────────
• Schema drift between SQLite and Supabase Postgres  
  – Drizzle generates both; run `db:generate:sqlite` and `db:generate:pg` in CI to detect drift.  
• Large product catalog (>50k SKUs)  
  – Use SQLite indexes on `barcode`, `sku`, `name`.  
• Rogue discount rule sync overwriting manual local edits  
  – Conflict rule: cloud wins except when `updatedAt` in SQLite > cloud timestamp → keep local (marked `needs_review`).




<chatName="User Stories – Offline Auth, Local DB & Lane Sync"/>

The following user stories are framed in the classic “As a …, I want …, so that …” format.  They should give the implementation agent clear, contextual goals covering authentication, local-first storage, peer-to-peer lane synchronisation, cloud back-sync, and configuration security.

1. Cashier Login – Happy Path  
   • As a cashier, I want to enter my 4-digit PIN and be logged-in in under ½ second, so that I can start scanning items without waiting for the internet or another lane.

2. Cashier Login – Invalid PIN  
   • As a cashier, I want the system to reject an incorrect PIN immediately and show an error, so that I know to re-enter it or call a manager.

3. Cashier Login – Offline Mode  
   • As a cashier, I want to log in even when the store’s internet is down, so that sales can continue uninterrupted during an outage.

4. Manager Adds New Employee  
   • As a manager, I want to add or edit an employee record (name, PIN, permissions) on Lane 1 and have it usable on Lane 2 within 5 seconds, so that staffing changes do not block checkout.

5. Transaction Commit – Local First  
   • As the system, I must write a completed sale to the local SQLite database before attempting any network calls, so that a power or network failure cannot lose the transaction.

6. Lane-to-Lane Sync  
   • As the system, I want every inventory deduction, transaction, and employee update created on one terminal to be mirrored to the other terminal within 5 seconds, so that both lanes always show accurate stock and permissions.

7. At-Least-Once Delivery  
   • As the system, I need to retry any unacknowledged message to the peer lane until it is confirmed, so that no inventory or transaction data is ever skipped due to packet loss.

8. Outbox Durability  
   • As the system, I must persist every outbound sync message in an outbox table inside the same SQLite transaction as the business data change, so that a crash mid-sync never loses a message.

9. Cloud Back-Sync  
   • As the system, I want to push each transaction and inventory change to Supabase and keep retrying until the cloud confirms receipt, so that central reporting is eventually consistent even after long outages.

10. Cloud-to-Lane Updates  
    • As a manager using the cloud dashboard, I want price or discount changes I make to appear on both lanes within 2 minutes, so that pricing is consistent across channels.

11. Product Catalogue Cache  
    • As a cashier, I want every product and barcode to be instantly searchable locally, so scanning or manual search never stalls due to a slow network lookup.

12. Configuration Security  
    • As an owner, I want sensitive keys (payment gateway secrets, Supabase service key) stored outside the SQLite file in the OS keychain, so that copying the database alone does not expose credentials.

13. Manager-Only Settings  
    • As the system, I must prevent non-manager employees from altering tax rate, discounts, or loyalty settings, so that critical business rules remain protected.

14. Inventory Reconciliation  
    • As the system, I need a scheduled checksum comparison between lanes and with the cloud, so that any rare divergence can be detected and healed automatically.

15. Crash-Recovery Guarantee  
    • As a cashier, I want the transaction I just finished to reappear in the sales history after the terminal reboots unexpectedly, so that I can reassure the customer their purchase was recorded.

16. Outbox Growth Control  
    • As the system administrator, I want outbox rows that are fully acknowledged by both peer lane and cloud and older than 30 days to be purged, so that the local database remains small and fast.

17. Future Encryption Toggle  
    • As the owner, I want an option to enable full-database encryption (SQLCipher) without changing the cashier workflow, so that we can meet higher security requirements when handling payment tokens later.

18. Diagnostics UI  
    • As a support technician, I want a hidden diagnostics screen that shows outbox backlog, last peer sync time, and cloud sync status, so that I can quickly determine if a lane is healthy.

19. Soft-Conflict Resolution  
    • As the system, when the same product’s inventory is updated differently on two lanes before they reconnect, I need to apply both changes in timestamp order and flag any negative stock for manager review, so that data remains consistent without silent loss.

20. Install-and-Run Simplicity  
    • As an IT installer, I want to deploy the POS by copying the app bundle to a Mac Mini and launching it—no separate database or services—so that store setup takes minutes, not hours.

These stories give the implementation agent concrete functional, reliability, and security targets to drive the coding tasks outlined in the previous architectural plan.