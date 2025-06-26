import { app, ipcMain, BrowserWindow } from "electron";
import { join } from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "fs";
import { sqliteTable, integer, real, text, index } from "drizzle-orm/sqlite-core";
import { relations, eq, or, like, and, sql, desc, gte, lt } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { ulid } from "ulid";
import bcrypt from "bcryptjs";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const PRODUCT_CATEGORIES = ["wine", "liquor", "beer", "other"];
const PRODUCT_SIZES = ["750ml", "1L", "1.5L", "1.75L", "other"];
const EMPLOYEE_ROLES = ["cashier", "manager", "owner"];
const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  // ULID instead of UUID
  sku: text("sku", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  // wine, liquor, beer, other
  size: text("size").notNull(),
  // 750ml, 1L, 1.5L, 1.75L, other
  cost: real("cost").notNull(),
  retailPrice: real("retail_price").notNull(),
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: text("parent_product_id").references(() => products.id),
  unitsInParent: integer("units_in_parent").default(1),
  // e.g., 4 for a 4-pack
  // Loyalty configuration
  loyaltyPointMultiplier: real("loyalty_point_multiplier").default(1),
  // 2.0 for double points
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  skuIdx: index("products_sku_idx").on(table.sku),
  categoryIdx: index("products_category_idx").on(table.category)
}));
const productBarcodes = sqliteTable("product_barcodes", {
  id: text("id").primaryKey(),
  // ULID
  productId: text("product_id").references(() => products.id).notNull(),
  barcode: text("barcode", { length: 50 }).notNull().unique(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  barcodeIdx: index("product_barcodes_barcode_idx").on(table.barcode)
}));
const inventory = sqliteTable("inventory", {
  productId: text("product_id").references(() => products.id).primaryKey(),
  currentStock: integer("current_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  // For held orders
  lastUpdated: integer("last_updated", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" })
  // For multi-lane sync tracking
});
const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  // ULID
  employeeCode: text("employee_code", { length: 20 }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  pin: text("pin", { length: 60 }).notNull(),
  // Hashed PIN
  role: text("role").notNull().default("cashier"),
  // cashier, manager, owner
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  employeeCodeIdx: index("employees_code_idx").on(table.employeeCode)
}));
const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id]
  })
}));
const productBarcodesRelations = relations(productBarcodes, ({ one }) => ({
  product: one(products, {
    fields: [productBarcodes.productId],
    references: [products.id]
  })
}));
const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id]
  })
}));
const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  // ULID
  transactionNumber: text("transaction_number", { length: 20 }).notNull().unique(),
  customerId: text("customer_id"),
  // Optional customer reference
  employeeId: text("employee_id").references(() => employees.id).notNull(),
  // WHO processed the sale
  subtotal: real("subtotal").notNull(),
  taxAmount: real("tax_amount").notNull(),
  totalAmount: real("total_amount").notNull(),
  status: text("status").notNull().default("completed"),
  // completed, voided, refunded
  salesChannel: text("sales_channel").notNull().default("pos"),
  // pos, doordash, grubhub, employee
  // Payment information (simplified for now)
  paymentMethod: text("payment_method").notNull(),
  // cash, card, split
  amountPaid: real("amount_paid").notNull(),
  changeGiven: real("change_given").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  voidedAt: integer("voided_at", { mode: "timestamp" }),
  voidedBy: text("voided_by").references(() => employees.id)
}, (table) => ({
  transactionNumberIdx: index("transactions_number_idx").on(table.transactionNumber),
  employeeIdx: index("transactions_employee_idx").on(table.employeeId),
  statusIdx: index("transactions_status_idx").on(table.status),
  createdAtIdx: index("transactions_created_at_idx").on(table.createdAt)
}));
const transactionItems = sqliteTable("transaction_items", {
  id: text("id").primaryKey(),
  // ULID
  transactionId: text("transaction_id").references(() => transactions.id).notNull(),
  productId: text("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  // Price at time of sale
  totalPrice: real("total_price").notNull(),
  // quantity * unitPrice
  // Case discount information
  caseDiscountApplied: integer("case_discount_applied", { mode: "boolean" }).default(false),
  discountAmount: real("discount_amount").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  transactionIdx: index("transaction_items_transaction_idx").on(table.transactionId),
  productIdx: index("transaction_items_product_idx").on(table.productId)
}));
const transactionsRelations = relations(transactions, ({ one, many }) => ({
  employee: one(employees, {
    fields: [transactions.employeeId],
    references: [employees.id]
  }),
  voidedByEmployee: one(employees, {
    fields: [transactions.voidedBy],
    references: [employees.id]
  }),
  items: many(transactionItems)
}));
const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id]
  }),
  product: one(products, {
    fields: [transactionItems.productId],
    references: [products.id]
  })
}));
const employeesRelations = relations(employees, ({ many }) => ({
  transactions: many(transactions),
  voidedTransactions: many(transactions, {
    relationName: "voidedBy"
  })
}));
const syncQueue = sqliteTable("sync_queue", {
  id: text("id").primaryKey(),
  // ULID
  operation: text("operation").notNull(),
  // 'upload_transaction', 'update_inventory', etc.
  entityType: text("entity_type").notNull(),
  // 'transaction', 'inventory', 'product'
  entityId: text("entity_id").notNull(),
  // ID of the entity being synced
  payload: text("payload").notNull(),
  // JSON string of data to sync
  priority: integer("priority").notNull().default(5),
  // 1-10, lower = higher priority
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(5),
  status: text("status").notNull().default("pending"),
  // pending, processing, completed, failed
  error: text("error"),
  // Error message if failed
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  processedAt: integer("processed_at", { mode: "timestamp" })
}, (table) => ({
  statusIdx: index("sync_queue_status_idx").on(table.status),
  priorityIdx: index("sync_queue_priority_idx").on(table.priority, table.scheduledFor),
  entityIdx: index("sync_queue_entity_idx").on(table.entityType, table.entityId)
}));
const syncStatus = sqliteTable("sync_status", {
  id: text("id").primaryKey(),
  // Always 'main' - single row table
  lastTransactionSync: integer("last_transaction_sync", { mode: "timestamp" }),
  lastInventorySync: integer("last_inventory_sync", { mode: "timestamp" }),
  lastMasterDataSync: integer("last_master_data_sync", { mode: "timestamp" }),
  pendingTransactionCount: integer("pending_transaction_count").notNull().default(0),
  pendingInventoryCount: integer("pending_inventory_count").notNull().default(0),
  queueDepth: integer("queue_depth").notNull().default(0),
  isOnline: integer("is_online", { mode: "boolean" }).default(false),
  lastHeartbeat: integer("last_heartbeat", { mode: "timestamp" }),
  terminalId: text("terminal_id").notNull(),
  // This terminal's ID
  syncErrors: text("sync_errors"),
  // JSON array of recent errors
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
const transactionQueue = sqliteTable("transaction_queue", {
  id: text("id").primaryKey(),
  // ULID
  transactionId: text("transaction_id").notNull(),
  // References transaction
  status: text("status").notNull().default("pending"),
  // pending, uploading, uploaded, failed
  uploadAttempts: integer("upload_attempts").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" })
}, (table) => ({
  statusIdx: index("transaction_queue_status_idx").on(table.status),
  transactionIdx: index("transaction_queue_transaction_idx").on(table.transactionId)
}));
const masterDataVersions = sqliteTable("master_data_versions", {
  dataType: text("data_type").primaryKey(),
  // 'products', 'employees', 'customers'
  version: integer("version").notNull().default(0),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  recordCount: integer("record_count").notNull().default(0),
  checksum: text("checksum")
  // Hash of data for integrity checking
});
const syncQueueRelations = relations(syncQueue, ({ one }) => ({
  // Could add relations to products/transactions if needed
}));
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  EMPLOYEE_ROLES,
  PRODUCT_CATEGORIES,
  PRODUCT_SIZES,
  employees,
  employeesRelations,
  inventory,
  inventoryRelations,
  masterDataVersions,
  productBarcodes,
  productBarcodesRelations,
  products,
  productsRelations,
  syncQueue,
  syncQueueRelations,
  syncStatus,
  transactionItems,
  transactionItemsRelations,
  transactionQueue,
  transactions,
  transactionsRelations
}, Symbol.toStringTag, { value: "Module" }));
let db = null;
let sqliteDb = null;
function getAppDataPath() {
  const userDataPath = app.getPath("userData");
  const dbDir = join(userDataPath, "database");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  return dbDir;
}
function getDatabasePath() {
  const dbDir = getAppDataPath();
  return join(dbDir, "euphoria-pos.db");
}
function initializeDatabase(options = {}) {
  const dbPath = options.databasePath || getDatabasePath();
  console.log(`Initializing SQLite database at: ${dbPath}`);
  try {
    sqliteDb = new Database(dbPath, {
      verbose: process.env.NODE_ENV === "development" ? console.log : void 0,
      fileMustExist: false
    });
    sqliteDb.pragma("journal_mode = WAL");
    sqliteDb.pragma("foreign_keys = ON");
    sqliteDb.pragma("synchronous = NORMAL");
    sqliteDb.pragma("cache_size = -64000");
    sqliteDb.pragma("temp_store = MEMORY");
    sqliteDb.pragma("busy_timeout = 5000");
    if (options.enableEncryption && options.encryptionKey) {
      try {
        sqliteDb.pragma(`key = '${options.encryptionKey}'`);
        console.log("Database encryption enabled");
      } catch (error) {
        console.warn("Database encryption failed - continuing without encryption:", error);
      }
    }
    db = drizzle(sqliteDb, {
      schema,
      logger: process.env.NODE_ENV === "development"
    });
    console.log("SQLite database initialized successfully");
    return db;
  } catch (error) {
    console.error("Failed to initialize SQLite database:", error);
    throw error;
  }
}
async function runMigrations() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  try {
    console.log("Running database migrations...");
    await migrate(db, {
      migrationsFolder: join(process.cwd(), "drizzle/migrations")
    });
    console.log("Database migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}
function closeDatabase() {
  try {
    if (sqliteDb) {
      sqliteDb.close();
      sqliteDb = null;
      db = null;
      console.log("Database connection closed");
    }
  } catch (error) {
    console.error("Error closing database:", error);
  }
}
function checkDatabaseHealth() {
  try {
    if (!sqliteDb) {
      return {
        isConnected: false,
        version: null,
        walMode: false,
        foreignKeys: false,
        error: "Database not initialized"
      };
    }
    const version = sqliteDb.prepare("SELECT sqlite_version()").get();
    const walMode = sqliteDb.prepare("PRAGMA journal_mode").get();
    const foreignKeys = sqliteDb.prepare("PRAGMA foreign_keys").get();
    return {
      isConnected: true,
      version: version["sqlite_version()"],
      walMode: walMode.journal_mode === "wal",
      foreignKeys: foreignKeys.foreign_keys === 1
    };
  } catch (error) {
    return {
      isConnected: false,
      version: null,
      walMode: false,
      foreignKeys: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
async function initializeSyncStatus(terminalId) {
  const database = getDatabase();
  try {
    const existing = await database.select().from(syncStatus).where(eq(syncStatus.id, "main")).limit(1);
    if (existing.length === 0) {
      await database.insert(syncStatus).values({
        id: "main",
        terminalId,
        pendingTransactionCount: 0,
        pendingInventoryCount: 0,
        queueDepth: 0,
        isOnline: false,
        updatedAt: /* @__PURE__ */ new Date()
      });
      console.log(`Initialized sync status for terminal: ${terminalId}`);
    }
  } catch (error) {
    console.error("Failed to initialize sync status:", error);
    throw error;
  }
}
function createBackup(backupPath) {
  if (!sqliteDb) {
    throw new Error("Database not initialized");
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const defaultBackupPath = join(getAppDataPath(), `backup-${timestamp}.db`);
  const finalBackupPath = backupPath || defaultBackupPath;
  try {
    sqliteDb.backup(finalBackupPath);
    console.log(`Database backup created: ${finalBackupPath}`);
    return finalBackupPath;
  } catch (error) {
    console.error("Failed to create database backup:", error);
    throw error;
  }
}
let supabase = null;
let realtimeSubscriptions = /* @__PURE__ */ new Map();
function initializeSupabase(config) {
  try {
    console.log("Initializing Supabase client...");
    supabase = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: config.options?.auth?.autoRefreshToken ?? true,
        persistSession: config.options?.auth?.persistSession ?? false,
        // No persistent sessions for POS
        detectSessionInUrl: false
      },
      realtime: {
        heartbeatIntervalMs: config.options?.realtime?.heartbeatIntervalMs ?? 3e4,
        reconnectAfterMs: config.options?.realtime?.reconnectAfterMs ?? 1e3
      }
    });
    console.log("Supabase client initialized successfully");
    return supabase;
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    throw error;
  }
}
function getSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase client not initialized. Call initializeSupabase() first.");
  }
  return supabase;
}
async function testConnection() {
  try {
    if (!supabase) {
      return {
        isConnected: false,
        isAuthenticated: false,
        error: "Supabase client not initialized"
      };
    }
    const { data, error } = await supabase.from("products").select("count").limit(1);
    if (error) {
      return {
        isConnected: false,
        isAuthenticated: false,
        error: error.message
      };
    }
    const { data: { user } } = await supabase.auth.getUser();
    return {
      isConnected: true,
      isAuthenticated: !!user,
      error: void 0
    };
  } catch (error) {
    return {
      isConnected: false,
      isAuthenticated: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
async function updateTerminalStatus(status) {
  const client = getSupabaseClient();
  try {
    const { error } = await client.from("terminal_sync_status").upsert({
      ...status,
      last_heartbeat: (/* @__PURE__ */ new Date()).toISOString()
    }, {
      onConflict: "terminal_id"
    });
    if (error) {
      throw new Error(`Failed to update terminal status: ${error.message}`);
    }
  } catch (error) {
    console.error("Failed to update terminal status:", error);
    throw error;
  }
}
async function unsubscribeFromAllUpdates() {
  try {
    for (const [name, channel] of realtimeSubscriptions) {
      await channel.unsubscribe();
      console.log(`Unsubscribed from ${name}`);
    }
    realtimeSubscriptions.clear();
    console.log("All real-time subscriptions cleared");
  } catch (error) {
    console.error("Failed to unsubscribe from real-time updates:", error);
  }
}
async function closeSupabaseConnection() {
  try {
    await unsubscribeFromAllUpdates();
    supabase = null;
    console.log("Supabase connection closed");
  } catch (error) {
    console.error("Error closing Supabase connection:", error);
  }
}
let connections = null;
async function initializeDatabases(config) {
  try {
    console.log("Initializing database connections...");
    console.log("Setting up local SQLite database...");
    const localDb = initializeDatabase({
      databasePath: config.sqlite.databasePath,
      enableEncryption: config.sqlite.enableEncryption,
      encryptionKey: config.sqlite.encryptionKey
    });
    await runMigrations();
    await initializeSyncStatus(config.terminalId);
    console.log("Setting up Supabase cloud connection...");
    const cloudClient = initializeSupabase({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      options: config.supabase.options
    });
    const localHealth = checkDatabaseHealth();
    const cloudHealth = await testConnection();
    if (!localHealth.isConnected) {
      throw new Error(`Local database connection failed: ${localHealth.error}`);
    }
    if (!cloudHealth.isConnected) {
      console.warn(`Cloud database connection failed: ${cloudHealth.error}`);
    }
    connections = {
      local: localDb,
      cloud: cloudClient,
      isInitialized: true
    };
    if (cloudHealth.isConnected) {
      try {
        await updateTerminalStatus({
          terminal_id: config.terminalId,
          status: "online",
          pending_transaction_count: 0,
          last_heartbeat: (/* @__PURE__ */ new Date()).toISOString()
        });
        console.log("Terminal status updated in cloud");
      } catch (error) {
        console.warn("Failed to update terminal status:", error);
      }
    }
    console.log("Database connections initialized successfully");
    console.log(`Local SQLite: ${localHealth.isConnected ? "✓" : "✗"} (version: ${localHealth.version})`);
    console.log(`Cloud Supabase: ${cloudHealth.isConnected ? "✓" : "✗"}`);
    return connections;
  } catch (error) {
    console.error("Failed to initialize databases:", error);
    throw error;
  }
}
function getDatabaseConnections() {
  if (!connections || !connections.isInitialized) {
    throw new Error("Databases not initialized. Call initializeDatabases() first.");
  }
  return connections;
}
function getLocalDatabase() {
  const { local } = getDatabaseConnections();
  return local;
}
async function checkAllDatabaseHealth() {
  const localHealth = checkDatabaseHealth();
  const cloudHealth = await testConnection();
  const issues = [];
  if (!localHealth.isConnected) {
    issues.push(`Local database: ${localHealth.error}`);
  }
  if (!cloudHealth.isConnected) {
    issues.push(`Cloud database: ${cloudHealth.error}`);
  }
  const canOperateOffline = localHealth.isConnected;
  const isHealthy = localHealth.isConnected && cloudHealth.isConnected;
  return {
    local: localHealth,
    cloud: cloudHealth,
    overall: {
      isHealthy,
      canOperateOffline,
      issues
    }
  };
}
function createDatabaseBackup(backupPath) {
  return createBackup(backupPath);
}
async function closeDatabaseConnections() {
  try {
    console.log("Closing database connections...");
    await closeSupabaseConnection();
    closeDatabase();
    connections = null;
    console.log("All database connections closed successfully");
  } catch (error) {
    console.error("Error closing database connections:", error);
    throw error;
  }
}
function setupDatabaseShutdownHandlers() {
  const cleanup = async () => {
    try {
      await closeDatabaseConnections();
    } catch (error) {
      console.error("Error during database cleanup:", error);
    }
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("beforeExit", cleanup);
  try {
    const { app: app2 } = require2("electron");
    if (app2) {
      app2.on("before-quit", cleanup);
      app2.on("window-all-closed", cleanup);
    }
  } catch {
  }
}
function setupDatabaseHandlers() {
  ipcMain.handle("db:health-check", async () => {
    try {
      return await checkAllDatabaseHealth();
    } catch (error) {
      console.error("Database health check failed:", error);
      return {
        local: { isConnected: false, error: "Failed to check local database" },
        cloud: { isConnected: false, error: "Failed to check cloud database" },
        overall: { isHealthy: false, canOperateOffline: false, issues: ["Health check failed"] }
      };
    }
  });
  ipcMain.handle("db:create-backup", async (_event, backupPath) => {
    try {
      return createDatabaseBackup(backupPath);
    } catch (error) {
      console.error("Failed to create backup:", error);
      throw error;
    }
  });
  ipcMain.handle("db:search-products", async (_event, query, options = {}) => {
    try {
      const db2 = getLocalDatabase();
      const { limit = 50, includeInactive = false, category } = options;
      let queryBuilder = db2.select().from(products);
      const conditions = [];
      if (!includeInactive) {
        conditions.push(eq(products.isActive, true));
      }
      if (category) {
        conditions.push(eq(products.category, category));
      }
      if (query.trim()) {
        const searchTerm = `%${query.toLowerCase()}%`;
        conditions.push(
          or(
            like(products.name, searchTerm),
            like(products.sku, searchTerm)
          )
        );
      }
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions));
      }
      const results = await queryBuilder.limit(limit).orderBy(products.name);
      return results;
    } catch (error) {
      console.error("Failed to search products:", error);
      throw error;
    }
  });
  ipcMain.handle("db:find-product-by-barcode", async (_event, barcode) => {
    try {
      const db2 = getLocalDatabase();
      const result = await db2.select({
        product: products
      }).from(products).innerJoin(
        productBarcodes,
        eq(products.id, productBarcodes.productId)
      ).where(
        and(
          eq(productBarcodes.barcode, barcode),
          eq(products.isActive, true)
        )
      ).limit(1);
      return result.length > 0 ? result[0].product : null;
    } catch (error) {
      console.error("Failed to find product by barcode:", error);
      throw error;
    }
  });
  ipcMain.handle("db:authenticate-employee", async (_event, employeeCode, pin) => {
    try {
      const db2 = getLocalDatabase();
      const employee = await db2.select().from(employees).where(
        and(
          eq(employees.employeeCode, employeeCode),
          eq(employees.isActive, true)
        )
      ).limit(1);
      if (employee.length === 0) {
        return null;
      }
      return employee[0];
    } catch (error) {
      console.error("Failed to authenticate employee:", error);
      throw error;
    }
  });
  ipcMain.handle("db:get-employees", async () => {
    try {
      const db2 = getLocalDatabase();
      return await db2.select().from(employees).where(eq(employees.isActive, true)).orderBy(employees.firstName, employees.lastName);
    } catch (error) {
      console.error("Failed to get employees:", error);
      throw error;
    }
  });
  ipcMain.handle("db:get-inventory", async (_event, productId) => {
    try {
      const db2 = getLocalDatabase();
      const result = await db2.select().from(inventory).where(eq(inventory.productId, productId)).limit(1);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get inventory:", error);
      throw error;
    }
  });
  ipcMain.handle("db:update-inventory", async (_event, productId, newStock, changeReason) => {
    try {
      const db2 = getLocalDatabase();
      await db2.update(inventory).set({
        currentStock: newStock,
        lastUpdated: /* @__PURE__ */ new Date()
      }).where(eq(inventory.productId, productId));
    } catch (error) {
      console.error("Failed to update inventory:", error);
      throw error;
    }
  });
  ipcMain.handle("db:get-sync-status", async () => {
    try {
      const db2 = getLocalDatabase();
      const result = await db2.select().from(syncStatus).where(eq(syncStatus.id, "main")).limit(1);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get sync status:", error);
      throw error;
    }
  });
  ipcMain.handle("db:create-transaction", async (_event, data) => {
    try {
      const db2 = getLocalDatabase();
      const result = db2.transaction((tx) => {
        const createdTransaction = tx.insert(transactions).values(data.transaction).returning().get();
        if (data.items.length > 0) {
          tx.insert(transactionItems).values(data.items).run();
        }
        for (const item of data.items) {
          const existingInventory = tx.select().from(inventory).where(eq(inventory.productId, item.productId)).get();
          if (existingInventory) {
            tx.update(inventory).set({
              currentStock: sql`current_stock - ${item.quantity}`,
              lastUpdated: /* @__PURE__ */ new Date()
            }).where(eq(inventory.productId, item.productId)).run();
          } else {
            tx.insert(inventory).values({
              productId: item.productId,
              currentStock: -item.quantity,
              // Start with negative if no initial stock
              reservedStock: 0,
              lastUpdated: /* @__PURE__ */ new Date()
            }).run();
          }
        }
        tx.insert(syncQueue).values({
          id: ulid(),
          operation: "upload_transaction",
          entityType: "transaction",
          entityId: createdTransaction.id,
          payload: JSON.stringify({
            transaction: createdTransaction,
            items: data.items
          }),
          priority: 1
          // High priority for transactions
        }).run();
        return createdTransaction;
      })();
      return {
        success: true,
        transaction: result
      };
    } catch (error) {
      console.error("Failed to create transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  });
  ipcMain.handle("db:get-employee-transactions", async (_event, employeeId, limit = 10) => {
    try {
      const db2 = getLocalDatabase();
      const results = await db2.select({
        id: transactions.id,
        transactionNumber: transactions.transactionNumber,
        employeeName: sql`${employees.firstName} || ' ' || ${employees.lastName}`,
        employeeCode: employees.employeeCode,
        totalAmount: transactions.totalAmount,
        paymentMethod: transactions.paymentMethod,
        createdAt: transactions.createdAt,
        itemCount: sql`COUNT(${transactionItems.id})`
      }).from(transactions).innerJoin(employees, eq(transactions.employeeId, employees.id)).leftJoin(transactionItems, eq(transactions.id, transactionItems.transactionId)).where(eq(transactions.employeeId, employeeId)).groupBy(transactions.id, employees.id).orderBy(desc(transactions.createdAt)).limit(limit);
      return {
        success: true,
        transactions: results
      };
    } catch (error) {
      console.error("Failed to get employee transactions:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  });
  ipcMain.handle("db:get-transaction-by-id", async (_event, transactionId) => {
    try {
      const db2 = getLocalDatabase();
      const result = await db2.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
      return {
        success: true,
        transaction: result.length > 0 ? result[0] : void 0
      };
    } catch (error) {
      console.error("Failed to get transaction by ID:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  });
  ipcMain.handle("db:void-transaction", async (_event, data) => {
    try {
      const db2 = getLocalDatabase();
      db2.transaction((tx) => {
        tx.update(transactions).set({
          status: "voided",
          voidedAt: /* @__PURE__ */ new Date(),
          voidedBy: data.voidedBy
        }).where(eq(transactions.id, data.transactionId)).run();
        const items = tx.select().from(transactionItems).where(eq(transactionItems.transactionId, data.transactionId)).all();
        for (const item of items) {
          tx.update(inventory).set({
            currentStock: sql`current_stock + ${item.quantity}`,
            lastUpdated: /* @__PURE__ */ new Date()
          }).where(eq(inventory.productId, item.productId)).run();
        }
        tx.insert(syncQueue).values({
          id: ulid(),
          operation: "void_transaction",
          entityType: "transaction",
          entityId: data.transactionId,
          payload: JSON.stringify(data),
          priority: 1
        }).run();
      })();
      return { success: true };
    } catch (error) {
      console.error("Failed to void transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  });
  ipcMain.handle("db:get-daily-sales-summary", async (_event, employeeId, date) => {
    try {
      const db2 = getLocalDatabase();
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      const result = await db2.select({
        totalSales: sql`COALESCE(SUM(${transactions.totalAmount}), 0)`,
        transactionCount: sql`COUNT(${transactions.id})`,
        cashSales: sql`COALESCE(SUM(CASE WHEN ${transactions.paymentMethod} = 'cash' THEN ${transactions.totalAmount} ELSE 0 END), 0)`,
        cardSales: sql`COALESCE(SUM(CASE WHEN ${transactions.paymentMethod} = 'card' THEN ${transactions.totalAmount} ELSE 0 END), 0)`
      }).from(transactions).where(
        and(
          eq(transactions.employeeId, employeeId),
          eq(transactions.status, "completed"),
          gte(transactions.createdAt, startOfDay),
          lt(transactions.createdAt, endOfDay)
        )
      );
      const summary = result[0];
      const averageTransaction = summary.transactionCount > 0 ? summary.totalSales / summary.transactionCount : 0;
      return {
        success: true,
        summary: {
          ...summary,
          averageTransaction
        }
      };
    } catch (error) {
      console.error("Failed to get daily sales summary:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  });
  console.log("Database IPC handlers registered");
}
const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1e3;
const ATTEMPT_WINDOW_MS = 60 * 60 * 1e3;
const rateLimitStore = /* @__PURE__ */ new Map();
async function hashPin(pin) {
  if (!pin || pin.length < 3) {
    throw new Error("PIN must be at least 3 characters long");
  }
  try {
    return await bcrypt.hash(pin, BCRYPT_ROUNDS);
  } catch (error) {
    throw new Error("Failed to hash PIN");
  }
}
async function comparePin(plainPin, hashedPin) {
  if (!plainPin || !hashedPin) {
    return false;
  }
  try {
    return await bcrypt.compare(plainPin, hashedPin);
  } catch (error) {
    console.error("PIN comparison failed:", error);
    return false;
  }
}
function getRateLimitState(employeeCode) {
  const now = /* @__PURE__ */ new Date();
  const cutoff = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  let state = rateLimitStore.get(employeeCode);
  if (!state) {
    state = {
      attempts: [],
      isLocked: false
    };
    rateLimitStore.set(employeeCode, state);
  }
  state.attempts = state.attempts.filter((attempt) => attempt.timestamp > cutoff);
  if (state.isLocked && state.lockExpiry && now > state.lockExpiry) {
    state.isLocked = false;
    state.lockExpiry = void 0;
  }
  return state;
}
function recordAttempt(employeeCode, success) {
  const state = getRateLimitState(employeeCode);
  const now = /* @__PURE__ */ new Date();
  state.attempts.push({
    employeeCode,
    timestamp: now,
    success
  });
  if (!success) {
    const failedAttempts = state.attempts.filter((a) => !a.success);
    if (failedAttempts.length >= MAX_LOGIN_ATTEMPTS) {
      state.isLocked = true;
      state.lockExpiry = new Date(now.getTime() + LOCKOUT_DURATION_MS);
    }
  }
  rateLimitStore.set(employeeCode, state);
}
function getRemainingAttempts(employeeCode) {
  const state = getRateLimitState(employeeCode);
  const failedAttempts = state.attempts.filter((a) => !a.success).length;
  return Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts);
}
async function validatePin(employeeCode, pin) {
  try {
    const state = getRateLimitState(employeeCode);
    if (state.isLocked) {
      return {
        isValid: false,
        isLocked: true,
        attemptsRemaining: 0
      };
    }
    const db2 = getLocalDatabase();
    const employeeResult = await db2.select().from(employees).where(eq(employees.employeeCode, employeeCode)).limit(1);
    if (employeeResult.length === 0) {
      recordAttempt(employeeCode, false);
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      };
    }
    const employee = employeeResult[0];
    if (!employee.isActive) {
      recordAttempt(employeeCode, false);
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      };
    }
    const pinIsValid = await comparePin(pin, employee.pin);
    recordAttempt(employeeCode, pinIsValid);
    if (pinIsValid) {
      return {
        isValid: true,
        employee
      };
    } else {
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      };
    }
  } catch (error) {
    console.error("PIN validation error:", error);
    recordAttempt(employeeCode, false);
    return {
      isValid: false,
      attemptsRemaining: getRemainingAttempts(employeeCode)
    };
  }
}
async function authenticateEmployee(credentials) {
  const { pin } = credentials;
  if (!pin || pin.length === 0) {
    return {
      success: false,
      error: "PIN is required"
    };
  }
  try {
    const db2 = getLocalDatabase();
    const allActiveEmployees = await db2.select().from(employees).where(eq(employees.isActive, true));
    for (const employee of allActiveEmployees) {
      const pinResult = await validatePin(employee.employeeCode, pin);
      if (pinResult.isValid && pinResult.employee) {
        return {
          success: true,
          employee: pinResult.employee
        };
      }
      if (pinResult.isLocked) {
        return {
          success: false,
          error: "Account is temporarily locked due to too many failed attempts"
        };
      }
    }
    return {
      success: false,
      error: "Invalid PIN"
    };
  } catch (error) {
    console.error("Authentication error:", error);
    return {
      success: false,
      error: "Authentication failed. Please try again."
    };
  }
}
async function createEmployee(employeeCode, firstName, lastName, plainPin, role = "cashier") {
  try {
    const hashedPin = await hashPin(plainPin);
    const now = /* @__PURE__ */ new Date();
    const newEmployee = {
      id: ulid(),
      employeeCode,
      firstName,
      lastName,
      pin: hashedPin,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };
    const db2 = getLocalDatabase();
    await db2.insert(employees).values(newEmployee);
    return { ...newEmployee, pin: "" };
  } catch (error) {
    console.error("Failed to create employee:", error);
    throw new Error("Failed to create employee");
  }
}
async function resetEmployeePin(targetEmployeeId, newPlainPin, resetByEmployeeId) {
  try {
    const hashedPin = await hashPin(newPlainPin);
    const now = /* @__PURE__ */ new Date();
    const db2 = getLocalDatabase();
    await db2.update(employees).set({
      pin: hashedPin,
      updatedAt: now
    }).where(eq(employees.id, targetEmployeeId));
    const targetEmployee = await db2.select().from(employees).where(eq(employees.id, targetEmployeeId)).limit(1);
    if (targetEmployee.length > 0) {
      rateLimitStore.delete(targetEmployee[0].employeeCode);
    }
    console.log(`PIN reset for employee ${targetEmployeeId} by ${resetByEmployeeId}`);
    return true;
  } catch (error) {
    console.error("PIN reset failed:", error);
    return false;
  }
}
function clearRateLimit(employeeCode) {
  rateLimitStore.delete(employeeCode);
}
function getRateLimitStatus(employeeCode) {
  return getRateLimitState(employeeCode);
}
function setupAuthHandlers() {
  console.log("Setting up authentication IPC handlers...");
  ipcMain.handle("auth:login", async (_event, credentials) => {
    try {
      console.log("Processing authentication request");
      const result = await authenticateEmployee(credentials);
      if (result.success) {
        console.log(`Authentication successful for employee: ${result.employee?.employeeCode}`);
      } else {
        console.log(`Authentication failed: ${result.error}`);
      }
      return result;
    } catch (error) {
      console.error("Authentication error:", error);
      return {
        success: false,
        error: "Authentication system error. Please try again."
      };
    }
  });
  ipcMain.handle("auth:validate-pin", async (_event, employeeCode, pin) => {
    try {
      return await validatePin(employeeCode, pin);
    } catch (error) {
      console.error("PIN validation error:", error);
      return {
        isValid: false,
        attemptsRemaining: 0
      };
    }
  });
  ipcMain.handle("auth:create-employee", async (_event, employeeCode, firstName, lastName, plainPin, role = "cashier", createdByEmployeeId) => {
    try {
      console.log(`Creating new employee: ${employeeCode} (${role}) by ${createdByEmployeeId}`);
      const employee = await createEmployee(employeeCode, firstName, lastName, plainPin, role);
      console.log(`Employee created successfully: ${employee.employeeCode}`);
      return {
        success: true,
        employee
      };
    } catch (error) {
      console.error("Employee creation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create employee"
      };
    }
  });
  ipcMain.handle("auth:reset-pin", async (_event, targetEmployeeId, newPlainPin, resetByEmployeeId) => {
    try {
      console.log(`PIN reset requested for employee ${targetEmployeeId} by ${resetByEmployeeId}`);
      const success = await resetEmployeePin(targetEmployeeId, newPlainPin, resetByEmployeeId);
      if (success) {
        console.log(`PIN reset successful for employee ${targetEmployeeId}`);
        return { success: true };
      } else {
        return {
          success: false,
          error: "Failed to reset PIN. Employee may not exist."
        };
      }
    } catch (error) {
      console.error("PIN reset failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "PIN reset failed"
      };
    }
  });
  ipcMain.handle("auth:clear-rate-limit", async (_event, employeeCode, clearedByEmployeeId) => {
    try {
      console.log(`Clearing rate limit for ${employeeCode} by ${clearedByEmployeeId}`);
      clearRateLimit(employeeCode);
      console.log(`Rate limit cleared for ${employeeCode}`);
      return { success: true };
    } catch (error) {
      console.error("Failed to clear rate limit:", error);
      return {
        success: false,
        error: "Failed to clear rate limit"
      };
    }
  });
  ipcMain.handle("auth:get-rate-limit-status", async (_event, employeeCode) => {
    try {
      return getRateLimitStatus(employeeCode);
    } catch (error) {
      console.error("Failed to get rate limit status:", error);
      return {
        attempts: [],
        isLocked: false
      };
    }
  });
  ipcMain.handle("auth:hash-pin", async (_event, plainPin) => {
    try {
      const hash = await hashPin(plainPin);
      return {
        success: true,
        hash
      };
    } catch (error) {
      console.error("PIN hashing failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "PIN hashing failed"
      };
    }
  });
  ipcMain.handle("auth:log-activity", async (_event, employeeId, activity) => {
    console.log(`Activity: ${activity} by employee ${employeeId} at ${(/* @__PURE__ */ new Date()).toISOString()}`);
  });
  ipcMain.handle("auth:get-recent-activity", async (_event, limit = 50) => {
    console.log(`Recent activity requested (limit: ${limit})`);
    return [];
  });
  console.log("Authentication IPC handlers setup complete");
}
let mainWindow = null;
function createWindow() {
  const preloadPath = join(__dirname, "../preload/index.cjs");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  try {
    const dbConfig = {
      sqlite: {
        databasePath: "./data/euphoria-pos.db"
      },
      supabase: {
        url: process.env.SUPABASE_URL || "https://placeholder.supabase.co",
        anonKey: process.env.SUPABASE_ANON_KEY || "placeholder-key"
      },
      terminalId: "terminal-001"
    };
    await initializeDatabases(dbConfig);
    setupDatabaseShutdownHandlers();
    setupDatabaseHandlers();
    setupAuthHandlers();
    createWindow();
  } catch (error) {
    console.error("Failed to initialize application:", error);
    app.quit();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
