import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// Essential tables for initial foundation: products, productBarcodes, employees, inventory
// Additional tables will be added incrementally as needed

// Application-level enum constants for type safety
export const PRODUCT_CATEGORIES = ['wine', 'liquor', 'beer', 'other'] as const
export const PRODUCT_SIZES = ['750ml', '1L', '1.5L', '1.75L', 'other'] as const
export const EMPLOYEE_ROLES = ['cashier', 'manager', 'owner'] as const

export type ProductCategory = typeof PRODUCT_CATEGORIES[number]
export type ProductSize = typeof PRODUCT_SIZES[number]
export type EmployeeRole = typeof EMPLOYEE_ROLES[number]

// Products table
export const products = sqliteTable('products', {
  id: text('id').primaryKey(), // ULID instead of UUID
  sku: text('sku', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(), // wine, liquor, beer, other
  size: text('size').notNull(), // 750ml, 1L, 1.5L, 1.75L, other
  cost: real('cost').notNull(),
  retailPrice: real('retail_price').notNull(),
  
  // For linked products (e.g., single can linked to 4-pack)
  parentProductId: text('parent_product_id').references(() => products.id),
  unitsInParent: integer('units_in_parent').default(1), // e.g., 4 for a 4-pack
  
  // Loyalty configuration
  loyaltyPointMultiplier: real('loyalty_point_multiplier').default(1.0), // 2.0 for double points
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  skuIdx: index('products_sku_idx').on(table.sku),
  categoryIdx: index('products_category_idx').on(table.category)
}))

// Product barcodes (multiple per product)
export const productBarcodes = sqliteTable('product_barcodes', {
  id: text('id').primaryKey(), // ULID
  productId: text('product_id').references(() => products.id).notNull(),
  barcode: text('barcode', { length: 50 }).notNull().unique(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  barcodeIdx: index('product_barcodes_barcode_idx').on(table.barcode)
}))

// Inventory levels (per product)
export const inventory = sqliteTable('inventory', {
  productId: text('product_id').references(() => products.id).primaryKey(),
  currentStock: integer('current_stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0), // For held orders
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }) // For multi-lane sync tracking
})

// Employees table (for authentication and permissions)
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(), // ULID
  employeeCode: text('employee_code', { length: 20 }).notNull().unique(), 
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  pin: text('pin', { length: 60 }).notNull(), // Hashed PIN
  role: text('role').notNull().default('cashier'), // cashier, manager, owner
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  employeeCodeIdx: index('employees_code_idx').on(table.employeeCode)
}))

