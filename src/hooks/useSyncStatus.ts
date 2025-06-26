/**
 * React hook for managing sync status and monitoring
 * Provides real-time sync status updates and controls
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { 
  SyncEngine, 
  SyncEngineStatus, 
  SyncResult 
} from '@/services/sync/SyncEngine'
import type { 
  SyncMonitor, 
  HealthStatus, 
  HealthCheck, 
  Alert as SyncAlert, 
  SyncMetrics,
  RecoveryAction 
} from '@/services/monitoring/SyncMonitor'

/**
 * Hook configuration
 */
export interface UseSyncStatusConfig {
  /** Auto-refresh interval (ms) */
  refreshInterval?: number
  
  /** Enable real-time updates */
  enableRealtime?: boolean
  
  /** Enable automatic error recovery */
  enableAutoRecovery?: boolean
}

/**
 * Hook return type
 */
export interface UseSyncStatusReturn {
  // Status data
  syncStatus: SyncEngineStatus | null
  healthStatus: {
    overall: HealthStatus
    checks: HealthCheck[]
    alerts: SyncAlert[]
    lastCheck: Date | null
  }
  currentMetrics: SyncMetrics | null
  recoveryActions: RecoveryAction[]
  
  // Loading and error states
  isLoading: boolean
  error: string | null
  isRefreshing: boolean
  
  // Controls
  forceSync: () => Promise<void>
  acknowledgeAlert: (alertId: string) => void
  executeRecovery: (actionId: string) => Promise<boolean>
  refreshStatus: () => Promise<void>
  
  // Real-time status
  isConnected: boolean
  lastUpdate: Date | null
}

/**
 * Custom hook for sync status management
 */
