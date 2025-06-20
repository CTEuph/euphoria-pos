import { pgTable, uuid, varchar, text, decimal, integer, timestamp, boolean, jsonb, pgEnum, index, unique, primaryKey } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const productCategoryEnum = pgEnum('product_category', ['wine', 'liquor', 'beer', 'other'])
export const productSizeEnum = pgEnum('product_size', ['750ml', '1L', '1.5L', '1.75L', 'other'])
export const transactionStatusEnum = pgEnum('transaction_status', ['pending', 'completed', 'voided', 'refunded'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'credit', 'debit', 'gift_card', 'loyalty_points', 'employee_tab', 'third_party'])
export const salesChannelEnum = pgEnum('sales_channel', ['pos', 'doordash', 'grubhub', 'employee'])
export const inventoryChangeTypeEnum = pgEnum('inventory_change_type', ['sale', 'return', 'adjustment', 'receive'])

// Products table
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: varchar('sku', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  category: productCategoryEnum('category').notNull(),
  size: productSizeEnum('size').notNull(),
  cost: decimal('cost', { precision: 10, scale: 2 }).notNull(),
  retailPrice: decimal('retail_price', { precision: 10, scale: 2 }).notNull(),
  
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: uuid('parent_product_id').references(() => products.id),
  unitsInParent: integer('units_in_parent').default(1), // e.g., 4 for a 4-pack
  
  // Loyalty configuration
  loyaltyPointMultiplier: decimal('loyalty_point_multiplier', { precision: 3, scale: 1 }).default('1.0'), // 2.0 for double points
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  skuIdx: index('products_sku_idx').on(table.sku),
  categoryIdx: index('products_category_idx').on(table.category)
}))

// Product barcodes (multiple per product)
export const productBarcodes = pgTable('product_barcodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  barcode: varchar('barcode', { length: 50 }).notNull().unique(),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  barcodeIdx: index('product_barcodes_barcode_idx').on(table.barcode)
}))

// Inventory levels (per product)
export const inventory = pgTable('inventory', {
  productId: uuid('product_id').references(() => products.id).primaryKey(),
  currentStock: integer('current_stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0), // For held orders
  lastUpdated: timestamp('last_updated').defaultNow(),
  lastSyncedAt: timestamp('last_synced_at') // For multi-lane sync tracking
})

// Customers
export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 255 }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  
  // Loyalty integration
  zinreloId: varchar('zinrelo_id', { length: 100 }).unique(),
  loyaltyPoints: integer('loyalty_points').default(0),
  loyaltyTier: varchar('loyalty_tier', { length: 20 }).default('bronze'),
  
  // RFID/NFC card
  rfidCardId: varchar('rfid_card_id', { length: 100 }).unique(),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  phoneIdx: index('customers_phone_idx').on(table.phone),
  rfidIdx: index('customers_rfid_idx').on(table.rfidCardId)
}))

// Employees
export const employees = pgTable('employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  employeeCode: varchar('employee_code', { length: 20 }).notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  pin: varchar('pin', { length: 60 }).notNull(), // Hashed PIN
  
  isActive: boolean('is_active').default(true),
  canOverridePrice: boolean('can_override_price').default(false),
  canVoidTransaction: boolean('can_void_transaction').default(false),
  isManager: boolean('is_manager').default(false),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

// Transactions
export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionNumber: varchar('transaction_number', { length: 20 }).notNull().unique(), // Human-readable
  
  customerId: uuid('customer_id').references(() => customers.id),
  employeeId: uuid('employee_id').references(() => employees.id).notNull(),
  
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0.00'),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  
  // Loyalty tracking
  pointsEarned: integer('points_earned').default(0), // Calculated at checkout based on items and multipliers
  pointsRedeemed: integer('points_redeemed').default(0), // If customer used points for discount
  
  status: transactionStatusEnum('status').notNull().default('completed'),
  salesChannel: salesChannelEnum('sales_channel').notNull().default('pos'), // 'employee' keeps sales separate
  
  // For returns/exchanges
  originalTransactionId: uuid('original_transaction_id').references(() => transactions.id),
  
  // Multi-lane tracking
  terminalId: varchar('terminal_id', { length: 20 }).notNull(),
  syncStatus: varchar('sync_status', { length: 20 }).default('synced'), // synced, pending, failed
  
  // Zinrelo sync tracking
  zinreloSyncStatus: varchar('zinrelo_sync_status', { length: 20 }).default('pending'), // pending, synced, failed
  zinreloSyncedAt: timestamp('zinrelo_synced_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  
  // Metadata for third-party orders
  metadata: jsonb('metadata') // { orderId: 'DD-12345', customerName: 'John Doe', platform: 'doordash' }
}, (table) => ({
  transactionNumberIdx: index('transactions_number_idx').on(table.transactionNumber),
  createdAtIdx: index('transactions_created_at_idx').on(table.createdAt),
  customerIdx: index('transactions_customer_idx').on(table.customerId),
  customerDateIdx: index('transactions_customer_date_idx').on(table.customerId, table.createdAt), // Fast customer history
  syncStatusIdx: index('transactions_sync_status_idx').on(table.syncStatus),
  zinreloSyncIdx: index('transactions_zinrelo_sync_idx').on(table.zinreloSyncStatus)
}))

