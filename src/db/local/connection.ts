import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import * as schema from './schema'

let db: ReturnType<typeof drizzle> | null = null
let sqliteDb: Database.Database | null = null

/**
 * Get the application data directory path
 * Creates the directory if it doesn't exist
 */
export function getAppDataPath(): string {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'database')
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
  
  return dbDir
}

/**
 * Get the SQLite database file path
 */
export function getDatabasePath(): string {
  const dbDir = getAppDataPath()
  return join(dbDir, 'euphoria-pos.db')
}

/**
 * Initialize the local SQLite database connection
 * Sets up encryption, WAL mode, and other optimizations
 */
export function initializeDatabase(options: {
  databasePath?: string
  enableEncryption?: boolean
  encryptionKey?: string
} = {}): ReturnType<typeof drizzle> {
  const dbPath = options.databasePath || getDatabasePath()
  
  console.log(`Initializing SQLite database at: ${dbPath}`)
  
  try {
    // Create SQLite connection with optimizations
    sqliteDb = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
      fileMustExist: false
    })
    
    // Enable WAL mode for better concurrency
    sqliteDb.pragma('journal_mode = WAL')
    
    // Enable foreign keys
    sqliteDb.pragma('foreign_keys = ON')
    
    // Set synchronous mode for better performance
    sqliteDb.pragma('synchronous = NORMAL')
    
    // Set cache size (negative value = KB, positive = pages)
    sqliteDb.pragma('cache_size = -64000') // 64MB cache
    
    // Set temp store to memory for better performance
    sqliteDb.pragma('temp_store = MEMORY')
    
    // Set busy timeout
    sqliteDb.pragma('busy_timeout = 5000')
    
    // Apply encryption if enabled (requires SQLCipher)
    if (options.enableEncryption && options.encryptionKey) {
      try {
        sqliteDb.pragma(`key = '${options.encryptionKey}'`)
        console.log('Database encryption enabled')
      } catch (error) {
        console.warn('Database encryption failed - continuing without encryption:', error)
      }
    }
    
    // Create Drizzle instance
    db = drizzle(sqliteDb, { 
      schema,
      logger: process.env.NODE_ENV === 'development'
    })
    
    console.log('SQLite database initialized successfully')
    return db
    
  } catch (error) {
    console.error('Failed to initialize SQLite database:', error)
    throw error
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  
  try {
    console.log('Running database migrations...')
    
    // Run migrations from the drizzle/migrations directory
    await migrate(db, { 
      migrationsFolder: join(process.cwd(), 'drizzle/migrations')
    })
    
    console.log('Database migrations completed successfully')
    
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}

/**
 * Get the initialized database instance
 * Throws if database is not initialized
 */
export function getDatabase(): ReturnType<typeof drizzle> {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

/**
 * Get the raw SQLite database instance
 */
export function getRawDatabase(): Database.Database {
  if (!sqliteDb) {
    throw new Error('SQLite database not initialized. Call initializeDatabase() first.')
  }
  return sqliteDb
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  try {
    if (sqliteDb) {
      sqliteDb.close()
      sqliteDb = null
      db = null
      console.log('Database connection closed')
    }
  } catch (error) {
    console.error('Error closing database:', error)
  }
}

/**
 * Check database health and connectivity
 */
export function checkDatabaseHealth(): {
  isConnected: boolean
  version: string | null
  walMode: boolean
  foreignKeys: boolean
  error?: string
} {
  try {
    if (!sqliteDb) {
      return {
        isConnected: false,
        version: null,
        walMode: false,
        foreignKeys: false,
        error: 'Database not initialized'
      }
    }
    
    // Test basic connectivity
    const version = sqliteDb.prepare('SELECT sqlite_version()').get() as { 'sqlite_version()': string }
    const walMode = sqliteDb.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
    const foreignKeys = sqliteDb.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    
    return {
      isConnected: true,
      version: version['sqlite_version()'],
      walMode: walMode.journal_mode === 'wal',
      foreignKeys: foreignKeys.foreign_keys === 1
    }
    
  } catch (error) {
    return {
      isConnected: false,
      version: null,
      walMode: false,
      foreignKeys: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Initialize sync status record
 * Creates the initial sync status row if it doesn't exist
 */
export async function initializeSyncStatus(terminalId: string): Promise<void> {
  const database = getDatabase()
  
  try {
    // Check if sync status exists
    const existing = await database
      .select()
      .from(schema.syncStatus)
      .where(eq(schema.syncStatus.id, 'main'))
      .limit(1)
    
    if (existing.length === 0) {
      // Create initial sync status
      await database.insert(schema.syncStatus).values({
        id: 'main',
        terminalId,
        pendingTransactionCount: 0,
        pendingInventoryCount: 0,
        queueDepth: 0,
        isOnline: false,
        updatedAt: new Date()
      })
      
      console.log(`Initialized sync status for terminal: ${terminalId}`)
    }
    
  } catch (error) {
    console.error('Failed to initialize sync status:', error)
    throw error
  }
}

/**
 * Create database backup
 */
export function createBackup(backupPath?: string): string {
  if (!sqliteDb) {
    throw new Error('Database not initialized')
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const defaultBackupPath = join(getAppDataPath(), `backup-${timestamp}.db`)
  const finalBackupPath = backupPath || defaultBackupPath
  
  try {
    sqliteDb.backup(finalBackupPath)
    console.log(`Database backup created: ${finalBackupPath}`)
    return finalBackupPath
    
  } catch (error) {
    console.error('Failed to create database backup:', error)
    throw error
  }
}

// Import eq for the sync status initialization
import { eq } from 'drizzle-orm'