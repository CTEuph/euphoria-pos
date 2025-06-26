import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// Essential tables for initial foundation: products, productBarcodes, employees, inventory
// Additional tables will be added incrementally as needed

// Application-level enum constants for type safety
export const PRODUCT_CATEGORIES = ['wine', 'liquor', 'beer', 'other'] as const
export const PRODUCT_SIZES = ['750ml', '1L', '1.5L', '1.75L', 'other'] as const

export type ProductCategory = typeof PRODUCT_CATEGORIES[number]
export type ProductSize = typeof PRODUCT_SIZES[number]

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
  
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  canOverridePrice: integer('can_override_price', { mode: 'boolean' }).default(false),
  canVoidTransaction: integer('can_void_transaction', { mode: 'boolean' }).default(false),
  isManager: integer('is_manager', { mode: 'boolean' }).default(false),
  
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

// Type exports for use in application
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type ProductBarcode = typeof productBarcodes.$inferSelect
export type NewProductBarcode = typeof productBarcodes.$inferInsert
export type Inventory = typeof inventory.$inferSelect
export type NewInventory = typeof inventory.$inferInsert
export type Employee = typeof employees.$inferSelect
export type NewEmployee = typeof employees.$inferInsert