// Transaction items
export const transactionItems = pgTable('transaction_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).default('0.00'),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  
  // For tracking what discounts were applied
  discountReason: text('discount_reason'), // 'case_discount', 'employee_price', etc.
  
  // Loyalty points earned on this item
  pointsEarned: integer('points_earned').default(0), // Item-level tracking for detailed reports
  
  isReturned: boolean('is_returned').default(false),
  returnedAt: timestamp('returned_at')
}, (table) => ({
  transactionIdx: index('transaction_items_transaction_idx').on(table.transactionId),
  productIdx: index('transaction_items_product_idx').on(table.productId)
}))

// Customer purchase patterns view (optional - for frequently bought items)
export const customerProductHistory = pgTable('customer_product_history', {
  customerId: uuid('customer_id').references(() => customers.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  
  firstPurchased: timestamp('first_purchased').notNull(),
  lastPurchased: timestamp('last_purchased').notNull(),
  purchaseCount: integer('purchase_count').notNull().default(1),
  totalQuantity: integer('total_quantity').notNull(),
  averageQuantityPerPurchase: decimal('avg_quantity', { precision: 5, scale: 2 }),
  
  // Denormalized for quick access
  productName: text('product_name').notNull(),
  productCategory: productCategoryEnum('product_category').notNull(),
  
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  pk: primaryKey({ columns: [table.customerId, table.productId] }),
  customerIdx: index('customer_product_history_customer_idx').on(table.customerId),
  lastPurchasedIdx: index('customer_product_history_last_purchased_idx').on(table.customerId, table.lastPurchased),
  purchaseCountIdx: index('customer_product_history_count_idx').on(table.customerId, table.purchaseCount)
}))

// Payment records (multiple per transaction for split payments)
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').references(() => transactions.id).notNull(),
  
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  
  // For card payments
  cardLastFour: varchar('card_last_four', { length: 4 }),
  cardType: varchar('card_type', { length: 20 }), // visa, mastercard, etc.
  authorizationCode: varchar('authorization_code', { length: 50 }),
  
  // For cash
  tenderedAmount: decimal('tendered_amount', { precision: 10, scale: 2 }),
  changeAmount: decimal('change_amount', { precision: 10, scale: 2 }),
  
  // For gift cards
  giftCardId: uuid('gift_card_id').references(() => giftCards.id),
  
  // For loyalty points
  pointsUsed: integer('points_used'),
  
  createdAt: timestamp('created_at').defaultNow()
})

// Gift cards
export const giftCards = pgTable('gift_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  cardNumber: varchar('card_number', { length: 20 }).notNull().unique(),
  pin: varchar('pin', { length: 10 }).notNull(),
  
  initialBalance: decimal('initial_balance', { precision: 10, scale: 2 }).notNull(),
  currentBalance: decimal('current_balance', { precision: 10, scale: 2 }).notNull(),
  
  issuedBy: uuid('issued_by').references(() => employees.id),
  purchaseTransactionId: uuid('purchase_transaction_id').references(() => transactions.id),
  
  isActive: boolean('is_active').default(true),
  expiresAt: timestamp('expires_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at')
})

// Discount rules (configured from backend)
export const discounts = pgTable('discounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  category: productCategoryEnum('category').notNull(),
  size: productSizeEnum('size').notNull(),
  
  unitsPerCase: integer('units_per_case').notNull(), // 12 for 750ml, 6 for 1.5L
  discountPercent: decimal('discount_percent', { precision: 5, scale: 2 }).notNull(), // 10.00 for 10%
  
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow()
})

// Inventory change audit log
export const inventoryChanges = pgTable('inventory_changes', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  
  changeType: inventoryChangeTypeEnum('change_type').notNull(),
  changeAmount: integer('change_amount').notNull(), // negative for sales, positive for returns/receives
  newStockLevel: integer('new_stock_level').notNull(),
  
  // What caused this change
  transactionId: uuid('transaction_id').references(() => transactions.id),
  transactionItemId: uuid('transaction_item_id').references(() => transactionItems.id),
  
  // Multi-lane tracking
  terminalId: varchar('terminal_id', { length: 20 }).notNull(),
  employeeId: uuid('employee_id').references(() => employees.id),
  
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  productIdx: index('inventory_changes_product_idx').on(table.productId),
  createdAtIdx: index('inventory_changes_created_at_idx').on(table.createdAt)
}))

// Price history tracking
export const priceHistory = pgTable('price_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  
  oldPrice: decimal('old_price', { precision: 10, scale: 2 }).notNull(),
  newPrice: decimal('new_price', { precision: 10, scale: 2 }).notNull(),
  oldCost: decimal('old_cost', { precision: 10, scale: 2 }).notNull(),
  newCost: decimal('new_cost', { precision: 10, scale: 2 }).notNull(),
  
  changedBy: uuid('changed_by').references(() => employees.id),
  changeReason: text('change_reason'),
  
  effectiveDate: timestamp('effective_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow()
})

// POS configuration (from backend)
export const posConfig = pgTable('pos_config', {
  key: varchar('key', { length: 50 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow()
})

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