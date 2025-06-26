/**
 * Database initialization and management for Euphoria POS
 * Coordinates both local SQLite and cloud Supabase connections
 */

import { 
  initializeDatabase as initSQLite, 
  runMigrations, 
  checkDatabaseHealth,
  initializeSyncStatus,
  closeDatabase as closeSQLite,
  createBackup
} from './local/connection'

import {
  initializeSupabase,
  testConnection as testSupabaseConnection,
  updateTerminalStatus,
  closeSupabaseConnection
} from './cloud/supabase'

import { SupabaseClient } from '@supabase/supabase-js'
import type { drizzle } from 'drizzle-orm/better-sqlite3'

export interface DatabaseConfig {
  // Local SQLite configuration
  sqlite: {
    databasePath?: string
    enableEncryption?: boolean
    encryptionKey?: string
  }
  
  // Cloud Supabase configuration
  supabase: {
    url: string
    anonKey: string
    serviceRoleKey?: string
    options?: {
      auth?: {
        autoRefreshToken?: boolean
        persistSession?: boolean
      }
      realtime?: {
        heartbeatIntervalMs?: number
        reconnectAfterMs?: number
      }
    }
  }
  
  // Terminal identification
  terminalId: string
}

export interface DatabaseConnections {
  local: ReturnType<typeof drizzle>
  cloud: SupabaseClient
  isInitialized: boolean
}

let connections: DatabaseConnections | null = null

/**
 * Initialize both local and cloud database connections
 */
export async function initializeDatabases(config: DatabaseConfig): Promise<DatabaseConnections> {
  try {
    console.log('Initializing database connections...')
    
    // Initialize local SQLite database
    console.log('Setting up local SQLite database...')
    const localDb = initSQLite({
      databasePath: config.sqlite.databasePath,
      enableEncryption: config.sqlite.enableEncryption,
      encryptionKey: config.sqlite.encryptionKey
    })
    
    // Run migrations
    await runMigrations()
    
    // Initialize sync status
    await initializeSyncStatus(config.terminalId)
    
    // Initialize Supabase client
    console.log('Setting up Supabase cloud connection...')
    const cloudClient = initializeSupabase({
      url: config.supabase.url,
      anonKey: config.supabase.anonKey,
      options: config.supabase.options
    })
    
    // Test connections
    const localHealth = checkDatabaseHealth()
    const cloudHealth = await testSupabaseConnection()
    
    if (!localHealth.isConnected) {
      throw new Error(`Local database connection failed: ${localHealth.error}`)
    }
    
    if (!cloudHealth.isConnected) {
      console.warn(`Cloud database connection failed: ${cloudHealth.error}`)
      // Don't throw error - allow offline operation
    }
    
    connections = {
      local: localDb,
      cloud: cloudClient,
      isInitialized: true
    }
    
    // Update terminal status in cloud (if connected)
    if (cloudHealth.isConnected) {
      try {
        await updateTerminalStatus({
          terminal_id: config.terminalId,
          status: 'online',
          pending_transaction_count: 0,
          last_heartbeat: new Date().toISOString()
        })
        console.log('Terminal status updated in cloud')
      } catch (error) {
        console.warn('Failed to update terminal status:', error)
      }
    }
    
    console.log('Database connections initialized successfully')
    console.log(`Local SQLite: ${localHealth.isConnected ? '✓' : '✗'} (version: ${localHealth.version})`)
    console.log(`Cloud Supabase: ${cloudHealth.isConnected ? '✓' : '✗'}`)
    
    return connections
    
  } catch (error) {
    console.error('Failed to initialize databases:', error)
    throw error
  }
}

/**
 * Get initialized database connections
 */
export function getDatabaseConnections(): DatabaseConnections {
  if (!connections || !connections.isInitialized) {
    throw new Error('Databases not initialized. Call initializeDatabases() first.')
  }
  return connections
}

/**
 * Get local SQLite database connection
 */
export function getLocalDatabase(): ReturnType<typeof drizzle> {
  const { local } = getDatabaseConnections()
  return local
}

/**
 * Get cloud Supabase client
 */
export function getCloudDatabase(): SupabaseClient {
  const { cloud } = getDatabaseConnections()
  return cloud
}

/**
 * Check health of both database connections
 */
export async function checkAllDatabaseHealth(): Promise<{
  local: ReturnType<typeof checkDatabaseHealth>
  cloud: Awaited<ReturnType<typeof testSupabaseConnection>>
  overall: {
    isHealthy: boolean
    canOperateOffline: boolean
    issues: string[]
  }
}> {
  const localHealth = checkDatabaseHealth()
  const cloudHealth = await testSupabaseConnection()
  
  const issues: string[] = []
  
  if (!localHealth.isConnected) {
    issues.push(`Local database: ${localHealth.error}`)
  }
  
  if (!cloudHealth.isConnected) {
    issues.push(`Cloud database: ${cloudHealth.error}`)
  }
  
  const canOperateOffline = localHealth.isConnected
  const isHealthy = localHealth.isConnected && cloudHealth.isConnected
  
  return {
    local: localHealth,
    cloud: cloudHealth,
    overall: {
      isHealthy,
      canOperateOffline,
      issues
    }
  }
}

/**
 * Create a backup of the local database
 */
export function createDatabaseBackup(backupPath?: string): string {
  return createBackup(backupPath)
}

/**
 * Gracefully close all database connections
 */
export async function closeDatabaseConnections(): Promise<void> {
  try {
    console.log('Closing database connections...')
    
    // Close Supabase connection
    await closeSupabaseConnection()
    
    // Close SQLite connection
    closeSQLite()
    
    connections = null
    
    console.log('All database connections closed successfully')
    
  } catch (error) {
    console.error('Error closing database connections:', error)
    throw error
  }
}

/**
 * Setup graceful shutdown handlers for database connections
 */
export function setupDatabaseShutdownHandlers(): void {
  const cleanup = async () => {
    try {
      await closeDatabaseConnections()
    } catch (error) {
      console.error('Error during database cleanup:', error)
    }
  }
  
  // Handle various shutdown signals
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('beforeExit', cleanup)
  
  // Handle Electron app events if available
  try {
    const { app } = require('electron')
    if (app) {
      app.on('before-quit', cleanup)
      app.on('window-all-closed', cleanup)
    }
  } catch {
    // Not in Electron context, ignore
  }
}

// Re-export useful types and functions
export type { DatabaseConfig, DatabaseConnections }
export type { Product, Employee, Inventory, SyncQueue, SyncStatus } from './local/schema'
export type { CloudProduct, CloudEmployee, CloudInventory } from './cloud/types'
export {
  // Cloud database utilities
  downloadMasterData,
  uploadTransactions,
  syncInventory,
  updateTerminalStatus,
  subscribeToInventoryUpdates,
  subscribeToMasterDataUpdates,
  unsubscribeFromAllUpdates
} from './cloud/supabase'