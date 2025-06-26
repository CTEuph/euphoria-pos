/**
 * Comprehensive sync status panel for terminal operators
 * Provides real-time monitoring and control of sync operations
 */

import React, { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, CheckCircle, Clock, Database, Wifi, WifiOff, RefreshCw, Settings, TrendingUp, AlertCircle } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { 
  HealthStatus, 
  HealthCheck, 
  Alert as SyncAlert, 
  SyncMetrics,
  RecoveryAction 
} from '@/services/monitoring/SyncMonitor'
import type { SyncEngineStatus } from '@/services/sync/SyncEngine'

/**
 * Component props
 */
interface SyncStatusPanelProps {
  /** Current sync engine status */
  syncStatus: SyncEngineStatus
  
  /** Health check results */
  healthStatus: {
    overall: HealthStatus
    checks: HealthCheck[]
    alerts: SyncAlert[]
    lastCheck: Date | null
  }
  
  /** Current metrics */
  currentMetrics: SyncMetrics | null
  
  /** Available recovery actions */
  recoveryActions: RecoveryAction[]
  
  /** Event handlers */
  onForceSync?: () => void
  onAcknowledgeAlert?: (alertId: string) => void
  onExecuteRecovery?: (actionId: string) => void
  onRefreshStatus?: () => void
  
  /** Display configuration */
  showAdvanced?: boolean
  compactMode?: boolean
}

/**
 * Status indicator component
 */
