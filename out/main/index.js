import { app, ipcMain, dialog, BrowserWindow } from "electron";
import * as path from "path";
import { join } from "path";
import * as fs from "fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sqliteTable, integer, text, index, primaryKey } from "drizzle-orm/sqlite-core";
import { relations, eq, sql } from "drizzle-orm";
import path$1 from "node:path";
import { v4 } from "uuid";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import bcrypt from "bcrypt";
import WebSocket, { WebSocketServer } from "ws";
import * as crypto from "crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function validateConfig() {
  const errors = [];
  const warnings = [];
  let terminalId = process.env.TERMINAL_ID;
  let terminalPort = parseInt(process.env.TERMINAL_PORT || "8123");
  try {
    const settingsPath = path.join(__dirname, "..", "settings.local.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.terminalId) terminalId = settings.terminalId;
      if (settings.terminalPort) terminalPort = settings.terminalPort;
    }
  } catch (error) {
    warnings.push("Failed to read settings.local.json, using environment variables");
  }
  if (!terminalId) {
    errors.push("TERMINAL_ID is required. Set it in environment variables or settings.local.json");
  } else if (!/^[A-Z0-9]{2,10}$/.test(terminalId)) {
    errors.push("TERMINAL_ID must be 2-10 characters, uppercase letters and numbers only (e.g., L1, L2, LANE01)");
  }
  if (!terminalPort || terminalPort < 1024 || terminalPort > 65535) {
    errors.push("TERMINAL_PORT must be between 1024 and 65535");
  }
  if (terminalPort === 5173) {
    errors.push("TERMINAL_PORT cannot be 5173 (reserved for Vite dev server)");
  }
  const peerTerminals = process.env.PEER_TERMINALS ? process.env.PEER_TERMINALS.split(",").map((url) => url.trim()) : [];
  for (const peer of peerTerminals) {
    if (!peer.startsWith("ws://") && !peer.startsWith("wss://")) {
      errors.push(`Invalid peer terminal URL: ${peer}. Must start with ws:// or wss://`);
    }
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  if (supabaseUrl && !supabaseUrl.startsWith("https://")) {
    errors.push("SUPABASE_URL must start with https://");
  }
  if (supabaseUrl && !supabaseServiceKey) {
    warnings.push("SUPABASE_URL is set but SUPABASE_SERVICE_KEY is missing. Cloud sync will be disabled.");
  }
  const syncBackoffBaseMs = parseInt(process.env.SYNC_BACKOFF_BASE_MS || "1000");
  if (syncBackoffBaseMs < 100 || syncBackoffBaseMs > 6e4) {
    warnings.push("SYNC_BACKOFF_BASE_MS should be between 100 and 60000 ms. Using default: 1000ms");
  }
  if (terminalId === "L1" || terminalId === "L2") {
    warnings.push(`Using default terminal ID '${terminalId}'. Consider setting a unique ID for production.`);
  }
  try {
    const dbPath = app.getPath("userData");
    fs.accessSync(dbPath, fs.constants.W_OK);
  } catch (error) {
    errors.push(`Cannot write to database directory: ${app.getPath("userData")}`);
  }
  if (peerTerminals.some((peer) => peer.includes("localhost") || peer.includes("127.0.0.1"))) {
    warnings.push("Peer terminals include localhost. This is fine for development but not for production.");
  }
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config: errors.length === 0 ? {
      terminalId,
      terminalPort,
      peerTerminals,
      supabaseUrl,
      supabaseServiceKey,
      syncBackoffBaseMs
    } : void 0
  };
}
function handleConfigErrors(result) {
  console.error("\n========================================");
  console.error("CONFIGURATION ERRORS");
  console.error("========================================\n");
  if (result.errors.length > 0) {
    console.error("The following errors must be fixed:\n");
    result.errors.forEach((error, index2) => {
      console.error(`  ${index2 + 1}. ${error}`);
    });
    console.error("\n");
  }
  if (result.warnings.length > 0) {
    console.warn("Warnings:\n");
    result.warnings.forEach((warning, index2) => {
      console.warn(`  ${index2 + 1}. ${warning}`);
    });
    console.warn("\n");
  }
  console.error("To fix these issues:\n");
  console.error("1. Create a file: electron/settings.local.json with:");
  console.error("   {");
  console.error('     "terminalId": "L1",');
  console.error('     "terminalPort": 8123');
  console.error("   }");
  console.error("\n2. Or set environment variables:");
  console.error("   TERMINAL_ID=L1");
  console.error("   TERMINAL_PORT=8123");
  console.error("   PEER_TERMINALS=ws://localhost:8124");
  console.error("\n========================================\n");
}
function getValidatedConfig() {
  const result = validateConfig();
  if (!result.isValid) {
    handleConfigErrors(result);
    throw new Error("Invalid configuration. See errors above.");
  }
  if (result.warnings.length > 0) {
    console.warn("\nConfiguration warnings:");
    result.warnings.forEach((warning) => console.warn(`- ${warning}`));
    console.warn("");
  }
  return result.config;
}
const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  sku: text("sku", { length: 50 }).notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  // 'wine', 'liquor', 'beer', 'other'
  size: text("size").notNull(),
  // '750ml', '1L', '1.5L', '1.75L', 'other'
  cost: text("cost").notNull(),
  // Store as string for precision
  retailPrice: text("retail_price").notNull(),
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: text("parent_product_id").references(() => products.id),
  unitsInParent: integer("units_in_parent").default(1),
  // Loyalty configuration
  loyaltyPointMultiplier: text("loyalty_point_multiplier").default("1.0"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  skuIdx: index("products_sku_idx").on(table.sku),
  categoryIdx: index("products_category_idx").on(table.category)
}));
const productBarcodes = sqliteTable("product_barcodes", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  barcode: text("barcode", { length: 50 }).notNull().unique(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  barcodeIdx: index("product_barcodes_barcode_idx").on(table.barcode)
}));
const inventory = sqliteTable("inventory", {
  productId: text("product_id").references(() => products.id).primaryKey(),
  currentStock: integer("current_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  lastUpdated: integer("last_updated", { mode: "timestamp" }).notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" })
});
const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  phone: text("phone", { length: 20 }).notNull().unique(),
  email: text("email", { length: 255 }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  // Loyalty integration
  zinreloId: text("zinrelo_id", { length: 100 }).unique(),
  loyaltyPoints: integer("loyalty_points").default(0),
  loyaltyTier: text("loyalty_tier", { length: 20 }).default("bronze"),
  // RFID/NFC card
  rfidCardId: text("rfid_card_id", { length: 100 }).unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  phoneIdx: index("customers_phone_idx").on(table.phone),
  rfidIdx: index("customers_rfid_idx").on(table.rfidCardId)
}));
const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  employeeCode: text("employee_code", { length: 20 }).notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  pin: text("pin", { length: 60 }).notNull(),
  // Hashed PIN
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  canOverridePrice: integer("can_override_price", { mode: "boolean" }).default(false),
  canVoidTransaction: integer("can_void_transaction", { mode: "boolean" }).default(false),
  isManager: integer("is_manager", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});
