/**
 * Dedicated sync latency monitoring system
 * Tracks sync operation timing and generates performance alerts
 */

import { EventEmitter } from 'events'
import type { SyncResult } from '../sync/SyncEngine'

/**
 * Latency monitoring configuration
 */
export interface LatencyMonitorConfig {
  /** Latency alert threshold (ms) */
  alertThreshold: number
  
  /** Critical latency threshold (ms) */
  criticalThreshold: number
  
  /** Sample size for trend analysis */
  sampleSize: number
  
  /** Alert cooldown period (ms) */
  alertCooldown: number
  
  /** Enable detailed latency breakdown */
  enableDetailedTracking: boolean
}

/**
 * Latency measurement
 */
export interface LatencyMeasurement {
  operationType: 'upload' | 'download' | 'transformation' | 'full_sync'
  duration: number
  timestamp: Date
  itemCount?: number
  payloadSize?: number
  networkLatency?: number
  retryCount?: number
  metadata?: Record<string, any>
}

/**
 * Latency statistics
 */
export interface LatencyStats {
  operationType: string
  count: number
  average: number
  median: number
  p95: number
  p99: number
  min: number
  max: number
  standardDeviation: number
  trend: 'improving' | 'degrading' | 'stable'
  throughput: number // items per second
  efficiency: number // items per ms
}

/**
 * Latency breakdown
 */
export interface LatencyBreakdown {
  total: number
  network: number
  processing: number
  database: number
  transformation: number
  overhead: number
  percentages: {
    network: number
    processing: number
    database: number
    transformation: number
    overhead: number
  }
}

/**
 * Latency alert
 */
export interface LatencyAlert {
  id: string
  type: 'high_latency' | 'critical_latency' | 'degrading_performance' | 'timeout_risk'
  severity: 'warning' | 'critical'
  operationType: string
  latency: number
  threshold: number
  message: string
  timestamp: Date
  recommendations: string[]
  metadata?: Record<string, any>
}

/**
 * Performance trend analysis
 */
export interface PerformanceTrend {
  period: '1h' | '4h' | '24h' | '7d'
  direction: 'improving' | 'degrading' | 'stable'
  changePercent: number
  confidence: number
  baseline: number
  current: number
  factors: Array<{
    factor: string
    impact: 'positive' | 'negative'
    significance: number
  }>
}

/**
 * Comprehensive latency monitoring system
 */
export class LatencyMonitor extends EventEmitter {
  private config: Required<LatencyMonitorConfig>
  private measurements: Map<string, LatencyMeasurement[]> = new Map()
  private activeAlerts: Map<string, LatencyAlert> = new Map()
  private lastAlertTime: Map<string, Date> = new Map()
  
  // Performance baselines
  private performanceBaselines: Map<string, number> = new Map()
  
  // Real-time tracking
  private activeOperations: Map<string, { startTime: Date; type: string; metadata?: any }> = new Map()

  constructor(config: Partial<LatencyMonitorConfig> = {}) {
    super()
    
    this.config = {
      alertThreshold: config.alertThreshold ?? 60000, // 60 seconds
      criticalThreshold: config.criticalThreshold ?? 120000, // 2 minutes
      sampleSize: config.sampleSize ?? 100,
      alertCooldown: config.alertCooldown ?? 300000, // 5 minutes
      enableDetailedTracking: config.enableDetailedTracking ?? true
    }
    
    this.initializeBaselines()
  }

  /**
   * Start tracking a sync operation
   */
  startOperation(
    operationId: string, 
    type: 'upload' | 'download' | 'transformation' | 'full_sync',
    metadata?: any
  ): void {
    this.activeOperations.set(operationId, {
      startTime: new Date(),
      type,
      metadata
    })
    
    this.emit('operation_started', { operationId, type, timestamp: new Date() })
  }

