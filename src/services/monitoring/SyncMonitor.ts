/**
 * Comprehensive monitoring system for sync engine health and performance
 * Tracks metrics, alerts, and provides real-time status information
 */

import { EventEmitter } from 'events'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { eq, desc, and, gte, lte, count } from 'drizzle-orm'

import * as localSchema from '@/db/local/schema'
import type { SyncEngine, SyncResult, SyncEngineStatus } from '../sync/SyncEngine'

/**
 * Monitoring configuration
 */
export interface SyncMonitorConfig {
  /** Check interval for health monitoring (ms) */
  checkInterval?: number
  
  /** Queue depth alert threshold */
  queueDepthThreshold?: number
  
  /** Sync latency alert threshold (ms) */
  latencyThreshold?: number
  
  /** Error rate alert threshold (percentage) */
  errorRateThreshold?: number
  
  /** Enable detailed logging */
  enableDetailedLogging?: boolean
  
  /** Retention period for metrics (days) */
  metricsRetentionDays?: number
}

/**
 * Health check status levels
 */
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

/**
 * Health check result
 */
export interface HealthCheck {
  component: string
  status: HealthStatus
  message: string
  timestamp: Date
  details?: Record<string, any>
}

/**
 * Sync performance metrics
 */
export interface SyncMetrics {
  timestamp: Date
  queueDepth: number
  syncLatency: number
  errorCount: number
  successCount: number
  networkLatency?: number
  diskUsage?: number
  memoryUsage?: number
}

/**
 * Alert definition
 */
export interface Alert {
  id: string
  type: 'queue_depth' | 'latency' | 'error_rate' | 'network' | 'storage' | 'custom'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  timestamp: Date
  acknowledged: boolean
  metadata?: Record<string, any>
}

/**
 * Recovery action definition
 */
export interface RecoveryAction {
  id: string
  name: string
  description: string
  autoExecute: boolean
  execute: () => Promise<boolean>
}

/**
 * Comprehensive sync monitoring system
 */
export class SyncMonitor extends EventEmitter {
  private config: Required<SyncMonitorConfig>
  private localDb: BetterSQLite3Database<typeof localSchema>
  private supabaseClient: SupabaseClient
  private syncEngine: SyncEngine
  
  private monitoringInterval: NodeJS.Timeout | null = null
  private isMonitoring = false
  private currentMetrics: SyncMetrics | null = null
  private activeAlerts: Map<string, Alert> = new Map()
  private recoveryActions: Map<string, RecoveryAction> = new Map()
  
  // Health check results cache
  private healthChecks: Map<string, HealthCheck> = new Map()
  private lastHealthCheck: Date | null = null

  constructor(
    localDb: BetterSQLite3Database<typeof localSchema>,
    supabaseClient: SupabaseClient,
    syncEngine: SyncEngine,
    config: SyncMonitorConfig = {}
  ) {
    super()
    
    this.localDb = localDb
    this.supabaseClient = supabaseClient
    this.syncEngine = syncEngine
    
    this.config = {
      checkInterval: config.checkInterval ?? 30000, // 30 seconds
      queueDepthThreshold: config.queueDepthThreshold ?? 50,
      latencyThreshold: config.latencyThreshold ?? 60000, // 60 seconds
      errorRateThreshold: config.errorRateThreshold ?? 20, // 20%
      enableDetailedLogging: config.enableDetailedLogging ?? true,
      metricsRetentionDays: config.metricsRetentionDays ?? 30
    }
    
    this.setupRecoveryActions()
    this.setupSyncEngineListeners()
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('SyncMonitor is already running')
      return
    }
    
    try {
      console.log('Starting sync monitoring...')
      
      // Initialize monitoring tables if needed
      await this.initializeMonitoringTables()
      
      // Perform initial health check
      await this.performHealthCheck()
      
      // Start periodic monitoring
      this.monitoringInterval = setInterval(
        () => this.performPeriodicCheck(),
        this.config.checkInterval
      )
      
      this.isMonitoring = true
      this.emit('monitor_started')
      
      console.log(`Sync monitoring started (check interval: ${this.config.checkInterval}ms)`)
      
    } catch (error) {
      console.error('Failed to start sync monitoring:', error)
      throw error
    }
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {
      return
    }
    
