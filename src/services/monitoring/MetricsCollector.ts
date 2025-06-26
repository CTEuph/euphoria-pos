/**
 * Comprehensive metrics collection system for sync operations
 * Tracks performance, errors, and system health over time
 */

import { EventEmitter } from 'events'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, desc, and, gte, lte, count, avg, max, min, sql } from 'drizzle-orm'

import * as localSchema from '@/db/local/schema'
import type { SyncResult } from '../sync/SyncEngine'

/**
 * Detailed sync metrics
 */
export interface SyncHealthMetrics {
  // Timing metrics
  totalSyncDuration: number
  uploadDuration: number
  downloadDuration: number
  transformationDuration: number
  
  // Queue metrics
  queueDepthAtStart: number
  queueDepthAtEnd: number
  itemsProcessed: number
  
  // Success/failure metrics
  successfulOperations: number
  failedOperations: number
  retryCount: number
  
  // Network metrics
  networkLatency?: number
  payloadSize?: number
  compressionRatio?: number
  
  // System metrics
  memoryUsageBefore?: number
  memoryUsageAfter?: number
  cpuUsage?: number
  diskIo?: number
  
  // Error details
  errorTypes: Record<string, number>
  criticalErrors: string[]
  
  // Timestamp
  timestamp: Date
  terminalId: string
  syncType: 'full' | 'incremental' | 'realtime'
}

/**
 * Aggregated metrics for reporting
 */
export interface AggregatedMetrics {
  period: 'hourly' | 'daily' | 'weekly'
  startTime: Date
  endTime: Date
  
  totalSyncs: number
  successfulSyncs: number
  failedSyncs: number
  successRate: number
  
  averageDuration: number
  p95Duration: number
  p99Duration: number
  
  averageQueueDepth: number
  maxQueueDepth: number
  
  totalItemsProcessed: number
  averageItemsPerSync: number
  
  errorBreakdown: Record<string, number>
  topErrors: Array<{ error: string; count: number }>
  
  networkStats: {
    averageLatency: number
    maxLatency: number
    totalDataTransferred: number
  }
  
  systemStats: {
    averageMemoryUsage: number
    peakMemoryUsage: number
    averageCpuUsage: number
  }
}

/**
 * Performance trend analysis
 */
export interface PerformanceTrend {
  metric: string
  direction: 'improving' | 'degrading' | 'stable'
  changePercentage: number
  confidence: number
  recommendations: string[]
}

/**
 * Health score calculation
 */
export interface HealthScore {
  overall: number // 0-100
  components: {
    reliability: number
    performance: number
    efficiency: number
    stability: number
  }
  factors: Array<{
    name: string
    impact: 'positive' | 'negative'
    weight: number
    description: string
  }>
  timestamp: Date
}

/**
 * Metrics collection configuration
 */
export interface MetricsConfig {
  enableDetailedCollection: boolean
  enableSystemMetrics: boolean
  enableNetworkMetrics: boolean
  retentionDays: number
  aggregationIntervals: Array<'hourly' | 'daily' | 'weekly'>
}

/**
 * Comprehensive metrics collector
 */
export class MetricsCollector extends EventEmitter {
  private localDb: BetterSQLite3Database<typeof localSchema>
  private config: MetricsConfig
  private currentSyncStart: Date | null = null
  private currentSyncMetrics: Partial<SyncHealthMetrics> = {}
  
  // Performance tracking
  private performanceHistory: SyncHealthMetrics[] = []
  private maxHistorySize = 1000
  
  // System monitoring
  private systemMonitorInterval: NodeJS.Timeout | null = null

  constructor(
    localDb: BetterSQLite3Database<typeof localSchema>,
    config: MetricsConfig
  ) {
    super()
    
    this.localDb = localDb
    this.config = config
    
    if (config.enableSystemMetrics) {
      this.startSystemMonitoring()
    }
  }

