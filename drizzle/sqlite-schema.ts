import { sqliteTable, text, integer, real, primaryKey, index, unique } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// SQLite doesn't support enums, so we'll use CHECK constraints or just text fields
// We'll validate these at the application level

// Products table
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'wine', 'liquor', 'beer', 'other'
  size: text('size').notNull(), // '750ml', '1L', '1.5L', '1.75L', 'other'
  cost: real('cost').notNull(),
  retailPrice: real('retail_price').notNull(),
  
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: text('parent_product_id').references(() => products.id),
  unitsInParent: integer('units_in_parent').default(1), // e.g., 4 for a 4-pack
  
  // Loyalty configuration
  loyaltyPointMultiplier: real('loyalty_point_multiplier').default(1.0), // 2.0 for double points
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
}, (table) => ({
  skuIdx: index('products_sku_idx').on(table.sku),
  categoryIdx: index('products_category_idx').on(table.category)
}))

// Product barcodes (multiple per product)
export const productBarcodes = sqliteTable('product_barcodes', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id).notNull(),
  barcode: text('barcode', { length: 50 }).notNull().unique(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
}, (table) => ({
  barcodeIdx: index('product_barcodes_barcode_idx').on(table.barcode)
}))

// Inventory levels (per product)
export const inventory = sqliteTable('inventory', {
  productId: text('product_id').references(() => products.id).primaryKey(),
  currentStock: integer('current_stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0), // For held orders
  lastUpdated: text('last_updated').default('CURRENT_TIMESTAMP'),
  lastSyncedAt: text('last_synced_at') // For multi-lane sync tracking
})

// Customers
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  phone: text('phone', { length: 20 }).notNull().unique(),
  email: text('email', { length: 255 }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  
  // Loyalty integration
  zinreloId: text('zinrelo_id', { length: 100 }).unique(),
  loyaltyPoints: integer('loyalty_points').default(0),
  loyaltyTier: text('loyalty_tier', { length: 20 }).default('bronze'),
  
  // RFID/NFC card
  rfidCardId: text('rfid_card_id', { length: 100 }).unique(),
  
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
}, (table) => ({
  phoneIdx: index('customers_phone_idx').on(table.phone),
  rfidIdx: index('customers_rfid_idx').on(table.rfidCardId)
}))

// Employees
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  employeeCode: text('employee_code', { length: 20 }).notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  pin: text('pin', { length: 60 }).notNull(), // Hashed PIN
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  canOverridePrice: integer('can_override_price', { mode: 'boolean' }).default(false),
  canVoidTransaction: integer('can_void_transaction', { mode: 'boolean' }).default(false),
  isManager: integer('is_manager', { mode: 'boolean' }).default(false),
  
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
})

// Transactions
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  transactionNumber: text('transaction_number', { length: 20 }).notNull().unique(), // Human-readable
  
  customerId: text('customer_id').references(() => customers.id),
  employeeId: text('employee_id').references(() => employees.id).notNull(),
  
  subtotal: real('subtotal').notNull(),
  taxAmount: real('tax_amount').notNull(),
  discountAmount: real('discount_amount').default(0.00),
  totalAmount: real('total_amount').notNull(),
  
  // Loyalty tracking
  pointsEarned: integer('points_earned').default(0), // Calculated at checkout based on items and multipliers
  pointsRedeemed: integer('points_redeemed').default(0), // If customer used points for discount
  
  status: text('status').notNull().default('completed'), // 'pending', 'completed', 'voided', 'refunded'
  salesChannel: text('sales_channel').notNull().default('pos'), // 'pos', 'doordash', 'grubhub', 'employee'
  
  // For returns/exchanges
  originalTransactionId: text('original_transaction_id').references(() => transactions.id),
  
  // Multi-lane tracking
  terminalId: text('terminal_id', { length: 20 }).notNull(),
  syncStatus: text('sync_status', { length: 20 }).default('synced'), // synced, pending, failed
  
  // Zinrelo sync tracking
  zinreloSyncStatus: text('zinrelo_sync_status', { length: 20 }).default('pending'), // pending, synced, failed
  zinreloSyncedAt: text('zinrelo_synced_at'),
  
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  completedAt: text('completed_at'),
  
  // Metadata for third-party orders
  metadata: text('metadata', { mode: 'json' }) // { orderId: 'DD-12345', customerName: 'John Doe', platform: 'doordash' }
}, (table) => ({
  transactionNumberIdx: index('transactions_number_idx').on(table.transactionNumber),
  createdAtIdx: index('transactions_created_at_idx').on(table.createdAt),
  customerIdx: index('transactions_customer_idx').on(table.customerId),
  customerDateIdx: index('transactions_customer_date_idx').on(table.customerId, table.createdAt), // Fast customer history
  syncStatusIdx: index('transactions_sync_status_idx').on(table.syncStatus),
  zinreloSyncIdx: index('transactions_zinrelo_sync_idx').on(table.zinreloSyncStatus)
}))

