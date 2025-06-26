/**
 * Dedicated sync queue monitoring system
 * Tracks queue depth, processing rates, and generates alerts
 */

import { EventEmitter } from 'events'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, desc, count, sql, and, gte, lte } from 'drizzle-orm'

import * as localSchema from '@/db/local/schema'
import type { SyncQueue } from '@/db/local/schema'

/**
 * Queue monitoring configuration
 */
export interface QueueMonitorConfig {
  /** Queue depth alert threshold */
  depthThreshold: number
  
  /** Processing rate alert threshold (items/minute) */
  processingRateThreshold: number
  
  /** Monitoring check interval (ms) */
  checkInterval: number
  
  /** Alert cooldown period (ms) to prevent spam */
  alertCooldown: number
  
  /** Enable detailed queue analytics */
  enableAnalytics: boolean
}

/**
 * Queue statistics
 */
export interface QueueStats {
  currentDepth: number
  totalPending: number
  oldestItemAge: number | null // milliseconds
  newestItemAge: number | null // milliseconds
  processingRate: number // items per minute
  averageWaitTime: number // milliseconds
  backlogTrend: 'increasing' | 'decreasing' | 'stable'
  estimatedClearTime: number | null // milliseconds to clear queue
}

/**
 * Queue performance metrics
 */
export interface QueuePerformanceMetrics {
  period: string
  timestamp: Date
  itemsAdded: number
  itemsProcessed: number
  itemsFailed: number
  averageDepth: number
  maxDepth: number
  processingRate: number
  errorRate: number
  throughputTrend: 'improving' | 'degrading' | 'stable'
}

/**
 * Queue alert types
 */
export type QueueAlertType = 
  | 'high_depth'
  | 'stalled_processing'
  | 'old_items'
  | 'processing_errors'
  | 'capacity_exceeded'

/**
 * Queue alert
 */
export interface QueueAlert {
  id: string
  type: QueueAlertType
  severity: 'warning' | 'critical'
  title: string
  message: string
  queueDepth: number
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Queue item analysis
 */
export interface QueueItemAnalysis {
  byStatus: Record<string, number>
  byOperation: Record<string, number>
  byAge: {
    under1Min: number
    under5Min: number
    under15Min: number
    over15Min: number
  }
  oldestItems: Array<{
    id: string
    operation: string
    age: number
    retryCount: number
  }>
}

/**
 * Comprehensive queue monitoring system
 */
export class QueueMonitor extends EventEmitter {
  private config: Required<QueueMonitorConfig>
  private localDb: BetterSQLite3Database<typeof localSchema>
  
  private monitoringInterval: NodeJS.Timeout | null = null
  private isMonitoring = false
  
  // Alert tracking
  private activeAlerts: Map<string, QueueAlert> = new Map()
  private lastAlertTime: Map<QueueAlertType, Date> = new Map()
  
  // Performance tracking
  private historicalStats: QueueStats[] = []
  private performanceMetrics: QueuePerformanceMetrics[] = []
  private maxHistorySize = 288 // 24 hours at 5-minute intervals
  
  // Processing rate calculation
  private lastDepthCheck: { depth: number; timestamp: Date } | null = null
  private processedItemsHistory: Array<{ count: number; timestamp: Date }> = []

  constructor(
    localDb: BetterSQLite3Database<typeof localSchema>,
    config: Partial<QueueMonitorConfig> = {}
  ) {
    super()
    
    this.localDb = localDb
    this.config = {
      depthThreshold: config.depthThreshold ?? 50,
      processingRateThreshold: config.processingRateThreshold ?? 10, // 10 items/minute
      checkInterval: config.checkInterval ?? 60000, // 1 minute
      alertCooldown: config.alertCooldown ?? 300000, // 5 minutes
      enableAnalytics: config.enableAnalytics ?? true
    }
  }

