/**
 * Health check endpoints for system monitoring
 * Provides REST API endpoints for external monitoring systems
 */

import { EventEmitter } from 'events'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { SyncEngine } from '../sync/SyncEngine'
import type { SyncMonitor, HealthStatus } from './SyncMonitor'
import type { ErrorLogger } from './ErrorLogger'
import type { BackupMonitor } from './BackupMonitor'
import type { IntegrityVerifier } from './IntegrityVerifier'
import type { RecoveryManager } from './RecoveryManager'

/**
 * Health check endpoint types
 */
export type HealthCheckEndpoint = 
  | 'overall'
  | 'sync'
  | 'database'
  | 'network'
  | 'backup'
  | 'integrity'
  | 'recovery'
  | 'performance'
  | 'security'

/**
 * Health check response format
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  version: string
  uptime: number
  
  checks: Record<string, {
    status: 'pass' | 'warn' | 'fail'
    message: string
    duration: number
    details?: Record<string, any>
  }>
  
  metrics?: Record<string, number>
  alerts?: Array<{
    id: string
    severity: 'info' | 'warning' | 'critical'
    message: string
    timestamp: string
  }>
}

/**
 * Endpoint configuration
 */
export interface HealthCheckEndpointConfig {
  /** Enable health check endpoints */
  enabled: boolean
  
  /** Port for health check server */
  port: number
  
  /** Enable authentication for endpoints */
  enableAuth: boolean
  
  /** API key for authentication */
  apiKey?: string
  
  /** Enable detailed responses */
  enableDetailedResponses: boolean
  
  /** Cache health check results (seconds) */
  cacheTimeout: number
  
  /** Enable CORS */
  enableCors: boolean
  
  /** Allowed origins for CORS */
  allowedOrigins: string[]
  
  /** Enable rate limiting */
  enableRateLimit: boolean
  
  /** Rate limit (requests per minute) */
  rateLimit: number
}

/**
 * Cached health check result
 */
interface CachedHealthCheck {
  result: HealthCheckResponse
  timestamp: Date
  ttl: number
}

/**
 * Rate limiting tracking
 */
interface RateLimitEntry {
  count: number
  resetTime: Date
}

/**
 * Health check endpoints manager
 */
export class HealthCheckEndpoints extends EventEmitter {
  private config: Required<HealthCheckEndpointConfig>
  private localDb: BetterSQLite3Database<any>
  private supabaseClient: SupabaseClient | null
  
  // Service dependencies
  private syncEngine: SyncEngine
  private syncMonitor: SyncMonitor
  private errorLogger: ErrorLogger
  private backupMonitor: BackupMonitor | null
  private integrityVerifier: IntegrityVerifier | null
  private recoveryManager: RecoveryManager | null
  
  // Server state
  private startTime: Date
  private version: string
  
  // Caching and rate limiting
  private healthCheckCache: Map<string, CachedHealthCheck> = new Map()
  private rateLimitMap: Map<string, RateLimitEntry> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(
    services: {
      localDb: BetterSQLite3Database<any>
      supabaseClient: SupabaseClient | null
      syncEngine: SyncEngine
      syncMonitor: SyncMonitor
      errorLogger: ErrorLogger
      backupMonitor?: BackupMonitor
      integrityVerifier?: IntegrityVerifier
      recoveryManager?: RecoveryManager
    },
    config: Partial<HealthCheckEndpointConfig> = {}
  ) {
    super()
    
    this.localDb = services.localDb
    this.supabaseClient = services.supabaseClient
    this.syncEngine = services.syncEngine
    this.syncMonitor = services.syncMonitor
    this.errorLogger = services.errorLogger
    this.backupMonitor = services.backupMonitor || null
    this.integrityVerifier = services.integrityVerifier || null
    this.recoveryManager = services.recoveryManager || null
    
    this.config = {
      enabled: config.enabled ?? true,
      port: config.port ?? 3001,
      enableAuth: config.enableAuth ?? false,
      apiKey: config.apiKey,
      enableDetailedResponses: config.enableDetailedResponses ?? true,
      cacheTimeout: config.cacheTimeout ?? 30, // 30 seconds
      enableCors: config.enableCors ?? true,
      allowedOrigins: config.allowedOrigins ?? ['*'],
      enableRateLimit: config.enableRateLimit ?? true,
      rateLimit: config.rateLimit ?? 60 // 60 requests per minute
    }
    
    this.startTime = new Date()
    this.version = process.env.npm_package_version || '1.0.0'
  }