export function useSyncStatus(
  syncEngine: SyncEngine | null,
  syncMonitor: SyncMonitor | null,
  config: UseSyncStatusConfig = {}
): UseSyncStatusReturn {
  const {
    refreshInterval = 30000,
    enableRealtime = true,
    enableAutoRecovery = false
  } = config
  
  // State
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus | null>(null)
  const [healthStatus, setHealthStatus] = useState<{
    overall: HealthStatus
    checks: HealthCheck[]
    alerts: SyncAlert[]
    lastCheck: Date | null
  }>({
    overall: 'unknown',
    checks: [],
    alerts: [],
    lastCheck: null
  })
  const [currentMetrics, setCurrentMetrics] = useState<SyncMetrics | null>(null)
  const [recoveryActions, setRecoveryActions] = useState<RecoveryAction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  // Refs for cleanup
  const refreshIntervalRef = useRef<NodeJS.Timeout>()
  const eventListenersSetup = useRef(false)
  
  /**
   * Load all status data
   */
  const loadStatusData = useCallback(async () => {
    if (!syncEngine || !syncMonitor) {
      setIsLoading(false)
      return
    }
    
    try {
      setError(null)
      
      // Get sync engine status
      const engineStatus = syncEngine.getStatus()
      setSyncStatus(engineStatus)
      
      // Get health status
      const health = syncMonitor.getHealthStatus()
      setHealthStatus(health)
      
      // Get current metrics
      const metrics = syncMonitor.getCurrentMetrics()
      setCurrentMetrics(metrics)
      
      // Get recovery actions
      const actions = syncMonitor.getRecoveryActions()
      setRecoveryActions(actions)
      
      setIsConnected(engineStatus.isOnline)
      setLastUpdate(new Date())
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sync status'
      setError(errorMessage)
      console.error('Failed to load sync status:', err)
    } finally {
      setIsLoading(false)
    }
  }, [syncEngine, syncMonitor])
  
  /**
   * Setup real-time event listeners
   */
  const setupEventListeners = useCallback(() => {
    if (!syncEngine || !syncMonitor || eventListenersSetup.current) {
      return
    }
    
    console.log('Setting up sync status event listeners')
    
    // Sync engine events
    const handleSyncComplete = (result: SyncResult) => {
      console.log('Sync completed:', result)
      loadStatusData()
    }
    
    const handleSyncError = (error: any) => {
      console.log('Sync error:', error)
      setError(error instanceof Error ? error.message : 'Sync error occurred')
      loadStatusData()
    }
    
    const handleQueueUpdated = (queueInfo: any) => {
      setSyncStatus(prev => prev ? {
        ...prev,
        queueDepth: queueInfo.depth
      } : null)
    }
    
    // Monitor events
    const handleHealthCheckComplete = () => {
      loadStatusData()
    }
    
    const handleAlertCreated = (alert: SyncAlert) => {
      setHealthStatus(prev => ({
        ...prev,
        alerts: [...prev.alerts, alert]
      }))
      
      // Auto-recovery for critical alerts
      if (enableAutoRecovery && alert.severity === 'critical') {
        console.log('Auto-recovery triggered for critical alert:', alert.title)
        // Implement auto-recovery logic here
      }
    }
    
    const handleAlertResolved = (alert: SyncAlert) => {
      setHealthStatus(prev => ({
        ...prev,
        alerts: prev.alerts.filter(a => a.id !== alert.id)
      }))
    }
    
    const handleMetricsUpdated = (metrics: SyncMetrics) => {
      setCurrentMetrics(metrics)
    }
    
    // Attach listeners
    syncEngine.on('sync_complete', handleSyncComplete)
    syncEngine.on('sync_error', handleSyncError)
    syncEngine.on('queue_updated', handleQueueUpdated)
    
    syncMonitor.on('health_check_complete', handleHealthCheckComplete)
    syncMonitor.on('alert_created', handleAlertCreated)
    syncMonitor.on('alert_resolved', handleAlertResolved)
    syncMonitor.on('metrics_updated', handleMetricsUpdated)
    
    eventListenersSetup.current = true
    
    // Return cleanup function
    return () => {
      syncEngine.off('sync_complete', handleSyncComplete)
      syncEngine.off('sync_error', handleSyncError)
      syncEngine.off('queue_updated', handleQueueUpdated)
      
      syncMonitor.off('health_check_complete', handleHealthCheckComplete)
      syncMonitor.off('alert_created', handleAlertCreated)
      syncMonitor.off('alert_resolved', handleAlertResolved)
      syncMonitor.off('metrics_updated', handleMetricsUpdated)
      
      eventListenersSetup.current = false
    }
  }, [syncEngine, syncMonitor, enableAutoRecovery, loadStatusData])
  
  /**
   * Force sync operation
   */
  const forceSync = useCallback(async () => {
    if (!syncEngine) {
      throw new Error('Sync engine not available')
    }
    
    try {
      setError(null)
      console.log('Forcing sync operation...')
      await syncEngine.performFullSync()
      await loadStatusData()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to force sync'
      setError(errorMessage)
      throw err
    }
  }, [syncEngine, loadStatusData])
  
  /**
   * Acknowledge alert
   */
  const acknowledgeAlert = useCallback((alertId: string) => {
    if (!syncMonitor) {
      return
    }
    
    const success = syncMonitor.acknowledgeAlert(alertId)
    if (success) {
      setHealthStatus(prev => ({
        ...prev,
        alerts: prev.alerts.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      }))
    }
  }, [syncMonitor])
  
  /**
   * Execute recovery action
   */
  const executeRecovery = useCallback(async (actionId: string): Promise<boolean> => {
    if (!syncMonitor) {
      return false
    }
    
    try {
      setError(null)
      const success = await syncMonitor.executeRecoveryAction(actionId)
      if (success) {
        // Refresh status after recovery action
        await loadStatusData()
      }
      return success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Recovery action failed'
      setError(errorMessage)
      return false
    }
  }, [syncMonitor, loadStatusData])
  
  /**
   * Refresh status manually
   */
  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await loadStatusData()
      
      // Force health check
      if (syncMonitor) {
        await syncMonitor.forceHealthCheck()
      }
    } finally {
      setIsRefreshing(false)
    }
  }, [loadStatusData, syncMonitor])
  
  // Initial load and setup
  useEffect(() => {
    console.log('useSyncStatus: Initial setup')
    
    // Load initial data
    loadStatusData()
    
    // Setup event listeners if real-time is enabled
    let cleanup: (() => void) | undefined
    if (enableRealtime) {
      cleanup = setupEventListeners()
    }
    
    // Setup refresh interval
    if (refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(loadStatusData, refreshInterval)
    }
    
    return () => {
      if (cleanup) {
        cleanup()
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [loadStatusData, setupEventListeners, enableRealtime, refreshInterval])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [])
  
  return {
    // Status data
    syncStatus,
    healthStatus,
    currentMetrics,
    recoveryActions,
    
    // Loading and error states
    isLoading,
    error,
    isRefreshing,
    
    // Controls
    forceSync,
    acknowledgeAlert,
    executeRecovery,
    refreshStatus,
    
    // Real-time status
    isConnected,
    lastUpdate
  }
}

export default useSyncStatus