  /**
   * Start collecting metrics for a sync operation
   */
  startSyncMetrics(syncType: 'full' | 'incremental' | 'realtime', terminalId: string): void {
    this.currentSyncStart = new Date()
    this.currentSyncMetrics = {
      timestamp: this.currentSyncStart,
      terminalId,
      syncType,
      errorTypes: {},
      criticalErrors: []
    }
    
    // Capture initial system state
    if (this.config.enableSystemMetrics) {
      this.currentSyncMetrics.memoryUsageBefore = this.getMemoryUsage()
      this.currentSyncMetrics.queueDepthAtStart = this.getCurrentQueueDepth()
    }
    
    this.emit('sync_metrics_started', {
      syncType,
      terminalId,
      timestamp: this.currentSyncStart
    })
  }

  /**
   * Record operation timing
   */
  recordOperationTiming(operation: 'upload' | 'download' | 'transformation', duration: number): void {
    if (!this.currentSyncMetrics) return
    
    switch (operation) {
      case 'upload':
        this.currentSyncMetrics.uploadDuration = duration
        break
      case 'download':
        this.currentSyncMetrics.downloadDuration = duration
        break
      case 'transformation':
        this.currentSyncMetrics.transformationDuration = duration
        break
    }
  }

  /**
   * Record network metrics
   */
  recordNetworkMetrics(latency: number, payloadSize: number, compressionRatio?: number): void {
    if (!this.currentSyncMetrics || !this.config.enableNetworkMetrics) return
    
    this.currentSyncMetrics.networkLatency = latency
    this.currentSyncMetrics.payloadSize = payloadSize
    if (compressionRatio) {
      this.currentSyncMetrics.compressionRatio = compressionRatio
    }
  }

  /**
   * Record operation result
   */
  recordOperationResult(success: boolean, itemsProcessed: number, retryCount = 0): void {
    if (!this.currentSyncMetrics) return
    
    this.currentSyncMetrics.itemsProcessed = (this.currentSyncMetrics.itemsProcessed || 0) + itemsProcessed
    this.currentSyncMetrics.retryCount = (this.currentSyncMetrics.retryCount || 0) + retryCount
    
    if (success) {
      this.currentSyncMetrics.successfulOperations = (this.currentSyncMetrics.successfulOperations || 0) + 1
    } else {
      this.currentSyncMetrics.failedOperations = (this.currentSyncMetrics.failedOperations || 0) + 1
    }
  }

  /**
   * Record error
   */
  recordError(error: Error, isCritical = false): void {
    if (!this.currentSyncMetrics) return
    
    const errorType = error.constructor.name
    this.currentSyncMetrics.errorTypes[errorType] = (this.currentSyncMetrics.errorTypes[errorType] || 0) + 1
    
    if (isCritical) {
      this.currentSyncMetrics.criticalErrors.push(error.message)
    }
    
    this.emit('error_recorded', {
      error: error.message,
      type: errorType,
      critical: isCritical,
      timestamp: new Date()
    })
  }

  /**
   * Complete sync metrics collection
   */
  completeSyncMetrics(): SyncHealthMetrics | null {
    if (!this.currentSyncStart || !this.currentSyncMetrics) {
      return null
    }
    
    const endTime = new Date()
    const totalDuration = endTime.getTime() - this.currentSyncStart.getTime()
    
    // Finalize metrics
    const completedMetrics: SyncHealthMetrics = {
      ...this.currentSyncMetrics,
      totalSyncDuration: totalDuration,
      uploadDuration: this.currentSyncMetrics.uploadDuration || 0,
      downloadDuration: this.currentSyncMetrics.downloadDuration || 0,
      transformationDuration: this.currentSyncMetrics.transformationDuration || 0,
      queueDepthAtStart: this.currentSyncMetrics.queueDepthAtStart || 0,
      queueDepthAtEnd: this.getCurrentQueueDepth(),
      itemsProcessed: this.currentSyncMetrics.itemsProcessed || 0,
      successfulOperations: this.currentSyncMetrics.successfulOperations || 0,
      failedOperations: this.currentSyncMetrics.failedOperations || 0,
      retryCount: this.currentSyncMetrics.retryCount || 0,
      errorTypes: this.currentSyncMetrics.errorTypes || {},
      criticalErrors: this.currentSyncMetrics.criticalErrors || [],
      timestamp: this.currentSyncMetrics.timestamp!,
      terminalId: this.currentSyncMetrics.terminalId!,
      syncType: this.currentSyncMetrics.syncType!
    } as SyncHealthMetrics
    
    // Capture final system state
    if (this.config.enableSystemMetrics) {
      completedMetrics.memoryUsageAfter = this.getMemoryUsage()
      completedMetrics.cpuUsage = this.getCpuUsage()
    }
    
    // Store metrics
    this.storeMetrics(completedMetrics)
    
    // Add to performance history
    this.performanceHistory.push(completedMetrics)
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift()
    }
    
