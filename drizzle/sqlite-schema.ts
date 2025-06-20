import { sqliteTable, text, integer, real, index, unique, primaryKey } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// SQLite doesn't have enums, so we'll use text with check constraints
// In the application layer, we'll validate these values

// Products table
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'wine', 'liquor', 'beer', 'other'
  size: text('size').notNull(), // '750ml', '1L', '1.5L', '1.75L', 'other'
  cost: text('cost').notNull(), // Store as string for precision
  retailPrice: text('retail_price').notNull(),
  
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: text('parent_product_id').references(() => products.id),
  unitsInParent: integer('units_in_parent').default(1),
  
  // Loyalty configuration
  loyaltyPointMultiplier: text('loyalty_point_multiplier').default('1.0'),
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  barcodeIdx: index('product_barcodes_barcode_idx').on(table.barcode)
}))

// Inventory levels (per product)
export const inventory = sqliteTable('inventory', {
  productId: text('product_id').references(() => products.id).primaryKey(),
  currentStock: integer('current_stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).notNull(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' })
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
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
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
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// Transactions
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  transactionNumber: text('transaction_number', { length: 20 }).notNull().unique(),
  
  customerId: text('customer_id').references(() => customers.id),
  employeeId: text('employee_id').references(() => employees.id).notNull(),
  
  subtotal: text('subtotal').notNull(),
  taxAmount: text('tax_amount').notNull(),
  discountAmount: text('discount_amount').default('0.00'),
  totalAmount: text('total_amount').notNull(),
  
  // Loyalty tracking
  pointsEarned: integer('points_earned').default(0),
  pointsRedeemed: integer('points_redeemed').default(0),
  
  status: text('status').notNull().default('completed'), // 'pending', 'completed', 'voided', 'refunded'
  salesChannel: text('sales_channel').notNull().default('pos'), // 'pos', 'doordash', 'grubhub', 'employee'
  
  // For returns/exchanges
  originalTransactionId: text('original_transaction_id').references(() => transactions.id),
  
  // Multi-lane tracking
  terminalId: text('terminal_id', { length: 20 }).notNull(),
  syncStatus: text('sync_status', { length: 20 }).default('synced'),
  
  // Zinrelo sync tracking
  zinreloSyncStatus: text('zinrelo_sync_status', { length: 20 }).default('pending'),
  zinreloSyncedAt: integer('zinrelo_synced_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  
  // Metadata for third-party orders
  metadata: text('metadata', { mode: 'json' })
}, (table) => ({
  transactionNumberIdx: index('transactions_number_idx').on(table.transactionNumber),
  createdAtIdx: index('transactions_created_at_idx').on(table.createdAt),
  customerIdx: index('transactions_customer_idx').on(table.customerId),
  customerDateIdx: index('transactions_customer_date_idx').on(table.customerId, table.createdAt),
  syncStatusIdx: index('transactions_sync_status_idx').on(table.syncStatus),
  zinreloSyncIdx: index('transactions_zinrelo_sync_idx').on(table.zinreloSyncStatus)
}))

// Transaction items
export const transactionItems = sqliteTable('transaction_items', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').references(() => transactions.id).notNull(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  quantity: integer('quantity').notNull(),
  unitPrice: text('unit_price').notNull(),
  discountAmount: text('discount_amount').default('0.00'),
  totalPrice: text('total_price').notNull(),
  
  // For tracking what discounts were applied
  discountReason: text('discount_reason'),
  
  // Loyalty points earned on this item
  pointsEarned: integer('points_earned').default(0),
  
  isReturned: integer('is_returned', { mode: 'boolean' }).default(false),
  returnedAt: integer('returned_at', { mode: 'timestamp' })
}, (table) => ({
  transactionIdx: index('transaction_items_transaction_idx').on(table.transactionId),
  productIdx: index('transaction_items_product_idx').on(table.productId)
}))

// Customer purchase patterns view
export const customerProductHistory = sqliteTable('customer_product_history', {
  customerId: text('customer_id').references(() => customers.id).notNull(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  firstPurchased: integer('first_purchased', { mode: 'timestamp' }).notNull(),
  lastPurchased: integer('last_purchased', { mode: 'timestamp' }).notNull(),
  purchaseCount: integer('purchase_count').notNull().default(1),
  totalQuantity: integer('total_quantity').notNull(),
  averageQuantityPerPurchase: text('avg_quantity'),
  
  // Denormalized for quick access
  productName: text('product_name').notNull(),
  productCategory: text('product_category').notNull(),
  
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index('customer_product_history_customer_idx').on(table.customerId),
  lastPurchasedIdx: index('customer_product_history_last_purchased_idx').on(table.customerId, table.lastPurchased),
  purchaseCountIdx: index('customer_product_history_count_idx').on(table.customerId, table.purchaseCount)
}))