  /**
   * Start queue monitoring
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('Queue monitor is already running')
      return
    }
    
    try {
      console.log('Starting queue monitoring...')
      
      // Perform initial check
      await this.performQueueCheck()
      
      // Start periodic monitoring
      this.monitoringInterval = setInterval(
        () => this.performQueueCheck(),
        this.config.checkInterval
      )
      
      this.isMonitoring = true
      this.emit('monitor_started')
      
      console.log(`Queue monitoring started (check interval: ${this.config.checkInterval}ms)`)
      
    } catch (error) {
      console.error('Failed to start queue monitoring:', error)
      throw error
    }
  }

  /**
   * Stop queue monitoring
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {
      return
    }
    
    try {
      console.log('Stopping queue monitoring...')
      
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval)
        this.monitoringInterval = null
      }
      
      this.isMonitoring = false
      this.emit('monitor_stopped')
      
      console.log('Queue monitoring stopped')
      
    } catch (error) {
      console.error('Error stopping queue monitoring:', error)
    }
  }

  /**
   * Get current queue statistics
   */
  async getCurrentStats(): Promise<QueueStats> {
    try {
      // Get queue depth
      const depthResult = await this.localDb
        .select({ count: count() })
        .from(localSchema.syncQueue)
        .where(eq(localSchema.syncQueue.status, 'pending'))
      
      const currentDepth = depthResult[0]?.count || 0
      
      // Get total pending (including retry states)
      const totalResult = await this.localDb
        .select({ count: count() })
        .from(localSchema.syncQueue)
      
      const totalPending = totalResult[0]?.count || 0
      
      // Get age information
      const ageInfo = await this.getQueueAgeStats()
      
      // Calculate processing rate
      const processingRate = this.calculateProcessingRate()
      
      // Calculate average wait time
      const averageWaitTime = await this.calculateAverageWaitTime()
      
      // Determine backlog trend
      const backlogTrend = this.calculateBacklogTrend()
      
      // Estimate clear time
      const estimatedClearTime = this.estimateQueueClearTime(currentDepth, processingRate)
      
      const stats: QueueStats = {
        currentDepth,
        totalPending,
        oldestItemAge: ageInfo.oldest,
        newestItemAge: ageInfo.newest,
        processingRate,
        averageWaitTime,
        backlogTrend,
        estimatedClearTime
      }
      
      // Store in history
      this.historicalStats.push(stats)
      if (this.historicalStats.length > this.maxHistorySize) {
        this.historicalStats.shift()
      }
      
      return stats
      
    } catch (error) {
      console.error('Failed to get queue stats:', error)
      throw error
    }
  }

  /**
   * Get detailed queue item analysis
   */
  async getQueueAnalysis(): Promise<QueueItemAnalysis> {
    try {
      // Get all queue items
      const items = await this.localDb
        .select()
        .from(localSchema.syncQueue)
        .orderBy(desc(localSchema.syncQueue.createdAt))
      
      const now = new Date()
      
      // Analyze by status
      const byStatus: Record<string, number> = {}
      items.forEach(item => {
        byStatus[item.status] = (byStatus[item.status] || 0) + 1
      })
      
      // Analyze by operation
      const byOperation: Record<string, number> = {}
      items.forEach(item => {
        byOperation[item.operation] = (byOperation[item.operation] || 0) + 1
      })
      
      // Analyze by age
      const byAge = {
        under1Min: 0,
        under5Min: 0,
        under15Min: 0,
        over15Min: 0
      }
      
      items.forEach(item => {
        const age = now.getTime() - item.createdAt.getTime()
        const ageMinutes = age / (1000 * 60)
        
        if (ageMinutes < 1) {
          byAge.under1Min++
        } else if (ageMinutes < 5) {
          byAge.under5Min++
        } else if (ageMinutes < 15) {
          byAge.under15Min++
        } else {
          byAge.over15Min++
        }
      })
      
      // Get oldest items
      const oldestItems = items
        .map(item => ({
          id: item.id,
          operation: item.operation,
          age: now.getTime() - item.createdAt.getTime(),
          retryCount: item.retryCount
        }))
        .sort((a, b) => b.age - a.age)
        .slice(0, 10)
      
      return {
        byStatus,
        byOperation,
        byAge,
        oldestItems
      }
      
    } catch (error) {
      console.error('Failed to analyze queue:', error)
      throw error
    }
  }

  /**
   * Get performance metrics for a time period
   */
  getPerformanceMetrics(hours = 24): QueuePerformanceMetrics[] {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - hours)
    
