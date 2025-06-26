/**
 * AppInitializer component
 * Handles application initialization, session validation, and state restoration
 * Shows loading screen during initialization
 */

import { useState, useEffect } from 'react'
import { appInitializationService, type InitializationResult } from '../services/appInitializationService'

export interface AppInitializerProps {
  /** Child components to render after initialization */
  children: React.ReactNode
  /** Whether to show detailed initialization status (for debugging) */
  showDetailedStatus?: boolean
  /** Custom loading message */
  loadingMessage?: string
  /** Minimum loading time in milliseconds (for smooth UX) */
  minLoadingTime?: number
}

export function AppInitializer({
  children,
  showDetailedStatus = false,
  loadingMessage = "Initializing Euphoria POS...",
  minLoadingTime = 1000
}: AppInitializerProps) {
  const [isInitializing, setIsInitializing] = useState(true)
  const [initResult, setInitResult] = useState<InitializationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const initialize = async () => {
      const startTime = Date.now()
      
      try {
        console.log('Starting app initialization...')
        const result = await appInitializationService.initialize()
        
        setInitResult(result)
        
        if (!result.success && result.error) {
          setError(result.error)
        }
        
        // Ensure minimum loading time for smooth UX
        const elapsedTime = Date.now() - startTime
        if (elapsedTime < minLoadingTime) {
          await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsedTime))
        }
        
      } catch (err) {
        console.error('App initialization failed:', err)
        setError(err instanceof Error ? err.message : 'Unknown initialization error')
      } finally {
        setIsInitializing(false)
      }
    }

    initialize()
  }, [minLoadingTime])

  // Show loading screen during initialization
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center p-8">
          {/* Logo and title */}
          <div className="mb-8">
            <div className="w-20 h-20 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-3xl">E</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Euphoria POS
            </h1>
            <p className="text-slate-600">
              {loadingMessage}
            </p>
          </div>

          {/* Loading animation */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
          </div>

          {/* Detailed status (for debugging) */}
          {showDetailedStatus && initResult && (
            <div className="bg-white rounded-lg p-4 text-left text-sm max-w-md mx-auto">
              <h3 className="font-semibold mb-2">Initialization Status:</h3>
              <ul className="space-y-1 text-slate-600">
                <li>✅ Authentication system loaded</li>
                <li>{initResult.sessionRestored ? '✅' : '❌'} Session restored</li>
                <li>{initResult.sessionExpired ? '⚠️' : '✅'} Session validated</li>
                <li>📦 {initResult.preservedTransactionCount} preserved transactions</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show error screen if initialization failed
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-bold text-red-900 mb-2">
            Initialization Failed
          </h2>
          <p className="text-red-700 mb-6">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
          
          {/* Debug button for development */}
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => {
                appInitializationService.clearAllState()
                window.location.reload()
              }}
              className="ml-3 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Clear State & Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  // Initialization successful, render the app
  return <>{children}</>
}

/**
 * Hook to access initialization result
 * Useful for components that need to know about initialization status
 */
export function useInitialization() {
  const [initResult, setInitResult] = useState<InitializationResult | null>(null)

  useEffect(() => {
    // This would be set during initialization
    // For now, we'll just return current auth state
    const getCurrentStatus = (): InitializationResult => ({
      success: true,
      isAuthenticated: false, // This would come from auth store
      sessionRestored: false,
      sessionExpired: false,
      preservedTransactionCount: 0
    })

    setInitResult(getCurrentStatus())
  }, [])

  return {
    initResult,
    preservationStats: appInitializationService.getPreservationStats(),
    validateSession: appInitializationService.validateCurrentSession.bind(appInitializationService),
    clearAllState: appInitializationService.clearAllState.bind(appInitializationService)
  }
}