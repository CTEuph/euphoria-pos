/**
 * Comprehensive error logging system for sync operations
 * Captures, categorizes, and analyzes errors with detailed context
 */

import { EventEmitter } from 'events'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq, desc, and, gte, lte, count, sql } from 'drizzle-orm'

import * as localSchema from '@/db/local/schema'

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Error categories
 */
export type ErrorCategory = 
  | 'network'
  | 'database' 
  | 'transformation'
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'timeout'
  | 'system'
  | 'business_logic'
  | 'unknown'

/**
 * Detailed error entry
 */
export interface DetailedErrorEntry {
  id: string
  timestamp: Date
  severity: ErrorSeverity
  category: ErrorCategory
  component: string
  operation: string
  message: string
  stackTrace?: string
  
  // Context information
  context: {
    terminalId: string
    userId?: string
    sessionId?: string
    syncOperation?: string
    itemsBeingProcessed?: number
    queueDepth?: number
    networkStatus?: 'online' | 'offline'
    systemLoad?: number
  }
  
  // Technical details
  technical: {
    errorCode?: string
    errorType: string
    source: string
    line?: number
    column?: number
    filename?: string
    method?: string
  }
  
  // Recovery information
  recovery: {
    isRecoverable: boolean
    recoveryAttempts: number
    recoverySuccessful?: boolean
    recoveryTime?: number
    autoRecoveryTriggered: boolean
  }
  
  // Related data
  relatedErrors: string[] // IDs of related errors
  userData?: Record<string, any>
  systemState?: Record<string, any>
  
  // Resolution
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: Date
  resolved: boolean
  resolvedBy?: string
  resolvedAt?: Date
  resolution?: string
}

/**
 * Error pattern analysis
 */
export interface ErrorPattern {
  pattern: string
  category: ErrorCategory
  count: number
  firstSeen: Date
  lastSeen: Date
  frequency: number // errors per hour
  impact: 'low' | 'medium' | 'high'
  trend: 'increasing' | 'decreasing' | 'stable'
  commonContext: Record<string, any>
  suggestedFix?: string
}

/**
 * Error summary statistics
 */
export interface ErrorSummary {
  period: string
  totalErrors: number
  errorsByCategory: Record<ErrorCategory, number>
  errorsBySeverity: Record<ErrorSeverity, number>
  errorsByComponent: Record<string, number>
  topErrors: Array<{
    message: string
    count: number
    category: ErrorCategory
    lastOccurrence: Date
  }>
  errorRate: number // errors per hour
  mtbf: number // mean time between failures (ms)
  mttr: number // mean time to recovery (ms)
  recoveryRate: number // percentage of errors that auto-recovered
}

/**
 * Error trend analysis
 */
export interface ErrorTrend {
  timeframe: '1h' | '4h' | '24h' | '7d'
  direction: 'improving' | 'worsening' | 'stable'
  changePercent: number
  primaryFactors: string[]
  recommendations: string[]
}

/**
 * Error logger configuration
 */
export interface ErrorLoggerConfig {
  /** Maximum number of errors to keep in memory */
  maxInMemoryErrors: number
  
  /** Error retention period in days */
  retentionDays: number
  
  /** Enable automatic error categorization */
  enableAutoCategorization: boolean
  
  /** Enable error pattern detection */
  enablePatternDetection: boolean
  
  /** Enable automatic recovery attempts */
  enableAutoRecovery: boolean
  
  /** Log level threshold */
  logLevel: ErrorSeverity
}

/**
 * Comprehensive error logging system
 */
export class ErrorLogger extends EventEmitter {
  private config: Required<ErrorLoggerConfig>
  private localDb: BetterSQLite3Database<typeof localSchema>
  
  private errorHistory: DetailedErrorEntry[] = []
  private errorPatterns: Map<string, ErrorPattern> = new Map()
  
  // Error classification rules
  private classificationRules: Map<RegExp, { category: ErrorCategory; severity: ErrorSeverity }> = new Map()
  
  // Recovery strategies
  private recoveryStrategies: Map<ErrorCategory, () => Promise<boolean>> = new Map()