  /**
   * Complete tracking for a sync operation
   */
  completeOperation(
    operationId: string,
    result?: {
      itemCount?: number
      payloadSize?: number
      networkLatency?: number
      retryCount?: number
      success?: boolean
      error?: string
    }
  ): LatencyMeasurement | null {
    const operation = this.activeOperations.get(operationId)
    if (!operation) {
      console.warn(`No active operation found for ID: ${operationId}`)
      return null
    }
    
    const endTime = new Date()
    const duration = endTime.getTime() - operation.startTime.getTime()
    
    const measurement: LatencyMeasurement = {
      operationType: operation.type,
      duration,
      timestamp: endTime,
      itemCount: result?.itemCount,
      payloadSize: result?.payloadSize,
      networkLatency: result?.networkLatency,
      retryCount: result?.retryCount,
      metadata: {
        ...operation.metadata,
        success: result?.success,
        error: result?.error
      }
    }
    
    // Store measurement
    this.recordMeasurement(measurement)
    
    // Check for alerts
    this.checkLatencyAlerts(measurement)
    
    // Clean up
    this.activeOperations.delete(operationId)
    
    this.emit('operation_completed', { operationId, measurement })
    
    return measurement
  }

  /**
   * Record a completed sync result
   */
  recordSyncResult(result: SyncResult): void {
    const measurement: LatencyMeasurement = {
      operationType: 'full_sync',
      duration: result.duration,
      timestamp: new Date(result.timestamp),
      itemCount: result.itemsProcessed,
      retryCount: 0,
      metadata: {
        operation: result.operation,
        success: result.success,
        errors: result.errors
      }
    }
    
    this.recordMeasurement(measurement)
    this.checkLatencyAlerts(measurement)
  }

  /**
   * Get latency statistics for an operation type
   */
  getLatencyStats(operationType?: string): Map<string, LatencyStats> {
    const stats = new Map<string, LatencyStats>()
    
    const typesToAnalyze = operationType 
      ? [operationType] 
      : Array.from(this.measurements.keys())
    
    for (const type of typesToAnalyze) {
      const measurements = this.measurements.get(type) || []
      if (measurements.length === 0) continue
      
      const durations = measurements.map(m => m.duration).sort((a, b) => a - b)
      const count = durations.length
      
      if (count === 0) continue
      
      const sum = durations.reduce((a, b) => a + b, 0)
      const average = sum / count
      const median = this.calculatePercentile(durations, 50)
      const p95 = this.calculatePercentile(durations, 95)
      const p99 = this.calculatePercentile(durations, 99)
      const min = durations[0]
      const max = durations[count - 1]
      
      // Calculate standard deviation
      const variance = durations.reduce((acc, duration) => 
        acc + Math.pow(duration - average, 2), 0) / count
      const standardDeviation = Math.sqrt(variance)
      
      // Calculate trend
      const trend = this.calculateTrend(type, measurements)
      
      // Calculate throughput (items per second)
      const totalItems = measurements.reduce((sum, m) => sum + (m.itemCount || 0), 0)
      const totalTime = sum / 1000 // Convert to seconds
      const throughput = totalTime > 0 ? totalItems / totalTime : 0
      
      // Calculate efficiency (items per ms)
      const efficiency = sum > 0 ? totalItems / sum : 0
      
      stats.set(type, {
        operationType: type,
        count,
        average,
        median,
        p95,
        p99,
        min,
        max,
        standardDeviation,
        trend,
        throughput,
        efficiency
      })
    }
    
    return stats
  }

  /**
   * Get detailed latency breakdown for recent operations
   */
  getLatencyBreakdown(operationType: string, sampleCount = 10): LatencyBreakdown | null {
    const measurements = this.measurements.get(operationType) || []
    if (measurements.length === 0) return null
    
    const recentMeasurements = measurements
      .slice(-sampleCount)
      .filter(m => this.config.enableDetailedTracking && m.metadata)
    
    if (recentMeasurements.length === 0) {
      // Fallback to simple breakdown
      const avgDuration = measurements.slice(-sampleCount)
        .reduce((sum, m) => sum + m.duration, 0) / Math.min(sampleCount, measurements.length)
      
      return {
        total: avgDuration,
        network: 0,
        processing: avgDuration,
        database: 0,
        transformation: 0,
        overhead: 0,
        percentages: {
          network: 0,
          processing: 100,
          database: 0,
          transformation: 0,
          overhead: 0
        }
      }
    }
    
    // Calculate averages for each component
    const totals = recentMeasurements.reduce((acc, m) => {
      const networkTime = m.networkLatency || 0
      const processingTime = m.duration - networkTime
      
      return {
        total: acc.total + m.duration,
        network: acc.network + networkTime,
        processing: acc.processing + processingTime,
        database: acc.database + (m.metadata?.databaseTime || 0),
        transformation: acc.transformation + (m.metadata?.transformationTime || 0),
        overhead: acc.overhead + (m.metadata?.overheadTime || 0)
      }
    }, { total: 0, network: 0, processing: 0, database: 0, transformation: 0, overhead: 0 })
    
    const count = recentMeasurements.length
    const breakdown = {
      total: totals.total / count,
      network: totals.network / count,
      processing: totals.processing / count,
      database: totals.database / count,
      transformation: totals.transformation / count,
      overhead: totals.overhead / count,
      percentages: {
        network: 0,
        processing: 0,
        database: 0,
        transformation: 0,
        overhead: 0
      }
    }
    
    // Calculate percentages
    if (breakdown.total > 0) {
      breakdown.percentages = {
        network: (breakdown.network / breakdown.total) * 100,
        processing: (breakdown.processing / breakdown.total) * 100,
        database: (breakdown.database / breakdown.total) * 100,
        transformation: (breakdown.transformation / breakdown.total) * 100,
        overhead: (breakdown.overhead / breakdown.total) * 100
      }
    }
    
    return breakdown
  }