const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  transactionNumber: text("transaction_number", { length: 20 }).notNull().unique(),
  customerId: text("customer_id").references(() => customers.id),
  employeeId: text("employee_id").references(() => employees.id).notNull(),
  subtotal: text("subtotal").notNull(),
  taxAmount: text("tax_amount").notNull(),
  discountAmount: text("discount_amount").default("0.00"),
  totalAmount: text("total_amount").notNull(),
  // Loyalty tracking
  pointsEarned: integer("points_earned").default(0),
  pointsRedeemed: integer("points_redeemed").default(0),
  status: text("status").notNull().default("completed"),
  // 'pending', 'completed', 'voided', 'refunded'
  salesChannel: text("sales_channel").notNull().default("pos"),
  // 'pos', 'doordash', 'grubhub', 'employee'
  // For returns/exchanges
  originalTransactionId: text("original_transaction_id").references(() => transactions.id),
  // Multi-lane tracking
  terminalId: text("terminal_id", { length: 20 }).notNull(),
  syncStatus: text("sync_status", { length: 20 }).default("synced"),
  // Zinrelo sync tracking
  zinreloSyncStatus: text("zinrelo_sync_status", { length: 20 }).default("pending"),
  zinreloSyncedAt: integer("zinrelo_synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  // Metadata for third-party orders
  metadata: text("metadata", { mode: "json" })
}, (table) => ({
  transactionNumberIdx: index("transactions_number_idx").on(table.transactionNumber),
  createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
  customerIdx: index("transactions_customer_idx").on(table.customerId),
  customerDateIdx: index("transactions_customer_date_idx").on(table.customerId, table.createdAt),
  syncStatusIdx: index("transactions_sync_status_idx").on(table.syncStatus),
  zinreloSyncIdx: index("transactions_zinrelo_sync_idx").on(table.zinreloSyncStatus)
}));
const transactionItems = sqliteTable("transaction_items", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(() => transactions.id).notNull(),
  productId: text("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: text("unit_price").notNull(),
  discountAmount: text("discount_amount").default("0.00"),
  totalPrice: text("total_price").notNull(),
  // For tracking what discounts were applied
  discountReason: text("discount_reason"),
  // Loyalty points earned on this item
  pointsEarned: integer("points_earned").default(0),
  isReturned: integer("is_returned", { mode: "boolean" }).default(false),
  returnedAt: integer("returned_at", { mode: "timestamp" })
}, (table) => ({
  transactionIdx: index("transaction_items_transaction_idx").on(table.transactionId),
  productIdx: index("transaction_items_product_idx").on(table.productId)
}));
const customerProductHistory = sqliteTable("customer_product_history", {
  customerId: text("customer_id").references(() => customers.id).notNull(),
  productId: text("product_id").references(() => products.id).notNull(),
  firstPurchased: integer("first_purchased", { mode: "timestamp" }).notNull(),
  lastPurchased: integer("last_purchased", { mode: "timestamp" }).notNull(),
  purchaseCount: integer("purchase_count").notNull().default(1),
  totalQuantity: integer("total_quantity").notNull(),
  averageQuantityPerPurchase: text("avg_quantity"),
  // Denormalized for quick access
  productName: text("product_name").notNull(),
  productCategory: text("product_category").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index("customer_product_history_customer_idx").on(table.customerId),
  lastPurchasedIdx: index("customer_product_history_last_purchased_idx").on(table.customerId, table.lastPurchased),
  purchaseCountIdx: index("customer_product_history_count_idx").on(table.customerId, table.purchaseCount)
}));
const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(() => transactions.id).notNull(),
  paymentMethod: text("payment_method").notNull(),
  // 'cash', 'credit', 'debit', 'gift_card', 'loyalty_points', 'employee_tab', 'third_party'
  amount: text("amount").notNull(),
  // For card payments
  cardLastFour: text("card_last_four", { length: 4 }),
  cardType: text("card_type", { length: 20 }),
  authorizationCode: text("authorization_code", { length: 50 }),
  // For cash
  tenderedAmount: text("tendered_amount"),
  changeAmount: text("change_amount"),
  // For gift cards
  giftCardId: text("gift_card_id").references(() => giftCards.id),
  // For loyalty points
  pointsUsed: integer("points_used"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});
const giftCards = sqliteTable("gift_cards", {
  id: text("id").primaryKey(),
  cardNumber: text("card_number", { length: 20 }).notNull().unique(),
  pin: text("pin", { length: 10 }).notNull(),
  initialBalance: text("initial_balance").notNull(),
  currentBalance: text("current_balance").notNull(),
  issuedBy: text("issued_by").references(() => employees.id),
  purchaseTransactionId: text("purchase_transaction_id").references(() => transactions.id),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" })
});
const discounts = sqliteTable("discounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  size: text("size").notNull(),
  unitsPerCase: integer("units_per_case").notNull(),
  discountPercent: text("discount_percent").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});
