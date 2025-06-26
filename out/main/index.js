import { ipcMain, app, BrowserWindow } from "electron";
import { join } from "path";
import "better-sqlite3";
import "drizzle-orm/better-sqlite3";
import "drizzle-orm/better-sqlite3/migrator";
import "fs";
import { sqliteTable, integer, real, text, index } from "drizzle-orm/sqlite-core";
import { relations, eq, or, like, and } from "drizzle-orm";
import "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { ulid } from "ulid";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
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
relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id]
  })
}));
relations(productBarcodes, ({ one }) => ({
  product: one(products, {
    fields: [productBarcodes.productId],
    references: [products.id]
  })
}));
relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id]
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
sqliteTable("transaction_queue", {
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
sqliteTable("master_data_versions", {
  dataType: text("data_type").primaryKey(),
  // 'products', 'employees', 'customers'
  version: integer("version").notNull().default(0),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  recordCount: integer("record_count").notNull().default(0),
  checksum: text("checksum")
  // Hash of data for integrity checking
});
relations(syncQueue, ({ one }) => ({
  // Could add relations to products/transactions if needed
}));
let sqliteDb = null;
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
function createBackup(backupPath) {
  {
    throw new Error("Database not initialized");
  }
}
let supabase = null;
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
function getDatabaseConnections() {
  {
    throw new Error("Databases not initialized. Call initializeDatabases() first.");
  }
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
  return createBackup();
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
      const db = getLocalDatabase();
      const { limit = 50, includeInactive = false, category } = options;
      let queryBuilder = db.select().from(products);
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
      const db = getLocalDatabase();
      const result = await db.select({
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
      const db = getLocalDatabase();
      const employee = await db.select().from(employees).where(
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
      const db = getLocalDatabase();
      return await db.select().from(employees).where(eq(employees.isActive, true)).orderBy(employees.firstName, employees.lastName);
    } catch (error) {
      console.error("Failed to get employees:", error);
      throw error;
    }
  });
  ipcMain.handle("db:get-inventory", async (_event, productId) => {
    try {
      const db = getLocalDatabase();
      const result = await db.select().from(inventory).where(eq(inventory.productId, productId)).limit(1);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get inventory:", error);
      throw error;
    }
  });
  ipcMain.handle("db:update-inventory", async (_event, productId, newStock, changeReason) => {
    try {
      const db = getLocalDatabase();
      await db.update(inventory).set({
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
      const db = getLocalDatabase();
      const result = await db.select().from(syncStatus).where(eq(syncStatus.id, "main")).limit(1);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error("Failed to get sync status:", error);
      throw error;
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
    const db = getLocalDatabase();
    const employeeResult = await db.select().from(employees).where(eq(employees.employeeCode, employeeCode)).limit(1);
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
    const db = getLocalDatabase();
    const allActiveEmployees = await db.select().from(employees).where(eq(employees.isActive, true));
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
    const db = getLocalDatabase();
    await db.insert(employees).values(newEmployee);
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
    const db = getLocalDatabase();
    await db.update(employees).set({
      pin: hashedPin,
      updatedAt: now
    }).where(eq(employees.id, targetEmployeeId));
    const targetEmployee = await db.select().from(employees).where(eq(employees.id, targetEmployeeId)).limit(1);
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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
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
app.whenReady().then(() => {
  setupDatabaseHandlers();
  setupAuthHandlers();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
