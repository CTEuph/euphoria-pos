/**
 * Monitoring services index
 * Exports all monitoring and health check components
 */

// Core monitoring services
export { SyncMonitor } from './SyncMonitor'
export type { 
  SyncMonitorConfig,
  HealthStatus,
  HealthCheck,
  SyncMetrics,
  Alert,
  RecoveryAction
} from './SyncMonitor'

// Metrics collection
export { MetricsCollector } from './MetricsCollector'
export type {
  SyncHealthMetrics,
  AggregatedMetrics,
  PerformanceTrend,
  HealthScore,
  MetricsConfig
} from './MetricsCollector'

// Queue monitoring
export { default as QueueMonitor } from './QueueMonitor'
export type {
  QueueStats,
  QueuePerformanceMetrics,
  QueueAlert,
  QueueItemAnalysis
} from './QueueMonitor'

// Latency monitoring
export { default as LatencyMonitor } from './LatencyMonitor'
export type {
  LatencyMeasurement,
  LatencyStats,
  LatencyBreakdown,
  LatencyAlert,
  PerformanceTrend as LatencyTrend
} from './LatencyMonitor'

// Error logging
export { default as ErrorLogger } from './ErrorLogger'
export type {
  ErrorSeverity,
  ErrorCategory,
  DetailedErrorEntry,
  ErrorPattern,
  ErrorSummary,
  ErrorTrend
} from './ErrorLogger'

// Backup monitoring
export { default as BackupMonitor } from './BackupMonitor'
export type {
  BackupType,
  BackupStatus,
  BackupEntry,
  BackupStats,
  BackupHealth,
  BackupVerificationResult
} from './BackupMonitor'

// Data integrity verification
export { default as IntegrityVerifier } from './IntegrityVerifier'
export type {
  IntegrityCheckType,
  IntegrityIssueSeverity,
  IntegrityCheckResult,
  IntegrityReport,
  DataConsistencyCheck,
  BusinessRuleValidation
} from './IntegrityVerifier'

// Recovery management
export { default as RecoveryManager } from './RecoveryManager'
export type {
  RecoveryScenarioType,
  RecoveryActionResult,
  RecoveryScenario,
  RecoveryAction,
  RecoveryContext,
  RecoverySession,
  RecoveryStats
} from './RecoveryManager'

// Health check endpoints
export { default as HealthCheckEndpoints } from './HealthCheckEndpoints'
export type {
  HealthCheckEndpoint,
  HealthCheckResponse,
  HealthCheckEndpointConfig
} from './HealthCheckEndpoints'

/**
 * Utility function to create a complete monitoring setup
 */
export function createMonitoringServices(config: {
  localDb: any
  supabaseClient: any
  syncEngine: any
  enableAdvanced?: boolean
}) {
  const {
    localDb,
    supabaseClient,
    syncEngine,
    enableAdvanced = true
  } = config

  // Core services
  const syncMonitor = new SyncMonitor(
    localDb,
    supabaseClient,
    syncEngine
  )

  const metricsCollector = new MetricsCollector(
    localDb,
    {
      enableDetailedCollection: enableAdvanced,
      enableSystemMetrics: true,
      enableNetworkMetrics: true,
      retentionDays: 30,
      aggregationIntervals: ['hourly', 'daily', 'weekly']
    }
  )

  const errorLogger = new ErrorLogger(
    localDb,
    {
      enableAutoCategorization: true,
      enablePatternDetection: true,
      enableAutoRecovery: false,
      logLevel: 'low'
    }
  )

  // Advanced services (optional)
  let queueMonitor: QueueMonitor | undefined
  let latencyMonitor: LatencyMonitor | undefined
  let backupMonitor: BackupMonitor | undefined
  let integrityVerifier: IntegrityVerifier | undefined
  let recoveryManager: RecoveryManager | undefined
  let healthCheckEndpoints: HealthCheckEndpoints | undefined

  if (enableAdvanced) {
    queueMonitor = new QueueMonitor(localDb, {
      depthThreshold: 50,
      processingRateThreshold: 10,
      enableAnalytics: true
    })

    latencyMonitor = new LatencyMonitor({
      alertThreshold: 60000, // 60 seconds
      criticalThreshold: 120000, // 2 minutes
      enableDetailedTracking: true
    })

    backupMonitor = new BackupMonitor(
      localDb,
      supabaseClient,
      {
        enableBackupVerification: true,
        alertOnFailure: true,
        compressionEnabled: true
      }
    )

    integrityVerifier = new IntegrityVerifier(
      localDb,
      supabaseClient,
      {
        enableAutoVerification: true,
        enableDeepVerification: false,
        verificationInterval: 3600000 // 1 hour
      }
    )

    recoveryManager = new RecoveryManager(
      localDb,
      supabaseClient,
      syncEngine,
      syncMonitor,
      errorLogger,
      {
        enableAutoRecovery: true,
        enableAnalytics: true
      }
    )

    healthCheckEndpoints = new HealthCheckEndpoints(
      {
        localDb,
        supabaseClient,
        syncEngine,
        syncMonitor,
        errorLogger,
        backupMonitor,
        integrityVerifier,
        recoveryManager
      },
      {
        enabled: true,
        port: 3001,
        enableAuth: false,
        enableDetailedResponses: true,
        cacheTimeout: 30
      }
    )
  }

  return {
    // Core services
    syncMonitor,
    metricsCollector,
    errorLogger,

    // Advanced services
    queueMonitor,
    latencyMonitor,
    backupMonitor,
    integrityVerifier,
    recoveryManager,
    healthCheckEndpoints,

    // Utility functions
    async startAll() {
      console.log('Starting monitoring services...')
      
      try {
        await syncMonitor.start()
        
        if (enableAdvanced) {
          await queueMonitor?.start()
          await backupMonitor?.start()
          await integrityVerifier?.start()
          await recoveryManager?.start()
          await healthCheckEndpoints?.start()
        }
        
        console.log('All monitoring services started successfully')
      } catch (error) {
        console.error('Failed to start monitoring services:', error)
        throw error
      }
    },

    async stopAll() {
      console.log('Stopping monitoring services...')
      
      try {
        await syncMonitor.stop()
        
        if (enableAdvanced) {
          await queueMonitor?.stop()
          await backupMonitor?.stop()
          await integrityVerifier?.stop()
          await recoveryManager?.stop()
          await healthCheckEndpoints?.stop()
        }
        
        console.log('All monitoring services stopped')
      } catch (error) {
        console.error('Error stopping monitoring services:', error)
      }
    },

    getOverallHealth() {
      return {
        sync: syncMonitor.getHealthStatus(),
        backup: backupMonitor?.getBackupHealth(),
        integrity: integrityVerifier?.getLatestReport(),
        recovery: recoveryManager?.getRecoveryStats('24h'),
        errors: errorLogger.getErrorSummary(24)
      }
    }
  }
}

/**
 * Utility function to create a minimal monitoring setup
 */
export function createMinimalMonitoring(config: {
  localDb: any
  supabaseClient: any
  syncEngine: any
}) {
  return createMonitoringServices({
    ...config,
    enableAdvanced: false
  })
}