const inventoryChanges = sqliteTable("inventory_changes", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  changeType: text("change_type").notNull(),
  // 'sale', 'return', 'adjustment', 'receive'
  changeAmount: integer("change_amount").notNull(),
  newStockLevel: integer("new_stock_level").notNull(),
  // What caused this change
  transactionId: text("transaction_id").references(() => transactions.id),
  transactionItemId: text("transaction_item_id").references(() => transactionItems.id),
  // Multi-lane tracking
  terminalId: text("terminal_id", { length: 20 }).notNull(),
  employeeId: text("employee_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  productIdx: index("inventory_changes_product_idx").on(table.productId),
  createdAtIdx: index("inventory_changes_created_at_idx").on(table.createdAt)
}));
const priceHistory = sqliteTable("price_history", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  oldPrice: text("old_price").notNull(),
  newPrice: text("new_price").notNull(),
  oldCost: text("old_cost").notNull(),
  newCost: text("new_cost").notNull(),
  changedBy: text("changed_by").references(() => employees.id),
  changeReason: text("change_reason"),
  effectiveDate: integer("effective_date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull()
});
const posConfig = sqliteTable("pos_config", {
  key: text("key", { length: 50 }).primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull()
});
const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  // 'transaction', 'inventory', 'customer', etc.
  payload: text("payload", { mode: "json" }).notNull(),
  status: text("status").notNull().default("pending"),
  // 'pending', 'peer_ack', 'cloud_ack'
  retryCount: integer("retry_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  peerAckedAt: integer("peer_acked_at", { mode: "timestamp" }),
  cloudAckedAt: integer("cloud_acked_at", { mode: "timestamp" })
}, (table) => ({
  statusIdx: index("outbox_status_idx").on(table.status),
  createdAtIdx: index("outbox_created_at_idx").on(table.createdAt)
}));
const inboxProcessed = sqliteTable("inbox_processed", {
  messageId: text("message_id").primaryKey(),
  fromTerminal: text("from_terminal").notNull(),
  topic: text("topic").notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp" }).notNull()
}, (table) => ({
  processedAtIdx: index("inbox_processed_at_idx").on(table.processedAt)
}));
const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id]
  })
}));
const transactionsRelations = relations(transactions, ({ many, one }) => ({
  items: many(transactionItems),
  payments: many(payments),
  customer: one(customers, {
    fields: [transactions.customerId],
    references: [customers.id]
  }),
  employee: one(employees, {
    fields: [transactions.employeeId],
    references: [employees.id]
  })
}));
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  customerProductHistory,
  customers,
  discounts,
  employees,
  giftCards,
  inboxProcessed,
  inventory,
  inventoryChanges,
  outbox,
  payments,
  posConfig,
  priceHistory,
  productBarcodes,
  products,
  productsRelations,
  transactionItems,
  transactions,
  transactionsRelations
}, Symbol.toStringTag, { value: "Module" }));
let sqliteDb = null;
let db = null;
function initializeDatabase() {
  if (db) return db;
  const userDataPath = app.getPath("userData");
  const dbPath = path$1.join(userDataPath, "euphoria-pos.db");
  console.log("Initializing SQLite database at:", dbPath);
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("synchronous = NORMAL");
  db = drizzle(sqliteDb, { schema });
  console.log("Running SQLite migrations...");
  const migrationsFolder = path$1.join(__dirname, "../../drizzle/sqlite");
  migrate(db, { migrationsFolder });
  console.log("Migrations completed successfully");
  return db;
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}
async function withTxn(fn) {
  const database = getDb();
  return database.transaction((tx) => {
    return fn(tx);
  })();
}
function closeDatabase() {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
    db = null;
  }
}
function generateId() {
  return v4();
}
function now() {
  return /* @__PURE__ */ new Date();
}
async function verifyPin(pin) {
  const db2 = getDb();
  try {
    const activeEmployees = await db2.select().from(employees).where(eq(employees.isActive, true));
    for (const employee of activeEmployees) {
      const isValid = await bcrypt.compare(pin, employee.pin);
      if (isValid) {
        console.log(`Employee ${employee.firstName} ${employee.lastName} authenticated`);
        return employee;
      }
    }
    console.log("Invalid PIN - no matching employee found");
    return null;
  } catch (error) {
    console.error("Error verifying PIN:", error);
    return null;
  }
}
async function upsertEmployee(employee) {
  const db2 = getDb();
  const timestamp = now();
  try {
    const existing = await db2.select().from(employees).where(eq(employees.employeeCode, employee.employeeCode)).limit(1);
    if (existing.length > 0) {
      const updates = {
        ...employee,
        updatedAt: timestamp
      };
      if (employee.pin) {
        updates.pin = await bcrypt.hash(employee.pin, 10);
      }
      await db2.update(employees).set(updates).where(eq(employees.id, existing[0].id));
      const updated = await db2.select().from(employees).where(eq(employees.id, existing[0].id)).limit(1);
      return updated[0];
    } else {
      const id = generateId();
      const hashedPin = employee.pin ? await bcrypt.hash(employee.pin, 10) : "";
      const newEmployee = {
        id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        pin: hashedPin,
        isActive: employee.isActive ?? true,
        canOverridePrice: employee.canOverridePrice ?? false,
        canVoidTransaction: employee.canVoidTransaction ?? false,
        isManager: employee.isManager ?? false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await db2.insert(employees).values(newEmployee);
      const created = await db2.select().from(employees).where(eq(employees.id, id)).limit(1);
      return created[0];
    }
  } catch (error) {
    console.error("Error upserting employee:", error);
    throw error;
  }
}
async function getAllEmployees() {
  const db2 = getDb();
  return await db2.select().from(employees);
}
const mockEmployees = [
  {
    employeeCode: "EMP001",
    firstName: "John",
    lastName: "Doe",
    pin: "1234",
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: true,
    isManager: true
  },
  {
    employeeCode: "EMP002",
    firstName: "Jane",
    lastName: "Smith",
    pin: "5678",
    isActive: true,
    canOverridePrice: false,
    canVoidTransaction: false,
    isManager: false
  },
  {
    employeeCode: "EMP003",
    firstName: "Bob",
    lastName: "Johnson",
    pin: "9999",
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: false,
    isManager: false
  }
];
const mockProducts = [
  {
    id: generateId(),
    sku: "JD750",
    name: "Jack Daniels 750ml",
    category: "liquor",
    size: "750ml",
    cost: "15.00",
    retailPrice: "24.99",
    barcode: "082184090563"
  },
  {
    id: generateId(),
    sku: "GREY750",
    name: "Grey Goose Vodka 750ml",
    category: "liquor",
    size: "750ml",
    cost: "22.00",
    retailPrice: "34.99",
    barcode: "080480280017"
  },
  {
    id: generateId(),
    sku: "BUD6PK",
    name: "Budweiser 6-Pack",
    category: "beer",
    size: "other",
    cost: "5.00",
    retailPrice: "8.99",
    barcode: "018200001963"
  }
];
async function seedInitialData() {
  try {
    const db2 = getDb();
    const existingEmployees = await getAllEmployees();
    if (existingEmployees.length === 0) {
      console.log("Seeding initial employee data...");
      for (const employee of mockEmployees) {
        await upsertEmployee(employee);
        console.log(`Created employee: ${employee.firstName} ${employee.lastName} (PIN: ${employee.pin})`);
      }
      console.log("Initial employee data seeded successfully");
    } else {
      console.log("Employee data already exists, skipping seed");
    }
    const existingProducts = await db2.select().from(products).limit(1);
    if (existingProducts.length === 0) {
      console.log("Seeding initial product data...");
      const timestamp = now();
      for (const product of mockProducts) {
        await db2.insert(products).values({
          ...product,
          parentProductId: null,
          unitsInParent: 1,
          loyaltyPointMultiplier: "1.0",
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        await db2.insert(productBarcodes).values({
          id: generateId(),
          productId: product.id,
          barcode: product.barcode,
          isPrimary: true,
          createdAt: timestamp
        });
        await db2.insert(inventory).values({
          productId: product.id,
          currentStock: 100,
          // Start with 100 units
          reservedStock: 0,
          lastUpdated: timestamp,
          lastSyncedAt: null
        });
        console.log(`Created product: ${product.name}`);
      }
      console.log("Initial product data seeded successfully");
    } else {
      console.log("Product data already exists, skipping seed");
    }
  } catch (error) {
    console.error("Error seeding initial data:", error);
  }
}
let currentEmployee = null;
function assertAuthenticated() {
  if (!currentEmployee) {
    throw new Error("Not authenticated");
  }
  return currentEmployee;
}
function getCurrentEmployee() {
  return currentEmployee;
}
function setupAuthHandlers() {
  ipcMain.handle("auth:verify-pin", async (event, pin) => {
    try {
      const employee = await verifyPin(pin);
      if (employee) {
        currentEmployee = employee;
        console.log(`Employee authenticated: ${employee.firstName} ${employee.lastName}`);
        return {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeCode: employee.employeeCode,
          isManager: employee.isManager,
          canOverridePrice: employee.canOverridePrice,
          canVoidTransaction: employee.canVoidTransaction
        };
      }
      return null;
    } catch (error) {
      console.error("PIN verification error:", error);
      return null;
    }
  });
  ipcMain.handle("auth:logout", async () => {
    console.log("Employee logged out:", currentEmployee?.firstName, currentEmployee?.lastName);
    currentEmployee = null;
  });
  ipcMain.handle("auth:get-current-employee", async () => {
    if (!currentEmployee) return null;
    return {
      id: currentEmployee.id,
      name: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
      employeeCode: currentEmployee.employeeCode,
      isManager: currentEmployee.isManager
    };
  });
  ipcMain.handle("auth:check-authenticated", async () => {
    return currentEmployee !== null;
  });
}
async function publish(topic, payload, _options = {}) {
  const db2 = getDb();
  const id = generateId();
  const timestamp = now();
  const message = {
    id,
    topic,
    payload,
    status: "pending",
    retryCount: 0,
    createdAt: timestamp,
    peerAckedAt: null,
    cloudAckedAt: null
  };
  await db2.insert(outbox).values(message);
  console.log(`Published message ${id} to outbox:`, { topic, payload });
  return id;
}
async function markSent(messageId, stage) {
  const db2 = getDb();
  const timestamp = now();
  if (stage === "peer_ack") {
    await db2.update(outbox).set({
      status: "peer_ack",
      peerAckedAt: timestamp
    }).where(eq(outbox.id, messageId));
    console.log(`Message ${messageId} acknowledged by peer`);
  } else if (stage === "cloud_ack") {
    await db2.update(outbox).set({
      status: "cloud_ack",
      cloudAckedAt: timestamp
    }).where(eq(outbox.id, messageId));
    console.log(`Message ${messageId} acknowledged by cloud`);
  }
}
async function getPendingMessages(status = "pending", limit = 100) {
  const db2 = getDb();
  return await db2.select().from(outbox).where(eq(outbox.status, status)).limit(limit).orderBy(outbox.createdAt);
}
async function incrementRetryCount(messageId) {
  const db2 = getDb();
  const [message] = await db2.select().from(outbox).where(eq(outbox.id, messageId)).limit(1);
  if (message) {
    await db2.update(outbox).set({
      retryCount: (message.retryCount || 0) + 1
    }).where(eq(outbox.id, messageId));
  }
}
async function publishBatch(messages) {
  return await withTxn(async (tx) => {
    const ids = [];
    const timestamp = now();
    for (const msg of messages) {
      const id = generateId();
      const message = {
        id,
        topic: msg.topic,
        payload: msg.payload,
        status: "pending",
        retryCount: 0,
        createdAt: timestamp,
        peerAckedAt: null,
        cloudAckedAt: null
      };
      await tx.insert(outbox).values(message);
      ids.push(id);
    }
    console.log(`Published ${messages.length} messages to outbox`);
    return ids;
  });
}
async function completeSale(dto) {
  const employee = getCurrentEmployee();
  if (!employee) {
    throw new Error("No employee authenticated");
  }
  const transactionId = generateId();
  const timestamp = now();
  const terminalId = process.env.TERMINAL_ID || "L1";
  const transactionNumber = `${terminalId}-${Date.now()}`;
  return await withTxn(async (tx) => {
    const newTransaction = {
      id: transactionId,
      transactionNumber,
      customerId: dto.customerId || null,
      employeeId: employee.id,
      subtotal: dto.subtotal.toFixed(2),
      taxAmount: dto.taxAmount.toFixed(2),
      discountAmount: dto.discountAmount.toFixed(2),
      totalAmount: dto.totalAmount.toFixed(2),
      pointsEarned: calculatePointsEarned(dto),
      pointsRedeemed: calculatePointsRedeemed(dto),
      status: "completed",
      salesChannel: dto.salesChannel,
      originalTransactionId: null,
      terminalId,
      syncStatus: "pending",
      zinreloSyncStatus: "pending",
      zinreloSyncedAt: null,
      createdAt: timestamp,
      completedAt: timestamp,
      metadata: dto.metadata || null
    };
    await tx.insert(transactions).values(newTransaction);
    const inventoryUpdates = [];
    for (const item of dto.items) {
      const itemId = generateId();
      const newItem = {
        id: itemId,
        transactionId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: (item.discountAmount || 0).toFixed(2),
        totalPrice: (item.unitPrice * item.quantity - (item.discountAmount || 0)).toFixed(2),
        discountReason: item.discountReason || null,
        pointsEarned: calculateItemPoints(item),
        isReturned: false,
        returnedAt: null
      };
      await tx.insert(transactionItems).values(newItem);
      const [currentInventory] = await tx.select().from(inventory).where(eq(inventory.productId, item.productId)).limit(1);
      if (currentInventory) {
        const newStock = currentInventory.currentStock - item.quantity;
        await tx.update(inventory).set({
          currentStock: newStock,
          lastUpdated: timestamp
        }).where(eq(inventory.productId, item.productId));
        inventoryUpdates.push({
          productId: item.productId,
          changeAmount: -item.quantity,
          newStock
        });
        await tx.insert(inventoryChanges).values({
          id: generateId(),
          productId: item.productId,
          changeType: "sale",
          changeAmount: -item.quantity,
          newStockLevel: newStock,
          transactionId,
          transactionItemId: itemId,
          terminalId,
          employeeId: employee.id,
          notes: null,
          createdAt: timestamp
        });
      }
    }
    for (const payment of dto.payments) {
      const newPayment = {
        id: generateId(),
        transactionId,
        paymentMethod: payment.method,
        amount: payment.amount.toFixed(2),
        cardLastFour: payment.cardLastFour || null,
        cardType: payment.cardType || null,
        authorizationCode: payment.authorizationCode || null,
        tenderedAmount: payment.tenderedAmount?.toFixed(2) || null,
        changeAmount: payment.changeAmount?.toFixed(2) || null,
        giftCardId: payment.giftCardId || null,
        pointsUsed: payment.pointsUsed || null,
        createdAt: timestamp
      };
      await tx.insert(payments).values(newPayment);
    }
    const messages = [
      {
        topic: "transaction",
        payload: {
          transaction: newTransaction,
          items: dto.items,
          payments: dto.payments
        }
      },
      ...inventoryUpdates.map((update) => ({
        topic: "inventory",
        payload: update
      }))
    ];
    if (dto.customerId) {
      messages.push({
        topic: "customer",
        payload: {
          customerId: dto.customerId,
          lastPurchase: timestamp,
          pointsEarned: calculatePointsEarned(dto),
          pointsRedeemed: calculatePointsRedeemed(dto)
        }
      });
    }
    await publishBatch(messages);
    console.log(`Transaction ${transactionNumber} completed successfully`);
    return transactionId;
  });
}
function calculatePointsEarned(dto) {
  let points = 0;
  for (const item of dto.items) {
    points += calculateItemPoints(item);
  }
  return Math.floor(points);
}
function calculateItemPoints(item) {
  const basePoints = item.unitPrice * item.quantity;
  const multiplier = parseFloat(item.product?.loyaltyPointMultiplier || "1.0");
  return Math.floor(basePoints * multiplier);
}
function calculatePointsRedeemed(dto) {
  let pointsUsed = 0;
  for (const payment of dto.payments) {
    if (payment.method === "loyalty_points" && payment.pointsUsed) {
      pointsUsed += payment.pointsUsed;
    }
  }
  return pointsUsed;
}
async function getTransactionById(transactionId) {
  const db2 = getDb();
  const [transaction] = await db2.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
  if (!transaction) return null;
  const items = await db2.select().from(transactionItems).where(eq(transactionItems.transactionId, transactionId));
  const paymentRecords = await db2.select().from(payments).where(eq(payments.transactionId, transactionId));
  return {
    transaction,
    items,
    payments: paymentRecords
  };
}
async function getRecentTransactions(limit = 10) {
  const db2 = getDb();
  return await db2.select().from(transactions).orderBy(sql`${transactions.createdAt} DESC`).limit(limit);
}
let cachedConfig = null;
function getTerminalId() {
  if (!cachedConfig) {
    cachedConfig = getValidatedConfig();
  }
  return cachedConfig.terminalId;
}
function setupTransactionHandlers() {
  ipcMain.handle("transaction:complete", async (event, dto) => {
    try {
      const employee = assertAuthenticated();
      console.log(`Processing transaction for employee: ${employee.firstName} ${employee.lastName}`);
      if (!dto.items || dto.items.length === 0) {
        throw new Error("Transaction must have at least one item");
      }
      if (!dto.payments || dto.payments.length === 0) {
        throw new Error("Transaction must have at least one payment");
      }
      const totalPayments = dto.payments.reduce((sum, p) => sum + p.amount, 0);
      if (Math.abs(totalPayments - dto.totalAmount) > 0.01) {
        throw new Error(`Payment total (${totalPayments}) does not match transaction total (${dto.totalAmount})`);
      }
      const enhancedDto = {
        ...dto,
        employeeId: employee.id,
        terminalId: getTerminalId()
      };
      const transactionId = await completeSale(enhancedDto);
      return {
        success: true,
        transactionId
      };
    } catch (error) {
      console.error("Transaction completion error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Transaction failed"
      };
    }
  });
  ipcMain.handle("transaction:get", async (event, transactionId) => {
    try {
      assertAuthenticated();
      const transaction = await getTransactionById(transactionId);
      return {
        success: true,
        transaction
      };
    } catch (error) {
      console.error("Get transaction error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get transaction"
      };
    }
  });
  ipcMain.handle("transaction:recent", async (event, limit) => {
    try {
      assertAuthenticated();
      const transactions2 = await getRecentTransactions(limit);
      return {
        success: true,
        transactions: transactions2
      };
    } catch (error) {
      console.error("Get recent transactions error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get recent transactions"
      };
    }
  });
  ipcMain.handle("transaction:void", async (event, transactionId, reason) => {
    try {
      const employee = assertAuthenticated();
      if (!employee.canVoidTransaction && !employee.isManager) {
        throw new Error("You do not have permission to void transactions");
      }
      console.log(`Voiding transaction ${transactionId} - Reason: ${reason}`);
      return {
        success: true,
        message: "Transaction void not yet implemented"
      };
    } catch (error) {
      console.error("Void transaction error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to void transaction"
      };
    }
  });
}
function compareInventory(localInventory, remoteInventory) {
  const diffs = [];
  const remoteMap = new Map(
    remoteInventory.map((item) => [item.productId, item])
  );
  for (const localItem of localInventory) {
    const remoteItem = remoteMap.get(localItem.productId);
    if (!remoteItem) {
      diffs.push({
        productId: localItem.productId,
        localStock: localItem.currentStock,
        remoteStock: 0,
        difference: localItem.currentStock
      });
    } else if (localItem.currentStock !== remoteItem.currentStock) {
      diffs.push({
        productId: localItem.productId,
        localStock: localItem.currentStock,
        remoteStock: remoteItem.currentStock,
        difference: localItem.currentStock - remoteItem.currentStock
      });
    }
    remoteMap.delete(localItem.productId);
  }
  for (const [productId, remoteItem] of remoteMap) {
    diffs.push({
      productId,
      localStock: 0,
      remoteStock: remoteItem.currentStock,
      difference: -remoteItem.currentStock
    });
  }
  return diffs;
}
async function reconcileInventory(diffs, remoteInventory) {
  if (diffs.length === 0) {
    console.log("Inventory reconciliation: No differences found");
    return;
  }
  const db2 = getDb();
  console.log(`Reconciling ${diffs.length} inventory differences`);
  const remoteMap = new Map(
    remoteInventory.map((item) => [item.productId, item])
  );
  for (const diff of diffs) {
    const localItem = db2.select().from(inventory).where(eq(inventory.productId, diff.productId)).get();
    const remoteItem = remoteMap.get(diff.productId);
    let useRemoteValue = false;
    if (!localItem && remoteItem) {
      useRemoteValue = true;
    } else if (localItem && remoteItem) {
      useRemoteValue = remoteItem.lastUpdated > localItem.lastUpdated;
    }
    if (useRemoteValue && remoteItem) {
      await db2.insert(inventory).values({
        productId: remoteItem.productId,
        currentStock: remoteItem.currentStock,
        reservedStock: remoteItem.reservedStock,
        lastUpdated: remoteItem.lastUpdated,
        lastSyncedAt: /* @__PURE__ */ new Date()
      }).onConflictDoUpdate({
        target: inventory.productId,
        set: {
          currentStock: remoteItem.currentStock,
          reservedStock: remoteItem.reservedStock,
          lastUpdated: remoteItem.lastUpdated,
          lastSyncedAt: /* @__PURE__ */ new Date()
        }
      });
      console.log(`Reconciled ${diff.productId}: local=${diff.localStock} → remote=${diff.remoteStock}`);
      await publish("inventory.reconciled", {
        productId: diff.productId,
        previousStock: diff.localStock,
        newStock: diff.remoteStock,
        source: "reconciliation"
      });
    }
  }
}
async function performInventoryReconciliation(peerInventory) {
  const db2 = getDb();
  try {
    const localInventory = db2.select({
      productId: inventory.productId,
      currentStock: inventory.currentStock,
      reservedStock: inventory.reservedStock,
      lastUpdated: inventory.lastUpdated
    }).from(inventory).all();
    const diffs = compareInventory(localInventory, peerInventory);
    if (diffs.length > 0) {
      console.log(`Found ${diffs.length} inventory differences`);
      await reconcileInventory(diffs, peerInventory);
      await publish("inventory.reconciliation.complete", {
        differencesFound: diffs.length,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  } catch (error) {
    console.error("Inventory reconciliation error:", error);
    throw error;
  }
}
async function requestInventoryFromPeers() {
  const { requestInventoryFromAllPeers: requestInventoryFromAllPeers2 } = await Promise.resolve().then(() => wsClient);
  await requestInventoryFromAllPeers2();
  await publish("inventory.reconciliation.request", {
    requestId: crypto.randomUUID(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function getInventorySnapshot() {
  const db2 = getDb();
  return db2.select({
    productId: inventory.productId,
    currentStock: inventory.currentStock,
    reservedStock: inventory.reservedStock,
    lastUpdated: inventory.lastUpdated
  }).from(inventory).all();
}
let wss = null;
const connectedPeers = /* @__PURE__ */ new Map();
function startPeerServer(port) {
  if (wss) {
    console.log("WebSocket server already running");
    return;
  }
  try {
    wss = new WebSocketServer({ port });
    wss.on("listening", () => {
      console.log(`WebSocket server listening on port ${port}`);
    });
    wss.on("connection", (ws, req) => {
      const clientIp = req.socket.remoteAddress;
      console.log(`New peer connection from ${clientIp}`);
      ws.on("message", async (data) => {
        try {
          const parsedData = JSON.parse(data.toString());
          if (parsedData.type === "inventory_request") {
            console.log("Received inventory request from peer");
            const inventorySnapshot = getInventorySnapshot();
            ws.send(JSON.stringify({
              type: "inventory_response",
              requestId: parsedData.requestId,
              inventory: inventorySnapshot,
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            }));
            return;
          } else if (parsedData.type === "inventory_response") {
            console.log("Received inventory response from peer");
            if (parsedData.inventory) {
              await performInventoryReconciliation(parsedData.inventory);
            }
            return;
          }
          const message = parsedData;
          console.log(`Received message from peer:`, message);
          const db2 = getDb();
          const existing = await db2.select().from(inboxProcessed).where(eq(inboxProcessed.messageId, message.id)).limit(1);
          if (existing.length > 0) {
            console.log(`Message ${message.id} already processed, skipping`);
            ws.send(JSON.stringify({ type: "ack", messageId: message.id }));
            return;
          }
          await processIncomingMessage(message);
          await db2.insert(inboxProcessed).values({
            messageId: message.id,
            fromTerminal: message.fromTerminal,
            topic: message.topic,
            payload: message.payload,
            processedAt: now()
          });
          ws.send(JSON.stringify({ type: "ack", messageId: message.id }));
        } catch (error) {
          console.error("Error processing peer message:", error);
          ws.send(JSON.stringify({ type: "error", error: "Failed to process message" }));
        }
      });
      ws.on("close", () => {
        console.log(`Peer connection closed from ${clientIp}`);
      });
      ws.on("error", (error) => {
        console.error(`WebSocket error from ${clientIp}:`, error);
      });
    });
    wss.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
  } catch (error) {
    console.error("Failed to start WebSocket server:", error);
    throw error;
  }
}
function stopPeerServer() {
  if (wss) {
    wss.close(() => {
      console.log("WebSocket server stopped");
    });
    wss = null;
  }
  connectedPeers.clear();
}
async function processIncomingMessage(message) {
  console.log(`Processing ${message.topic} message from ${message.fromTerminal}`);
  switch (message.topic) {
    case "transaction":
      console.log("Transaction sync:", message.payload);
      break;
    case "inventory":
      console.log("Inventory sync:", message.payload);
      break;
    case "customer":
      console.log("Customer sync:", message.payload);
      break;
    default:
      console.log(`Unknown message topic: ${message.topic}`);
  }
}
const peers = /* @__PURE__ */ new Map();
const pendingAcks = /* @__PURE__ */ new Map();
const RECONNECT_DELAY = 5e3;
const ACK_TIMEOUT = 1e4;
function connectToPeers(peerUrls, terminalId) {
  for (const url of peerUrls) {
    if (!peers.has(url)) {
      peers.set(url, {
        url,
        ws: null,
        isConnected: false
      });
    }
    connectToPeer(url, terminalId);
  }
}
function connectToPeer(url, terminalId) {
  const peer = peers.get(url);
  if (!peer) return;
  try {
    console.log(`Connecting to peer: ${url}`);
    const ws = new WebSocket(url);
    peer.ws = ws;
    ws.on("open", () => {
      console.log(`Connected to peer: ${url}`);
      peer.isConnected = true;
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
        peer.reconnectTimer = void 0;
      }
      sendPendingMessagesToPeer(peer, terminalId);
    });
    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === "ack" && response.messageId) {
          const pending = pendingAcks.get(response.messageId);
          if (pending) {
            pending.resolve();
            pendingAcks.delete(response.messageId);
            markSent(response.messageId, "peer_ack");
          }
        } else if (response.type === "inventory_request") {
          console.log("Received inventory request from peer");
          const inventorySnapshot = getInventorySnapshot();
          ws.send(JSON.stringify({
            type: "inventory_response",
            requestId: response.requestId,
            inventory: inventorySnapshot,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          }));
        } else if (response.type === "inventory_response") {
          console.log("Received inventory response from peer");
          if (response.inventory) {
            performInventoryReconciliation(response.inventory);
          }
        }
      } catch (error) {
        console.error("Error parsing peer response:", error);
      }
    });
    ws.on("close", () => {
      console.log(`Disconnected from peer: ${url}`);
      peer.isConnected = false;
      peer.ws = null;
      scheduleReconnect(url, terminalId);
    });
    ws.on("error", (error) => {
      console.error(`WebSocket client error for ${url}:`, error);
      peer.isConnected = false;
    });
  } catch (error) {
    console.error(`Failed to connect to peer ${url}:`, error);
    scheduleReconnect(url, terminalId);
  }
}
function scheduleReconnect(url, terminalId) {
  const peer = peers.get(url);
  if (!peer) return;
  if (peer.reconnectTimer) {
    clearTimeout(peer.reconnectTimer);
  }
  peer.reconnectTimer = setTimeout(() => {
    console.log(`Attempting to reconnect to peer: ${url}`);
    connectToPeer(url, terminalId);
  }, RECONNECT_DELAY);
}
async function sendPendingMessagesToPeer(peer, terminalId) {
  if (!peer.ws || !peer.isConnected) return;
  try {
    const pendingMessages = await getPendingMessages("pending", 100);
    for (const message of pendingMessages) {
      await sendMessageToPeer(peer, message, terminalId);
    }
  } catch (error) {
    console.error("Error sending pending messages:", error);
  }
}
async function sendMessageToPeer(peer, message, terminalId) {
  if (!peer.ws || !peer.isConnected) return;
  const peerMessage = {
    id: message.id,
    fromTerminal: terminalId,
    topic: message.topic,
    payload: message.payload,
    timestamp: message.createdAt.toISOString()
  };
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingAcks.delete(message.id);
      incrementRetryCount(message.id);
      reject(new Error(`ACK timeout for message ${message.id}`));
    }, ACK_TIMEOUT);
    pendingAcks.set(message.id, {
      messageId: message.id,
      resolve: () => {
        clearTimeout(timeoutId);
        resolve();
      },
      reject
    });
    peer.ws.send(JSON.stringify(peerMessage), (error) => {
      if (error) {
        clearTimeout(timeoutId);
        pendingAcks.delete(message.id);
        reject(error);
      }
    });
  });
}
function disconnectFromPeers() {
  for (const [url, peer] of peers) {
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer);
    }
    if (peer.ws) {
      peer.ws.close();
    }
  }
  peers.clear();
  pendingAcks.clear();
}
async function requestInventoryFromAllPeers() {
  const requestId = Math.random().toString(36).substring(7);
  for (const [url, peer] of peers) {
    if (peer.isConnected && peer.ws) {
      console.log(`Requesting inventory from peer: ${url}`);
      peer.ws.send(JSON.stringify({
        type: "inventory_request",
        requestId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }));
    }
  }
}
const wsClient = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  connectToPeers,
  disconnectFromPeers,
  requestInventoryFromAllPeers
}, Symbol.toStringTag, { value: "Module" }));
let syncIntervalTimer = null;
let isRunning = false;
const DEFAULT_SYNC_INTERVAL = 3e4;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 3;
function startCloudSync(config) {
  if (isRunning) {
    console.log("Cloud sync already running");
    return;
  }
  const {
    supabaseUrl,
    supabaseServiceKey,
    terminalId,
    syncInterval: syncInterval2 = DEFAULT_SYNC_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE
  } = config;
  if (!supabaseUrl || supabaseUrl === "your_supabase_url") {
    console.log("Cloud sync disabled - no Supabase URL configured");
    return;
  }
  if (!supabaseServiceKey || supabaseServiceKey === "your_supabase_service_key") {
    console.log("Cloud sync disabled - no Supabase service key configured");
    return;
  }
  console.log(`Starting cloud sync for terminal ${terminalId}`);
  console.log(`Sync interval: ${syncInterval2}ms, Batch size: ${batchSize}`);
  isRunning = true;
  syncToCloud(config);
  syncIntervalTimer = setInterval(() => {
    syncToCloud(config);
  }, syncInterval2);
}
function stopCloudSync() {
  if (syncIntervalTimer) {
    clearInterval(syncIntervalTimer);
    syncIntervalTimer = null;
  }
  isRunning = false;
  console.log("Cloud sync stopped");
}
async function syncToCloud(config) {
  const {
    supabaseUrl,
    supabaseServiceKey,
    terminalId,
    batchSize = DEFAULT_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES
  } = config;
  try {
    const messages = await getPendingMessages("peer_ack", batchSize);
    if (messages.length === 0) {
      return;
    }
    console.log(`Syncing ${messages.length} messages to cloud`);
    const concurrency = 5;
    const results = [];
    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((msg) => sendToCloud(msg, supabaseUrl, supabaseServiceKey, terminalId, maxRetries))
      );
      results.push(...batchResults);
    }
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`Cloud sync completed: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error("Error during cloud sync:", error);
  }
}
async function sendToCloud(message, supabaseUrl, serviceKey, terminalId, maxRetries) {
  if (message.retryCount >= maxRetries) {
    console.error(`Message ${message.id} exceeded max retries (${maxRetries})`);
    return { success: false, messageId: message.id, error: "Max retries exceeded" };
  }
  try {
    const payload = {
      messageId: message.id,
      terminalId,
      topic: message.topic,
      data: message.payload,
      timestamp: message.createdAt.toISOString(),
      peerAckedAt: message.peerAckedAt?.toISOString()
    };
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-pos-message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      await markSent(message.id, "cloud_ack");
      return { success: true, messageId: message.id };
    } else {
      const error = await response.text();
      console.error(`Cloud sync failed for message ${message.id}:`, error);
      await incrementRetryCount(message.id);
      return { success: false, messageId: message.id, error };
    }
  } catch (error) {
    console.error(`Error sending message ${message.id} to cloud:`, error);
    await incrementRetryCount(message.id);
    return {
      success: false,
      messageId: message.id,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
let syncInterval = null;
let reconcileInterval = null;
const SYNC_INTERVAL = 5e3;
const RECONCILE_INTERVAL = 6e5;
function getConfig() {
  let terminalId = process.env.TERMINAL_ID || "L1";
  let terminalPort = parseInt(process.env.TERMINAL_PORT || "8123");
  try {
    const settings = require2("../../settings.local.json");
    if (settings.terminalId) terminalId = settings.terminalId;
    if (settings.terminalPort) terminalPort = settings.terminalPort;
  } catch (error) {
  }
  const peerTerminals = process.env.PEER_TERMINALS ? process.env.PEER_TERMINALS.split(",").map((url) => url.trim()) : [];
  return { terminalId, terminalPort, peerTerminals };
}
function startLaneSync() {
  const { terminalId, terminalPort, peerTerminals } = getConfig();
  console.log(`Starting lane sync for terminal ${terminalId} on port ${terminalPort}`);
  console.log(`Peer terminals: ${peerTerminals.join(", ") || "none"}`);
  try {
    startPeerServer(terminalPort);
  } catch (error) {
    console.error("Failed to start peer server:", error);
    try {
      console.log(`Port ${terminalPort} in use, trying ${terminalPort + 1}`);
      startPeerServer(terminalPort + 1);
    } catch (error2) {
      console.error("Failed to start peer server on alternate port:", error2);
    }
  }
  if (peerTerminals.length > 0) {
    connectToPeers(peerTerminals, terminalId);
  }
  syncInterval = setInterval(async () => {
    try {
      const pendingMessages = await getPendingMessages("pending", 50);
      if (pendingMessages.length > 0) {
        console.log(`Found ${pendingMessages.length} pending messages to sync`);
      }
    } catch (error) {
      console.error("Error in sync interval:", error);
    }
  }, SYNC_INTERVAL);
  reconcileInterval = setInterval(async () => {
    try {
      console.log("Starting scheduled inventory reconciliation");
      await requestInventoryFromPeers();
    } catch (error) {
      console.error("Error in reconciliation interval:", error);
    }
  }, RECONCILE_INTERVAL);
  setTimeout(async () => {
    try {
      console.log("Running initial inventory reconciliation");
      await requestInventoryFromPeers();
    } catch (error) {
      console.error("Error in initial reconciliation:", error);
    }
  }, 3e4);
}
function stopLaneSync() {
  console.log("Stopping lane sync");
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (reconcileInterval) {
    clearInterval(reconcileInterval);
    reconcileInterval = null;
  }
  disconnectFromPeers();
  stopPeerServer();
}
let mainWindow = null;
const configResult = validateConfig();
if (!configResult.isValid) {
  handleConfigErrors(configResult);
  app.quit();
  process.exit(1);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
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
    console.log("========================================");
    console.log("Euphoria POS Starting");
    console.log(`Terminal ID: ${configResult.config.terminalId}`);
    console.log(`Terminal Port: ${configResult.config.terminalPort}`);
    console.log(`Peer Terminals: ${configResult.config.peerTerminals.join(", ") || "none"}`);
    console.log("========================================\n");
    initializeDatabase();
    await seedInitialData();
    setupAuthHandlers();
    setupTransactionHandlers();
    startLaneSync();
    if (configResult.config.supabaseUrl && configResult.config.supabaseServiceKey) {
      console.log("Starting cloud sync...");
      startCloudSync({
        supabaseUrl: configResult.config.supabaseUrl,
        supabaseServiceKey: configResult.config.supabaseServiceKey,
        terminalId: configResult.config.terminalId,
        syncInterval: 3e4,
        // 30 seconds
        batchSize: 50,
        maxRetries: 3
      });
    } else {
      console.log("Cloud sync disabled (no Supabase credentials)");
    }
    createWindow();
  } catch (error) {
    console.error("Failed to start application:", error);
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start Euphoria POS:

${error instanceof Error ? error.message : "Unknown error"}`
    );
    app.quit();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  console.log("Shutting down Euphoria POS...");
  stopLaneSync();
  stopCloudSync();
  closeDatabase();
  console.log("Shutdown complete");
});