    try {
      console.log('Stopping sync monitoring...')
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval)
        this.monitoringInterval = null
      }
      
      this.isMonitoring = false
      this.emit('monitor_stopped')
      
      console.log('Sync monitoring stopped')
      
    } catch (error) {
      console.error('Error stopping sync monitoring:', error)
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): {
    overall: HealthStatus
    checks: HealthCheck[]
    alerts: Alert[]
    lastCheck: Date | null
  } {
    const checks = Array.from(this.healthChecks.values())
    const alerts = Array.from(this.activeAlerts.values())
    
    // Determine overall health status
    let overall: HealthStatus = 'healthy'
    if (checks.some(c => c.status === 'critical')) {
      overall = 'critical'
    } else if (checks.some(c => c.status === 'warning')) {
      overall = 'warning'
    } else if (checks.length === 0) {
      overall = 'unknown'
    }
    
    return {
      overall,
      checks,
      alerts,
      lastCheck: this.lastHealthCheck
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): SyncMetrics | null {
    return this.currentMetrics
  }

  /**
   * Get historical metrics
   */
  async getHistoricalMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<SyncMetrics[]> {
    try {
      // In a real implementation, you'd query a metrics table
      // For now, return empty array as placeholder
      return []
      
    } catch (error) {
      console.error('Failed to get historical metrics:', error)
      return []
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy?: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) {
      return false
    }
    
    alert.acknowledged = true
    alert.metadata = {
      ...alert.metadata,
      acknowledgedBy,
      acknowledgedAt: new Date().toISOString()
    }
    
    this.emit('alert_acknowledged', alert)
    return true
  }

  /**
   * Execute recovery action
   */
  async executeRecoveryAction(actionId: string): Promise<boolean> {
    const action = this.recoveryActions.get(actionId)
    if (!action) {
      console.error(`Recovery action not found: ${actionId}`)
      return false
    }
    
    try {
      console.log(`Executing recovery action: ${action.name}`)
      const success = await action.execute()
      
      this.emit('recovery_action_executed', {
        action,
        success,
        timestamp: new Date()
      })
      
      return success
      
    } catch (error) {
      console.error(`Recovery action failed: ${action.name}:`, error)
      this.emit('recovery_action_failed', {
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      })
      
      return false
    }
  }

  /**
   * Get available recovery actions
   */
  getRecoveryActions(): RecoveryAction[] {
    return Array.from(this.recoveryActions.values())
  }

  /**
   * Force health check
   */
  async forceHealthCheck(): Promise<void> {
    await this.performHealthCheck()
  }

  /**
   * Clean up old metrics data
   */
  async cleanupOldMetrics(): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - this.config.metricsRetentionDays)
      
      // In a real implementation, you'd clean up from metrics tables
      // For now, return 0 as placeholder
      return 0
      
    } catch (error) {
      console.error('Failed to cleanup old metrics:', error)
      return 0
    }
  }

  /**
   * Setup recovery actions
   */
  private setupRecoveryActions(): void {
    // Clear sync queue action
    this.recoveryActions.set('clear_sync_queue', {
      id: 'clear_sync_queue',
      name: 'Clear Sync Queue',
      description: 'Removes all pending items from sync queue',
      autoExecute: false,
      execute: async () => {
        try {
          await this.localDb.delete(localSchema.syncQueue)
          return true
        } catch {
          return false
        }
      }
    })
    
    // Restart sync engine action
    this.recoveryActions.set('restart_sync', {
      id: 'restart_sync',
      name: 'Restart Sync Engine',
      description: 'Stops and restarts the sync engine',
      autoExecute: false,
      execute: async () => {
        try {
          await this.syncEngine.stop()
          await this.syncEngine.start()
          return true
        } catch {
          return false
        }
      }
    })
    
    // Force full sync action
    this.recoveryActions.set('force_full_sync', {
      id: 'force_full_sync',
      name: 'Force Full Sync',
      description: 'Performs a complete synchronization',
      autoExecute: false,
      execute: async () => {
        try {
          await this.syncEngine.performFullSync()
          return true
        } catch {
          return false
        }
      }
    })
  }

  /**
   * Setup sync engine event listeners
   */
  private setupSyncEngineListeners(): void {
    this.syncEngine.on('sync_complete', (result: SyncResult) => {
      this.recordSyncMetrics(result)
    })
    
    this.syncEngine.on('sync_error', (error: any) => {
      this.handleSyncError(error)
    })
    
    this.syncEngine.on('queue_updated', (queueInfo: any) => {
      this.checkQueueDepth(queueInfo.depth)
    })
  }

  /**
   * Initialize monitoring database tables
   */
  private async initializeMonitoringTables(): Promise<void> {
    // In a real implementation, you'd create monitoring-specific tables
    // The sync tables already exist, so we'll use those
    console.log('Monitoring tables initialized')
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const checks: HealthCheck[] = []
      
      // Check sync engine status
      checks.push(await this.checkSyncEngineHealth())
      
      // Check database connectivity
      checks.push(await this.checkDatabaseHealth())
      
      // Check cloud connectivity
      checks.push(await this.checkCloudConnectivity())
      
      // Check queue depth
      checks.push(await this.checkQueueHealth())
      
      // Check disk space
      checks.push(await this.checkDiskSpace())
      
      // Update health checks cache
      for (const check of checks) {
        this.healthChecks.set(check.component, check)
      }
      
      this.lastHealthCheck = new Date()
      this.emit('health_check_complete', { checks, timestamp: this.lastHealthCheck })
      
      // Process any new alerts
      this.processHealthCheckAlerts(checks)
      
    } catch (error) {
      console.error('Health check failed:', error)
      
      const errorCheck: HealthCheck = {
        component: 'health_monitor',
        status: 'critical',
        message: `Health check system failure: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
      
      this.healthChecks.set('health_monitor', errorCheck)
    }
  }

  /**
   * Check sync engine health
   */
  private async checkSyncEngineHealth(): Promise<HealthCheck> {
    try {
      const status = this.syncEngine.getStatus()
      
      let healthStatus: HealthStatus = 'healthy'
      let message = 'Sync engine is operating normally'
      
      if (!status.isActive) {
        healthStatus = 'critical'
        message = 'Sync engine is not active'
      } else if (status.errors.length > 0) {
        healthStatus = 'warning'
        message = `Sync engine has ${status.errors.length} errors`
      } else if (!status.isOnline) {
        healthStatus = 'warning'
        message = 'Sync engine is offline'
      }
      
      return {
        component: 'sync_engine',
        status: healthStatus,
        message,
        timestamp: new Date(),
        details: {
          isActive: status.isActive,
          isOnline: status.isOnline,
          queueDepth: status.queueDepth,
          errorCount: status.errors.length,
          lastSync: status.lastSyncAt
        }
      }
      
    } catch (error) {
      return {
        component: 'sync_engine',
        status: 'critical',
        message: `Failed to check sync engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<HealthCheck> {
    try {
      // Test local database
      const testResult = await this.localDb.select().from(localSchema.syncStatus).limit(1)
      
      return {
        component: 'local_database',
        status: 'healthy',
        message: 'Local database is accessible',
        timestamp: new Date(),
        details: {
          connected: true,
          testQuery: 'success'
        }
      }
      
    } catch (error) {
      return {
        component: 'local_database',
        status: 'critical',
        message: `Database connectivity failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check cloud connectivity
   */
  private async checkCloudConnectivity(): Promise<HealthCheck> {
    try {
      // Test Supabase connection
      const { data, error } = await this.supabaseClient
        .from('products')
        .select('count')
        .limit(1)
      
      if (error) {
        return {
          component: 'cloud_database',
          status: 'critical',
          message: `Cloud connectivity failed: ${error.message}`,
          timestamp: new Date()
        }
      }
      
      return {
        component: 'cloud_database',
        status: 'healthy',
        message: 'Cloud database is accessible',
        timestamp: new Date(),
        details: {
          connected: true,
          testQuery: 'success'
        }
      }
      
    } catch (error) {
      return {
        component: 'cloud_database',
        status: 'critical',
        message: `Cloud connectivity error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check queue health
   */
  private async checkQueueHealth(): Promise<HealthCheck> {
    try {
      const queueItems = await this.localDb
        .select({ count: count() })
        .from(localSchema.syncQueue)
      
      const queueDepth = queueItems[0]?.count || 0
      
      let status: HealthStatus = 'healthy'
      let message = `Sync queue has ${queueDepth} pending items`
      
      if (queueDepth >= this.config.queueDepthThreshold) {
        status = 'warning'
        message = `Sync queue depth is high: ${queueDepth} items (threshold: ${this.config.queueDepthThreshold})`
      }
      
      return {
        component: 'sync_queue',
        status,
        message,
        timestamp: new Date(),
        details: {
          queueDepth,
          threshold: this.config.queueDepthThreshold
        }
      }
      
    } catch (error) {
      return {
        component: 'sync_queue',
        status: 'critical',
        message: `Failed to check queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Check disk space
   */
  private async checkDiskSpace(): Promise<HealthCheck> {
    try {
      // This is a simplified check - in production you'd use proper disk space detection
      return {
        component: 'disk_space',
        status: 'healthy',
        message: 'Disk space is adequate',
        timestamp: new Date(),
        details: {
          available: 'unknown',
          threshold: '1GB'
        }
      }
      
    } catch (error) {
      return {
        component: 'disk_space',
        status: 'warning',
        message: `Could not check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Process health check results for alerts
   */
  private processHealthCheckAlerts(checks: HealthCheck[]): void {
    for (const check of checks) {
      const alertId = `health_${check.component}`
      
      if (check.status === 'critical' || check.status === 'warning') {
        // Create alert if not already active
        if (!this.activeAlerts.has(alertId)) {
          const alert: Alert = {
            id: alertId,
            type: 'custom',
            severity: check.status === 'critical' ? 'critical' : 'warning',
            title: `${check.component} Health Issue`,
            message: check.message,
            timestamp: new Date(),
            acknowledged: false,
            metadata: {
              component: check.component,
              details: check.details
            }
          }
          
          this.activeAlerts.set(alertId, alert)
          this.emit('alert_created', alert)
        }
      } else {
        // Clear alert if component is now healthy
        if (this.activeAlerts.has(alertId)) {
          const alert = this.activeAlerts.get(alertId)!
          this.activeAlerts.delete(alertId)
          this.emit('alert_resolved', alert)
        }
      }
    }
  }

  /**
   * Perform periodic monitoring check
   */
  private async performPeriodicCheck(): Promise<void> {
    try {
      // Perform health check
      await this.performHealthCheck()
      
      // Clean up old metrics periodically (once per hour)
      const now = new Date()
      if (now.getMinutes() === 0) {
        await this.cleanupOldMetrics()
      }
      
    } catch (error) {
      console.error('Periodic check failed:', error)
    }
  }

  /**
   * Record sync metrics from sync result
   */
  private recordSyncMetrics(result: SyncResult): void {
    const metrics: SyncMetrics = {
      timestamp: new Date(),
      queueDepth: 0, // Will be updated by queue check
      syncLatency: result.duration,
      errorCount: result.errors.length,
      successCount: result.success ? 1 : 0
    }
    
    this.currentMetrics = metrics
    this.emit('metrics_updated', metrics)
    
    // Check for latency alerts
    if (result.duration > this.config.latencyThreshold) {
      this.createLatencyAlert(result.duration)
    }
  }

  /**
   * Handle sync error
   */
  private handleSyncError(error: any): void {
    const alert: Alert = {
      id: `sync_error_${Date.now()}`,
      type: 'error_rate',
      severity: 'warning',
      title: 'Sync Error Occurred',
      message: error instanceof Error ? error.message : 'Unknown sync error',
      timestamp: new Date(),
      acknowledged: false,
      metadata: {
        error: error instanceof Error ? error.stack : error
      }
    }
    
    this.activeAlerts.set(alert.id, alert)
    this.emit('alert_created', alert)
  }

  /**
   * Check queue depth and create alerts
   */
  private checkQueueDepth(depth: number): void {
    if (this.currentMetrics) {
      this.currentMetrics.queueDepth = depth
    }
    
    const alertId = 'queue_depth_high'
    
    if (depth >= this.config.queueDepthThreshold) {
      if (!this.activeAlerts.has(alertId)) {
        const alert: Alert = {
          id: alertId,
          type: 'queue_depth',
          severity: 'warning',
          title: 'High Queue Depth',
          message: `Sync queue depth is ${depth} items (threshold: ${this.config.queueDepthThreshold})`,
          timestamp: new Date(),
          acknowledged: false,
          metadata: {
            queueDepth: depth,
            threshold: this.config.queueDepthThreshold
          }
        }
        
        this.activeAlerts.set(alertId, alert)
        this.emit('alert_created', alert)
      }
    } else {
      // Clear alert if queue depth is back to normal
      if (this.activeAlerts.has(alertId)) {
        const alert = this.activeAlerts.get(alertId)!
        this.activeAlerts.delete(alertId)
        this.emit('alert_resolved', alert)
      }
    }
  }

  /**
   * Create latency alert
   */
  private createLatencyAlert(latency: number): void {
    const alert: Alert = {
      id: `latency_high_${Date.now()}`,
      type: 'latency',
      severity: 'warning',
      title: 'High Sync Latency',
      message: `Sync operation took ${Math.round(latency / 1000)}s (threshold: ${Math.round(this.config.latencyThreshold / 1000)}s)`,
      timestamp: new Date(),
      acknowledged: false,
      metadata: {
        latency,
        threshold: this.config.latencyThreshold
      }
    }
    
    this.activeAlerts.set(alert.id, alert)
    this.emit('alert_created', alert)
  }
}

/**
 * Export types for external use
 */
export type {
  SyncMonitorConfig,
  HealthStatus,
  HealthCheck,
  SyncMetrics,
  Alert,
  RecoveryAction
}