    // Reset current metrics
    this.currentSyncStart = null
    this.currentSyncMetrics = {}
    
    this.emit('sync_metrics_completed', completedMetrics)
    
    return completedMetrics
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getAggregatedMetrics(
    period: 'hourly' | 'daily' | 'weekly',
    startTime: Date,
    endTime: Date
  ): Promise<AggregatedMetrics> {
    try {
      // In a real implementation, this would query from a metrics table
      // For now, calculate from performance history
      const relevantMetrics = this.performanceHistory.filter(
        m => m.timestamp >= startTime && m.timestamp <= endTime
      )
      
      if (relevantMetrics.length === 0) {
        return this.createEmptyAggregatedMetrics(period, startTime, endTime)
      }
      
      const totalSyncs = relevantMetrics.length
      const successfulSyncs = relevantMetrics.filter(m => m.failedOperations === 0).length
      const failedSyncs = totalSyncs - successfulSyncs
      
      const durations = relevantMetrics.map(m => m.totalSyncDuration).sort((a, b) => a - b)
      const queueDepths = relevantMetrics.map(m => m.queueDepthAtStart)
      const itemCounts = relevantMetrics.map(m => m.itemsProcessed)
      
      // Calculate percentiles
      const p95Index = Math.floor(durations.length * 0.95)
      const p99Index = Math.floor(durations.length * 0.99)
      
      // Aggregate error types
      const errorBreakdown: Record<string, number> = {}
      relevantMetrics.forEach(m => {
        Object.entries(m.errorTypes).forEach(([type, count]) => {
          errorBreakdown[type] = (errorBreakdown[type] || 0) + count
        })
      })
      
      const topErrors = Object.entries(errorBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([error, count]) => ({ error, count }))
      
      return {
        period,
        startTime,
        endTime,
        totalSyncs,
        successfulSyncs,
        failedSyncs,
        successRate: totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 0,
        averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        p95Duration: durations[p95Index] || 0,
        p99Duration: durations[p99Index] || 0,
        averageQueueDepth: queueDepths.length > 0 ? queueDepths.reduce((a, b) => a + b, 0) / queueDepths.length : 0,
        maxQueueDepth: Math.max(...queueDepths, 0),
        totalItemsProcessed: itemCounts.reduce((a, b) => a + b, 0),
        averageItemsPerSync: itemCounts.length > 0 ? itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length : 0,
        errorBreakdown,
        topErrors,
        networkStats: {
          averageLatency: this.calculateAverageNetworkLatency(relevantMetrics),
          maxLatency: this.calculateMaxNetworkLatency(relevantMetrics),
          totalDataTransferred: this.calculateTotalDataTransferred(relevantMetrics)
        },
        systemStats: {
          averageMemoryUsage: this.calculateAverageMemoryUsage(relevantMetrics),
          peakMemoryUsage: this.calculatePeakMemoryUsage(relevantMetrics),
          averageCpuUsage: this.calculateAverageCpuUsage(relevantMetrics)
        }
      }
      
    } catch (error) {
      console.error('Failed to get aggregated metrics:', error)
      return this.createEmptyAggregatedMetrics(period, startTime, endTime)
    }
  }