  constructor(
    localDb: BetterSQLite3Database<typeof localSchema>,
    config: Partial<ErrorLoggerConfig> = {}
  ) {
    super()
    
    this.localDb = localDb
    this.config = {
      maxInMemoryErrors: config.maxInMemoryErrors ?? 1000,
      retentionDays: config.retentionDays ?? 30,
      enableAutoCategorization: config.enableAutoCategorization ?? true,
      enablePatternDetection: config.enablePatternDetection ?? true,
      enableAutoRecovery: config.enableAutoRecovery ?? false,
      logLevel: config.logLevel ?? 'low'
    }
    
    this.initializeClassificationRules()
    this.initializeRecoveryStrategies()
  }

  /**
   * Log an error with full context
   */
  async logError(
    error: Error,
    context: {
      component: string
      operation: string
      terminalId: string
      userId?: string
      sessionId?: string
      syncOperation?: string
      itemsBeingProcessed?: number
      queueDepth?: number
      networkStatus?: 'online' | 'offline'
      systemLoad?: number
      userData?: Record<string, any>
      systemState?: Record<string, any>
    }
  ): Promise<DetailedErrorEntry> {
    const timestamp = new Date()
    const errorId = this.generateErrorId(timestamp)
    
    // Categorize and assess severity
    const { category, severity } = this.categorizeError(error)
    
    // Extract technical details
    const technical = this.extractTechnicalDetails(error)
    
    // Create detailed error entry
    const errorEntry: DetailedErrorEntry = {
      id: errorId,
      timestamp,
      severity,
      category,
      component: context.component,
      operation: context.operation,
      message: error.message,
      stackTrace: error.stack,
      
      context: {
        terminalId: context.terminalId,
        userId: context.userId,
        sessionId: context.sessionId,
        syncOperation: context.syncOperation,
        itemsBeingProcessed: context.itemsBeingProcessed,
        queueDepth: context.queueDepth,
        networkStatus: context.networkStatus,
        systemLoad: context.systemLoad
      },
      
      technical,
      
      recovery: {
        isRecoverable: this.isRecoverable(category, error),
        recoveryAttempts: 0,
        autoRecoveryTriggered: false
      },
      
      relatedErrors: [],
      userData: context.userData,
      systemState: context.systemState,
      
      acknowledged: false,
      resolved: false
    }
    
    // Store error
    await this.storeError(errorEntry)
    
    // Add to in-memory history
    this.errorHistory.push(errorEntry)
    if (this.errorHistory.length > this.config.maxInMemoryErrors) {
      this.errorHistory.shift()
    }
    
    // Detect patterns
    if (this.config.enablePatternDetection) {
      await this.updateErrorPatterns(errorEntry)
    }
    
    // Find related errors
    this.findRelatedErrors(errorEntry)
    
    // Attempt auto-recovery if enabled
    if (this.config.enableAutoRecovery && errorEntry.recovery.isRecoverable) {
      this.attemptAutoRecovery(errorEntry)
    }
    
    // Emit events
    this.emit('error_logged', errorEntry)
    
    if (severity === 'critical') {
      this.emit('critical_error', errorEntry)
    }
    
    console.error(`[${severity.toUpperCase()}] ${category}/${context.component}: ${error.message}`, {
      errorId,
      operation: context.operation,
      context: errorEntry.context
    })
    
    return errorEntry
  }