  /**
   * Analyze performance trends
   */
  analyzePerformanceTrends(operationType: string): PerformanceTrend[] {
    const measurements = this.measurements.get(operationType) || []
    if (measurements.length < 20) return []
    
    const trends: PerformanceTrend[] = []
    const periods: Array<{ period: '1h' | '4h' | '24h' | '7d'; hours: number }> = [
      { period: '1h', hours: 1 },
      { period: '4h', hours: 4 },
      { period: '24h', hours: 24 },
      { period: '7d', hours: 168 }
    ]
    
    for (const { period, hours } of periods) {
      const trend = this.calculatePeriodTrend(operationType, hours)
      if (trend) {
        trends.push({ ...trend, period })
      }
    }
    
    return trends
  }

  /**
   * Get active latency alerts
   */
  getActiveAlerts(): LatencyAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) return false
    
    this.activeAlerts.delete(alertId)
    this.emit('alert_acknowledged', alert)
    return true
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(operationType: string): string[] {
    const stats = this.getLatencyStats(operationType).get(operationType)
    if (!stats) return []
    
    const recommendations: string[] = []
    const baseline = this.performanceBaselines.get(operationType) || this.config.alertThreshold
    
    if (stats.average > baseline * 1.5) {
      recommendations.push('Consider optimizing database queries')
      recommendations.push('Check network connectivity and bandwidth')
      recommendations.push('Review payload sizes for potential reduction')
    }
    
    if (stats.p99 > baseline * 3) {
      recommendations.push('Investigate outlier cases causing extreme latency')
      recommendations.push('Consider implementing operation timeouts')
    }
    
    if (stats.standardDeviation > stats.average * 0.5) {
      recommendations.push('Performance is highly variable - investigate inconsistency causes')
      recommendations.push('Consider implementing caching mechanisms')
    }
    
    const breakdown = this.getLatencyBreakdown(operationType)
    if (breakdown) {
      if (breakdown.percentages.network > 50) {
        recommendations.push('Network latency is dominant - check connection quality')
        recommendations.push('Consider implementing compression or data reduction')
      }
      
      if (breakdown.percentages.database > 40) {
        recommendations.push('Database operations are taking significant time')
        recommendations.push('Review indexes and query optimization')
      }
    }
    
    if (stats.trend === 'degrading') {
      recommendations.push('Performance is degrading over time - monitor system resources')
      recommendations.push('Consider scheduling maintenance to address performance issues')
    }
    
    return recommendations
  }

  /**
   * Export latency data
   */
  exportData(): {
    measurements: Record<string, LatencyMeasurement[]>
    stats: Record<string, LatencyStats>
    alerts: LatencyAlert[]
    baselines: Record<string, number>
    exportTime: string
  } {
    const stats: Record<string, LatencyStats> = {}
    this.getLatencyStats().forEach((stat, type) => {
      stats[type] = stat
    })
    
    const measurements: Record<string, LatencyMeasurement[]> = {}
    this.measurements.forEach((measurementList, type) => {
      measurements[type] = [...measurementList]
    })
    
    const baselines: Record<string, number> = {}
    this.performanceBaselines.forEach((baseline, type) => {
      baselines[type] = baseline
    })
    
    return {
      measurements,
      stats,
      alerts: Array.from(this.activeAlerts.values()),
      baselines,
      exportTime: new Date().toISOString()
    }
  }

  /**
   * Private helper methods
   */

  private recordMeasurement(measurement: LatencyMeasurement): void {
    const type = measurement.operationType
    
    if (!this.measurements.has(type)) {
      this.measurements.set(type, [])
    }
    
    const measurements = this.measurements.get(type)!
    measurements.push(measurement)
    
    // Keep only recent measurements
    if (measurements.length > this.config.sampleSize) {
      measurements.shift()
    }
    
    this.emit('measurement_recorded', measurement)
  }

  private checkLatencyAlerts(measurement: LatencyMeasurement): void {
    const { operationType, duration, timestamp } = measurement
    const alertKey = `${operationType}_latency`
    
    // Check cooldown
    const lastAlert = this.lastAlertTime.get(alertKey)
    if (lastAlert && timestamp.getTime() - lastAlert.getTime() < this.config.alertCooldown) {
      return
    }
    
    let alert: LatencyAlert | null = null
    
    if (duration >= this.config.criticalThreshold) {
      alert = {
        id: `${alertKey}_${timestamp.getTime()}`,
        type: 'critical_latency',
        severity: 'critical',
        operationType,
        latency: duration,
        threshold: this.config.criticalThreshold,
        message: `Critical latency detected: ${Math.round(duration / 1000)}s (threshold: ${Math.round(this.config.criticalThreshold / 1000)}s)`,
        timestamp,
        recommendations: this.getPerformanceRecommendations(operationType),
        metadata: measurement.metadata
      }
    } else if (duration >= this.config.alertThreshold) {
      alert = {
        id: `${alertKey}_${timestamp.getTime()}`,
        type: 'high_latency',
        severity: 'warning',
        operationType,
        latency: duration,
        threshold: this.config.alertThreshold,
        message: `High latency detected: ${Math.round(duration / 1000)}s (threshold: ${Math.round(this.config.alertThreshold / 1000)}s)`,
        timestamp,
        recommendations: this.getPerformanceRecommendations(operationType),
        metadata: measurement.metadata
      }
    }
    
    if (alert) {
      this.activeAlerts.set(alertKey, alert)
      this.lastAlertTime.set(alertKey, timestamp)
      this.emit('alert_created', alert)
    } else {
      // Clear alert if latency is back to normal
      if (this.activeAlerts.has(alertKey)) {
        const clearedAlert = this.activeAlerts.get(alertKey)!
        this.activeAlerts.delete(alertKey)
        this.emit('alert_resolved', clearedAlert)
      }
    }
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    
    if (lower === upper) {
      return sortedArray[lower]
    }
    
    const weight = index - lower
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight
  }

  private calculateTrend(operationType: string, measurements: LatencyMeasurement[]): 'improving' | 'degrading' | 'stable' {
    if (measurements.length < 10) return 'stable'
    
    const recent = measurements.slice(-20)
    const firstHalf = recent.slice(0, 10)
    const secondHalf = recent.slice(10)
    
    const firstAvg = firstHalf.reduce((sum, m) => sum + m.duration, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.duration, 0) / secondHalf.length
    
    const change = (secondAvg - firstAvg) / firstAvg
    
    if (change > 0.1) return 'degrading'
    if (change < -0.1) return 'improving'
    return 'stable'
  }

  private calculatePeriodTrend(operationType: string, hours: number): Omit<PerformanceTrend, 'period'> | null {
    const measurements = this.measurements.get(operationType) || []
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    const periodMeasurements = measurements.filter(m => m.timestamp >= cutoff)
    if (periodMeasurements.length < 5) return null
    
    const durations = periodMeasurements.map(m => m.duration)
    const baseline = this.performanceBaselines.get(operationType) || this.config.alertThreshold
    const current = durations.reduce((sum, d) => sum + d, 0) / durations.length
    
    const changePercent = ((current - baseline) / baseline) * 100
    const direction = changePercent > 10 ? 'degrading' : changePercent < -10 ? 'improving' : 'stable'
    
    return {
      direction,
      changePercent: Math.abs(changePercent),
      confidence: Math.min(100, periodMeasurements.length * 2),
      baseline,
      current,
      factors: []
    }
  }

  private initializeBaselines(): void {
    // Set reasonable default baselines
    this.performanceBaselines.set('upload', 30000) // 30 seconds
    this.performanceBaselines.set('download', 20000) // 20 seconds
    this.performanceBaselines.set('transformation', 5000) // 5 seconds
    this.performanceBaselines.set('full_sync', 45000) // 45 seconds
  }
}

export default LatencyMonitor