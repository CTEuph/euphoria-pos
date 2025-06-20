import { app, ipcMain, BrowserWindow } from "electron";
import { join } from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { sqliteTable, integer, text, index, primaryKey } from "drizzle-orm/sqlite-core";
import { relations, eq } from "drizzle-orm";
import path from "node:path";
import { v4 } from "uuid";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import bcrypt from "bcrypt";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
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
  const dbPath = path.join(userDataPath, "euphoria-pos.db");
  console.log("Initializing SQLite database at:", dbPath);
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("synchronous = NORMAL");
  db = drizzle(sqliteDb, { schema });
  console.log("Running SQLite migrations...");
  const migrationsFolder = path.join(__dirname, "../../drizzle/sqlite");
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
  } catch (error) {
    console.error("Error seeding initial data:", error);
  }
}
let currentEmployee = null;
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
async function testOutbox() {
  console.log("Testing outbox functionality...");
  initializeDatabase();
  const messageId = await publish("test", { foo: 1, bar: "test" });
  console.log("Published message:", messageId);
  const pending = await getPendingMessages();
  console.log("Pending messages:", pending.length);
  console.log("First message:", pending[0]);
  await markSent(messageId, "peer_ack");
  const peerAcked = await getPendingMessages("peer_ack");
  console.log("Peer acknowledged messages:", peerAcked.length);
  await markSent(messageId, "cloud_ack");
  const stillPending = await getPendingMessages();
  console.log("Still pending messages:", stillPending.length);
  console.log("Outbox tests completed successfully!");
}
let mainWindow = null;
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
  initializeDatabase();
  await seedInitialData();
  setupAuthHandlers();
  await testOutbox();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  closeDatabase();
});