  /**
   * Get error summary for a time period
   */
  getErrorSummary(hours = 24): ErrorSummary {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    const relevantErrors = this.errorHistory.filter(e => e.timestamp >= cutoff)
    
    if (relevantErrors.length === 0) {
      return this.createEmptyErrorSummary(hours)
    }
    
    // Count by category
    const errorsByCategory = relevantErrors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1
      return acc
    }, {} as Record<ErrorCategory, number>)
    
    // Count by severity
    const errorsBySeverity = relevantErrors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1
      return acc
    }, {} as Record<ErrorSeverity, number>)
    
    // Count by component
    const errorsByComponent = relevantErrors.reduce((acc, error) => {
      acc[error.component] = (acc[error.component] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    // Top errors
    const errorCounts = new Map<string, { count: number; category: ErrorCategory; lastOccurrence: Date }>()
    relevantErrors.forEach(error => {
      const key = error.message
      const existing = errorCounts.get(key)
      if (existing) {
        existing.count++
        if (error.timestamp > existing.lastOccurrence) {
          existing.lastOccurrence = error.timestamp
        }
      } else {
        errorCounts.set(key, {
          count: 1,
          category: error.category,
          lastOccurrence: error.timestamp
        })
      }
    })
    
    const topErrors = Array.from(errorCounts.entries())
      .map(([message, data]) => ({ message, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    
    // Calculate metrics
    const errorRate = relevantErrors.length / hours
    const mtbf = this.calculateMTBF(relevantErrors)
    const mttr = this.calculateMTTR(relevantErrors)
    const recoveryRate = this.calculateRecoveryRate(relevantErrors)
    
    return {
      period: `${hours}h`,
      totalErrors: relevantErrors.length,
      errorsByCategory,
      errorsBySeverity,
      errorsByComponent,
      topErrors,
      errorRate,
      mtbf,
      mttr,
      recoveryRate
    }
  }

  /**
   * Get error patterns
   */
  getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.errorPatterns.values())
      .sort((a, b) => b.frequency - a.frequency)
  }

  /**
   * Analyze error trends
   */
  analyzeErrorTrends(): ErrorTrend[] {
    const timeframes: Array<{ timeframe: '1h' | '4h' | '24h' | '7d'; hours: number }> = [
      { timeframe: '1h', hours: 1 },
      { timeframe: '4h', hours: 4 },
      { timeframe: '24h', hours: 24 },
      { timeframe: '7d', hours: 168 }
    ]
    
    return timeframes.map(({ timeframe, hours }) => {
      const current = this.getErrorSummary(hours)
      const previous = this.getErrorSummary(hours * 2) // Compare with previous period
      
      const currentRate = current.errorRate
      const previousRate = previous.totalErrors > 0 ? previous.totalErrors / (hours * 2) : 0
      
      let direction: 'improving' | 'worsening' | 'stable' = 'stable'
      let changePercent = 0
      
      if (previousRate > 0) {
        changePercent = ((currentRate - previousRate) / previousRate) * 100
        if (changePercent > 10) {
          direction = 'worsening'
        } else if (changePercent < -10) {
          direction = 'improving'
        }
      }
      
      // Identify primary factors
      const primaryFactors = Object.entries(current.errorsByCategory)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([category]) => category)
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(current, direction)
      
      return {
        timeframe,
        direction,
        changePercent: Math.abs(changePercent),
        primaryFactors,
        recommendations
      }
    })
  }

  /**
   * Acknowledge error
   */
  acknowledgeError(errorId: string, acknowledgedBy: string): boolean {
    const error = this.errorHistory.find(e => e.id === errorId)
    if (!error) return false
    
    error.acknowledged = true
    error.acknowledgedBy = acknowledgedBy
    error.acknowledgedAt = new Date()
    
    this.emit('error_acknowledged', error)
    return true
  }

  /**
   * Resolve error
   */
  resolveError(errorId: string, resolvedBy: string, resolution: string): boolean {
    const error = this.errorHistory.find(e => e.id === errorId)
    if (!error) return false
    
    error.resolved = true
    error.resolvedBy = resolvedBy
    error.resolvedAt = new Date()
    error.resolution = resolution
    
    this.emit('error_resolved', error)
    return true
  }

  /**
   * Get errors by criteria
   */
  getErrors(criteria: {
    category?: ErrorCategory
    severity?: ErrorSeverity
    component?: string
    since?: Date
    resolved?: boolean
    limit?: number
  } = {}): DetailedErrorEntry[] {
    let filtered = [...this.errorHistory]
    
    if (criteria.category) {
      filtered = filtered.filter(e => e.category === criteria.category)
    }
    
    if (criteria.severity) {
      filtered = filtered.filter(e => e.severity === criteria.severity)
    }
    
    if (criteria.component) {
      filtered = filtered.filter(e => e.component === criteria.component)
    }
    
    if (criteria.since) {
      filtered = filtered.filter(e => e.timestamp >= criteria.since!)
    }
    
    if (criteria.resolved !== undefined) {
      filtered = filtered.filter(e => e.resolved === criteria.resolved)
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    
    if (criteria.limit) {
      filtered = filtered.slice(0, criteria.limit)
    }
    
    return filtered
  }

  /**
   * Export error data
   */
  exportErrorData(): {
    errors: DetailedErrorEntry[]
    patterns: ErrorPattern[]
    summary: ErrorSummary
    trends: ErrorTrend[]
    exportTime: string
  } {
    return {
      errors: [...this.errorHistory],
      patterns: this.getErrorPatterns(),
      summary: this.getErrorSummary(24),
      trends: this.analyzeErrorTrends(),
      exportTime: new Date().toISOString()
    }
  }

  /**
   * Clean up old errors
   */
  async cleanupOldErrors(): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays)
    
    const initialLength = this.errorHistory.length
    this.errorHistory = this.errorHistory.filter(e => e.timestamp >= cutoff)
    
    const cleaned = initialLength - this.errorHistory.length
    
    if (cleaned > 0) {
      this.emit('errors_cleaned', { cleaned, remaining: this.errorHistory.length, cutoff })
    }
    
    return cleaned
  }

  /**
   * Private helper methods
   */

  private generateErrorId(timestamp: Date): string {
    return `err_${timestamp.getTime()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private categorizeError(error: Error): { category: ErrorCategory; severity: ErrorSeverity } {
    if (!this.config.enableAutoCategorization) {
      return { category: 'unknown', severity: 'medium' }
    }
    
    const message = error.message.toLowerCase()
    const stack = error.stack?.toLowerCase() || ''
    
    // Check classification rules
    for (const [pattern, classification] of this.classificationRules) {
      if (pattern.test(message) || pattern.test(stack)) {
        return classification
      }
    }
    
    // Default classification
    return { category: 'unknown', severity: 'medium' }
  }

  private extractTechnicalDetails(error: Error): DetailedErrorEntry['technical'] {
    const stack = error.stack || ''
    const stackLines = stack.split('\n')
    
    // Extract source location from stack trace
    const locationMatch = stackLines[1]?.match(/at .* \((.+):(\d+):(\d+)\)/)
    
    return {
      errorType: error.constructor.name,
      source: stack,
      line: locationMatch ? parseInt(locationMatch[2]) : undefined,
      column: locationMatch ? parseInt(locationMatch[3]) : undefined,
      filename: locationMatch ? locationMatch[1] : undefined,
      method: stackLines[1]?.match(/at ([^(]+)/)?.[1]?.trim()
    }
  }

  private isRecoverable(category: ErrorCategory, error: Error): boolean {
    const recoverableCategories: ErrorCategory[] = ['network', 'timeout', 'system']
    return recoverableCategories.includes(category)
  }

  private async storeError(error: DetailedErrorEntry): Promise<void> {
    // In a real implementation, you'd store this in a dedicated errors table
    console.log('Error stored:', {
      id: error.id,
      category: error.category,
      severity: error.severity,
      message: error.message
    })
  }

  private async updateErrorPatterns(error: DetailedErrorEntry): Promise<void> {
    const patternKey = `${error.category}_${error.message.slice(0, 50)}`
    const existing = this.errorPatterns.get(patternKey)
    
    if (existing) {
      existing.count++
      existing.lastSeen = error.timestamp
      existing.frequency = this.calculateFrequency(existing.firstSeen, existing.lastSeen, existing.count)
      existing.trend = this.calculatePatternTrend(existing)
    } else {
      this.errorPatterns.set(patternKey, {
        pattern: patternKey,
        category: error.category,
        count: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
        frequency: 0,
        impact: this.assessPatternImpact(error),
        trend: 'stable',
        commonContext: { ...error.context }
      })
    }
  }

  private findRelatedErrors(error: DetailedErrorEntry): void {
    const timeWindow = 5 * 60 * 1000 // 5 minutes
    const related = this.errorHistory.filter(e => 
      e.id !== error.id &&
      Math.abs(e.timestamp.getTime() - error.timestamp.getTime()) <= timeWindow &&
      (e.component === error.component || e.operation === error.operation)
    )
    
    error.relatedErrors = related.map(e => e.id)
  }

  private async attemptAutoRecovery(error: DetailedErrorEntry): Promise<void> {
    const strategy = this.recoveryStrategies.get(error.category)
    if (!strategy) return
    
    try {
      error.recovery.autoRecoveryTriggered = true
      error.recovery.recoveryAttempts++
      
      const startTime = Date.now()
      const success = await strategy()
      const recoveryTime = Date.now() - startTime
      
      error.recovery.recoverySuccessful = success
      error.recovery.recoveryTime = recoveryTime
      
      if (success) {
        this.emit('auto_recovery_success', error)
      } else {
        this.emit('auto_recovery_failed', error)
      }
      
    } catch (recoveryError) {
      error.recovery.recoverySuccessful = false
      this.emit('auto_recovery_failed', error)
    }
  }

  private initializeClassificationRules(): void {
    // Network errors
    this.classificationRules.set(
      /network|connection|timeout|fetch|request/i,
      { category: 'network', severity: 'medium' }
    )
    
    // Database errors
    this.classificationRules.set(
      /database|sql|query|transaction|connection/i,
      { category: 'database', severity: 'high' }
    )
    
    // Authentication errors
    this.classificationRules.set(
      /auth|login|token|unauthorized|forbidden/i,
      { category: 'authentication', severity: 'high' }
    )
    
    // Validation errors
    this.classificationRules.set(
      /validation|invalid|required|format|schema/i,
      { category: 'validation', severity: 'low' }
    )
    
    // System errors
    this.classificationRules.set(
      /memory|disk|cpu|system|resource/i,
      { category: 'system', severity: 'critical' }
    )
  }

  private initializeRecoveryStrategies(): void {
    // Network recovery
    this.recoveryStrategies.set('network', async () => {
      // Implement network recovery logic
      await new Promise(resolve => setTimeout(resolve, 1000))
      return Math.random() > 0.3 // 70% success rate
    })
    
    // System recovery
    this.recoveryStrategies.set('system', async () => {
      // Implement system recovery logic
      await new Promise(resolve => setTimeout(resolve, 2000))
      return Math.random() > 0.5 // 50% success rate
    })
  }

  private calculateFrequency(firstSeen: Date, lastSeen: Date, count: number): number {
    const timeSpan = lastSeen.getTime() - firstSeen.getTime()
    const hours = timeSpan / (1000 * 60 * 60)
    return hours > 0 ? count / hours : 0
  }

  private calculatePatternTrend(pattern: ErrorPattern): 'increasing' | 'decreasing' | 'stable' {
    // Simplified trend calculation
    if (pattern.frequency > 1) return 'increasing'
    if (pattern.frequency < 0.1) return 'decreasing'
    return 'stable'
  }

  private assessPatternImpact(error: DetailedErrorEntry): 'low' | 'medium' | 'high' {
    if (error.severity === 'critical') return 'high'
    if (error.severity === 'high') return 'medium'
    return 'low'
  }

  private calculateMTBF(errors: DetailedErrorEntry[]): number {
    if (errors.length < 2) return 0
    
    const timeSpan = errors[errors.length - 1].timestamp.getTime() - errors[0].timestamp.getTime()
    return timeSpan / errors.length
  }

  private calculateMTTR(errors: DetailedErrorEntry[]): number {
    const resolvedErrors = errors.filter(e => e.resolved && e.resolvedAt)
    if (resolvedErrors.length === 0) return 0
    
    const totalRecoveryTime = resolvedErrors.reduce((sum, error) => {
      return sum + (error.resolvedAt!.getTime() - error.timestamp.getTime())
    }, 0)
    
    return totalRecoveryTime / resolvedErrors.length
  }

  private calculateRecoveryRate(errors: DetailedErrorEntry[]): number {
    const recoverableErrors = errors.filter(e => e.recovery.isRecoverable)
    if (recoverableErrors.length === 0) return 0
    
    const recoveredErrors = recoverableErrors.filter(e => e.recovery.recoverySuccessful)
    return (recoveredErrors.length / recoverableErrors.length) * 100
  }

  private createEmptyErrorSummary(hours: number): ErrorSummary {
    return {
      period: `${hours}h`,
      totalErrors: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      errorsByComponent: {},
      topErrors: [],
      errorRate: 0,
      mtbf: 0,
      mttr: 0,
      recoveryRate: 0
    }
  }

  private generateRecommendations(summary: ErrorSummary, trend: 'improving' | 'worsening' | 'stable'): string[] {
    const recommendations: string[] = []
    
    if (trend === 'worsening') {
      recommendations.push('Error rate is increasing - investigate recent changes')
      recommendations.push('Consider implementing additional monitoring')
    }
    
    // Check for high error categories
    const topCategory = Object.entries(summary.errorsByCategory)
      .sort(([, a], [, b]) => b - a)[0]
    
    if (topCategory && topCategory[1] > summary.totalErrors * 0.3) {
      switch (topCategory[0] as ErrorCategory) {
        case 'network':
          recommendations.push('High network errors - check connectivity and bandwidth')
          break
        case 'database':
          recommendations.push('Database errors are frequent - review queries and connections')
          break
        case 'authentication':
          recommendations.push('Authentication issues detected - verify credentials and tokens')
          break
        case 'system':
          recommendations.push('System errors indicate resource issues - check memory and CPU')
          break
      }
    }
    
    if (summary.recoveryRate < 50) {
      recommendations.push('Low recovery rate - improve error handling and recovery procedures')
    }
    
    return recommendations
  }
}

export default ErrorLogger