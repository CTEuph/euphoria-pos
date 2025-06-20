import { app } from 'electron'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import * as schema from '../../drizzle/sqlite-schema'
import path from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

// Database instance
let sqliteDb: Database.Database | null = null
let db: BetterSQLite3Database<typeof schema> | null = null

/**
 * Initialize the local SQLite database
 */
export function initializeDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db

  // Get the user data directory
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'euphoria-pos.db')

  console.log('Initializing SQLite database at:', dbPath)

  // Create the SQLite database instance
  sqliteDb = new Database(dbPath)
  
  // Enable WAL mode for better concurrency
  sqliteDb.pragma('journal_mode = WAL')
  sqliteDb.pragma('synchronous = NORMAL')
  
  // Create Drizzle instance
  db = drizzle(sqliteDb, { schema })
  
  // Run migrations
  console.log('Running SQLite migrations...')
  const migrationsFolder = path.join(__dirname, '../../drizzle/sqlite')
  migrate(db, { migrationsFolder })
  console.log('Migrations completed successfully')

  return db
}

/**
 * Get the database instance
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

/**
 * Execute a function within a transaction
 */
export async function withTxn<T>(
  fn: (tx: BetterSQLite3Database<typeof schema>) => T
): Promise<T> {
  const database = getDb()
  
  return database.transaction((tx) => {
    return fn(tx as any)
  })() as T
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (sqliteDb) {
    sqliteDb.close()
    sqliteDb = null
    db = null
  }
}

/**
 * Generate a UUID for primary keys
 */
export function generateId(): string {
  return uuidv4()
}

/**
 * Get current timestamp
 */
export function now(): Date {
  return new Date()
}