  /**
   * Analyze performance trends
   */
  analyzePerformanceTrends(): PerformanceTrend[] {
    if (this.performanceHistory.length < 10) {
      return []
    }
    
    const trends: PerformanceTrend[] = []
    
    // Analyze sync duration trend
    const durationTrend = this.calculateTrend(
      this.performanceHistory.map(m => m.totalSyncDuration),
      'Sync Duration'
    )
    if (durationTrend) trends.push(durationTrend)
    
    // Analyze success rate trend
    const successRates = this.calculateSuccessRates(this.performanceHistory)
    const successTrend = this.calculateTrend(successRates, 'Success Rate')
    if (successTrend) trends.push(successTrend)
    
    // Analyze queue depth trend
    const queueTrend = this.calculateTrend(
      this.performanceHistory.map(m => m.queueDepthAtStart),
      'Queue Depth'
    )
    if (queueTrend) trends.push(queueTrend)
    
    return trends
  }

  /**
   * Calculate health score
   */
  calculateHealthScore(): HealthScore {
    if (this.performanceHistory.length === 0) {
      return {
        overall: 50,
        components: {
          reliability: 50,
          performance: 50,
          efficiency: 50,
          stability: 50
        },
        factors: [],
        timestamp: new Date()
      }
    }
    
    const recentMetrics = this.performanceHistory.slice(-50) // Last 50 syncs
    
    // Calculate component scores
    const reliability = this.calculateReliabilityScore(recentMetrics)
    const performance = this.calculatePerformanceScore(recentMetrics)
    const efficiency = this.calculateEfficiencyScore(recentMetrics)
    const stability = this.calculateStabilityScore(recentMetrics)
    
    const overall = (reliability + performance + efficiency + stability) / 4
    
    const factors = this.identifyHealthFactors(recentMetrics, {
      reliability,
      performance,
      efficiency,
      stability
    })
    
    return {
      overall: Math.round(overall),
      components: {
        reliability: Math.round(reliability),
        performance: Math.round(performance),
        efficiency: Math.round(efficiency),
        stability: Math.round(stability)
      },
      factors,
      timestamp: new Date()
    }
  }

  /**
   * Clean up old metrics
   */
  async cleanupOldMetrics(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays)
    
    // Clean performance history
    const initialLength = this.performanceHistory.length
    this.performanceHistory = this.performanceHistory.filter(
      m => m.timestamp >= cutoffDate
    )
    
    const cleaned = initialLength - this.performanceHistory.length
    
    if (cleaned > 0) {
      this.emit('metrics_cleaned', {
        cleaned,
        remaining: this.performanceHistory.length,
        cutoffDate
      })
    }
    