// Relations for the essential tables
export const productsRelations = relations(products, ({ many, one }) => ({
  barcodes: many(productBarcodes),
  inventory: one(inventory),
  parentProduct: one(products, {
    fields: [products.parentProductId],
    references: [products.id]
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

// Transactions table - stores completed sales with employee information
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(), // ULID
  transactionNumber: text('transaction_number', { length: 20 }).notNull().unique(),
  customerId: text('customer_id'), // Optional customer reference
  employeeId: text('employee_id').references(() => employees.id).notNull(), // WHO processed the sale
  
  subtotal: real('subtotal').notNull(),
  taxAmount: real('tax_amount').notNull(),
  totalAmount: real('total_amount').notNull(),
  
  status: text('status').notNull().default('completed'), // completed, voided, refunded
  salesChannel: text('sales_channel').notNull().default('pos'), // pos, doordash, grubhub, employee
  
  // Payment information (simplified for now)
  paymentMethod: text('payment_method').notNull(), // cash, card, split
  amountPaid: real('amount_paid').notNull(),
  changeGiven: real('change_given').notNull().default(0),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  voidedAt: integer('voided_at', { mode: 'timestamp' }),
  voidedBy: text('voided_by').references(() => employees.id)
}, (table) => ({
  transactionNumberIdx: index('transactions_number_idx').on(table.transactionNumber),
  employeeIdx: index('transactions_employee_idx').on(table.employeeId),
  statusIdx: index('transactions_status_idx').on(table.status),
  createdAtIdx: index('transactions_created_at_idx').on(table.createdAt)
}))

// Transaction items - individual products in each transaction
export const transactionItems = sqliteTable('transaction_items', {
  id: text('id').primaryKey(), // ULID
  transactionId: text('transaction_id').references(() => transactions.id).notNull(),
  productId: text('product_id').references(() => products.id).notNull(),
  
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(), // Price at time of sale
  totalPrice: real('total_price').notNull(), // quantity * unitPrice
  
  // Case discount information
  caseDiscountApplied: integer('case_discount_applied', { mode: 'boolean' }).default(false),
  discountAmount: real('discount_amount').notNull().default(0),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, (table) => ({
  transactionIdx: index('transaction_items_transaction_idx').on(table.transactionId),
  productIdx: index('transaction_items_product_idx').on(table.productId)
}))

// Relations for transaction tables
export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  employee: one(employees, {
    fields: [transactions.employeeId],
    references: [employees.id]
  }),
  voidedByEmployee: one(employees, {
    fields: [transactions.voidedBy],
    references: [employees.id]
  }),
  items: many(transactionItems)
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

// Update employees relations to include transactions
export const employeesRelations = relations(employees, ({ many }) => ({
  transactions: many(transactions),
  voidedTransactions: many(transactions, {
    relationName: 'voidedBy'
  })
}))

// Sync queue for offline operations (SQLite-specific)
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(), // ULID
  operation: text('operation').notNull(), // 'upload_transaction', 'update_inventory', etc.
  entityType: text('entity_type').notNull(), // 'transaction', 'inventory', 'product'
  entityId: text('entity_id').notNull(), // ID of the entity being synced
  payload: text('payload').notNull(), // JSON string of data to sync
  
  priority: integer('priority').notNull().default(5), // 1-10, lower = higher priority
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(5),
  
  status: text('status').notNull().default('pending'), // pending, processing, completed, failed
  error: text('error'), // Error message if failed
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  processedAt: integer('processed_at', { mode: 'timestamp' })
}, (table) => ({
  statusIdx: index('sync_queue_status_idx').on(table.status),
  priorityIdx: index('sync_queue_priority_idx').on(table.priority, table.scheduledFor),
  entityIdx: index('sync_queue_entity_idx').on(table.entityType, table.entityId)
}))

// Sync status tracking (SQLite-specific)
export const syncStatus = sqliteTable('sync_status', {
  id: text('id').primaryKey(), // Always 'main' - single row table
  
  lastTransactionSync: integer('last_transaction_sync', { mode: 'timestamp' }),
  lastInventorySync: integer('last_inventory_sync', { mode: 'timestamp' }),
  lastMasterDataSync: integer('last_master_data_sync', { mode: 'timestamp' }),
  
  pendingTransactionCount: integer('pending_transaction_count').notNull().default(0),
  pendingInventoryCount: integer('pending_inventory_count').notNull().default(0),
  queueDepth: integer('queue_depth').notNull().default(0),
  
  isOnline: integer('is_online', { mode: 'boolean' }).default(false),
  lastHeartbeat: integer('last_heartbeat', { mode: 'timestamp' }),
  
  terminalId: text('terminal_id').notNull(), // This terminal's ID
  syncErrors: text('sync_errors'), // JSON array of recent errors
  
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
})

// Local transaction queue (before sync)
export const transactionQueue = sqliteTable('transaction_queue', {
  id: text('id').primaryKey(), // ULID
  transactionId: text('transaction_id').notNull(), // References transaction
  
  status: text('status').notNull().default('pending'), // pending, uploading, uploaded, failed
  uploadAttempts: integer('upload_attempts').notNull().default(0),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' })
}, (table) => ({
  statusIdx: index('transaction_queue_status_idx').on(table.status),
  transactionIdx: index('transaction_queue_transaction_idx').on(table.transactionId)
}))

// Master data versions (track what we have locally)
export const masterDataVersions = sqliteTable('master_data_versions', {
  dataType: text('data_type').primaryKey(), // 'products', 'employees', 'customers'
  version: integer('version').notNull().default(0),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  recordCount: integer('record_count').notNull().default(0),
  checksum: text('checksum') // Hash of data for integrity checking
})

// Additional relations for sync tables
export const syncQueueRelations = relations(syncQueue, ({ one }) => ({
  // Could add relations to products/transactions if needed
}))

// Type exports for use in application
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductBarcode = typeof productBarcodes.$inferSelect
export type NewProductBarcode = typeof productBarcodes.$inferInsert
export type Inventory = typeof inventory.$inferSelect
export type NewInventory = typeof inventory.$inferInsert
export type Employee = typeof employees.$inferSelect
export type NewEmployee = typeof employees.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type TransactionItem = typeof transactionItems.$inferSelect
export type NewTransactionItem = typeof transactionItems.$inferInsert

// Sync-related type exports
export type SyncQueue = typeof syncQueue.$inferSelect
export type NewSyncQueue = typeof syncQueue.$inferInsert
export type SyncStatus = typeof syncStatus.$inferSelect
export type NewSyncStatus = typeof syncStatus.$inferInsert
export type TransactionQueue = typeof transactionQueue.$inferSelect
export type NewTransactionQueue = typeof transactionQueue.$inferInsert
export type MasterDataVersion = typeof masterDataVersions.$inferSelect
export type NewMasterDataVersion = typeof masterDataVersions.$inferInsert