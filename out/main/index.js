import { app, ipcMain, net, BrowserWindow } from "electron";
import path, { join } from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";
import { relations, eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import WebSocket, { WebSocketServer } from "ws";
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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
}, (table) => ({
  skuIdx: index("products_sku_idx").on(table.sku),
  categoryIdx: index("products_category_idx").on(table.category)
}));
const productBarcodes = sqliteTable("product_barcodes", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  barcode: text("barcode", { length: 50 }).notNull().unique(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
}, (table) => ({
  barcodeIdx: index("product_barcodes_barcode_idx").on(table.barcode)
}));
const inventory = sqliteTable("inventory", {
  productId: text("product_id").references(() => products.id).primaryKey(),
  currentStock: integer("current_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  // For held orders
  lastUpdated: text("last_updated").default("CURRENT_TIMESTAMP"),
  lastSyncedAt: text("last_synced_at")
  // For multi-lane sync tracking
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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
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
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
});
const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  transactionNumber: text("transaction_number", { length: 20 }).notNull().unique(),
  // Human-readable
  customerId: text("customer_id").references(() => customers.id),
  employeeId: text("employee_id").references(() => employees.id).notNull(),
  subtotal: real("subtotal").notNull(),
  taxAmount: real("tax_amount").notNull(),
  discountAmount: real("discount_amount").default(0),
  totalAmount: real("total_amount").notNull(),
  // Loyalty tracking
  pointsEarned: integer("points_earned").default(0),
  // Calculated at checkout based on items and multipliers
  pointsRedeemed: integer("points_redeemed").default(0),
  // If customer used points for discount
  status: text("status").notNull().default("completed"),
  // 'pending', 'completed', 'voided', 'refunded'
  salesChannel: text("sales_channel").notNull().default("pos"),
  // 'pos', 'doordash', 'grubhub', 'employee'
  // For returns/exchanges
  originalTransactionId: text("original_transaction_id").references(() => transactions.id),
  // Multi-lane tracking
  terminalId: text("terminal_id", { length: 20 }).notNull(),
  syncStatus: text("sync_status", { length: 20 }).default("synced"),
  // synced, pending, failed
  // Zinrelo sync tracking
  zinreloSyncStatus: text("zinrelo_sync_status", { length: 20 }).default("pending"),
  // pending, synced, failed
  zinreloSyncedAt: text("zinrelo_synced_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  completedAt: text("completed_at"),
  // Metadata for third-party orders
  metadata: text("metadata", { mode: "json" })
  // { orderId: 'DD-12345', customerName: 'John Doe', platform: 'doordash' }
}, (table) => ({
  transactionNumberIdx: index("transactions_number_idx").on(table.transactionNumber),
  createdAtIdx: index("transactions_created_at_idx").on(table.createdAt),
  customerIdx: index("transactions_customer_idx").on(table.customerId),
  customerDateIdx: index("transactions_customer_date_idx").on(table.customerId, table.createdAt),
  // Fast customer history
  syncStatusIdx: index("transactions_sync_status_idx").on(table.syncStatus),
  zinreloSyncIdx: index("transactions_zinrelo_sync_idx").on(table.zinreloSyncStatus)
}));
const transactionItems = sqliteTable("transaction_items", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(() => transactions.id).notNull(),
  productId: text("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  discountAmount: real("discount_amount").default(0),
  totalPrice: real("total_price").notNull(),
  // For tracking what discounts were applied
  discountReason: text("discount_reason"),
  // 'case_discount', 'employee_price', etc.
  // Loyalty points earned on this item
  pointsEarned: integer("points_earned").default(0),
  // Item-level tracking for detailed reports
  isReturned: integer("is_returned", { mode: "boolean" }).default(false),
  returnedAt: text("returned_at")
}, (table) => ({
  transactionIdx: index("transaction_items_transaction_idx").on(table.transactionId),
  productIdx: index("transaction_items_product_idx").on(table.productId)
}));
const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  transactionId: text("transaction_id").references(() => transactions.id).notNull(),
  paymentMethod: text("payment_method").notNull(),
  // 'cash', 'credit', 'debit', 'gift_card', 'loyalty_points', 'employee_tab', 'third_party'
  amount: real("amount").notNull(),
  // For card payments
  cardLastFour: text("card_last_four", { length: 4 }),
  cardType: text("card_type", { length: 20 }),
  // visa, mastercard, etc.
  authorizationCode: text("authorization_code", { length: 50 }),
  // For cash
  tenderedAmount: real("tendered_amount"),
  changeAmount: real("change_amount"),
  // For gift cards
  giftCardId: text("gift_card_id").references(() => giftCards.id),
  // For loyalty points
  pointsUsed: integer("points_used"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
});
const giftCards = sqliteTable("gift_cards", {
  id: text("id").primaryKey(),
  cardNumber: text("card_number", { length: 20 }).notNull().unique(),
  pin: text("pin", { length: 10 }).notNull(),
  initialBalance: real("initial_balance").notNull(),
  currentBalance: real("current_balance").notNull(),
  issuedBy: text("issued_by").references(() => employees.id),
  purchaseTransactionId: text("purchase_transaction_id").references(() => transactions.id),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP"),
  lastUsedAt: text("last_used_at")
});
const inventoryChanges = sqliteTable("inventory_changes", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  changeType: text("change_type").notNull(),
  // 'sale', 'return', 'adjustment', 'receive'
  changeAmount: integer("change_amount").notNull(),
  // negative for sales, positive for returns/receives
  newStockLevel: integer("new_stock_level").notNull(),
  // What caused this change
  transactionId: text("transaction_id").references(() => transactions.id),
  transactionItemId: text("transaction_item_id").references(() => transactionItems.id),
  // Multi-lane tracking
  terminalId: text("terminal_id", { length: 20 }).notNull(),
  employeeId: text("employee_id").references(() => employees.id),
  notes: text("notes"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
}, (table) => ({
  productIdx: index("inventory_changes_product_idx").on(table.productId),
  createdAtIdx: index("inventory_changes_created_at_idx").on(table.createdAt)
}));
const posConfig = sqliteTable("pos_config", {
  key: text("key", { length: 50 }).primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
});
const outbox = sqliteTable("outbox", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  // 'transaction:new', 'inventory:update', etc.
  payload: text("payload", { mode: "json" }).notNull(),
  status: text("status").notNull(),
  // 'pending', 'sent', 'peer_ack', 'cloud_ack', 'error'
  retries: integer("retries").default(0),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
});
const inboxProcessed = sqliteTable("inbox_processed", {
  id: text("id").primaryKey(),
  // Message ID from other terminal
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
});
const discountRules = sqliteTable("discount_rules", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  // 'item', 'order', 'case'
  category: text("category"),
  // 'wine', 'liquor', 'beer', 'other'
  size: text("size"),
  // '750ml', '1L', etc.
  percent: real("percent"),
  fixedAmount: real("fixed_amount"),
  employeeApprovalRequired: integer("employee_approval_required", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
});
const customerProductHistory = sqliteTable("customer_product_history", {
  customerId: text("customer_id").references(() => customers.id).notNull(),
  productId: text("product_id").references(() => products.id).notNull(),
  firstPurchased: text("first_purchased").notNull(),
  lastPurchased: text("last_purchased").notNull(),
  purchaseCount: integer("purchase_count").notNull().default(1),
  totalQuantity: integer("total_quantity").notNull(),
  averageQuantityPerPurchase: real("avg_quantity"),
  // Denormalized for quick access
  productName: text("product_name").notNull(),
  productCategory: text("product_category").notNull(),
  updatedAt: text("updated_at").default("CURRENT_TIMESTAMP")
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index("customer_product_history_customer_idx").on(table.customerId),
  lastPurchasedIdx: index("customer_product_history_last_purchased_idx").on(table.customerId, table.lastPurchased),
  purchaseCountIdx: index("customer_product_history_count_idx").on(table.customerId, table.purchaseCount)
}));
const caseDiscountRules = sqliteTable("case_discount_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  // 'wine', 'liquor', 'beer', 'other'
  size: text("size").notNull(),
  // '750ml', '1L', '1.5L', '1.75L', 'other'
  unitsPerCase: integer("units_per_case").notNull(),
  // 12 for 750ml, 6 for 1.5L
  discountPercent: real("discount_percent").notNull(),
  // 10.00 for 10%
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
});
const priceHistory = sqliteTable("price_history", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id).notNull(),
  oldPrice: real("old_price").notNull(),
  newPrice: real("new_price").notNull(),
  oldCost: real("old_cost").notNull(),
  newCost: real("new_cost").notNull(),
  changedBy: text("changed_by").references(() => employees.id),
  changeReason: text("change_reason"),
  effectiveDate: text("effective_date").default("CURRENT_TIMESTAMP"),
  createdAt: text("created_at").default("CURRENT_TIMESTAMP")
});
const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  transactionItems: many(transactionItems),
  priceHistory: many(priceHistory),
  inventoryChanges: many(inventoryChanges),
  childProducts: many(products, { relationName: "parentChild" }),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id],
    relationName: "parentChild"
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
const customersRelations = relations(customers, ({ many }) => ({
  transactions: many(transactions),
  productHistory: many(customerProductHistory)
}));
const employeesRelations = relations(employees, ({ many }) => ({
  transactions: many(transactions),
  giftCardsIssued: many(giftCards),
  inventoryChanges: many(inventoryChanges),
  priceChanges: many(priceHistory)
}));
const transactionsRelations = relations(transactions, ({ one, many }) => ({
  customer: one(customers, {
    fields: [transactions.customerId],
    references: [customers.id]
  }),
  employee: one(employees, {
    fields: [transactions.employeeId],
    references: [employees.id]
  }),
  items: many(transactionItems),
  payments: many(payments),
  inventoryChanges: many(inventoryChanges),
  originalTransaction: one(transactions, {
    fields: [transactions.originalTransactionId],
    references: [transactions.id],
    relationName: "returnOriginal"
  }),
  returns: many(transactions, { relationName: "returnOriginal" })
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
const paymentsRelations = relations(payments, ({ one }) => ({
  transaction: one(transactions, {
    fields: [payments.transactionId],
    references: [transactions.id]
  }),
  giftCard: one(giftCards, {
    fields: [payments.giftCardId],
    references: [giftCards.id]
  })
}));
const giftCardsRelations = relations(giftCards, ({ one, many }) => ({
  issuedBy: one(employees, {
    fields: [giftCards.issuedBy],
    references: [employees.id]
  }),
  purchaseTransaction: one(transactions, {
    fields: [giftCards.purchaseTransactionId],
    references: [transactions.id]
  }),
  payments: many(payments)
}));
const inventoryChangesRelations = relations(inventoryChanges, ({ one }) => ({
  product: one(products, {
    fields: [inventoryChanges.productId],
    references: [products.id]
  }),
  transaction: one(transactions, {
    fields: [inventoryChanges.transactionId],
    references: [transactions.id]
  }),
  transactionItem: one(transactionItems, {
    fields: [inventoryChanges.transactionItemId],
    references: [transactionItems.id]
  }),
  employee: one(employees, {
    fields: [inventoryChanges.employeeId],
    references: [employees.id]
  })
}));
const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  product: one(products, {
    fields: [priceHistory.productId],
    references: [products.id]
  }),
  changedBy: one(employees, {
    fields: [priceHistory.changedBy],
    references: [employees.id]
  })
}));
const customerProductHistoryRelations = relations(customerProductHistory, ({ one }) => ({
  customer: one(customers, {
    fields: [customerProductHistory.customerId],
    references: [customers.id]
  }),
  product: one(products, {
    fields: [customerProductHistory.productId],
    references: [products.id]
  })
}));
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  caseDiscountRules,
  customerProductHistory,
  customerProductHistoryRelations,
  customers,
  customersRelations,
  discountRules,
  employees,
  employeesRelations,
  giftCards,
  giftCardsRelations,
  inboxProcessed,
  inventory,
  inventoryChanges,
  inventoryChangesRelations,
  inventoryRelations,
  outbox,
  payments,
  paymentsRelations,
  posConfig,
  priceHistory,
  priceHistoryRelations,
  productBarcodes,
  productBarcodesRelations,
  products,
  productsRelations,
  get schema() {
    return schema;
  },
  transactionItems,
  transactionItemsRelations,
  transactions,
  transactionsRelations
}, Symbol.toStringTag, { value: "Module" }));
const dbPath = path.join(app.getPath("userData"), "pos.sqlite");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite, { schema });
async function withTxn(fn) {
  return await db.transaction(async (tx) => {
    return await fn(tx);
  });
}
function initializeDatabase() {
  try {
    const migrationsPath = path.join(__dirname, "../../drizzle/sqlite");
    migrate(db, { migrationsFolder: migrationsPath });
    console.log("Database initialized successfully at:", dbPath);
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}
const mockEmployees = [
  {
    employeeCode: "EMP001",
    firstName: "John",
    lastName: "Doe",
    pin: "",
    // Will be hashed below
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: true,
    isManager: true
  },
  {
    employeeCode: "EMP002",
    firstName: "Jane",
    lastName: "Smith",
    pin: "",
    // Will be hashed below
    isActive: true,
    canOverridePrice: false,
    canVoidTransaction: false,
    isManager: false
  },
  {
    employeeCode: "EMP003",
    firstName: "Mike",
    lastName: "Johnson",
    pin: "",
    // Will be hashed below
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: false,
    isManager: false
  }
];
const PINS = ["1234", "5678", "9999"];
async function seedEmployees() {
  try {
    const count = await db.select({ count: employees.id }).from(employees).limit(1);
    if (count.length > 0) {
      console.log("Employees already exist, skipping seed");
      return;
    }
    const employeesToInsert = await Promise.all(
      mockEmployees.map(async (emp, index2) => ({
        ...emp,
        id: v4(),
        pin: await bcrypt.hash(PINS[index2], 10)
      }))
    );
    await db.insert(employees).values(employeesToInsert);
    console.log("Seeded mock employees successfully");
  } catch (error) {
    console.error("Failed to seed employees:", error);
  }
}
async function verifyPin(pin) {
  try {
    const employees$1 = await db.select().from(employees).where(eq(employees.isActive, true));
    for (const employee of employees$1) {
      const isMatch = await bcrypt.compare(pin, employee.pin);
      if (isMatch) {
        if (!employee.isActive) {
          throw new Error("EMPLOYEE_INACTIVE");
        }
        return employee;
      }
    }
    return null;
  } catch (error) {
    console.error("PIN verification error:", error);
    throw error;
  }
}
async function seedInitialData() {
  try {
    const configCount = await db.select({ count: posConfig.key.count() }).from(posConfig).limit(1);
    if (configCount[0]?.count === 0) {
      await db.insert(posConfig).values([
        {
          key: "tax_rate",
          value: JSON.stringify({ percent: 8 }),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          key: "loyalty_points_per_dollar",
          value: JSON.stringify(1),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          key: "terminal_sequence",
          value: JSON.stringify(0),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]);
      console.log("Seeded default POS configuration");
    }
    const discountCount = await db.select({ count: discountRules.id.count() }).from(discountRules).limit(1);
    if (discountCount[0]?.count === 0) {
      await db.insert(discountRules).values({
        id: "case-discount-wine-750ml",
        scope: "case",
        category: "wine",
        size: "750ml",
        percent: 10,
        fixedAmount: null,
        employeeApprovalRequired: false,
        isActive: true,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      console.log("Seeded sample discount rule");
    }
  } catch (error) {
    console.error("Failed to seed initial data:", error);
  }
}
let currentEmployee = null;
function setupAuthHandlers() {
  ipcMain.handle("auth:verify-pin", async (_, pin) => {
    try {
      const emp = await verifyPin(pin);
      if (!emp) return null;
      currentEmployee = emp;
      return {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName
      };
    } catch (error) {
      if (error.message === "EMPLOYEE_INACTIVE") {
        console.error("Employee is inactive");
        return null;
      }
      console.error("PIN verification failed:", error);
      return null;
    }
  });
  ipcMain.handle("auth:logout", async () => {
    currentEmployee = null;
  });
  ipcMain.handle("auth:get-current-employee", async () => {
    if (!currentEmployee) return null;
    return {
      id: currentEmployee.id,
      name: `${currentEmployee.firstName} ${currentEmployee.lastName}`
    };
  });
}
function assertAuthenticated() {
  if (!currentEmployee) {
    throw new Error("Not authenticated");
  }
  return currentEmployee;
}
function getCurrentEmployee() {
  return currentEmployee;
}
function setupDatabaseHandlers() {
  ipcMain.handle("db:get-products", async () => {
    assertAuthenticated();
    return await db.select().from(products).where(products.isActive.eq(true));
  });
  ipcMain.handle("db:get-product", async (_, barcode) => {
    assertAuthenticated();
    const productBarcode = await db.select().from(productBarcodes).where(productBarcodes.barcode.eq(barcode)).limit(1);
    if (productBarcode.length === 0) {
      return null;
    }
    const product = await db.select().from(products).where(products.id.eq(productBarcode[0].productId)).limit(1);
    return product[0] || null;
  });
  ipcMain.handle("db:get-discount-rules", async () => {
    assertAuthenticated();
    return await db.select().from(discountRules).where(discountRules.isActive.eq(true));
  });
}
async function publish(type, payload) {
  const message = {
    id: v4(),
    type,
    payload,
    status: "pending",
    retries: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await db.insert(outbox).values(message);
}
async function markSent(id, peer) {
  const status = peer === "lane" ? "peer_ack" : peer === "cloud" ? "cloud_ack" : "sent";
  await db.update(outbox).set({ status }).where(eq(outbox.id, id));
}
async function markError(id) {
  await db.update(outbox).set({ status: "error" }).where(eq(outbox.id, id));
}
async function incrementRetries(id) {
  await db.update(outbox).set({
    retries: sql`${outbox.retries} + 1`
  }).where(eq(outbox.id, id));
}
async function getPendingMessages(status = "pending") {
  return await db.select().from(outbox).where(eq(outbox.status, status)).orderBy(outbox.createdAt);
}
const PROTECTED_KEYS = [
  "tax_rate",
  "loyalty_points_per_dollar",
  "discount_thresholds",
  "case_discount_rules"
];
async function getConfig(key) {
  const result = await db.select().from(posConfig).where(posConfig.key.eq(key)).limit(1);
  if (result.length === 0) {
    throw new Error(`Configuration key not found: ${key}`);
  }
  return JSON.parse(result[0].value);
}
async function setConfig(key, value) {
  if (PROTECTED_KEYS.includes(key)) {
    const employee = getCurrentEmployee();
    if (!employee || !employee.isManager) {
      throw new Error("FORBIDDEN: Manager permission required");
    }
  }
  const valueStr = JSON.stringify(value);
  const existing = await db.select().from(posConfig).where(posConfig.key.eq(key)).limit(1);
  if (existing.length > 0) {
    await db.update(posConfig).set({
      value: valueStr,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(posConfig.key.eq(key));
  } else {
    await db.insert(posConfig).values({
      key,
      value: valueStr,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  await publish("pos_config:update", { key, value });
}
async function getAllConfig() {
  const results = await db.select().from(posConfig);
  const config = {};
  for (const row of results) {
    try {
      config[row.key] = JSON.parse(row.value);
    } catch {
      config[row.key] = row.value;
    }
  }
  return config;
}
function setupConfigHandlers() {
  ipcMain.handle("config:get", async (_, key) => {
    assertAuthenticated();
    return await getConfig(key);
  });
  ipcMain.handle("config:set", async (_, key, value) => {
    assertAuthenticated();
    return await setConfig(key, value);
  });
  ipcMain.handle("config:get-all", async () => {
    assertAuthenticated();
    return await getAllConfig();
  });
}
let wss = null;
function startWebSocketServer(port) {
  if (wss) {
    console.log("WebSocket server already running");
    return;
  }
  wss = new WebSocketServer({ port });
  wss.on("connection", (ws) => {
    console.log("Peer lane connected");
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const processed = await db.select().from(inboxProcessed).where(eq(inboxProcessed.id, message.id)).limit(1);
        if (processed.length > 0) {
          ws.send(JSON.stringify({ ack: message.id }));
          return;
        }
        await processIncomingMessage(message);
        await db.insert(inboxProcessed).values({
          id: message.id,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        ws.send(JSON.stringify({ ack: message.id }));
      } catch (error) {
        console.error("Error processing peer message:", error);
        ws.send(JSON.stringify({ error: "Processing failed" }));
      }
    });
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
    ws.on("close", () => {
      console.log("Peer lane disconnected");
    });
  });
  console.log(`WebSocket server listening on port ${port}`);
}
function stopWebSocketServer() {
  if (wss) {
    wss.close(() => {
      console.log("WebSocket server stopped");
    });
    wss = null;
  }
}
async function processIncomingMessage(message) {
  const { type, payload } = message;
  await withTxn(async (tx) => {
    switch (type) {
      case "transaction:new":
        await upsertTransaction(tx, payload);
        break;
      case "inventory:update":
        await updateInventory(tx, payload);
        break;
      case "employee:upsert":
        await upsertEmployee(tx, payload);
        break;
      case "product:upsert":
        await upsertProduct(tx, payload);
        break;
      case "pos_config:update":
        await updatePosConfig(tx, payload);
        break;
      case "discount_rule:upsert":
        await upsertDiscountRule(tx, payload);
        break;
      default:
        console.warn("Unknown message type:", type);
    }
  });
}
async function upsertTransaction(tx, data) {
  const existing = await tx.select().from(transactions).where(eq(transactions.id, data.id)).limit(1);
  if (existing.length === 0) {
    await tx.insert(transactions).values(data);
    if (data.items && Array.isArray(data.items)) {
      await tx.insert(transactionItems).values(data.items);
    }
    if (data.payments && Array.isArray(data.payments)) {
      await tx.insert(payments).values(data.payments);
    }
  }
}
async function updateInventory(tx, data) {
  const { productId, change } = data;
  await tx.update(inventory).set({
    currentStock: inventory.currentStock.plus(change),
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).where(inventory.productId.eq(productId));
}
async function upsertEmployee(tx, data) {
  const existing = await tx.select().from(employees).where(employees.id.eq(data.id)).limit(1);
  if (existing.length > 0) {
    await tx.update(employees).set({
      ...data,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(employees.id.eq(data.id));
  } else {
    await tx.insert(employees).values(data);
  }
}
async function upsertProduct(tx, data) {
  const existing = await tx.select().from(products).where(products.id.eq(data.id)).limit(1);
  if (existing.length > 0) {
    await tx.update(products).set({
      ...data,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(products.id.eq(data.id));
  } else {
    await tx.insert(products).values(data);
  }
  if (data.inventory) {
    const invExists = await tx.select().from(inventory).where(inventory.productId.eq(data.id)).limit(1);
    if (invExists.length > 0) {
      await tx.update(inventory).set(data.inventory).where(inventory.productId.eq(data.id));
    } else {
      await tx.insert(inventory).values({
        ...data.inventory,
        productId: data.id
      });
    }
  }
}
async function updatePosConfig(tx, data) {
  const { key, value } = data;
  const existing = await tx.select().from(posConfig).where(posConfig.key.eq(key)).limit(1);
  if (existing.length > 0) {
    await tx.update(posConfig).set({
      value,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(posConfig.key.eq(key));
  } else {
    await tx.insert(posConfig).values({
      key,
      value,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}
async function upsertDiscountRule(tx, data) {
  const existing = await tx.select().from(discountRules).where(discountRules.id.eq(data.id)).limit(1);
  if (existing.length > 0) {
    await tx.update(discountRules).set({
      ...data,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(discountRules.id.eq(data.id));
  } else {
    await tx.insert(discountRules).values(data);
  }
}
const peers = /* @__PURE__ */ new Map();
let syncInterval$1 = null;
let isRunning$1 = false;
const SYNC_INTERVAL_MS$1 = 200;
const BACKOFF_BASE_MS = Number(process.env.SYNC_BACKOFF_BASE_MS) || 2e3;
const MAX_RETRIES$1 = 10;
function startWebSocketClient(peerUrls, terminalId) {
  if (isRunning$1) {
    console.log("WebSocket client already running");
    return;
  }
  isRunning$1 = true;
  for (const url of peerUrls) {
    peers.set(url, {
      url,
      ws: null,
      pendingAcks: /* @__PURE__ */ new Map()
    });
    connectToPeer(url, terminalId);
  }
  syncInterval$1 = setInterval(() => {
    syncPendingMessages(terminalId);
  }, SYNC_INTERVAL_MS$1);
  console.log("WebSocket client started");
}
function stopWebSocketClient() {
  isRunning$1 = false;
  if (syncInterval$1) {
    clearInterval(syncInterval$1);
    syncInterval$1 = null;
  }
  for (const peer of peers.values()) {
    if (peer.ws) {
      peer.ws.close();
    }
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer);
    }
    for (const timer of peer.pendingAcks.values()) {
      clearTimeout(timer);
    }
  }
  peers.clear();
  console.log("WebSocket client stopped");
}
function connectToPeer(url, terminalId) {
  const peer = peers.get(url);
  if (!peer) return;
  try {
    const ws = new WebSocket(url);
    peer.ws = ws;
    ws.on("open", () => {
      console.log(`Connected to peer: ${url}`);
    });
    ws.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.ack) {
          const ackTimer = peer.pendingAcks.get(response.ack);
          if (ackTimer) {
            clearTimeout(ackTimer);
            peer.pendingAcks.delete(response.ack);
            markSent(response.ack, "lane");
          }
        }
      } catch (error) {
        console.error("Error parsing peer response:", error);
      }
    });
    ws.on("error", (error) => {
      console.error(`WebSocket error for ${url}:`, error);
    });
    ws.on("close", () => {
      console.log(`Disconnected from peer: ${url}`);
      peer.ws = null;
      if (isRunning$1) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.random() * 3);
        peer.reconnectTimer = setTimeout(() => {
          connectToPeer(url, terminalId);
        }, backoffMs);
      }
    });
  } catch (error) {
    console.error(`Failed to connect to peer ${url}:`, error);
    if (isRunning$1) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.random() * 3);
      peer.reconnectTimer = setTimeout(() => {
        connectToPeer(url, terminalId);
      }, backoffMs);
    }
  }
}
async function syncPendingMessages(terminalId) {
  try {
    const messages = await getPendingMessages("pending");
    for (const message of messages) {
      for (const peer of peers.values()) {
        if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
          sendMessageToPeer(peer, message, terminalId);
        }
      }
    }
  } catch (error) {
    console.error("Error syncing pending messages:", error);
  }
}
function sendMessageToPeer(peer, message, terminalId) {
  const envelope = {
    id: message.id,
    topic: message.type,
    payload: message.payload,
    origin: terminalId,
    ts: message.createdAt
  };
  try {
    peer.ws.send(JSON.stringify(envelope));
    const ackTimer = setTimeout(async () => {
      peer.pendingAcks.delete(message.id);
      await incrementRetries(message.id);
      if (message.retries >= MAX_RETRIES$1 - 1) {
        await markError(message.id);
        console.error(`Max retries reached for message ${message.id}`);
      }
    }, BACKOFF_BASE_MS * Math.pow(2, message.retries || 0));
    peer.pendingAcks.set(message.id, ackTimer);
  } catch (error) {
    console.error("Error sending message to peer:", error);
  }
}
async function reconcile() {
  try {
    console.log("Starting reconciliation...");
    const checksum = await calculateInventoryChecksum();
    await publish("inventory:checksum", {
      checksum,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log("Reconciliation complete");
  } catch (error) {
    console.error("Reconciliation failed:", error);
  }
}
async function calculateInventoryChecksum() {
  const result = await db.select({
    count: inventoryChanges.id.count(),
    totalChange: inventoryChanges.changeAmount.sum()
  }).from(inventoryChanges).where(
    inventoryChanges.createdAt.gte(
      new Date(Date.now() - 24 * 60 * 60 * 1e3).toISOString()
      // Last 24 hours
    )
  );
  const { count, totalChange } = result[0] || { count: 0, totalChange: 0 };
  return `${count}|${totalChange || 0}`;
}
let reconcileInterval = null;
function startLaneSync() {
  const terminalId = process.env.TERMINAL_ID || "L1";
  const terminalPort = Number(process.env.TERMINAL_PORT) || 8123;
  const peerTerminals = process.env.PEER_TERMINALS?.split(",") || [];
  startWebSocketServer(terminalPort);
  if (peerTerminals.length > 0) {
    startWebSocketClient(peerTerminals, terminalId);
  }
  reconcileInterval = setInterval(() => {
    reconcile().catch(console.error);
  }, 6e5);
  console.log(`Lane sync started - Terminal: ${terminalId}, Port: ${terminalPort}`);
  return {
    stop() {
      stopWebSocketServer();
      stopWebSocketClient();
      if (reconcileInterval) {
        clearInterval(reconcileInterval);
        reconcileInterval = null;
      }
      console.log("Lane sync stopped");
    }
  };
}
let syncInterval = null;
let isRunning = false;
const SYNC_INTERVAL_MS = 5e3;
Number(process.env.SYNC_BACKOFF_BASE_MS) || 2e3;
const MAX_RETRIES = 10;
function startCloudSync() {
  if (isRunning) {
    console.log("Cloud sync already running");
    return { stop: () => {
    } };
  }
  isRunning = true;
  syncInterval = setInterval(() => {
    syncToCloud().catch(console.error);
  }, SYNC_INTERVAL_MS);
  console.log("Cloud sync started");
  return {
    stop() {
      isRunning = false;
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
      console.log("Cloud sync stopped");
    }
  };
}
async function syncToCloud() {
  try {
    const messages = await getPendingMessages("peer_ack");
    for (const message of messages) {
      if (!isRunning) break;
      try {
        await sendToCloud(message);
        await markSent(message.id, "cloud");
      } catch (error) {
        console.error(`Failed to sync message ${message.id} to cloud:`, error);
        await incrementRetries(message.id);
        if (message.retries >= MAX_RETRIES - 1) {
          await markError(message.id);
          console.error(`Max retries reached for cloud sync of message ${message.id}`);
        }
      }
    }
  } catch (error) {
    console.error("Error in cloud sync:", error);
  }
}
async function sendToCloud(message) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration missing");
  }
  const endpoints = {
    "transaction:new": "/functions/v1/ingest/transaction",
    "inventory:update": "/functions/v1/ingest/inventory",
    "employee:upsert": "/functions/v1/ingest/employee",
    "product:upsert": "/functions/v1/ingest/product",
    "pos_config:update": "/functions/v1/ingest/config",
    "discount_rule:upsert": "/functions/v1/ingest/discount"
  };
  const endpoint = endpoints[message.type];
  if (!endpoint) {
    throw new Error(`Unknown message type for cloud sync: ${message.type}`);
  }
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: "POST",
      url: `${supabaseUrl}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "x-terminal-id": process.env.TERMINAL_ID || "unknown"
      }
    });
    request.on("response", (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode === 200) {
          resolve(void 0);
        } else {
          reject(new Error(`Cloud sync failed: ${response.statusCode} - ${data}`));
        }
      });
    });
    request.on("error", (error) => {
      reject(error);
    });
    request.write(JSON.stringify({
      id: message.id,
      type: message.type,
      payload: message.payload,
      timestamp: message.createdAt
    }));
    request.end();
  });
}
function validateConfig() {
  const required = {
    TERMINAL_ID: process.env.TERMINAL_ID,
    TERMINAL_PORT: process.env.TERMINAL_PORT,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  };
  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value || value === "UNSET") {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
  if (required.TERMINAL_ID === "L1" && process.env.NODE_ENV === "production") {
    console.warn('WARNING: Using default terminal ID "L1" in production. Please set a unique TERMINAL_ID.');
  }
  const port = Number(required.TERMINAL_PORT);
  if (isNaN(port) || port < 1024 || port > 65535) {
    throw new Error("TERMINAL_PORT must be a valid port number between 1024 and 65535");
  }
  console.log("Configuration validated successfully");
}
let mainWindow = null;
let laneSync = null;
let cloudSync = null;
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
app.whenReady().then(async () => {
  try {
    validateConfig();
    initializeDatabase();
    await seedEmployees();
    await seedInitialData();
    setupAuthHandlers();
    setupDatabaseHandlers();
    setupConfigHandlers();
    laneSync = startLaneSync();
    cloudSync = startCloudSync();
    createWindow();
  } catch (error) {
    console.error("Failed to initialize app:", error);
    app.quit();
  }
});
app.on("before-quit", () => {
  if (laneSync) {
    laneSync.stop();
  }
  if (cloudSync) {
    cloudSync.stop();
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