    return cleaned
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      return this.exportMetricsAsCsv()
    }
    
    return JSON.stringify({
      exportTime: new Date().toISOString(),
      totalMetrics: this.performanceHistory.length,
      metrics: this.performanceHistory
    }, null, 2)
  }

  /**
   * Private helper methods
   */

  private storeMetrics(metrics: SyncHealthMetrics): void {
    // In a real implementation, you'd store this in a dedicated metrics table
    // For now, we just keep it in memory
    console.log('Metrics stored:', {
      timestamp: metrics.timestamp,
      duration: metrics.totalSyncDuration,
      success: metrics.failedOperations === 0
    })
  }

  private getCurrentQueueDepth(): number {
    try {
      // This would query the actual queue depth from the database
      return 0
    } catch {
      return 0
    }
  }

  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed / 1024 / 1024 // MB
    }
    return 0
  }

  private getCpuUsage(): number {
    // This would use a proper CPU monitoring library in production
    return 0
  }

  private startSystemMonitoring(): void {
    this.systemMonitorInterval = setInterval(() => {
      // Monitor system resources periodically
      this.emit('system_metrics', {
        memory: this.getMemoryUsage(),
        cpu: this.getCpuUsage(),
        timestamp: new Date()
      })
    }, 30000) // Every 30 seconds
  }

  private calculateAverageNetworkLatency(metrics: SyncHealthMetrics[]): number {
    const latencies = metrics.filter(m => m.networkLatency).map(m => m.networkLatency!)
    return latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0
  }

  private calculateMaxNetworkLatency(metrics: SyncHealthMetrics[]): number {
    const latencies = metrics.filter(m => m.networkLatency).map(m => m.networkLatency!)
    return latencies.length > 0 ? Math.max(...latencies) : 0
  }

  private calculateTotalDataTransferred(metrics: SyncHealthMetrics[]): number {
    return metrics.filter(m => m.payloadSize).reduce((total, m) => total + (m.payloadSize || 0), 0)
  }

  private calculateAverageMemoryUsage(metrics: SyncHealthMetrics[]): number {
    const memUsages = metrics.filter(m => m.memoryUsageAfter).map(m => m.memoryUsageAfter!)
    return memUsages.length > 0 ? memUsages.reduce((a, b) => a + b, 0) / memUsages.length : 0
  }

  private calculatePeakMemoryUsage(metrics: SyncHealthMetrics[]): number {
    const memUsages = metrics.filter(m => m.memoryUsageAfter).map(m => m.memoryUsageAfter!)
    return memUsages.length > 0 ? Math.max(...memUsages) : 0
  }

  private calculateAverageCpuUsage(metrics: SyncHealthMetrics[]): number {
    const cpuUsages = metrics.filter(m => m.cpuUsage).map(m => m.cpuUsage!)
    return cpuUsages.length > 0 ? cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length : 0
  }

  private createEmptyAggregatedMetrics(
    period: 'hourly' | 'daily' | 'weekly',
    startTime: Date,
    endTime: Date
  ): AggregatedMetrics {
    return {
      period,
      startTime,
      endTime,
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      successRate: 0,
      averageDuration: 0,
      p95Duration: 0,
      p99Duration: 0,
      averageQueueDepth: 0,
      maxQueueDepth: 0,
      totalItemsProcessed: 0,
      averageItemsPerSync: 0,
      errorBreakdown: {},
      topErrors: [],
      networkStats: {
        averageLatency: 0,
        maxLatency: 0,
        totalDataTransferred: 0
      },
      systemStats: {
        averageMemoryUsage: 0,
        peakMemoryUsage: 0,
        averageCpuUsage: 0
      }
    }
  }

  private calculateTrend(values: number[], metricName: string): PerformanceTrend | null {
    if (values.length < 5) return null
    
    // Simple linear regression to detect trend
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const y = values
    
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const avgY = sumY / n
    
    const changePercentage = avgY !== 0 ? (slope / avgY) * 100 : 0
    
    let direction: 'improving' | 'degrading' | 'stable'
    if (Math.abs(changePercentage) < 5) {
      direction = 'stable'
    } else if (metricName.includes('Duration') || metricName.includes('Queue')) {
      direction = changePercentage < 0 ? 'improving' : 'degrading'
    } else {
      direction = changePercentage > 0 ? 'improving' : 'degrading'
    }
    
    return {
      metric: metricName,
      direction,
      changePercentage: Math.abs(changePercentage),
      confidence: Math.min(100, n * 10), // Simple confidence based on sample size
      recommendations: this.generateTrendRecommendations(metricName, direction, changePercentage)
    }
  }

  private calculateSuccessRates(metrics: SyncHealthMetrics[]): number[] {
    const windowSize = 10
    const rates: number[] = []
    
    for (let i = windowSize - 1; i < metrics.length; i++) {
      const window = metrics.slice(i - windowSize + 1, i + 1)
      const successful = window.filter(m => m.failedOperations === 0).length
      rates.push((successful / windowSize) * 100)
    }
    
    return rates
  }

  private calculateReliabilityScore(metrics: SyncHealthMetrics[]): number {
    const successfulSyncs = metrics.filter(m => m.failedOperations === 0).length
    return (successfulSyncs / metrics.length) * 100
  }

  private calculatePerformanceScore(metrics: SyncHealthMetrics[]): number {
    const durations = metrics.map(m => m.totalSyncDuration)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    
    // Score based on average duration (lower is better)
    // Assume 30 seconds is baseline, scale accordingly
    const baselineDuration = 30000
    const score = Math.max(0, 100 - (avgDuration / baselineDuration) * 50)
    return Math.min(100, score)
  }

  private calculateEfficiencyScore(metrics: SyncHealthMetrics[]): number {
    const retryRates = metrics.map(m => m.retryCount / Math.max(1, m.itemsProcessed))
    const avgRetryRate = retryRates.reduce((a, b) => a + b, 0) / retryRates.length
    
    // Score based on retry rate (lower is better)
    return Math.max(0, 100 - avgRetryRate * 100)
  }

  private calculateStabilityScore(metrics: SyncHealthMetrics[]): number {
    if (metrics.length < 2) return 100
    
    const durations = metrics.map(m => m.totalSyncDuration)
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length
    const variance = durations.reduce((sum, duration) => sum + Math.pow(duration - mean, 2), 0) / durations.length
    const stdDev = Math.sqrt(variance)
    
    // Score based on standard deviation (lower is better)
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0
    return Math.max(0, 100 - coefficientOfVariation * 100)
  }

  private identifyHealthFactors(
    metrics: SyncHealthMetrics[],
    components: { reliability: number; performance: number; efficiency: number; stability: number }
  ): Array<{ name: string; impact: 'positive' | 'negative'; weight: number; description: string }> {
    const factors: Array<{ name: string; impact: 'positive' | 'negative'; weight: number; description: string }> = []
    
    // Analyze reliability
    if (components.reliability < 80) {
      factors.push({
        name: 'Low Success Rate',
        impact: 'negative',
        weight: 0.8,
        description: `Only ${components.reliability.toFixed(1)}% of syncs are successful`
      })
    }
    
    // Analyze performance
    if (components.performance < 70) {
      factors.push({
        name: 'Slow Sync Performance',
        impact: 'negative',
        weight: 0.6,
        description: 'Sync operations are taking longer than expected'
      })
    }
    
    // Analyze efficiency
    if (components.efficiency < 75) {
      factors.push({
        name: 'High Retry Rate',
        impact: 'negative',
        weight: 0.5,
        description: 'Many operations require retries, indicating efficiency issues'
      })
    }
    
    // Add positive factors
    if (components.reliability > 95) {
      factors.push({
        name: 'Excellent Reliability',
        impact: 'positive',
        weight: 0.7,
        description: 'Very high success rate for sync operations'
      })
    }
    
    return factors
  }

  private generateTrendRecommendations(
    metricName: string,
    direction: 'improving' | 'degrading' | 'stable',
    changePercentage: number
  ): string[] {
    const recommendations: string[] = []
    
    if (direction === 'degrading') {
      if (metricName.includes('Duration')) {
        recommendations.push('Consider optimizing database queries')
        recommendations.push('Check network connectivity')
        recommendations.push('Review payload sizes for potential optimization')
      } else if (metricName.includes('Queue')) {
        recommendations.push('Increase sync frequency')
        recommendations.push('Check for sync engine issues')
        recommendations.push('Monitor for network connectivity problems')
      }
    } else if (direction === 'improving') {
      recommendations.push('Continue current optimization strategies')
      recommendations.push('Monitor to ensure improvements are sustained')
    }
    
    return recommendations
  }

  private exportMetricsAsCsv(): string {
    const headers = [
      'timestamp',
      'terminalId',
      'syncType',
      'totalSyncDuration',
      'uploadDuration',
      'downloadDuration',
      'transformationDuration',
      'queueDepthAtStart',
      'queueDepthAtEnd',
      'itemsProcessed',
      'successfulOperations',
      'failedOperations',
      'retryCount',
      'networkLatency',
      'payloadSize',
      'memoryUsageBefore',
      'memoryUsageAfter'
    ]
    
    const rows = this.performanceHistory.map(m => [
      m.timestamp.toISOString(),
      m.terminalId,
      m.syncType,
      m.totalSyncDuration,
      m.uploadDuration,
      m.downloadDuration,
      m.transformationDuration,
      m.queueDepthAtStart,
      m.queueDepthAtEnd,
      m.itemsProcessed,
      m.successfulOperations,
      m.failedOperations,
      m.retryCount,
      m.networkLatency || '',
      m.payloadSize || '',
      m.memoryUsageBefore || '',
      m.memoryUsageAfter || ''
    ])
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }
}

export type {
  SyncHealthMetrics,
  AggregatedMetrics,
  PerformanceTrend,
  HealthScore,
  MetricsConfig
}