const StatusIndicator: React.FC<{
  status: HealthStatus
  label: string
  details?: string
  size?: 'sm' | 'md' | 'lg'
}> = ({ status, label, details, size = 'md' }) => {
  const getStatusConfig = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' }
      case 'warning':
        return { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200' }
      case 'critical':
        return { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' }
      default:
        return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' }
    }
  }
  
  const config = getStatusConfig(status)
  const Icon = config.icon
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5', 
    lg: 'w-6 h-6'
  }
  
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg ${config.bg} ${config.border} border`}>
      <Icon className={`${sizeClasses[size]} ${config.color}`} />
      <div className="flex-1">
        <div className="font-medium text-sm">{label}</div>
        {details && <div className="text-xs text-gray-600">{details}</div>}
      </div>
    </div>
  )
}

/**
 * Metrics display component
 */
const MetricsDisplay: React.FC<{
  metrics: SyncMetrics | null
  compact?: boolean
}> = ({ metrics, compact = false }) => {
  if (!metrics) {
    return (
      <div className="text-center text-gray-500 py-4">
        No metrics available
      </div>
    )
  }
  
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>Queue: {metrics.queueDepth}</div>
        <div>Latency: {Math.round(metrics.syncLatency / 1000)}s</div>
      </div>
    )
  }
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{metrics.queueDepth}</div>
          <div className="text-sm text-gray-600">Queue Depth</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{Math.round(metrics.syncLatency / 1000)}s</div>
          <div className="text-sm text-gray-600">Last Sync</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{metrics.errorCount}</div>
          <div className="text-sm text-gray-600">Errors</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-bold">{metrics.successCount}</div>
          <div className="text-sm text-gray-600">Success</div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Alert list component
 */
const AlertsList: React.FC<{
  alerts: SyncAlert[]
  onAcknowledge?: (alertId: string) => void
}> = ({ alerts, onAcknowledge }) => {
  if (alerts.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4">
        No active alerts
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <Alert key={alert.id} variant={alert.severity === 'critical' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            {alert.title}
            {!alert.acknowledged && onAcknowledge && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAcknowledge(alert.id)}
              >
                Acknowledge
              </Button>
            )}
          </AlertTitle>
          <AlertDescription>
            {alert.message}
            <div className="text-xs text-gray-500 mt-1">
              {alert.timestamp.toLocaleString()}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/**
 * Recovery actions component
 */
const RecoveryActions: React.FC<{
  actions: RecoveryAction[]
  onExecute?: (actionId: string) => void
}> = ({ actions, onExecute }) => {
  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <Card key={action.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{action.name}</div>
                <div className="text-sm text-gray-600">{action.description}</div>
              </div>
              <Button
                variant={action.autoExecute ? "default" : "outline"}
                size="sm"
                onClick={() => onExecute?.(action.id)}
              >
                Execute
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * Main sync status panel component
 */
export const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({
  syncStatus,
  healthStatus,
  currentMetrics,
  recoveryActions,
  onForceSync,
  onAcknowledgeAlert,
  onExecuteRecovery,
  onRefreshStatus,
  showAdvanced = false,
  compactMode = false
}) => {
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState('overview')
  
  // Auto-refresh status
  useEffect(() => {
    const interval = setInterval(() => {
      onRefreshStatus?.()
    }, 30000) // Refresh every 30 seconds
    
    return () => clearInterval(interval)
  }, [onRefreshStatus])
  
  // Calculate overall status summary
  const statusSummary = useMemo(() => {
    const activeAlerts = healthStatus.alerts.filter(a => !a.acknowledged)
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical')
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning')
    
    return {
      isOnline: syncStatus.isOnline,
      isActive: syncStatus.isActive,
      hasIssues: healthStatus.overall !== 'healthy',
      criticalCount: criticalAlerts.length,
      warningCount: warningAlerts.length,
      queueDepth: syncStatus.queueDepth,
      lastSync: syncStatus.lastSyncAt
    }
  }, [syncStatus, healthStatus])
  
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefreshStatus?.()
    } finally {
      setRefreshing(false)
    }
  }
  
  // Compact mode display
  if (compactMode) {
    return (
      <Card className="w-full">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {statusSummary.isOnline ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              <div className="text-sm">
                <div className="font-medium">
                  {statusSummary.isActive ? 'Active' : 'Inactive'}
                </div>
                <div className="text-gray-600">
                  Queue: {statusSummary.queueDepth}
                </div>
              </div>
            </div>
            
            {statusSummary.hasIssues && (
              <Badge variant={statusSummary.criticalCount > 0 ? 'destructive' : 'secondary'}>
                {statusSummary.criticalCount + statusSummary.warningCount} issues
              </Badge>
            )}
            
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  // Full display mode
  return (
    <div className="w-full space-y-4">
      {/* Header with overall status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Sync Status
              </CardTitle>
              <CardDescription>
                Real-time synchronization monitoring
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onForceSync}>
                Force Sync
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusIndicator
              status={statusSummary.isOnline ? 'healthy' : 'critical'}
              label="Connection"
              details={statusSummary.isOnline ? 'Online' : 'Offline'}
            />
            
            <StatusIndicator
              status={statusSummary.isActive ? 'healthy' : 'warning'}
              label="Sync Engine"
              details={statusSummary.isActive ? 'Active' : 'Inactive'}
            />
            
            <StatusIndicator
              status={healthStatus.overall}
              label="Overall Health"
              details={`${statusSummary.criticalCount + statusSummary.warningCount} issues`}
            />
          </div>
          
          {statusSummary.lastSync && (
            <div className="mt-4 text-sm text-gray-600">
              Last sync: {statusSummary.lastSync.toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Tabbed detailed view */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {healthStatus.alerts.filter(a => !a.acknowledged).length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {healthStatus.alerts.filter(a => !a.acknowledged).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="recovery">Recovery</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {healthStatus.checks.map((check) => (
                  <StatusIndicator
                    key={check.component}
                    status={check.status}
                    label={check.component.replace('_', ' ').toUpperCase()}
                    details={check.message}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
          
          <MetricsDisplay metrics={currentMetrics} />
        </TabsContent>
        
        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>
                Monitor and acknowledge system alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertsList
                alerts={healthStatus.alerts}
                onAcknowledge={onAcknowledgeAlert}
              />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Real-time sync performance data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsDisplay metrics={currentMetrics} />
              
              {currentMetrics && showAdvanced && (
                <div className="mt-6 space-y-4">
                  <Separator />
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Network Latency</div>
                      <div className="text-gray-600">
                        {currentMetrics.networkLatency ? `${Math.round(currentMetrics.networkLatency)}ms` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">Memory Usage</div>
                      <div className="text-gray-600">
                        {currentMetrics.memoryUsage ? `${Math.round(currentMetrics.memoryUsage)}MB` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="recovery">
          <Card>
            <CardHeader>
              <CardTitle>Recovery Actions</CardTitle>
              <CardDescription>
                Available automated recovery procedures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RecoveryActions
                actions={recoveryActions}
                onExecute={onExecuteRecovery}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SyncStatusPanel