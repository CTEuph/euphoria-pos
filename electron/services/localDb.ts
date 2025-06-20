import { app } from 'electron'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '../../drizzle/sqlite-schema'

// Initialize database in app user data directory
const dbPath = path.join(app.getPath('userData'), 'pos.sqlite')
const sqlite = new Database(dbPath)

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL')

// Create Drizzle instance
export const db = drizzle(sqlite, { schema })

// Helper for transactions
export async function withTxn<T>(
  fn: (tx: typeof db) => Promise<T> | T
): Promise<T> {
  return await db.transaction(async (tx) => {
    return await fn(tx)
  })
}

// Run migrations on startup
export function initializeDatabase() {
  try {
    // Create migrations directory path
    const migrationsPath = path.join(__dirname, '../../drizzle/sqlite')
    
    // Run migrations
    migrate(db, { migrationsFolder: migrationsPath })
    
    console.log('Database initialized successfully at:', dbPath)
  } catch (error) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}

// Export schema types for use in other modules
export type Employee = typeof schema.employees.$inferSelect
export type Product = typeof schema.products.$inferSelect
export type Transaction = typeof schema.transactions.$inferSelect
export type Customer = typeof schema.customers.$inferSelect
export type InventoryChange = typeof schema.inventoryChanges.$inferSelect
export type OutboxMessage = typeof schema.outbox.$inferSelect

// Export insert types
export type NewEmployee = typeof schema.employees.$inferInsert
export type NewProduct = typeof schema.products.$inferInsert
export type NewTransaction = typeof schema.transactions.$inferInsert
export type NewCustomer = typeof schema.customers.$inferInsert
export type NewInventoryChange = typeof schema.inventoryChanges.$inferInsert
export type NewOutboxMessage = typeof schema.outbox.$inferInsert