// Transaction items
export const transactionItems = sqliteTable('transaction_items', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').references(() => transactions.id).notNull(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  discountAmount: real('discount_amount').default(0.00),
  totalPrice: real('total_price').notNull(),
  
  // For tracking what discounts were applied
  discountReason: text('discount_reason'), // 'case_discount', 'employee_price', etc.
  
  // Loyalty points earned on this item
  pointsEarned: integer('points_earned').default(0), // Item-level tracking for detailed reports
  
  isReturned: integer('is_returned', { mode: 'boolean' }).default(false),
  returnedAt: text('returned_at')
}, (table) => ({
  transactionIdx: index('transaction_items_transaction_idx').on(table.transactionId),
  productIdx: index('transaction_items_product_idx').on(table.productId)
}))

// Payment records (multiple per transaction for split payments)
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').references(() => transactions.id).notNull(),
  
  paymentMethod: text('payment_method').notNull(), // 'cash', 'credit', 'debit', 'gift_card', 'loyalty_points', 'employee_tab', 'third_party'
  amount: real('amount').notNull(),
  
  // For card payments
  cardLastFour: text('card_last_four', { length: 4 }),
  cardType: text('card_type', { length: 20 }), // visa, mastercard, etc.
  authorizationCode: text('authorization_code', { length: 50 }),
  
  // For cash
  tenderedAmount: real('tendered_amount'),
  changeAmount: real('change_amount'),
  
  // For gift cards
  giftCardId: text('gift_card_id').references(() => giftCards.id),
  
  // For loyalty points
  pointsUsed: integer('points_used'),
  
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
})

// Gift cards
export const giftCards = sqliteTable('gift_cards', {
  id: text('id').primaryKey(),
  cardNumber: text('card_number', { length: 20 }).notNull().unique(),
  pin: text('pin', { length: 10 }).notNull(),
  
  initialBalance: real('initial_balance').notNull(),
  currentBalance: real('current_balance').notNull(),
  
  issuedBy: text('issued_by').references(() => employees.id),
  purchaseTransactionId: text('purchase_transaction_id').references(() => transactions.id),
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  expiresAt: text('expires_at'),
  
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  lastUsedAt: text('last_used_at')
})

// Inventory change audit log
export const inventoryChanges = sqliteTable('inventory_changes', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  changeType: text('change_type').notNull(), // 'sale', 'return', 'adjustment', 'receive'
  changeAmount: integer('change_amount').notNull(), // negative for sales, positive for returns/receives
  newStockLevel: integer('new_stock_level').notNull(),
  
  // What caused this change
  transactionId: text('transaction_id').references(() => transactions.id),
  transactionItemId: text('transaction_item_id').references(() => transactionItems.id),
  
  // Multi-lane tracking
  terminalId: text('terminal_id', { length: 20 }).notNull(),
  employeeId: text('employee_id').references(() => employees.id),
  
  notes: text('notes'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
}, (table) => ({
  productIdx: index('inventory_changes_product_idx').on(table.productId),
  createdAtIdx: index('inventory_changes_created_at_idx').on(table.createdAt)
}))

// POS configuration (from backend)
export const posConfig = sqliteTable('pos_config', {
  key: text('key', { length: 50 }).primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
})

// NEW: Outbox table for sync
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'transaction:new', 'inventory:update', etc.
  payload: text('payload', { mode: 'json' }).notNull(),
  status: text('status').notNull(), // 'pending', 'sent', 'peer_ack', 'cloud_ack', 'error'
  retries: integer('retries').default(0),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
})

// NEW: Inbox processed table to prevent duplicates
export const inboxProcessed = sqliteTable('inbox_processed', {
  id: text('id').primaryKey(), // Message ID from other terminal
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
})

// NEW: Discount rules table
export const discountRules = sqliteTable('discount_rules', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(), // 'item', 'order', 'case'
  category: text('category'), // 'wine', 'liquor', 'beer', 'other'
  size: text('size'), // '750ml', '1L', etc.
  percent: real('percent'),
  fixedAmount: real('fixed_amount'),
  employeeApprovalRequired: integer('employee_approval_required', { mode: 'boolean' }).default(false),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
})