  /**
   * Start health check endpoints server
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('Health check endpoints disabled')
      return
    }
    
    try {
      console.log('Starting health check endpoints...')
      
      // Start cleanup interval for cache and rate limits
      this.cleanupInterval = setInterval(() => {
        this.cleanupCacheAndRateLimits()
      }, 60000) // Clean up every minute
      
      this.emit('endpoints_started')
      
      console.log(`Health check endpoints available on port ${this.config.port}`)
      
    } catch (error) {
      console.error('Failed to start health check endpoints:', error)
      throw error
    }
  }

  /**
   * Stop health check endpoints server
   */
  async stop(): Promise<void> {
    try {
      console.log('Stopping health check endpoints...')
      
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }
      
      this.emit('endpoints_stopped')
      
      console.log('Health check endpoints stopped')
      
    } catch (error) {
      console.error('Error stopping health check endpoints:', error)
    }
  }

  /**
   * Handle health check request
   */
  async handleHealthCheck(
    endpoint: HealthCheckEndpoint,
    clientInfo?: {
      ip: string
      userAgent?: string
      apiKey?: string
    }
  ): Promise<HealthCheckResponse> {
    try {
      // Rate limiting check
      if (this.config.enableRateLimit && clientInfo?.ip) {
        const allowed = this.checkRateLimit(clientInfo.ip)
        if (!allowed) {
          throw new Error('Rate limit exceeded')
        }
      }
      
      // Authentication check
      if (this.config.enableAuth) {
        const authenticated = this.authenticateRequest(clientInfo?.apiKey)
        if (!authenticated) {
          throw new Error('Authentication required')
        }
      }
      
      // Check cache
      const cacheKey = `${endpoint}_${this.config.enableDetailedResponses}`
      const cached = this.healthCheckCache.get(cacheKey)
      
      if (cached && Date.now() - cached.timestamp.getTime() < cached.ttl) {
        return cached.result
      }
      
      // Perform health check
      const result = await this.performHealthCheck(endpoint)
      
      // Cache result
      this.healthCheckCache.set(cacheKey, {
        result,
        timestamp: new Date(),
        ttl: this.config.cacheTimeout * 1000
      })
      
      return result
      
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Health check failed')
    }
  }

  /**
   * Get available endpoints
   */
  getAvailableEndpoints(): Array<{
    endpoint: HealthCheckEndpoint
    path: string
    description: string
  }> {
    return [
      {
        endpoint: 'overall',
        path: '/health',
        description: 'Overall system health status'
      },
      {
        endpoint: 'sync',
        path: '/health/sync',
        description: 'Sync engine and synchronization status'
      },
      {
        endpoint: 'database',
        path: '/health/database',
        description: 'Database connectivity and integrity'
      },
      {
        endpoint: 'network',
        path: '/health/network',
        description: 'Network connectivity and cloud services'
      },
      {
        endpoint: 'backup',
        path: '/health/backup',
        description: 'Backup system status and recent backups'
      },
      {
        endpoint: 'integrity',
        path: '/health/integrity',
        description: 'Data integrity verification status'
      },
      {
        endpoint: 'recovery',
        path: '/health/recovery',
        description: 'Recovery system status and recent sessions'
      },
      {
        endpoint: 'performance',
        path: '/health/performance',
        description: 'System performance metrics'
      },
      {
        endpoint: 'security',
        path: '/health/security',
        description: 'Security status and audit information'
      }
    ]
  }

  /**
   * Export health check data
   */
  exportHealthData(): {
    endpoints: Array<{ endpoint: HealthCheckEndpoint; path: string; description: string }>
    config: HealthCheckEndpointConfig
    stats: {
      totalRequests: number
      cacheHitRate: number
      rateLimitedRequests: number
    }
    exportTime: string
  } {
    return {
      endpoints: this.getAvailableEndpoints(),
      config: { ...this.config },
      stats: {
        totalRequests: 0, // Would track in production
        cacheHitRate: 0, // Would calculate from metrics
        rateLimitedRequests: 0 // Would track in production
      },
      exportTime: new Date().toISOString()
    }
  }

  /**
   * Private implementation methods
   */

  private async performHealthCheck(endpoint: HealthCheckEndpoint): Promise<HealthCheckResponse> {
    const startTime = Date.now()
    
    try {
      let checks: HealthCheckResponse['checks'] = {}
      let metrics: Record<string, number> = {}
      let alerts: HealthCheckResponse['alerts'] = []
      
      switch (endpoint) {
        case 'overall':
          checks = await this.performOverallHealthCheck()
          break
        case 'sync':
          checks = await this.performSyncHealthCheck()
          break
        case 'database':
          checks = await this.performDatabaseHealthCheck()
          break
        case 'network':
          checks = await this.performNetworkHealthCheck()
          break
        case 'backup':
          checks = await this.performBackupHealthCheck()
          break
        case 'integrity':
          checks = await this.performIntegrityHealthCheck()
          break
        case 'recovery':
          checks = await this.performRecoveryHealthCheck()
          break
        case 'performance':
          const perfResult = await this.performPerformanceHealthCheck()
          checks = perfResult.checks
          metrics = perfResult.metrics
          break
        case 'security':
          checks = await this.performSecurityHealthCheck()
          break
        default:
          throw new Error(`Unknown health check endpoint: ${endpoint}`)
      }
      
      // Get system alerts
      const systemAlerts = this.getSystemAlerts()
      alerts.push(...systemAlerts)
      
      // Determine overall status
      const overallStatus = this.determineOverallStatus(checks)
      
      const response: HealthCheckResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: this.version,
        uptime: Date.now() - this.startTime.getTime(),
        checks,
        ...(Object.keys(metrics).length > 0 && { metrics }),
        ...(alerts.length > 0 && { alerts })
      }
      
      return response
      
    } catch (error) {
      return this.createErrorResponse(error instanceof Error ? error.message : 'Health check failed')
    }
  }

  private async performOverallHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    // Combine all major system checks
    const syncChecks = await this.performSyncHealthCheck()
    const dbChecks = await this.performDatabaseHealthCheck()
    const networkChecks = await this.performNetworkHealthCheck()
    
    return {
      ...syncChecks,
      ...dbChecks,
      ...networkChecks
    }
  }

  private async performSyncHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    try {
      const startTime = Date.now()
      const syncStatus = this.syncEngine.getStatus()
      const duration = Date.now() - startTime
      
      // Sync engine status
      checks.sync_engine = {
        status: syncStatus.isActive ? 'pass' : 'fail',
        message: syncStatus.isActive ? 'Sync engine is active' : 'Sync engine is inactive',
        duration,
        details: this.config.enableDetailedResponses ? {
          isOnline: syncStatus.isOnline,
          queueDepth: syncStatus.queueDepth,
          lastSyncAt: syncStatus.lastSyncAt?.toISOString(),
          errorCount: syncStatus.errors.length
        } : undefined
      }
      
      // Queue depth check
      checks.sync_queue = {
        status: syncStatus.queueDepth < 50 ? 'pass' : syncStatus.queueDepth < 100 ? 'warn' : 'fail',
        message: `Queue depth: ${syncStatus.queueDepth} items`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          queueDepth: syncStatus.queueDepth,
          threshold: 50
        } : undefined
      }
      
      // Last sync timing
      const lastSyncTime = syncStatus.lastSyncAt
      const hoursSinceSync = lastSyncTime 
        ? (Date.now() - lastSyncTime.getTime()) / (1000 * 60 * 60)
        : 999
      
      checks.sync_timing = {
        status: hoursSinceSync < 1 ? 'pass' : hoursSinceSync < 4 ? 'warn' : 'fail',
        message: lastSyncTime 
          ? `Last sync: ${hoursSinceSync.toFixed(1)} hours ago`
          : 'No recent sync found',
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          lastSyncAt: lastSyncTime?.toISOString(),
          hoursSinceSync
        } : undefined
      }
      
    } catch (error) {
      checks.sync_engine = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Sync check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performDatabaseHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    try {
      // Local database check
      const localStartTime = Date.now()
      await this.localDb.select().from('products' as any).limit(1)
      const localDuration = Date.now() - localStartTime
      
      checks.local_database = {
        status: localDuration < 1000 ? 'pass' : localDuration < 5000 ? 'warn' : 'fail',
        message: `Local database responsive (${localDuration}ms)`,
        duration: localDuration,
        details: this.config.enableDetailedResponses ? {
          responseTime: localDuration,
          type: 'sqlite'
        } : undefined
      }
      
    } catch (error) {
      checks.local_database = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Local database check failed',
        duration: 0
      }
    }
    
    try {
      // Cloud database check
      if (this.supabaseClient) {
        const cloudStartTime = Date.now()
        const { data, error } = await this.supabaseClient
          .from('products')
          .select('count', { count: 'exact', head: true })
        
        const cloudDuration = Date.now() - cloudStartTime
        
        checks.cloud_database = {
          status: !error && cloudDuration < 2000 ? 'pass' : cloudDuration < 5000 ? 'warn' : 'fail',
          message: error 
            ? `Cloud database error: ${error.message}`
            : `Cloud database responsive (${cloudDuration}ms)`,
          duration: cloudDuration,
          details: this.config.enableDetailedResponses ? {
            responseTime: cloudDuration,
            type: 'postgresql',
            error: error?.message
          } : undefined
        }
      } else {
        checks.cloud_database = {
          status: 'warn',
          message: 'Cloud database not configured',
          duration: 0
        }
      }
      
    } catch (error) {
      checks.cloud_database = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Cloud database check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performNetworkHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    try {
      // Internet connectivity check
      const internetStartTime = Date.now()
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(10000)
      })
      const internetDuration = Date.now() - internetStartTime
      
      checks.internet_connectivity = {
        status: response.ok && internetDuration < 3000 ? 'pass' : internetDuration < 10000 ? 'warn' : 'fail',
        message: response.ok 
          ? `Internet accessible (${internetDuration}ms)`
          : 'Internet connectivity issues',
        duration: internetDuration,
        details: this.config.enableDetailedResponses ? {
          responseTime: internetDuration,
          status: response.status
        } : undefined
      }
      
    } catch (error) {
      checks.internet_connectivity = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Internet connectivity check failed',
        duration: 0
      }
    }
    
    try {
      // DNS resolution check
      const dnsStartTime = Date.now()
      // Simple DNS check by resolving a known domain
      await fetch('https://dns.google', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      })
      const dnsDuration = Date.now() - dnsStartTime
      
      checks.dns_resolution = {
        status: dnsDuration < 2000 ? 'pass' : dnsDuration < 5000 ? 'warn' : 'fail',
        message: `DNS resolution working (${dnsDuration}ms)`,
        duration: dnsDuration,
        details: this.config.enableDetailedResponses ? {
          responseTime: dnsDuration
        } : undefined
      }
      
    } catch (error) {
      checks.dns_resolution = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'DNS resolution check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performBackupHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    if (!this.backupMonitor) {
      checks.backup_system = {
        status: 'warn',
        message: 'Backup monitoring not configured',
        duration: 0
      }
      return checks
    }
    
    try {
      const backupHealth = this.backupMonitor.getBackupHealth()
      
      checks.backup_local = {
        status: backupHealth.localBackups.status === 'healthy' ? 'pass' : 
               backupHealth.localBackups.status === 'warning' ? 'warn' : 'fail',
        message: `Local backups: ${backupHealth.localBackups.issuesCount} issues`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          lastDaily: backupHealth.localBackups.lastDaily?.toISOString(),
          lastHourly: backupHealth.localBackups.lastHourly?.toISOString(),
          issuesCount: backupHealth.localBackups.issuesCount
        } : undefined
      }
      
      checks.backup_cloud = {
        status: backupHealth.cloudBackups.status === 'healthy' ? 'pass' : 
               backupHealth.cloudBackups.status === 'warning' ? 'warn' : 'fail',
        message: `Cloud backups: ${backupHealth.cloudBackups.issuesCount} issues`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          lastNightly: backupHealth.cloudBackups.lastNightly?.toISOString(),
          issuesCount: backupHealth.cloudBackups.issuesCount
        } : undefined
      }
      
    } catch (error) {
      checks.backup_system = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Backup health check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performIntegrityHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    if (!this.integrityVerifier) {
      checks.integrity_system = {
        status: 'warn',
        message: 'Integrity verification not configured',
        duration: 0
      }
      return checks
    }
    
    try {
      const latestReport = this.integrityVerifier.getLatestReport()
      
      if (!latestReport) {
        checks.integrity_verification = {
          status: 'warn',
          message: 'No integrity reports available',
          duration: 0
        }
      } else {
        const hoursOld = (Date.now() - latestReport.timestamp.getTime()) / (1000 * 60 * 60)
        
        checks.integrity_verification = {
          status: latestReport.overallStatus === 'healthy' && hoursOld < 24 ? 'pass' :
                 latestReport.overallStatus === 'issues_found' ? 'warn' : 'fail',
          message: `Latest integrity check: ${latestReport.overallStatus} (${hoursOld.toFixed(1)}h ago)`,
          duration: 0,
          details: this.config.enableDetailedResponses ? {
            overallStatus: latestReport.overallStatus,
            totalChecks: latestReport.totalChecks,
            passedChecks: latestReport.passedChecks,
            failedChecks: latestReport.failedChecks,
            hoursOld
          } : undefined
        }
      }
      
    } catch (error) {
      checks.integrity_verification = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Integrity check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performRecoveryHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    if (!this.recoveryManager) {
      checks.recovery_system = {
        status: 'warn',
        message: 'Recovery management not configured',
        duration: 0
      }
      return checks
    }
    
    try {
      const activeSessions = this.recoveryManager.getActiveSessions()
      const stats = this.recoveryManager.getRecoveryStats('24h')
      
      checks.recovery_sessions = {
        status: activeSessions.length === 0 ? 'pass' : activeSessions.length < 3 ? 'warn' : 'fail',
        message: `Active recovery sessions: ${activeSessions.length}`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          activeSessions: activeSessions.length,
          totalRecoveries24h: stats.totalRecoveries,
          successRate: stats.successRate
        } : undefined
      }
      
      checks.recovery_effectiveness = {
        status: stats.successRate > 80 ? 'pass' : stats.successRate > 60 ? 'warn' : 'fail',
        message: `Recovery success rate: ${stats.successRate.toFixed(1)}%`,
        duration: 0,
        details: this.config.enableDetailedResponses ? stats : undefined
      }
      
    } catch (error) {
      checks.recovery_system = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Recovery health check failed',
        duration: 0
      }
    }
    
    return checks
  }

  private async performPerformanceHealthCheck(): Promise<{
    checks: HealthCheckResponse['checks']
    metrics: Record<string, number>
  }> {
    const checks: HealthCheckResponse['checks'] = {}
    const metrics: Record<string, number> = {}
    
    try {
      // Memory usage
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage()
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024
        const heapTotalMB = memUsage.heapTotal / 1024 / 1024
        
        metrics.memory_heap_used_mb = Math.round(heapUsedMB)
        metrics.memory_heap_total_mb = Math.round(heapTotalMB)
        metrics.memory_usage_percent = Math.round((heapUsedMB / heapTotalMB) * 100)
        
        checks.memory_usage = {
          status: heapUsedMB < 512 ? 'pass' : heapUsedMB < 1024 ? 'warn' : 'fail',
          message: `Memory usage: ${heapUsedMB.toFixed(1)}MB`,
          duration: 0,
          details: this.config.enableDetailedResponses ? {
            heapUsed: heapUsedMB,
            heapTotal: heapTotalMB,
            usagePercent: (heapUsedMB / heapTotalMB) * 100
          } : undefined
        }
      }
      
      // Uptime
      const uptimeHours = (Date.now() - this.startTime.getTime()) / (1000 * 60 * 60)
      metrics.uptime_hours = Math.round(uptimeHours * 100) / 100
      
      checks.system_uptime = {
        status: 'pass',
        message: `System uptime: ${uptimeHours.toFixed(1)} hours`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          startTime: this.startTime.toISOString(),
          uptimeHours
        } : undefined
      }
      
      // Error rate
      const recentErrors = this.errorLogger.getErrors({
        since: new Date(Date.now() - 3600000), // Last hour
        limit: 100
      })
      
      const errorRate = recentErrors.length
      metrics.errors_per_hour = errorRate
      
      checks.error_rate = {
        status: errorRate < 10 ? 'pass' : errorRate < 50 ? 'warn' : 'fail',
        message: `Error rate: ${errorRate} errors/hour`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          errorsLastHour: errorRate,
          criticalErrors: recentErrors.filter(e => e.severity === 'critical').length
        } : undefined
      }
      
    } catch (error) {
      checks.performance_monitoring = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Performance monitoring failed',
        duration: 0
      }
    }
    
    return { checks, metrics }
  }

  private async performSecurityHealthCheck(): Promise<HealthCheckResponse['checks']> {
    const checks: HealthCheckResponse['checks'] = {}
    
    try {
      // Authentication status
      checks.authentication = {
        status: this.config.enableAuth ? 'pass' : 'warn',
        message: this.config.enableAuth 
          ? 'Authentication enabled'
          : 'Authentication disabled',
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          authEnabled: this.config.enableAuth,
          apiKeyConfigured: !!this.config.apiKey
        } : undefined
      }
      
      // Rate limiting
      checks.rate_limiting = {
        status: this.config.enableRateLimit ? 'pass' : 'warn',
        message: this.config.enableRateLimit
          ? `Rate limiting enabled (${this.config.rateLimit}/min)`
          : 'Rate limiting disabled',
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          rateLimitEnabled: this.config.enableRateLimit,
          rateLimit: this.config.rateLimit
        } : undefined
      }
      
      // Recent security events
      const securityErrors = this.errorLogger.getErrors({
        category: 'authentication',
        since: new Date(Date.now() - 86400000) // Last 24 hours
      })
      
      checks.security_events = {
        status: securityErrors.length === 0 ? 'pass' : securityErrors.length < 10 ? 'warn' : 'fail',
        message: `Security events: ${securityErrors.length} in last 24h`,
        duration: 0,
        details: this.config.enableDetailedResponses ? {
          securityEvents24h: securityErrors.length,
          authErrors: securityErrors.filter(e => e.message.includes('auth')).length
        } : undefined
      }
      
    } catch (error) {
      checks.security_monitoring = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Security monitoring failed',
        duration: 0
      }
    }
    
    return checks
  }

  private getSystemAlerts(): HealthCheckResponse['alerts'] {
    const alerts: HealthCheckResponse['alerts'] = []
    
    try {
      // Get alerts from sync monitor
      const healthStatus = this.syncMonitor.getHealthStatus()
      
      healthStatus.alerts.forEach(alert => {
        alerts.push({
          id: alert.id,
          severity: alert.severity as any,
          message: alert.message,
          timestamp: alert.timestamp.toISOString()
        })
      })
      
    } catch (error) {
      // Ignore errors getting alerts
    }
    
    return alerts
  }

  private determineOverallStatus(checks: HealthCheckResponse['checks']): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(checks).map(check => check.status)
    
    if (statuses.some(status => status === 'fail')) {
      return 'unhealthy'
    } else if (statuses.some(status => status === 'warn')) {
      return 'degraded'
    } else {
      return 'healthy'
    }
  }

  private createErrorResponse(message: string): HealthCheckResponse {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: Date.now() - this.startTime.getTime(),
      checks: {
        error: {
          status: 'fail',
          message,
          duration: 0
        }
      }
    }
  }

  private checkRateLimit(ip: string): boolean {
    const now = new Date()
    const entry = this.rateLimitMap.get(ip)
    
    if (!entry || now >= entry.resetTime) {
      // Reset or create new entry
      this.rateLimitMap.set(ip, {
        count: 1,
        resetTime: new Date(now.getTime() + 60000) // 1 minute from now
      })
      return true
    } else if (entry.count < this.config.rateLimit) {
      // Increment count
      entry.count++
      return true
    } else {
      // Rate limit exceeded
      return false
    }
  }

  private authenticateRequest(apiKey?: string): boolean {
    if (!this.config.enableAuth) {
      return true
    }
    
    return apiKey === this.config.apiKey
  }

  private cleanupCacheAndRateLimits(): void {
    const now = new Date()
    
    // Clean up expired cache entries
    for (const [key, cached] of this.healthCheckCache) {
      if (now.getTime() - cached.timestamp.getTime() >= cached.ttl) {
        this.healthCheckCache.delete(key)
      }
    }
    
    // Clean up expired rate limit entries
    for (const [ip, entry] of this.rateLimitMap) {
      if (now >= entry.resetTime) {
        this.rateLimitMap.delete(ip)
      }
    }
  }
}

export default HealthCheckEndpoints