    return this.performanceMetrics.filter(m => m.timestamp >= cutoff)
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): QueueAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) {
      return false
    }
    
    this.activeAlerts.delete(alertId)
    this.emit('alert_acknowledged', alert)
    return true
  }

  /**
   * Force queue check
   */
  async forceCheck(): Promise<QueueStats> {
    return await this.performQueueCheck()
  }

  /**
   * Clear old queue items
   */
  async clearOldItems(maxAge: number = 86400000): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - maxAge)
      
      const deleted = await this.localDb
        .delete(localSchema.syncQueue)
        .where(
          and(
            lte(localSchema.syncQueue.createdAt, cutoff),
            eq(localSchema.syncQueue.status, 'completed')
          )
        )
      
      if (deleted) {
        this.emit('old_items_cleared', { count: deleted, cutoff })
      }
      
      return deleted || 0
      
    } catch (error) {
      console.error('Failed to clear old queue items:', error)
      return 0
    }
  }

  /**
   * Export queue data for analysis
   */
  exportQueueData(): {
    stats: QueueStats[]
    metrics: QueuePerformanceMetrics[]
    alerts: QueueAlert[]
    exportTime: string
  } {
    return {
      stats: [...this.historicalStats],
      metrics: [...this.performanceMetrics],
      alerts: Array.from(this.activeAlerts.values()),
      exportTime: new Date().toISOString()
    }
  }

  /**
   * Private methods
   */

  private async performQueueCheck(): Promise<QueueStats> {
    try {
      const stats = await this.getCurrentStats()
      
      // Check for alerts
      await this.checkForAlerts(stats)
      
      // Update performance metrics
      if (this.config.enableAnalytics) {
        await this.updatePerformanceMetrics(stats)
      }
      
      // Track processing rate
      this.updateProcessingRateTracking(stats.currentDepth)
      
      this.emit('queue_checked', stats)
      
      return stats
      
    } catch (error) {
      console.error('Queue check failed:', error)
      this.emit('check_error', error)
      throw error
    }
  }

  private async checkForAlerts(stats: QueueStats): Promise<void> {
    const now = new Date()
    
    // Check queue depth
    if (stats.currentDepth >= this.config.depthThreshold) {
      await this.createAlert('high_depth', {
        title: 'High Queue Depth',
        message: `Queue depth is ${stats.currentDepth} items (threshold: ${this.config.depthThreshold})`,
        severity: stats.currentDepth >= this.config.depthThreshold * 2 ? 'critical' : 'warning',
        queueDepth: stats.currentDepth,
        metadata: { estimatedClearTime: stats.estimatedClearTime }
      })
    } else {
      this.clearAlert('high_depth')
    }
    
    // Check processing rate
    if (stats.processingRate < this.config.processingRateThreshold) {
      await this.createAlert('stalled_processing', {
        title: 'Low Processing Rate',
        message: `Processing rate is ${stats.processingRate.toFixed(1)} items/min (threshold: ${this.config.processingRateThreshold})`,
        severity: stats.processingRate === 0 ? 'critical' : 'warning',
        queueDepth: stats.currentDepth,
        metadata: { processingRate: stats.processingRate }
      })
    } else {
      this.clearAlert('stalled_processing')
    }
    
    // Check for old items
    if (stats.oldestItemAge && stats.oldestItemAge > 900000) { // 15 minutes
      await this.createAlert('old_items', {
        title: 'Old Queue Items',
        message: `Oldest item is ${Math.round(stats.oldestItemAge / 60000)} minutes old`,
        severity: stats.oldestItemAge > 1800000 ? 'critical' : 'warning', // 30 minutes
        queueDepth: stats.currentDepth,
        metadata: { oldestItemAge: stats.oldestItemAge }
      })
    } else {
      this.clearAlert('old_items')
    }
  }

  private async createAlert(
    type: QueueAlertType,
    alertData: {
      title: string
      message: string
      severity: 'warning' | 'critical'
      queueDepth: number
      metadata?: Record<string, any>
    }
  ): Promise<void> {
    // Check cooldown
    const lastAlert = this.lastAlertTime.get(type)
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertCooldown) {
      return
    }
    
    const alertId = `queue_${type}_${Date.now()}`
    
    const alert: QueueAlert = {
      id: alertId,
      type,
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.message,
      queueDepth: alertData.queueDepth,
      timestamp: new Date(),
      metadata: alertData.metadata
    }
    
    this.activeAlerts.set(type, alert) // Use type as key to prevent duplicates
    this.lastAlertTime.set(type, new Date())
    
    this.emit('alert_created', alert)
  }

  private clearAlert(type: QueueAlertType): void {
    const alert = this.activeAlerts.get(type)
    if (alert) {
      this.activeAlerts.delete(type)
      this.emit('alert_resolved', alert)
    }
  }

  private async getQueueAgeStats(): Promise<{ oldest: number | null; newest: number | null }> {
    try {
      const oldestResult = await this.localDb
        .select({ createdAt: localSchema.syncQueue.createdAt })
        .from(localSchema.syncQueue)
        .orderBy(localSchema.syncQueue.createdAt)
        .limit(1)
      
      const newestResult = await this.localDb
        .select({ createdAt: localSchema.syncQueue.createdAt })
        .from(localSchema.syncQueue)
        .orderBy(desc(localSchema.syncQueue.createdAt))
        .limit(1)
      
      const now = new Date()
      const oldest = oldestResult[0] ? now.getTime() - oldestResult[0].createdAt.getTime() : null
      const newest = newestResult[0] ? now.getTime() - newestResult[0].createdAt.getTime() : null
      
      return { oldest, newest }
      
    } catch (error) {
      console.error('Failed to get queue age stats:', error)
      return { oldest: null, newest: null }
    }
  }

  private calculateProcessingRate(): number {
    if (this.processedItemsHistory.length < 2) {
      return 0
    }
    
    // Calculate items processed in the last few checks
    const recentHistory = this.processedItemsHistory.slice(-10) // Last 10 checks
    const timeSpan = recentHistory[recentHistory.length - 1].timestamp.getTime() - 
                    recentHistory[0].timestamp.getTime()
    
    if (timeSpan === 0) return 0
    
    const totalProcessed = recentHistory.reduce((sum, entry) => sum + entry.count, 0)
    const ratePerMs = totalProcessed / timeSpan
    const ratePerMinute = ratePerMs * 60000
    
    return Math.max(0, ratePerMinute)
  }

  private async calculateAverageWaitTime(): Promise<number> {
    try {
      // This is simplified - in a real implementation you'd track when items were processed
      const completedItems = await this.localDb
        .select({
          createdAt: localSchema.syncQueue.createdAt,
          updatedAt: localSchema.syncQueue.updatedAt
        })
        .from(localSchema.syncQueue)
        .where(eq(localSchema.syncQueue.status, 'completed'))
        .orderBy(desc(localSchema.syncQueue.updatedAt))
        .limit(100)
      
      if (completedItems.length === 0) return 0
      
      const waitTimes = completedItems.map(item => 
        item.updatedAt.getTime() - item.createdAt.getTime()
      )
      
      return waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length
      
    } catch (error) {
      console.error('Failed to calculate average wait time:', error)
      return 0
    }
  }

  private calculateBacklogTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.historicalStats.length < 5) {
      return 'stable'
    }
    
    const recent = this.historicalStats.slice(-5)
    const first = recent[0].currentDepth
    const last = recent[recent.length - 1].currentDepth
    
    const change = last - first
    const threshold = Math.max(2, first * 0.1) // 10% change or 2 items minimum
    
    if (change > threshold) {
      return 'increasing'
    } else if (change < -threshold) {
      return 'decreasing'
    } else {
      return 'stable'
    }
  }

  private estimateQueueClearTime(depth: number, processingRate: number): number | null {
    if (depth === 0) return 0
    if (processingRate <= 0) return null
    
    // Estimate in milliseconds
    const minutesToClear = depth / processingRate
    return minutesToClear * 60000
  }

  private updateProcessingRateTracking(currentDepth: number): void {
    const now = new Date()
    
    if (this.lastDepthCheck) {
      const timeDiff = now.getTime() - this.lastDepthCheck.timestamp.getTime()
      const depthDiff = this.lastDepthCheck.depth - currentDepth
      
      if (timeDiff > 0 && depthDiff > 0) {
        // Items were processed
        this.processedItemsHistory.push({
          count: depthDiff,
          timestamp: now
        })
        
        // Keep only recent history
        if (this.processedItemsHistory.length > 50) {
          this.processedItemsHistory.shift()
        }
      }
    }
    
    this.lastDepthCheck = { depth: currentDepth, timestamp: now }
  }

  private async updatePerformanceMetrics(stats: QueueStats): Promise<void> {
    // Create performance metric entry every 5 minutes
    const now = new Date()
    const lastMetric = this.performanceMetrics[this.performanceMetrics.length - 1]
    
    if (!lastMetric || now.getTime() - lastMetric.timestamp.getTime() >= 300000) {
      // Calculate items added/processed since last metric
      const itemsAdded = 0 // Would need to track this separately
      const itemsProcessed = 0 // Would need to track this separately
      const itemsFailed = 0 // Would need to track this separately
      
      const metric: QueuePerformanceMetrics = {
        period: '5min',
        timestamp: now,
        itemsAdded,
        itemsProcessed,
        itemsFailed,
        averageDepth: stats.currentDepth,
        maxDepth: stats.currentDepth,
        processingRate: stats.processingRate,
        errorRate: 0,
        throughputTrend: 'stable'
      }
      
      this.performanceMetrics.push(metric)
      
      // Keep only recent metrics
      if (this.performanceMetrics.length > this.maxHistorySize) {
        this.performanceMetrics.shift()
      }
      
      this.emit('performance_metric_updated', metric)
    }
  }
}

export default QueueMonitor