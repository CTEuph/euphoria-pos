/**
 * Core synchronization engine for Euphoria POS
 * Handles bidirectional sync between local SQLite and cloud PostgreSQL
 * Coordinates upload queues, master data downloads, and real-time updates
 */

import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { eq, and, gt, desc, asc } from 'drizzle-orm'

import * as localSchema from '@/db/local/schema'
import type { 
  CloudProduct,
  CloudEmployee, 
  CloudInventory,
  CloudTransaction,
  CloudCustomer,
  SyncDownloadResponse,
  SyncUploadPayload 
} from '@/db/cloud/types'
import { TransformerFactory, TransformUtils } from './transformers'
import type { 
  Product,
  Employee,
  Inventory,
  Transaction,
  Customer,
  SyncQueue,
  SyncStatus 
} from '@/db/local/schema'

/**
 * Sync engine configuration
 */
export interface SyncEngineConfig {
  /** Local SQLite database connection */
  localDb: BetterSQLite3Database<typeof localSchema>
  
  /** Supabase client for cloud operations */
  supabaseClient: SupabaseClient
  
  /** Terminal identifier for this POS instance */
  terminalId: string
  
  /** Maximum number of items to sync in a single batch */
  batchSize?: number
  
  /** Maximum retry attempts for failed sync operations */
  maxRetryAttempts?: number
  
  /** Base delay for exponential backoff (ms) */
  baseRetryDelay?: number
  
  /** Enable real-time subscriptions for live updates */
  enableRealtime?: boolean
  
  /** Sync interval for periodic sync operations (ms) */
  syncInterval?: number
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean
  operation: string
  itemsProcessed: number
  errors: string[]
  duration: number
  timestamp: string
}

/**
 * Sync engine status
 */
export interface SyncEngineStatus {
  isOnline: boolean
  isActive: boolean
  lastSyncAt: Date | null
  queueDepth: number
  syncInProgress: boolean
  errors: string[]
  metrics: {
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    averageLatency: number
    lastErrorAt: Date | null
  }
}

/**
 * Event emitter for sync operations
 */
export type SyncEventType = 
  | 'sync_start'
  | 'sync_complete' 
  | 'sync_error'
  | 'queue_updated'
  | 'status_changed'
  | 'realtime_update'

export interface SyncEventData {
  type: SyncEventType
  data: any
  timestamp: Date
}

/**
 * Core synchronization engine
 * Manages all data flow between local SQLite and cloud PostgreSQL
 */
export class SyncEngine {
  private config: Required<SyncEngineConfig>
  private status: SyncEngineStatus
  private syncInterval: NodeJS.Timeout | null = null
  private eventListeners: Map<SyncEventType, Array<(data: SyncEventData) => void>> = new Map()
  private realtimeSubscriptions: Map<string, any> = new Map()

  constructor(config: SyncEngineConfig) {
    this.config = {
      batchSize: 10,
      maxRetryAttempts: 5,
      baseRetryDelay: 1000,
      enableRealtime: true,
      syncInterval: 30000, // 30 seconds
      ...config
    }

    this.status = {
      isOnline: false,
      isActive: false,
      lastSyncAt: null,
      queueDepth: 0,
      syncInProgress: false,
      errors: [],
      metrics: {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        averageLatency: 0,
        lastErrorAt: null
      }
    }
  }