// Customer purchase patterns view (optional - for frequently bought items)
export const customerProductHistory = sqliteTable('customer_product_history', {
  customerId: text('customer_id').references(() => customers.id).notNull(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  firstPurchased: text('first_purchased').notNull(),
  lastPurchased: text('last_purchased').notNull(),
  purchaseCount: integer('purchase_count').notNull().default(1),
  totalQuantity: integer('total_quantity').notNull(),
  averageQuantityPerPurchase: real('avg_quantity'),
  
  // Denormalized for quick access
  productName: text('product_name').notNull(),
  productCategory: text('product_category').notNull(),
  
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index('customer_product_history_customer_idx').on(table.customerId),
  lastPurchasedIdx: index('customer_product_history_last_purchased_idx').on(table.customerId, table.lastPurchased),
  purchaseCountIdx: index('customer_product_history_count_idx').on(table.customerId, table.purchaseCount)
}))

// Case discount rules (configured from backend)
export const caseDiscountRules = sqliteTable('case_discount_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'wine', 'liquor', 'beer', 'other'
  size: text('size').notNull(), // '750ml', '1L', '1.5L', '1.75L', 'other'
  
  unitsPerCase: integer('units_per_case').notNull(), // 12 for 750ml, 6 for 1.5L
  discountPercent: real('discount_percent').notNull(), // 10.00 for 10%
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
})

// Price history tracking
export const priceHistory = sqliteTable('price_history', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  oldPrice: real('old_price').notNull(),
  newPrice: real('new_price').notNull(),
  oldCost: real('old_cost').notNull(),
  newCost: real('new_cost').notNull(),
  
  changedBy: text('changed_by').references(() => employees.id),
  changeReason: text('change_reason'),
  
  effectiveDate: text('effective_date').default('CURRENT_TIMESTAMP'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
})

// Relations
export const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  transactionItems: many(transactionItems),
  priceHistory: many(priceHistory),
  inventoryChanges: many(inventoryChanges),
  childProducts: many(products, { relationName: 'parentChild' }),
  parentProduct: one(products, { 
    fields: [products.parentProductId], 
    references: [products.id],
    relationName: 'parentChild'
  })
}))

export const productBarcodesRelations = relations(productBarcodes, ({ one }) => ({
  product: one(products, {
    fields: [productBarcodes.productId],
    references: [products.id]
  })
}))

export const inventoryRelations = relations(inventory, ({ one }) => ({
  product: one(products, {
    fields: [inventory.productId],
    references: [products.id]
  })
}))

export const customersRelations = relations(customers, ({ many }) => ({
  transactions: many(transactions),
  productHistory: many(customerProductHistory)
}))

export const employeesRelations = relations(employees, ({ many }) => ({
  transactions: many(transactions),
  giftCardsIssued: many(giftCards),
  inventoryChanges: many(inventoryChanges),
  priceChanges: many(priceHistory)
}))

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
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
    relationName: 'returnOriginal'
  }),
  returns: many(transactions, { relationName: 'returnOriginal' })
}))

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id]
  }),
  product: one(products, {
    fields: [transactionItems.productId],
    references: [products.id]
  })
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  transaction: one(transactions, {
    fields: [payments.transactionId],
    references: [transactions.id]
  }),
  giftCard: one(giftCards, {
    fields: [payments.giftCardId],
    references: [giftCards.id]
  })
}))

export const giftCardsRelations = relations(giftCards, ({ one, many }) => ({
  issuedBy: one(employees, {
    fields: [giftCards.issuedBy],
    references: [employees.id]
  }),
  purchaseTransaction: one(transactions, {
    fields: [giftCards.purchaseTransactionId],
    references: [transactions.id]
  }),
  payments: many(payments)
}))

export const inventoryChangesRelations = relations(inventoryChanges, ({ one }) => ({
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
}))

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  product: one(products, {
    fields: [priceHistory.productId],
    references: [products.id]
  }),
  changedBy: one(employees, {
    fields: [priceHistory.changedBy],
    references: [employees.id]
  })
}))

export const customerProductHistoryRelations = relations(customerProductHistory, ({ one }) => ({
  customer: one(customers, {
    fields: [customerProductHistory.customerId],
    references: [customers.id]
  }),
  product: one(products, {
    fields: [customerProductHistory.productId],
    references: [products.id]
  })
}))

// Export all tables as a single schema object for Drizzle
export * as schema from './sqlite-schema'