// Payment records
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  transactionId: text('transaction_id').references(() => transactions.id).notNull(),
  
  paymentMethod: text('payment_method').notNull(), // 'cash', 'credit', 'debit', 'gift_card', 'loyalty_points', 'employee_tab', 'third_party'
  amount: text('amount').notNull(),
  
  // For card payments
  cardLastFour: text('card_last_four', { length: 4 }),
  cardType: text('card_type', { length: 20 }),
  authorizationCode: text('authorization_code', { length: 50 }),
  
  // For cash
  tenderedAmount: text('tendered_amount'),
  changeAmount: text('change_amount'),
  
  // For gift cards
  giftCardId: text('gift_card_id').references(() => giftCards.id),
  
  // For loyalty points
  pointsUsed: integer('points_used'),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// Gift cards
export const giftCards = sqliteTable('gift_cards', {
  id: text('id').primaryKey(),
  cardNumber: text('card_number', { length: 20 }).notNull().unique(),
  pin: text('pin', { length: 10 }).notNull(),
  
  initialBalance: text('initial_balance').notNull(),
  currentBalance: text('current_balance').notNull(),
  
  issuedBy: text('issued_by').references(() => employees.id),
  purchaseTransactionId: text('purchase_transaction_id').references(() => transactions.id),
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' })
})

// Discount rules
export const discounts = sqliteTable('discounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  size: text('size').notNull(),
  
  unitsPerCase: integer('units_per_case').notNull(),
  discountPercent: text('discount_percent').notNull(),
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// Inventory change audit log
export const inventoryChanges = sqliteTable('inventory_changes', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  changeType: text('change_type').notNull(), // 'sale', 'return', 'adjustment', 'receive'
  changeAmount: integer('change_amount').notNull(),
  newStockLevel: integer('new_stock_level').notNull(),
  
  // What caused this change
  transactionId: text('transaction_id').references(() => transactions.id),
  transactionItemId: text('transaction_item_id').references(() => transactionItems.id),
  
  // Multi-lane tracking
  terminalId: text('terminal_id', { length: 20 }).notNull(),
  employeeId: text('employee_id').references(() => employees.id),
  
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  productIdx: index('inventory_changes_product_idx').on(table.productId),
  createdAtIdx: index('inventory_changes_created_at_idx').on(table.createdAt)
}))

// Price history tracking
export const priceHistory = sqliteTable('price_history', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  oldPrice: text('old_price').notNull(),
  newPrice: text('new_price').notNull(),
  oldCost: text('old_cost').notNull(),
  newCost: text('new_cost').notNull(),
  
  changedBy: text('changed_by').references(() => employees.id),
  changeReason: text('change_reason'),
  
  effectiveDate: integer('effective_date', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// POS configuration
export const posConfig = sqliteTable('pos_config', {
  key: text('key', { length: 50 }).primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ============= SYNC TABLES =============

// Outbox for messages to be synced
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(), // 'transaction', 'inventory', 'customer', etc.
  payload: text('payload', { mode: 'json' }).notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'peer_ack', 'cloud_ack'
  retryCount: integer('retry_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  peerAckedAt: integer('peer_acked_at', { mode: 'timestamp' }),
  cloudAckedAt: integer('cloud_acked_at', { mode: 'timestamp' })
}, (table) => ({
  statusIdx: index('outbox_status_idx').on(table.status),
  createdAtIdx: index('outbox_created_at_idx').on(table.createdAt)
}))

// Inbox for processed messages from other lanes
export const inboxProcessed = sqliteTable('inbox_processed', {
  messageId: text('message_id').primaryKey(),
  fromTerminal: text('from_terminal').notNull(),
  topic: text('topic').notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }).notNull()
}, (table) => ({
  processedAtIdx: index('inbox_processed_at_idx').on(table.processedAt)
}))

// Relations
export const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id]
  })
}))

export const transactionsRelations = relations(transactions, ({ many, one }) => ({
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
}))

// Type exports for use in application
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Employee = typeof employees.$inferSelect
export type TransactionItem = typeof transactionItems.$inferSelect
export type NewTransactionItem = typeof transactionItems.$inferInsert
export type InventoryChange = typeof inventoryChanges.$inferSelect
export type Payment = typeof payments.$inferSelect
export type NewPayment = typeof payments.$inferInsert
export type CustomerProductHistory = typeof customerProductHistory.$inferSelect
export type Outbox = typeof outbox.$inferSelect
export type NewOutbox = typeof outbox.$inferInsert
export type InboxProcessed = typeof inboxProcessed.$inferSelect