  /**
   * Initialize the sync engine
   */
  async initialize(): Promise<void> {
    try {
      // Check connectivity
      await this.checkConnectivity()
      
      // Initialize sync status record
      await this.initializeSyncStatus()
      
      // Setup real-time subscriptions
      if (this.config.enableRealtime) {
        await this.setupRealtimeSubscriptions()
      }
      
      // Start periodic sync
      this.startPeriodicSync()
      
      // Start connectivity monitoring
      this.startConnectivityMonitoring()
      
      this.status.isActive = true
      this.emitEvent('status_changed', { status: this.status })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error'
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage })
      throw error
    }
  }

  /**
   * Shutdown the sync engine gracefully
   */
  async shutdown(): Promise<void> {
    // Stop periodic sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    
    // Unsubscribe from real-time updates
    for (const [channel, subscription] of this.realtimeSubscriptions) {
      await this.config.supabaseClient.removeChannel(subscription)
    }
    this.realtimeSubscriptions.clear()
    
    // Wait for any in-progress sync to complete
    let attempts = 0
    while (this.status.syncInProgress && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
    
    this.status.isActive = false
    this.emitEvent('status_changed', { status: this.status })
  }

  /**
   * Check network connectivity to cloud services with comprehensive monitoring
   */
  private async checkConnectivity(): Promise<boolean> {
    try {
      const startTime = Date.now()
      
      // Test basic connectivity with a lightweight query
      const { data, error } = await this.config.supabaseClient
        .from('sync_status')
        .select('id')
        .limit(1)
      
      const latency = Date.now() - startTime
      
      if (error) {
        await this.handleConnectivityChange(false, `Supabase error: ${error.message}`, latency)
        return false
      }
      
      // Additional connectivity checks
      const connectivityScore = await this.assessConnectivityQuality(latency)
      
      if (connectivityScore.isOnline) {
        await this.handleConnectivityChange(true, 'Connected', latency)
        return true
      } else {
        await this.handleConnectivityChange(false, connectivityScore.reason, latency)
        return false
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connectivity error'
      await this.handleConnectivityChange(false, errorMessage, 0)
      return false
    }
  }

  /**
   * Assess connectivity quality and determine if we should consider connection "good"
   */
  private async assessConnectivityQuality(latency: number): Promise<{
    isOnline: boolean
    quality: 'excellent' | 'good' | 'poor' | 'offline'
    reason: string
  }> {
    // Define connectivity quality thresholds
    if (latency > 10000) { // 10+ seconds
      return {
        isOnline: false,
        quality: 'offline',
        reason: `Connection timeout (${latency}ms)`
      }
    } else if (latency > 5000) { // 5-10 seconds
      return {
        isOnline: true,
        quality: 'poor',
        reason: `Slow connection (${latency}ms)`
      }
    } else if (latency > 2000) { // 2-5 seconds
      return {
        isOnline: true,
        quality: 'good',
        reason: `Moderate connection (${latency}ms)`
      }
    } else {
      return {
        isOnline: true,
        quality: 'excellent',
        reason: `Fast connection (${latency}ms)`
      }
    }
  }

  /**
   * Handle connectivity state changes
   */
  private async handleConnectivityChange(
    isOnline: boolean, 
    reason: string, 
    latency: number
  ): Promise<void> {
    const wasOnline = this.status.isOnline
    this.status.isOnline = isOnline
    
    // Log connectivity change
    console.log(`Connectivity change: ${wasOnline ? 'online' : 'offline'} → ${isOnline ? 'online' : 'offline'} (${reason})`)
    
    // Update connectivity metrics
    await this.updateConnectivityMetrics(isOnline, latency)
    
    // Handle state transitions
    if (!wasOnline && isOnline) {
      // Just came online - trigger immediate sync
      await this.handleComingOnline()
    } else if (wasOnline && !isOnline) {
      // Just went offline - switch to offline mode
      await this.handleGoingOffline(reason)
    }
    
    // Emit connectivity event
    this.emitEvent('status_changed', {
      connectivity: {
        isOnline,
        reason,
        latency,
        transition: wasOnline === isOnline ? 'no_change' : (isOnline ? 'came_online' : 'went_offline')
      }
    })
  }

  /**
   * Update connectivity metrics in local database
   */
  private async updateConnectivityMetrics(isOnline: boolean, latency: number): Promise<void> {
    try {
      const now = new Date()
      
      await this.config.localDb
        .update(localSchema.syncStatus)
        .set({
          isOnline,
          lastConnectivityCheck: now,
          lastLatency: latency,
          updatedAt: now
        })
        .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
        
    } catch (error) {
      console.error('Failed to update connectivity metrics:', error)
    }
  }

  /**
   * Handle coming back online
   */
  private async handleComingOnline(): Promise<void> {
    console.log('Terminal came online - triggering immediate sync')
    
    try {
      // Process offline queue
      await this.processOfflineQueue()
      
      // Trigger full sync
      if (!this.status.syncInProgress) {
        await this.performFullSync()
      }
      
      this.emitEvent('sync_start', { 
        operation: 'online_recovery',
        trigger: 'connectivity_restored'
      })
      
    } catch (error) {
      console.error('Error handling online recovery:', error)
    }
  }

  /**
   * Handle going offline
   */
  private async handleGoingOffline(reason: string): Promise<void> {
    console.log(`Terminal went offline: ${reason}`)
    
    // Cancel any in-progress sync operations (but don't abort them harshly)
    // The sync operations will naturally fail and be queued for retry
    
    // Update offline metrics
    await this.updateOfflineMetrics()
    
    this.emitEvent('sync_error', {
      type: 'connectivity_lost',
      reason,
      message: 'Operating in offline mode'
    })
  }

  /**
   * Process offline queue when coming back online
   */
  private async processOfflineQueue(): Promise<{
    processed: number
    uploaded: number
    errors: string[]
  }> {
    const errors: string[] = []
    let processed = 0
    let uploaded = 0

    try {
      // Get all pending queue items that accumulated while offline
      const offlineItems = await this.config.localDb
        .select()
        .from(localSchema.syncQueue)
        .where(eq(localSchema.syncQueue.status, 'pending'))
        .orderBy(asc(localSchema.syncQueue.createdAt)) // Process in chronological order

      console.log(`Processing ${offlineItems.length} items from offline queue`)

      // Process in batches to avoid overwhelming the connection
      const batches = this.createBatches(offlineItems, Math.min(this.config.batchSize, 5))
      
      for (const batch of batches) {
        try {
          processed += batch.length
          
          // Upload this batch
          const uploadResult = await this.uploadTransactionBatch(batch)
          uploaded += uploadResult.successCount
          errors.push(...uploadResult.errors)
          
          // Small delay between batches to be gentle on newly restored connection
          await new Promise(resolve => setTimeout(resolve, 1000))
          
        } catch (error) {
          const errorMessage = `Offline queue batch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMessage)
          console.error('Offline queue processing error:', errorMessage)
        }
      }

      // Update offline processing metrics
      await this.updateOfflineProcessingMetrics(processed, uploaded, errors.length)

      return { processed, uploaded, errors }

    } catch (error) {
      const errorMessage = `Offline queue processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)
      console.error('Critical offline queue error:', errorMessage)
      
      return { processed, uploaded, errors }
    }
  }

  /**
   * Update offline operation metrics
   */
  private async updateOfflineMetrics(): Promise<void> {
    try {
      const queueDepth = await this.getQueueDepth()
      
      await this.config.localDb
        .update(localSchema.syncStatus)
        .set({
          lastOfflineAt: new Date(),
          queueDepth,
          updatedAt: new Date()
        })
        .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
        
    } catch (error) {
      console.error('Failed to update offline metrics:', error)
    }
  }

  /**
   * Update offline processing metrics
   */
  private async updateOfflineProcessingMetrics(
    processed: number, 
    uploaded: number, 
    errorCount: number
  ): Promise<void> {
    try {
      await this.config.localDb
        .update(localSchema.syncStatus)
        .set({
          lastOfflineProcessingAt: new Date(),
          lastOfflineItemsProcessed: processed,
          lastOfflineItemsUploaded: uploaded,
          lastOfflineErrors: errorCount,
          updatedAt: new Date()
        })
        .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
        
    } catch (error) {
      console.error('Failed to update offline processing metrics:', error)
    }
  }

  /**
   * Enhanced periodic connectivity monitoring
   */
  private startConnectivityMonitoring(): void {
    // Check connectivity more frequently than sync operations
    const connectivityInterval = Math.min(this.config.syncInterval / 3, 10000) // Every 10 seconds max
    
    setInterval(async () => {
      await this.checkConnectivity()
    }, connectivityInterval)
  }

  /**
   * Get comprehensive connectivity status
   */
  async getConnectivityStatus(): Promise<{
    isOnline: boolean
    lastCheck: Date | null
    lastLatency: number | null
    connectionQuality: string
    offlineQueueSize: number
    lastOfflineAt: Date | null
    uptime: number // in milliseconds
  }> {
    try {
      const syncStatus = await this.config.localDb
        .select()
        .from(localSchema.syncStatus)
        .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
        .limit(1)

      const status = syncStatus[0]
      const queueSize = await this.getQueueDepth()
      
      // Calculate uptime since last offline event
      const uptime = status?.lastOfflineAt 
        ? Date.now() - status.lastOfflineAt.getTime()
        : Date.now() // Since process start if never went offline

      return {
        isOnline: this.status.isOnline,
        lastCheck: status?.lastConnectivityCheck || null,
        lastLatency: status?.lastLatency || null,
        connectionQuality: this.getConnectionQualityDescription(status?.lastLatency || 0),
        offlineQueueSize: queueSize,
        lastOfflineAt: status?.lastOfflineAt || null,
        uptime
      }
      
    } catch (error) {
      console.error('Failed to get connectivity status:', error)
      return {
        isOnline: this.status.isOnline,
        lastCheck: null,
        lastLatency: null,
        connectionQuality: 'unknown',
        offlineQueueSize: 0,
        lastOfflineAt: null,
        uptime: 0
      }
    }
  }

  /**
   * Get human-readable connection quality description
   */
  private getConnectionQualityDescription(latency: number): string {
    if (latency === 0) return 'unknown'
    if (latency > 5000) return 'poor'
    if (latency > 2000) return 'fair'
    if (latency > 1000) return 'good'
    return 'excellent'
  }

  /**
   * Force connectivity check (for manual testing)
   */
  async forceConnectivityCheck(): Promise<boolean> {
    console.log('Manual connectivity check triggered')
    return await this.checkConnectivity()
  }

  /**
   * Initialize sync status record for this terminal
   */
  private async initializeSyncStatus(): Promise<void> {
    // Check if sync status exists
    const existingStatus = await this.config.localDb
      .select()
      .from(localSchema.syncStatus)
      .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
      .limit(1)

    if (existingStatus.length === 0) {
      // Create initial sync status
      await this.config.localDb.insert(localSchema.syncStatus).values({
        terminalId: this.config.terminalId,
        lastSyncAt: null,
        lastSuccessfulSyncAt: null,
        queueDepth: 0,
        isOnline: this.status.isOnline,
        syncInProgress: false,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }
  }

  /**
   * Setup real-time subscriptions for live data updates
   */
  private async setupRealtimeSubscriptions(): Promise<void> {
    // Subscribe to inventory updates (high priority for multi-lane coordination)
    const inventoryChannel = this.config.supabaseClient
      .channel('inventory_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory',
        filter: `last_synced_from_terminal=neq.${this.config.terminalId}` // Don't receive our own updates
      }, (payload) => {
        this.handleRealtimeInventoryUpdate(payload)
      })
      .subscribe()

    this.realtimeSubscriptions.set('inventory', inventoryChannel)

    // Subscribe to product updates
    const productChannel = this.config.supabaseClient
      .channel('product_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products'
      }, (payload) => {
        this.handleRealtimeProductUpdate(payload)
      })
      .subscribe()

    this.realtimeSubscriptions.set('products', productChannel)

    // Subscribe to employee updates
    const employeeChannel = this.config.supabaseClient
      .channel('employee_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'employees'
      }, (payload) => {
        this.handleRealtimeEmployeeUpdate(payload)
      })
      .subscribe()

    this.realtimeSubscriptions.set('employees', employeeChannel)

    // Subscribe to customer updates
    const customerChannel = this.config.supabaseClient
      .channel('customer_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'customers'
      }, (payload) => {
        this.handleRealtimeCustomerUpdate(payload)
      })
      .subscribe()

    this.realtimeSubscriptions.set('customers', customerChannel)

    // Subscribe to inventory movements for conflict detection
    const movementChannel = this.config.supabaseClient
      .channel('inventory_movements')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'inventory_movements',
        filter: `terminal_id=neq.${this.config.terminalId}` // Only other terminals' movements
      }, (payload) => {
        this.handleRealtimeInventoryMovement(payload)
      })
      .subscribe()

    this.realtimeSubscriptions.set('inventory_movements', movementChannel)

    // Log successful subscription setup
    console.log(`Real-time subscriptions established for terminal ${this.config.terminalId}`)
  }

  /**
   * Handle real-time inventory updates from cloud
   */
  private async handleRealtimeInventoryUpdate(payload: any): Promise<void> {
    try {
      const eventType = payload.eventType || 'UPDATE'
      
      if (payload.new) {
        const cloudInventory = payload.new as CloudInventory
        const localInventory = TransformerFactory.toLocal(cloudInventory, 'inventory')
        
        // Check for potential conflicts (concurrent stock changes)
        const existingInventory = await this.config.localDb
          .select()
          .from(localSchema.inventory)
          .where(eq(localSchema.inventory.productId, localInventory.productId))
          .limit(1)

        if (existingInventory.length > 0) {
          const existing = existingInventory[0]
          
          // Detect potential conflict if our local data is newer
          if (existing.lastUpdated > localInventory.lastUpdated) {
            console.warn(`Inventory conflict detected for product ${localInventory.productId}`)
            this.emitEvent('realtime_update', {
              type: 'inventory_conflict',
              data: {
                productId: localInventory.productId,
                local: existing,
                cloud: localInventory,
                source: 'realtime'
              }
            })
            return // Don't overwrite newer local data
          }
        }

        // Update local inventory
        await this.config.localDb
          .insert(localSchema.inventory)
          .values(localInventory)
          .onConflictDoUpdate({
            target: localSchema.inventory.productId,
            set: {
              currentStock: localInventory.currentStock,
              reservedStock: localInventory.reservedStock,
              lastUpdated: localInventory.lastUpdated,
              lastSyncedAt: new Date()
            }
          })

        this.emitEvent('realtime_update', {
          type: 'inventory',
          eventType,
          data: localInventory,
          source: 'realtime'
        })

        console.log(`Real-time inventory update: Product ${localInventory.productId}, Stock: ${localInventory.currentStock}`)
      }
    } catch (error) {
      const errorMessage = `Real-time inventory update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage, source: 'realtime_inventory' })
    }
  }

  /**
   * Handle real-time product updates from cloud
   */
  private async handleRealtimeProductUpdate(payload: any): Promise<void> {
    try {
      const eventType = payload.eventType || 'UPDATE'
      
      if (payload.new) {
        const cloudProduct = payload.new as CloudProduct
        const localProduct = TransformerFactory.toLocal(cloudProduct, 'product')
        
        // Update local product
        await this.config.localDb
          .insert(localSchema.products)
          .values(localProduct)
          .onConflictDoUpdate({
            target: localSchema.products.id,
            set: {
              sku: localProduct.sku,
              name: localProduct.name,
              category: localProduct.category,
              size: localProduct.size,
              cost: localProduct.cost,
              retailPrice: localProduct.retailPrice,
              parentProductId: localProduct.parentProductId,
              unitsInParent: localProduct.unitsInParent,
              loyaltyPointMultiplier: localProduct.loyaltyPointMultiplier,
              isActive: localProduct.isActive,
              updatedAt: new Date()
            }
          })

        this.emitEvent('realtime_update', {
          type: 'product',
          eventType,
          data: localProduct,
          source: 'realtime'
        })

        console.log(`Real-time product update: ${localProduct.name} (${localProduct.sku})`)
      }
    } catch (error) {
      const errorMessage = `Real-time product update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage, source: 'realtime_product' })
    }
  }

  /**
   * Handle real-time employee updates from cloud
   */
  private async handleRealtimeEmployeeUpdate(payload: any): Promise<void> {
    try {
      const eventType = payload.eventType || 'UPDATE'
      
      if (payload.new) {
        const cloudEmployee = payload.new as CloudEmployee
        const localEmployee = TransformerFactory.toLocal(cloudEmployee, 'employee')
        
        // Update local employee
        await this.config.localDb
          .insert(localSchema.employees)
          .values(localEmployee)
          .onConflictDoUpdate({
            target: localSchema.employees.id,
            set: {
              employeeCode: localEmployee.employeeCode,
              firstName: localEmployee.firstName,
              lastName: localEmployee.lastName,
              pin: localEmployee.pin,
              isActive: localEmployee.isActive,
              canOverridePrice: localEmployee.canOverridePrice,
              canVoidTransaction: localEmployee.canVoidTransaction,
              isManager: localEmployee.isManager,
              updatedAt: new Date()
            }
          })

        this.emitEvent('realtime_update', {
          type: 'employee',
          eventType,
          data: localEmployee,
          source: 'realtime'
        })

        console.log(`Real-time employee update: ${localEmployee.firstName} ${localEmployee.lastName} (${localEmployee.employeeCode})`)
      }
    } catch (error) {
      const errorMessage = `Real-time employee update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage, source: 'realtime_employee' })
    }
  }

  /**
   * Handle real-time customer updates from cloud
   */
  private async handleRealtimeCustomerUpdate(payload: any): Promise<void> {
    try {
      const eventType = payload.eventType || 'UPDATE'
      
      if (payload.new) {
        const cloudCustomer = payload.new as CloudCustomer
        const localCustomer = TransformerFactory.toLocal(cloudCustomer, 'customer')
        
        // Update local customer
        await this.config.localDb
          .insert(localSchema.customers)
          .values(localCustomer)
          .onConflictDoUpdate({
            target: localSchema.customers.id,
            set: {
              firstName: localCustomer.firstName,
              lastName: localCustomer.lastName,
              email: localCustomer.email,
              phone: localCustomer.phone,
              loyaltyCardNumber: localCustomer.loyaltyCardNumber,
              loyaltyPoints: localCustomer.loyaltyPoints,
              isActive: localCustomer.isActive,
              updatedAt: new Date()
            }
          })

        this.emitEvent('realtime_update', {
          type: 'customer',
          eventType,
          data: localCustomer,
          source: 'realtime'
        })

        console.log(`Real-time customer update: ${localCustomer.firstName} ${localCustomer.lastName}`)
      }
    } catch (error) {
      const errorMessage = `Real-time customer update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage, source: 'realtime_customer' })
    }
  }

  /**
   * Handle real-time inventory movements from other terminals
   */
  private async handleRealtimeInventoryMovement(payload: any): Promise<void> {
    try {
      if (payload.new) {
        const movement = payload.new
        
        this.emitEvent('realtime_update', {
          type: 'inventory_movement',
          eventType: 'INSERT',
          data: movement,
          source: 'realtime'
        })

        console.log(`Real-time inventory movement from terminal ${movement.terminal_id}: Product ${movement.product_id}, Change: ${movement.change_amount}`)
        
        // Trigger immediate inventory sync for affected product
        await this.syncSpecificProductInventory(movement.product_id)
      }
    } catch (error) {
      const errorMessage = `Real-time inventory movement failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      this.status.errors.push(errorMessage)
      this.emitEvent('sync_error', { error: errorMessage, source: 'realtime_movement' })
    }
  }

  /**
   * Sync inventory for a specific product immediately
   */
  private async syncSpecificProductInventory(productId: string): Promise<void> {
    try {
      // Fetch current cloud inventory for this product
      const { data: cloudInventory, error } = await this.config.supabaseClient
        .from('inventory')
        .select('*')
        .eq('product_id', productId)
        .single()

      if (error || !cloudInventory) {
        console.warn(`Could not fetch cloud inventory for product ${productId}`)
        return
      }

      // Transform and update local inventory
      const localInventory = TransformerFactory.toLocal(cloudInventory, 'inventory')
      
      await this.config.localDb
        .insert(localSchema.inventory)
        .values(localInventory)
        .onConflictDoUpdate({
          target: localSchema.inventory.productId,
          set: {
            currentStock: localInventory.currentStock,
            reservedStock: localInventory.reservedStock,
            lastUpdated: localInventory.lastUpdated,
            lastSyncedAt: new Date()
          }
        })

      this.emitEvent('realtime_update', {
        type: 'inventory_sync',
        data: localInventory,
        source: 'movement_trigger'
      })

    } catch (error) {
      console.error(`Failed to sync inventory for product ${productId}:`, error)
    }
  }

  /**
   * Start periodic sync operations
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      if (!this.status.syncInProgress && this.status.isOnline) {
        await this.performFullSync()
      }
    }, this.config.syncInterval)
  }

  /**
   * Perform a complete sync cycle
   */
  async performFullSync(): Promise<SyncResult> {
    const startTime = Date.now()
    this.status.syncInProgress = true
    this.emitEvent('sync_start', { operation: 'full_sync' })

    try {
      // Check connectivity first
      if (!await this.checkConnectivity()) {
        throw new Error('No connectivity to cloud services')
      }

      let totalItems = 0
      const errors: string[] = []

      // Step 1: Upload pending transactions
      const uploadResult = await this.uploadPendingTransactions()
      totalItems += uploadResult.itemsProcessed
      errors.push(...uploadResult.errors)

      // Step 2: Download master data updates
      const downloadResult = await this.downloadMasterDataUpdates()
      totalItems += downloadResult.itemsProcessed
      errors.push(...downloadResult.errors)

      // Step 3: Update sync status
      await this.updateSyncStatus(errors.length === 0)

      const duration = Date.now() - startTime
      const result: SyncResult = {
        success: errors.length === 0,
        operation: 'full_sync',
        itemsProcessed: totalItems,
        errors,
        duration,
        timestamp: new Date().toISOString()
      }

      // Update metrics
      await this.updateMetrics(result)
      
      this.status.syncInProgress = false
      this.status.lastSyncAt = new Date()
      
      this.emitEvent('sync_complete', result)
      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error'
      const duration = Date.now() - startTime
      
      const result: SyncResult = {
        success: false,
        operation: 'full_sync',
        itemsProcessed: 0,
        errors: [errorMessage],
        duration,
        timestamp: new Date().toISOString()
      }

      this.updateMetrics(result)
      this.status.syncInProgress = false
      this.status.errors.push(errorMessage)
      
      this.emitEvent('sync_error', { error: errorMessage })
      return result
    }
  }

  /**
   * Upload pending transactions to cloud with ULID ordering
   */
  private async uploadPendingTransactions(): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      // Get pending transactions from sync queue, ordered by ULID (chronological)
      const pendingTransactions = await this.config.localDb
        .select()
        .from(localSchema.syncQueue)
        .where(
          and(
            eq(localSchema.syncQueue.status, 'pending'),
            eq(localSchema.syncQueue.operation, 'create')
          )
        )
        .orderBy(asc(localSchema.syncQueue.id)) // ULID ordering ensures chronological upload
        .limit(this.config.batchSize)

      if (pendingTransactions.length === 0) {
        return {
          success: true,
          operation: 'upload_transactions',
          itemsProcessed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      // Process transactions in batches
      const batches = this.createBatches(pendingTransactions, this.config.batchSize)
      
      for (const batch of batches) {
        try {
          const uploadResult = await this.uploadTransactionBatch(batch)
          itemsProcessed += uploadResult.successCount
          errors.push(...uploadResult.errors)
        } catch (error) {
          const errorMessage = `Batch upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          errors.push(errorMessage)
          
          // Mark batch items as failed
          await this.markBatchAsFailed(batch, errorMessage)
        }
      }

      // Update queue depth
      await this.getQueueDepth()

      return {
        success: errors.length === 0,
        operation: 'upload_transactions',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Transaction upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'upload_transactions',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Upload a batch of transactions to cloud
   */
  private async uploadTransactionBatch(queueItems: SyncQueue[]): Promise<{
    successCount: number
    errors: string[]
  }> {
    const errors: string[] = []
    let successCount = 0

    // Group queue items by table type
    const transactionItems = queueItems.filter(item => item.tableName === 'transactions')
    
    if (transactionItems.length === 0) {
      return { successCount: 0, errors: [] }
    }

    try {
      // Fetch transaction data from local database
      const transactionIds = transactionItems.map(item => item.recordId)
      const localTransactions = await this.config.localDb
        .select()
        .from(localSchema.transactions)
        .where(localSchema.transactions.id.in(transactionIds))

      if (localTransactions.length === 0) {
        errors.push('No transaction data found for queue items')
        return { successCount: 0, errors }
      }

      // Transform to cloud format
      const cloudTransactions = localTransactions.map(transaction => 
        TransformerFactory.toCloud(transaction, 'transaction')
      )

      // Upload to Supabase
      const { data, error } = await this.config.supabaseClient
        .from('transactions')
        .insert(cloudTransactions)
        .select()

      if (error) {
        errors.push(`Supabase upload error: ${error.message}`)
        return { successCount: 0, errors }
      }

      // Mark queue items as completed
      for (const item of transactionItems) {
        await this.config.localDb
          .update(localSchema.syncQueue)
          .set({
            status: 'completed',
            lastAttemptAt: new Date(),
            completedAt: new Date(),
            errorMessage: null,
            updatedAt: new Date()
          })
          .where(eq(localSchema.syncQueue.id, item.id))
      }

      successCount = transactionItems.length

    } catch (error) {
      const errorMessage = `Transaction batch upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      // Mark items as failed with retry logic
      for (const item of transactionItems) {
        await this.updateQueueItemForRetry(item, errorMessage)
      }
    }

    return { successCount, errors }
  }

  /**
   * Create batches from array of items
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  /**
   * Mark a batch of queue items as failed
   */
  private async markBatchAsFailed(queueItems: SyncQueue[], errorMessage: string): Promise<void> {
    for (const item of queueItems) {
      await this.updateQueueItemForRetry(item, errorMessage)
    }
  }

  /**
   * Update queue item for retry with exponential backoff
   */
  private async updateQueueItemForRetry(item: SyncQueue, errorMessage: string): Promise<void> {
    const newAttemptCount = item.attemptCount + 1
    const now = new Date()

    if (newAttemptCount >= this.config.maxRetryAttempts) {
      // Max retries reached, mark as failed permanently
      await this.config.localDb
        .update(localSchema.syncQueue)
        .set({
          status: 'failed',
          attemptCount: newAttemptCount,
          lastAttemptAt: now,
          errorMessage,
          updatedAt: now
        })
        .where(eq(localSchema.syncQueue.id, item.id))
    } else {
      // Calculate next retry time with exponential backoff
      const backoffDelay = this.config.baseRetryDelay * Math.pow(2, newAttemptCount - 1)
      const nextRetryAt = new Date(Date.now() + backoffDelay)

      await this.config.localDb
        .update(localSchema.syncQueue)
        .set({
          status: 'pending',
          attemptCount: newAttemptCount,
          lastAttemptAt: now,
          nextRetryAt,
          errorMessage,
          updatedAt: now
        })
        .where(eq(localSchema.syncQueue.id, item.id))
    }
  }

  /**
   * Add transaction to upload queue
   */
  async queueTransactionForUpload(transactionId: string): Promise<void> {
    const ulid = this.generateUlid()
    
    await this.config.localDb.insert(localSchema.syncQueue).values({
      id: ulid,
      terminalId: this.config.terminalId,
      tableName: 'transactions',
      recordId: transactionId,
      operation: 'create',
      status: 'pending',
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    this.emitEvent('queue_updated', { 
      operation: 'added',
      tableName: 'transactions',
      recordId: transactionId
    })
  }

  /**
   * Add multiple transactions to upload queue (bulk operation)
   */
  async queueTransactionsForUpload(transactionIds: string[]): Promise<void> {
    const queueItems = transactionIds.map(transactionId => ({
      id: this.generateUlid(),
      terminalId: this.config.terminalId,
      tableName: 'transactions',
      recordId: transactionId,
      operation: 'create' as const,
      status: 'pending' as const,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }))

    await this.config.localDb.insert(localSchema.syncQueue).values(queueItems)

    this.emitEvent('queue_updated', { 
      operation: 'bulk_added',
      tableName: 'transactions',
      count: transactionIds.length
    })
  }

  /**
   * Generate ULID for chronological ordering
   */
  private generateUlid(): string {
    // Use the TransformUtils ULID generator for consistency
    return TransformUtils.generateUlid()
  }

  /**
   * Download master data updates from cloud (products, customers, employees)
   */
  private async downloadMasterDataUpdates(): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      // Get last sync timestamps for each data type
      const lastSyncInfo = await this.getLastSyncTimestamps()

      // Download products
      const productResult = await this.downloadProducts(lastSyncInfo.products)
      itemsProcessed += productResult.itemsProcessed
      errors.push(...productResult.errors)

      // Download employees
      const employeeResult = await this.downloadEmployees(lastSyncInfo.employees)
      itemsProcessed += employeeResult.itemsProcessed
      errors.push(...employeeResult.errors)

      // Download customers
      const customerResult = await this.downloadCustomers(lastSyncInfo.customers)
      itemsProcessed += customerResult.itemsProcessed
      errors.push(...customerResult.errors)

      // Download inventory updates
      const inventoryResult = await this.downloadInventory(lastSyncInfo.inventory)
      itemsProcessed += inventoryResult.itemsProcessed
      errors.push(...inventoryResult.errors)

      // Update last sync timestamps
      await this.updateLastSyncTimestamps()

      return {
        success: errors.length === 0,
        operation: 'download_master_data',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Master data download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'download_master_data',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Get last sync timestamps for each data type
   */
  private async getLastSyncTimestamps(): Promise<{
    products: string | null
    employees: string | null
    customers: string | null
    inventory: string | null
  }> {
    const masterDataVersions = await this.config.localDb
      .select()
      .from(localSchema.masterDataVersions)
      .where(eq(localSchema.masterDataVersions.terminalId, this.config.terminalId))

    const versionsMap = new Map(
      masterDataVersions.map(v => [v.tableName, v.lastSyncedVersion])
    )

    return {
      products: versionsMap.get('products') || null,
      employees: versionsMap.get('employees') || null,
      customers: versionsMap.get('customers') || null,
      inventory: versionsMap.get('inventory') || null
    }
  }

  /**
   * Download products from cloud
   */
  private async downloadProducts(lastSyncVersion: string | null): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      // Build query for updated products
      let query = this.config.supabaseClient
        .from('products')
        .select(`
          *,
          barcodes (*)
        `)
        .eq('is_active', true)
        .order('updated_at', { ascending: true })

      // Add version filter if we have a last sync version
      if (lastSyncVersion) {
        query = query.gt('updated_at', lastSyncVersion)
      }

      const { data: cloudProducts, error } = await query

      if (error) {
        errors.push(`Product download error: ${error.message}`)
        return {
          success: false,
          operation: 'download_products',
          itemsProcessed: 0,
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      if (!cloudProducts || cloudProducts.length === 0) {
        return {
          success: true,
          operation: 'download_products',
          itemsProcessed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      // Transform and upsert products
      for (const cloudProduct of cloudProducts) {
        try {
          const localProduct = TransformerFactory.toLocal(cloudProduct, 'product')
          
          // Upsert product
          await this.config.localDb
            .insert(localSchema.products)
            .values(localProduct)
            .onConflictDoUpdate({
              target: localSchema.products.id,
              set: {
                sku: localProduct.sku,
                name: localProduct.name,
                category: localProduct.category,
                size: localProduct.size,
                cost: localProduct.cost,
                retailPrice: localProduct.retailPrice,
                parentProductId: localProduct.parentProductId,
                unitsInParent: localProduct.unitsInParent,
                loyaltyPointMultiplier: localProduct.loyaltyPointMultiplier,
                isActive: localProduct.isActive,
                updatedAt: new Date()
              }
            })

          // Handle barcodes if present
          if (cloudProduct.barcodes && cloudProduct.barcodes.length > 0) {
            for (const cloudBarcode of cloudProduct.barcodes) {
              const localBarcode = TransformerFactory.toLocal(cloudBarcode, 'barcode')
              
              await this.config.localDb
                .insert(localSchema.productBarcodes)
                .values(localBarcode)
                .onConflictDoUpdate({
                  target: localSchema.productBarcodes.id,
                  set: {
                    barcode: localBarcode.barcode,
                    isPrimary: localBarcode.isPrimary
                  }
                })
            }
          }

          itemsProcessed++
        } catch (error) {
          errors.push(`Product ${cloudProduct.id} transform/upsert failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      return {
        success: errors.length === 0,
        operation: 'download_products',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Product download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'download_products',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Download employees from cloud
   */
  private async downloadEmployees(lastSyncVersion: string | null): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      let query = this.config.supabaseClient
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: true })

      if (lastSyncVersion) {
        query = query.gt('updated_at', lastSyncVersion)
      }

      const { data: cloudEmployees, error } = await query

      if (error) {
        errors.push(`Employee download error: ${error.message}`)
        return {
          success: false,
          operation: 'download_employees',
          itemsProcessed: 0,
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      if (!cloudEmployees || cloudEmployees.length === 0) {
        return {
          success: true,
          operation: 'download_employees',
          itemsProcessed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      // Transform and upsert employees
      for (const cloudEmployee of cloudEmployees) {
        try {
          const localEmployee = TransformerFactory.toLocal(cloudEmployee, 'employee')
          
          await this.config.localDb
            .insert(localSchema.employees)
            .values(localEmployee)
            .onConflictDoUpdate({
              target: localSchema.employees.id,
              set: {
                employeeCode: localEmployee.employeeCode,
                firstName: localEmployee.firstName,
                lastName: localEmployee.lastName,
                pin: localEmployee.pin,
                isActive: localEmployee.isActive,
                canOverridePrice: localEmployee.canOverridePrice,
                canVoidTransaction: localEmployee.canVoidTransaction,
                isManager: localEmployee.isManager,
                updatedAt: new Date()
              }
            })

          itemsProcessed++
        } catch (error) {
          errors.push(`Employee ${cloudEmployee.id} transform/upsert failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      return {
        success: errors.length === 0,
        operation: 'download_employees',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Employee download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'download_employees',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Download customers from cloud
   */
  private async downloadCustomers(lastSyncVersion: string | null): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      let query = this.config.supabaseClient
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: true })

      if (lastSyncVersion) {
        query = query.gt('updated_at', lastSyncVersion)
      }

      const { data: cloudCustomers, error } = await query

      if (error) {
        errors.push(`Customer download error: ${error.message}`)
        return {
          success: false,
          operation: 'download_customers',
          itemsProcessed: 0,
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      if (!cloudCustomers || cloudCustomers.length === 0) {
        return {
          success: true,
          operation: 'download_customers',
          itemsProcessed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      // Transform and upsert customers
      for (const cloudCustomer of cloudCustomers) {
        try {
          const localCustomer = TransformerFactory.toLocal(cloudCustomer, 'customer')
          
          await this.config.localDb
            .insert(localSchema.customers)
            .values(localCustomer)
            .onConflictDoUpdate({
              target: localSchema.customers.id,
              set: {
                firstName: localCustomer.firstName,
                lastName: localCustomer.lastName,
                email: localCustomer.email,
                phone: localCustomer.phone,
                loyaltyCardNumber: localCustomer.loyaltyCardNumber,
                loyaltyPoints: localCustomer.loyaltyPoints,
                isActive: localCustomer.isActive,
                updatedAt: new Date()
              }
            })

          itemsProcessed++
        } catch (error) {
          errors.push(`Customer ${cloudCustomer.id} transform/upsert failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      return {
        success: errors.length === 0,
        operation: 'download_customers',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Customer download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'download_customers',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Download inventory updates from cloud
   */
  private async downloadInventory(lastSyncVersion: string | null): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let itemsProcessed = 0

    try {
      let query = this.config.supabaseClient
        .from('inventory')
        .select('*')
        .order('last_updated', { ascending: true })

      if (lastSyncVersion) {
        query = query.gt('last_updated', lastSyncVersion)
      }

      const { data: cloudInventory, error } = await query

      if (error) {
        errors.push(`Inventory download error: ${error.message}`)
        return {
          success: false,
          operation: 'download_inventory',
          itemsProcessed: 0,
          errors,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      if (!cloudInventory || cloudInventory.length === 0) {
        return {
          success: true,
          operation: 'download_inventory',
          itemsProcessed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      }

      // Transform and upsert inventory
      for (const cloudItem of cloudInventory) {
        try {
          const localItem = TransformerFactory.toLocal(cloudItem, 'inventory')
          
          await this.config.localDb
            .insert(localSchema.inventory)
            .values(localItem)
            .onConflictDoUpdate({
              target: localSchema.inventory.productId,
              set: {
                currentStock: localItem.currentStock,
                reservedStock: localItem.reservedStock,
                lastUpdated: localItem.lastUpdated,
                lastSyncedAt: new Date()
              }
            })

          itemsProcessed++
        } catch (error) {
          errors.push(`Inventory ${cloudItem.product_id} transform/upsert failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      return {
        success: errors.length === 0,
        operation: 'download_inventory',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      const errorMessage = `Inventory download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)

      return {
        success: false,
        operation: 'download_inventory',
        itemsProcessed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Update last sync timestamps after successful download
   */
  private async updateLastSyncTimestamps(): Promise<void> {
    const now = new Date().toISOString()
    const tablesToUpdate = ['products', 'employees', 'customers', 'inventory']

    for (const tableName of tablesToUpdate) {
      await this.config.localDb
        .insert(localSchema.masterDataVersions)
        .values({
          terminalId: this.config.terminalId,
          tableName,
          lastSyncedVersion: now,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [localSchema.masterDataVersions.terminalId, localSchema.masterDataVersions.tableName],
          set: {
            lastSyncedVersion: now,
            updatedAt: new Date()
          }
        })
    }
  }

  /**
   * Update local sync status record
   */
  private async updateSyncStatus(success: boolean): Promise<void> {
    const now = new Date()
    
    await this.config.localDb
      .update(localSchema.syncStatus)
      .set({
        lastSyncAt: now,
        lastSuccessfulSyncAt: success ? now : undefined,
        queueDepth: this.status.queueDepth,
        isOnline: this.status.isOnline,
        syncInProgress: false,
        lastError: success ? null : this.status.errors[this.status.errors.length - 1] || null,
        updatedAt: now
      })
      .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))
  }

  /**
   * Update sync metrics with comprehensive tracking
   */
  private async updateMetrics(result: SyncResult): Promise<void> {
    this.status.metrics.totalSyncs++
    
    if (result.success) {
      this.status.metrics.successfulSyncs++
    } else {
      this.status.metrics.failedSyncs++
      this.status.metrics.lastErrorAt = new Date()
    }
    
    // Update average latency (simple moving average)
    const totalLatency = this.status.metrics.averageLatency * (this.status.metrics.totalSyncs - 1) + result.duration
    this.status.metrics.averageLatency = totalLatency / this.status.metrics.totalSyncs
    
    // Persist metrics to database
    await this.persistSyncMetrics(result)
    
    // Check for performance alerts
    await this.checkPerformanceAlerts(result)
  }

  /**
   * Persist sync metrics to local database for analysis
   */
  private async persistSyncMetrics(result: SyncResult): Promise<void> {
    try {
      // Store detailed metrics in a dedicated metrics table
      await this.config.localDb.insert(localSchema.syncQueue).values({
        id: this.generateUlid(),
        terminalId: this.config.terminalId,
        tableName: 'metrics',
        recordId: `sync_${Date.now()}`,
        operation: result.operation,
        status: result.success ? 'completed' : 'failed',
        attemptCount: 1,
        errorMessage: result.errors.length > 0 ? result.errors.join('; ') : null,
        createdAt: new Date(result.timestamp),
        updatedAt: new Date()
      })

      // Update aggregate metrics in sync status
      const queueDepth = await this.getQueueDepth()
      
      await this.config.localDb
        .update(localSchema.syncStatus)
        .set({
          queueDepth,
          lastSyncAt: new Date(result.timestamp),
          lastSuccessfulSyncAt: result.success ? new Date(result.timestamp) : undefined,
          lastError: result.errors.length > 0 ? result.errors[0] : null,
          updatedAt: new Date()
        })
        .where(eq(localSchema.syncStatus.terminalId, this.config.terminalId))

    } catch (error) {
      console.error('Failed to persist sync metrics:', error)
    }
  }

  /**
   * Check for performance alerts based on metrics
   */
  private async checkPerformanceAlerts(result: SyncResult): Promise<void> {
    const alerts: string[] = []

    // Check sync duration (alert if > 30 seconds)
    if (result.duration > 30000) {
      alerts.push(`Slow sync detected: ${result.duration}ms for ${result.operation}`)
    }

    // Check queue depth (alert if > 50 items)
    if (this.status.queueDepth > 50) {
      alerts.push(`High queue depth: ${this.status.queueDepth} pending items`)
    }

    // Check error rate (alert if > 20% failures in last 10 syncs)
    const recentFailureRate = this.calculateRecentFailureRate()
    if (recentFailureRate > 0.2) {
      alerts.push(`High failure rate: ${Math.round(recentFailureRate * 100)}% in recent operations`)
    }

    // Check average latency (alert if > 10 seconds)
    if (this.status.metrics.averageLatency > 10000) {
      alerts.push(`High average latency: ${Math.round(this.status.metrics.averageLatency)}ms`)
    }

    // Emit alerts
    for (const alert of alerts) {
      this.emitEvent('sync_error', {
        type: 'performance_alert',
        message: alert,
        metrics: {
          duration: result.duration,
          queueDepth: this.status.queueDepth,
          failureRate: recentFailureRate,
          averageLatency: this.status.metrics.averageLatency
        }
      })
    }
  }

  /**
   * Calculate failure rate for recent operations
   */
  private calculateRecentFailureRate(): number {
    const recentSyncCount = Math.min(this.status.metrics.totalSyncs, 10)
    if (recentSyncCount === 0) return 0
    
    // This is a simplified calculation - in production you'd track recent operations
    const recentFailures = Math.min(this.status.metrics.failedSyncs, recentSyncCount)
    return recentFailures / recentSyncCount
  }

  /**
   * Get comprehensive sync metrics for monitoring
   */
  async getSyncMetrics(): Promise<{
    current: {
      isOnline: boolean
      isActive: boolean
      syncInProgress: boolean
      queueDepth: number
      lastSyncAt: Date | null
      lastSuccessfulSyncAt: Date | null
    }
    performance: {
      totalSyncs: number
      successfulSyncs: number
      failedSyncs: number
      successRate: number
      averageLatency: number
      lastErrorAt: Date | null
    }
    connectivity: {
      isOnline: boolean
      lastCheck: Date | null
      lastLatency: number | null
      connectionQuality: string
      uptime: number
      lastOfflineAt: Date | null
    }
    alerts: {
      highQueueDepth: boolean
      slowPerformance: boolean
      highFailureRate: boolean
      connectivityIssues: boolean
    }
  }> {
    try {
      const connectivityStatus = await this.getConnectivityStatus()
      const queueDepth = await this.getQueueDepth()
      
      // Calculate success rate
      const successRate = this.status.metrics.totalSyncs > 0 
        ? this.status.metrics.successfulSyncs / this.status.metrics.totalSyncs 
        : 0

      // Check for alert conditions
      const alerts = {
        highQueueDepth: queueDepth > 50,
        slowPerformance: this.status.metrics.averageLatency > 10000,
        highFailureRate: successRate < 0.8 && this.status.metrics.totalSyncs > 5,
        connectivityIssues: !connectivityStatus.isOnline || connectivityStatus.connectionQuality === 'poor'
      }

      return {
        current: {
          isOnline: this.status.isOnline,
          isActive: this.status.isActive,
          syncInProgress: this.status.syncInProgress,
          queueDepth,
          lastSyncAt: this.status.lastSyncAt,
          lastSuccessfulSyncAt: null // Would come from database
        },
        performance: {
          totalSyncs: this.status.metrics.totalSyncs,
          successfulSyncs: this.status.metrics.successfulSyncs,
          failedSyncs: this.status.metrics.failedSyncs,
          successRate,
          averageLatency: this.status.metrics.averageLatency,
          lastErrorAt: this.status.metrics.lastErrorAt
        },
        connectivity: connectivityStatus,
        alerts
      }

    } catch (error) {
      console.error('Failed to get sync metrics:', error)
      
      // Return basic metrics on error
      return {
        current: {
          isOnline: this.status.isOnline,
          isActive: this.status.isActive,
          syncInProgress: this.status.syncInProgress,
          queueDepth: 0,
          lastSyncAt: this.status.lastSyncAt,
          lastSuccessfulSyncAt: null
        },
        performance: {
          totalSyncs: this.status.metrics.totalSyncs,
          successfulSyncs: this.status.metrics.successfulSyncs,
          failedSyncs: this.status.metrics.failedSyncs,
          successRate: 0,
          averageLatency: this.status.metrics.averageLatency,
          lastErrorAt: this.status.metrics.lastErrorAt
        },
        connectivity: {
          isOnline: this.status.isOnline,
          lastCheck: null,
          lastLatency: null,
          connectionQuality: 'unknown',
          uptime: 0,
          lastOfflineAt: null
        },
        alerts: {
          highQueueDepth: false,
          slowPerformance: false,
          highFailureRate: false,
          connectivityIssues: !this.status.isOnline
        }
      }
    }
  }

  /**
   * Get historical sync metrics for trend analysis
   */
  async getHistoricalMetrics(days: number = 7): Promise<{
    dailyStats: Array<{
      date: string
      totalSyncs: number
      successfulSyncs: number
      failedSyncs: number
      averageLatency: number
    }>
    trends: {
      syncVolumeTrend: 'increasing' | 'decreasing' | 'stable'
      performanceTrend: 'improving' | 'degrading' | 'stable'
      reliabilityTrend: 'improving' | 'degrading' | 'stable'
    }
  }> {
    try {
      // Get metrics from the last N days
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const historicalData = await this.config.localDb
        .select()
        .from(localSchema.syncQueue)
        .where(
          and(
            eq(localSchema.syncQueue.tableName, 'metrics'),
            gt(localSchema.syncQueue.createdAt, cutoffDate)
          )
        )
        .orderBy(asc(localSchema.syncQueue.createdAt))

      // Group by day and calculate daily stats
      const dailyStatsMap = new Map<string, {
        totalSyncs: number
        successfulSyncs: number
        failedSyncs: number
        totalLatency: number
      }>()

      for (const record of historicalData) {
        const dateKey = record.createdAt.toISOString().split('T')[0]
        const existing = dailyStatsMap.get(dateKey) || {
          totalSyncs: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          totalLatency: 0
        }

        existing.totalSyncs++
        if (record.status === 'completed') {
          existing.successfulSyncs++
        } else {
          existing.failedSyncs++
        }
        
        // Extract latency from operation (would be better stored separately)
        existing.totalLatency += 1000 // Placeholder - would parse from stored data

        dailyStatsMap.set(dateKey, existing)
      }

      // Convert to array format
      const dailyStats = Array.from(dailyStatsMap.entries()).map(([date, stats]) => ({
        date,
        totalSyncs: stats.totalSyncs,
        successfulSyncs: stats.successfulSyncs,
        failedSyncs: stats.failedSyncs,
        averageLatency: stats.totalSyncs > 0 ? stats.totalLatency / stats.totalSyncs : 0
      }))

      // Calculate trends (simplified)
      const trends = this.calculateTrends(dailyStats)

      return { dailyStats, trends }

    } catch (error) {
      console.error('Failed to get historical metrics:', error)
      return {
        dailyStats: [],
        trends: {
          syncVolumeTrend: 'stable',
          performanceTrend: 'stable',
          reliabilityTrend: 'stable'
        }
      }
    }
  }

  /**
   * Calculate trends from daily statistics
   */
  private calculateTrends(dailyStats: Array<{
    date: string
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    averageLatency: number
  }>): {
    syncVolumeTrend: 'increasing' | 'decreasing' | 'stable'
    performanceTrend: 'improving' | 'degrading' | 'stable'
    reliabilityTrend: 'improving' | 'degrading' | 'stable'
  } {
    if (dailyStats.length < 2) {
      return {
        syncVolumeTrend: 'stable',
        performanceTrend: 'stable',
        reliabilityTrend: 'stable'
      }
    }

    const firstHalf = dailyStats.slice(0, Math.floor(dailyStats.length / 2))
    const secondHalf = dailyStats.slice(Math.floor(dailyStats.length / 2))

    // Calculate averages for each half
    const firstHalfAvgs = this.calculateAverages(firstHalf)
    const secondHalfAvgs = this.calculateAverages(secondHalf)

    // Determine trends
    const syncVolumeTrend = this.determineTrend(firstHalfAvgs.totalSyncs, secondHalfAvgs.totalSyncs)
    const performanceTrend = this.determineTrend(secondHalfAvgs.averageLatency, firstHalfAvgs.averageLatency) // Inverted - lower latency is better
    const reliabilityTrend = this.determineTrend(firstHalfAvgs.successRate, secondHalfAvgs.successRate)

    return {
      syncVolumeTrend: syncVolumeTrend as 'increasing' | 'decreasing' | 'stable',
      performanceTrend: performanceTrend as 'improving' | 'degrading' | 'stable',
      reliabilityTrend: reliabilityTrend as 'improving' | 'degrading' | 'stable'
    }
  }

  /**
   * Calculate averages for a set of daily stats
   */
  private calculateAverages(stats: Array<{
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    averageLatency: number
  }>): {
    totalSyncs: number
    successRate: number
    averageLatency: number
  } {
    if (stats.length === 0) {
      return { totalSyncs: 0, successRate: 0, averageLatency: 0 }
    }

    const totalSyncs = stats.reduce((sum, day) => sum + day.totalSyncs, 0) / stats.length
    const totalSuccessful = stats.reduce((sum, day) => sum + day.successfulSyncs, 0)
    const totalAttempts = stats.reduce((sum, day) => sum + day.totalSyncs, 0)
    const successRate = totalAttempts > 0 ? totalSuccessful / totalAttempts : 0
    const averageLatency = stats.reduce((sum, day) => sum + day.averageLatency, 0) / stats.length

    return { totalSyncs, successRate, averageLatency }
  }

  /**
   * Determine trend direction between two values
   */
  private determineTrend(oldValue: number, newValue: number): string {
    const threshold = 0.1 // 10% change threshold
    const change = (newValue - oldValue) / (oldValue || 1)

    if (change > threshold) return 'increasing'
    if (change < -threshold) return 'decreasing'
    return 'stable'
  }

  /**
   * Export metrics for external monitoring systems
   */
  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const metrics = await this.getSyncMetrics()
      const historical = await this.getHistoricalMetrics(30) // Last 30 days
      
      const exportData = {
        timestamp: new Date().toISOString(),
        terminalId: this.config.terminalId,
        current: metrics.current,
        performance: metrics.performance,
        connectivity: metrics.connectivity,
        alerts: metrics.alerts,
        historical: historical.dailyStats,
        trends: historical.trends
      }

      if (format === 'json') {
        return JSON.stringify(exportData, null, 2)
      } else {
        // Simple CSV format for basic metrics
        const csv = [
          'timestamp,terminalId,isOnline,queueDepth,totalSyncs,successRate,averageLatency',
          `${exportData.timestamp},${exportData.terminalId},${exportData.current.isOnline},${exportData.current.queueDepth},${exportData.performance.totalSyncs},${exportData.performance.successRate.toFixed(3)},${exportData.performance.averageLatency.toFixed(0)}`
        ].join('\n')
        
        return csv
      }

    } catch (error) {
      console.error('Failed to export metrics:', error)
      return format === 'json' ? '{"error": "Failed to export metrics"}' : 'error,Failed to export metrics'
    }
  }

  /**
   * Get current sync engine status
   */
  getStatus(): SyncEngineStatus {
    return { ...this.status }
  }

  /**
   * Add event listener
   */
  on(event: SyncEventType, listener: (data: SyncEventData) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener)
  }

  /**
   * Remove event listener
   */
  off(event: SyncEventType, listener: (data: SyncEventData) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(type: SyncEventType, data: any): void {
    const listeners = this.eventListeners.get(type)
    if (listeners) {
      const eventData: SyncEventData = {
        type,
        data,
        timestamp: new Date()
      }
      
      listeners.forEach(listener => {
        try {
          listener(eventData)
        } catch (error) {
          console.error(`Error in sync event listener for ${type}:`, error)
        }
      })
    }
  }

  /**
   * Force immediate sync operation
   */
  async forcSync(): Promise<SyncResult> {
    if (this.status.syncInProgress) {
      throw new Error('Sync already in progress')
    }
    
    return await this.performFullSync()
  }

  /**
   * Get current queue depth
   */
  async getQueueDepth(): Promise<number> {
    const queueItems = await this.config.localDb
      .select({ count: localSchema.syncQueue.id })
      .from(localSchema.syncQueue)
      .where(eq(localSchema.syncQueue.status, 'pending'))

    this.status.queueDepth = queueItems.length
    return this.status.queueDepth
  }

  /**
   * Resolve conflicts using ULID-based chronological ordering
   * ULIDs are chronologically sortable, so earlier ULIDs represent earlier operations
   */
  async resolveConflict<T>(
    conflictType: 'inventory' | 'transaction' | 'customer',
    localRecord: T & { id: string; updatedAt?: Date },
    cloudRecord: T & { id: string; updated_at?: string },
    conflictData: {
      productId?: string
      terminalId?: string
      operation?: string
    } = {}
  ): Promise<{
    resolution: 'use_local' | 'use_cloud' | 'merge' | 'manual_intervention'
    winner: T
    reason: string
    conflictId: string
  }> {
    const conflictId = this.generateUlid()
    
    try {
      // Extract ULIDs for chronological comparison
      const localUlid = localRecord.id
      const cloudUlid = cloudRecord.id
      
      // ULID chronological comparison - earlier ULID wins
      const chronologicalWinner = this.compareUlids(localUlid, cloudUlid)
      
      switch (conflictType) {
        case 'inventory':
          return await this.resolveInventoryConflict(
            localRecord as any,
            cloudRecord as any,
            chronologicalWinner,
            conflictId,
            conflictData
          )
          
        case 'transaction':
          return await this.resolveTransactionConflict(
            localRecord as any,
            cloudRecord as any,
            chronologicalWinner,
            conflictId,
            conflictData
          )
          
        case 'customer':
          return await this.resolveCustomerConflict(
            localRecord as any,
            cloudRecord as any,
            chronologicalWinner,
            conflictId,
            conflictData
          )
          
        default:
          throw new Error(`Unsupported conflict type: ${conflictType}`)
      }
      
    } catch (error) {
      const errorMessage = `Conflict resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      
      // Log conflict for manual intervention
      await this.logConflictForManualIntervention({
        conflictId,
        conflictType,
        localRecord,
        cloudRecord,
        error: errorMessage,
        conflictData
      })
      
      return {
        resolution: 'manual_intervention',
        winner: localRecord, // Default to local on error
        reason: errorMessage,
        conflictId
      }
    }
  }

  /**
   * Compare two ULIDs chronologically
   * Returns 'local' if local ULID is earlier, 'cloud' if cloud ULID is earlier
   */
  private compareUlids(localUlid: string, cloudUlid: string): 'local' | 'cloud' {
    // ULIDs are lexicographically sortable by time
    return localUlid < cloudUlid ? 'local' : 'cloud'
  }

  /**
   * Resolve inventory conflicts using business rules
   */
  private async resolveInventoryConflict(
    localInventory: Inventory,
    cloudInventory: CloudInventory,
    chronologicalWinner: 'local' | 'cloud',
    conflictId: string,
    conflictData: any
  ): Promise<{
    resolution: 'use_local' | 'use_cloud' | 'merge' | 'manual_intervention'
    winner: Inventory
    reason: string
    conflictId: string
  }> {
    // For inventory, we prioritize data integrity and chronological order
    
    // Check if this is a critical stock level conflict
    const localStock = localInventory.currentStock
    const cloudStock = cloudInventory.current_stock
    const stockDifference = Math.abs(localStock - cloudStock)
    
    // If stock difference is significant (>10 units), require manual intervention
    if (stockDifference > 10) {
      await this.logConflictForManualIntervention({
        conflictId,
        conflictType: 'inventory',
        localRecord: localInventory,
        cloudRecord: cloudInventory,
        reason: `Significant stock difference: ${stockDifference} units`,
        conflictData: {
          ...conflictData,
          stockDifference,
          localStock,
          cloudStock
        }
      })
      
      return {
        resolution: 'manual_intervention',
        winner: localInventory,
        reason: `Stock difference too large (${stockDifference} units) for automatic resolution`,
        conflictId
      }
    }
    
    // Use chronological winner for smaller differences
    if (chronologicalWinner === 'local') {
      return {
        resolution: 'use_local',
        winner: localInventory,
        reason: `Local inventory has earlier ULID (${localInventory.productId})`,
        conflictId
      }
    } else {
      const transformedCloud = TransformerFactory.toLocal(cloudInventory, 'inventory')
      return {
        resolution: 'use_cloud',
        winner: transformedCloud,
        reason: `Cloud inventory has earlier ULID (${cloudInventory.product_id})`,
        conflictId
      }
    }
  }

  /**
   * Resolve transaction conflicts using ULID ordering
   */
  private async resolveTransactionConflict(
    localTransaction: Transaction,
    cloudTransaction: CloudTransaction,
    chronologicalWinner: 'local' | 'cloud',
    conflictId: string,
    conflictData: any
  ): Promise<{
    resolution: 'use_local' | 'use_cloud' | 'merge' | 'manual_intervention'
    winner: Transaction
    reason: string
    conflictId: string
  }> {
    // For transactions, chronological order is paramount
    // Earlier transaction (by ULID) always wins to maintain transaction integrity
    
    if (chronologicalWinner === 'local') {
      return {
        resolution: 'use_local',
        winner: localTransaction,
        reason: `Local transaction has earlier ULID and wins chronologically`,
        conflictId
      }
    } else {
      const transformedCloud = TransformerFactory.toLocal(cloudTransaction, 'transaction')
      return {
        resolution: 'use_cloud',
        winner: transformedCloud,
        reason: `Cloud transaction has earlier ULID and wins chronologically`,
        conflictId
      }
    }
  }

  /**
   * Resolve customer conflicts with preference for latest loyalty data
   */
  private async resolveCustomerConflict(
    localCustomer: Customer,
    cloudCustomer: CloudCustomer,
    chronologicalWinner: 'local' | 'cloud',
    conflictId: string,
    conflictData: any
  ): Promise<{
    resolution: 'use_local' | 'use_cloud' | 'merge' | 'manual_intervention'
    winner: Customer
    reason: string
    conflictId: string
  }> {
    // For customers, we can often merge data intelligently
    // Prioritize loyalty points (usually higher is better) and contact info
    
    const localPoints = localCustomer.loyaltyPoints || 0
    const cloudPoints = cloudCustomer.loyalty_points || 0
    
    // If loyalty points differ significantly, use the higher one
    if (Math.abs(localPoints - cloudPoints) > 50) {
      const winner = localPoints > cloudPoints ? 'local' : 'cloud'
      const transformedCloud = TransformerFactory.toLocal(cloudCustomer, 'customer')
      
      return {
        resolution: winner === 'local' ? 'use_local' : 'use_cloud',
        winner: winner === 'local' ? localCustomer : transformedCloud,
        reason: `Used customer record with higher loyalty points (${Math.max(localPoints, cloudPoints)})`,
        conflictId
      }
    }
    
    // For smaller differences, use chronological order
    if (chronologicalWinner === 'local') {
      return {
        resolution: 'use_local',
        winner: localCustomer,
        reason: `Local customer has earlier ULID`,
        conflictId
      }
    } else {
      const transformedCloud = TransformerFactory.toLocal(cloudCustomer, 'customer')
      return {
        resolution: 'use_cloud',
        winner: transformedCloud,
        reason: `Cloud customer has earlier ULID`,
        conflictId
      }
    }
  }

  /**
   * Log conflicts that require manual intervention
   */
  private async logConflictForManualIntervention(conflictData: {
    conflictId: string
    conflictType: string
    localRecord: any
    cloudRecord: any
    reason?: string
    error?: string
    conflictData?: any
  }): Promise<void> {
    try {
      // Store conflict in local database for manual resolution
      await this.config.localDb.insert(localSchema.syncQueue).values({
        id: conflictData.conflictId,
        terminalId: this.config.terminalId,
        tableName: 'conflicts',
        recordId: conflictData.conflictId,
        operation: 'manual_resolution_required',
        status: 'failed',
        attemptCount: 0,
        errorMessage: `Conflict requires manual intervention: ${conflictData.reason || conflictData.error}`,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      // Emit event for UI notification
      this.emitEvent('sync_error', {
        type: 'conflict_manual_intervention',
        conflictId: conflictData.conflictId,
        conflictType: conflictData.conflictType,
        reason: conflictData.reason || conflictData.error,
        data: {
          local: conflictData.localRecord,
          cloud: conflictData.cloudRecord,
          conflictData: conflictData.conflictData
        }
      })

      console.error(`Conflict ${conflictData.conflictId} requires manual intervention:`, conflictData.reason || conflictData.error)
      
    } catch (error) {
      console.error('Failed to log conflict for manual intervention:', error)
    }
  }

  /**
   * Process and resolve pending conflicts
   */
  async processConflicts(): Promise<{
    processed: number
    resolved: number
    manualInterventionRequired: number
    errors: string[]
  }> {
    const errors: string[] = []
    let processed = 0
    let resolved = 0
    let manualInterventionRequired = 0

    try {
      // Get conflicts that need manual resolution
      const conflictItems = await this.config.localDb
        .select()
        .from(localSchema.syncQueue)
        .where(
          and(
            eq(localSchema.syncQueue.tableName, 'conflicts'),
            eq(localSchema.syncQueue.operation, 'manual_resolution_required'),
            eq(localSchema.syncQueue.status, 'failed')
          )
        )
        .orderBy(asc(localSchema.syncQueue.createdAt))

      for (const conflict of conflictItems) {
        processed++
        
        // For now, conflicts requiring manual intervention remain pending
        // In a real implementation, there would be an admin interface to resolve these
        manualInterventionRequired++
        
        this.emitEvent('queue_updated', {
          operation: 'conflict_pending',
          conflictId: conflict.recordId,
          message: 'Conflict awaiting manual resolution'
        })
      }

      return {
        processed,
        resolved,
        manualInterventionRequired,
        errors
      }

    } catch (error) {
      const errorMessage = `Conflict processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      errors.push(errorMessage)
      
      return {
        processed,
        resolved,
        manualInterventionRequired,
        errors
      }
    }
  }

  /**
   * Get conflict statistics
   */
  async getConflictStats(): Promise<{
    pending: number
    resolved: number
    total: number
    byType: Record<string, number>
  }> {
    try {
      const allConflicts = await this.config.localDb
        .select()
        .from(localSchema.syncQueue)
        .where(eq(localSchema.syncQueue.tableName, 'conflicts'))

      const pending = allConflicts.filter(c => c.status === 'failed').length
      const resolved = allConflicts.filter(c => c.status === 'completed').length
      const total = allConflicts.length

      // Group by conflict type (would need to parse from error messages or add a type field)
      const byType: Record<string, number> = {}
      for (const conflict of allConflicts) {
        const type = conflict.errorMessage?.includes('inventory') ? 'inventory' :
                    conflict.errorMessage?.includes('transaction') ? 'transaction' :
                    conflict.errorMessage?.includes('customer') ? 'customer' : 'unknown'
        byType[type] = (byType[type] || 0) + 1
      }

      return { pending, resolved, total, byType }
      
    } catch (error) {
      console.error('Failed to get conflict stats:', error)
      return { pending: 0, resolved: 0, total: 0, byType: {} }
    }
  }
}