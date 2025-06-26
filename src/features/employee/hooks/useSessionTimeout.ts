/**
 * useSessionTimeout Hook - Automatic session timeout management
 * Monitors user activity and handles session expiration for POS security
 * Designed for macOS Electron app with 1-minute timeout requirement
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useAuth } from './useAuth'

export interface UseSessionTimeoutOptions {
  /** Timeout duration in minutes (default: 1) */
  timeoutMinutes?: number
  /** Callback when session expires */
  onSessionExpire?: () => void
  /** Callback when session is about to expire */
  onSessionWarning?: (secondsRemaining: number) => void
  /** Warning threshold in seconds (default: 15) */
  warningThresholdSeconds?: number
  /** Whether to automatically logout on expiry (default: true) */
  autoLogout?: boolean
}

export interface UseSessionTimeoutReturn {
  /** Current session status */
  isActive: boolean
  /** Whether session has expired */
  isExpired: boolean
  /** Whether session is near expiry */
  isNearExpiry: boolean
  /** Seconds remaining until timeout */
  secondsRemaining: number
  /** Minutes remaining until timeout */
  minutesRemaining: number
  /** Reset the timeout timer */
  resetTimeout: () => void
  /** Extend the session */
  extendSession: () => void
  /** Manually trigger timeout */
  triggerTimeout: () => void
}

/**
 * Hook for managing session timeouts with activity tracking
 * Automatically monitors user activity and handles session expiration
 */
export function useSessionTimeout(options: UseSessionTimeoutOptions = {}): UseSessionTimeoutReturn {
  const {
    timeoutMinutes = 1, // 1 minute for POS security
    onSessionExpire,
    onSessionWarning,
    warningThresholdSeconds = 15,
    autoLogout = true
  } = options

  const {
    isAuthenticated,
    isSessionExpired,
    updateActivity,
    checkSessionTimeout,
    handleSessionExpiry,
    remainingSessionTime
  } = useAuth()

  // Internal state for tracking
  const [isNearExpiry, setIsNearExpiry] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const warningFiredRef = useRef(false)

  // Convert remaining time to seconds
  const secondsRemaining = Math.ceil(remainingSessionTime * 60)
  const minutesRemaining = Math.ceil(remainingSessionTime)

  // Reset timeout by updating activity
  const resetTimeout = useCallback(() => {
    if (isAuthenticated && !isSessionExpired) {
      updateActivity()
      setIsNearExpiry(false)
      warningFiredRef.current = false
    }
  }, [isAuthenticated, isSessionExpired, updateActivity])

  // Extend session (alias for resetTimeout)
  const extendSession = useCallback(() => {
    resetTimeout()
  }, [resetTimeout])

  // Manually trigger timeout
  const triggerTimeout = useCallback(() => {
    if (isAuthenticated) {
      handleSessionExpiry()
      onSessionExpire?.()
    }
  }, [isAuthenticated, handleSessionExpiry, onSessionExpire])

  // Monitor session status
  useEffect(() => {
    if (!isAuthenticated) {
      // Clear interval when not authenticated
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setIsNearExpiry(false)
      warningFiredRef.current = false
      return
    }

    // Set up monitoring interval (check every second)
    intervalRef.current = setInterval(() => {
      const hasTimedOut = checkSessionTimeout()
      
      if (hasTimedOut) {
        // Session has expired
        setIsNearExpiry(false)
        
        if (autoLogout) {
          handleSessionExpiry()
        }
        
        onSessionExpire?.()
        
        // Clear interval after timeout
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        // Check if we're near expiry
        const currentSecondsRemaining = Math.ceil(remainingSessionTime * 60)
        const nearExpiry = currentSecondsRemaining <= warningThresholdSeconds
        
        setIsNearExpiry(nearExpiry)
        
        // Fire warning callback once when threshold is reached
        if (nearExpiry && !warningFiredRef.current) {
          warningFiredRef.current = true
          onSessionWarning?.(currentSecondsRemaining)
        }
        
        // Reset warning flag if we move away from expiry
        if (!nearExpiry && warningFiredRef.current) {
          warningFiredRef.current = false
        }
      }
    }, 1000) // Check every second

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [
    isAuthenticated,
    checkSessionTimeout,
    handleSessionExpiry,
    onSessionExpire,
    onSessionWarning,
    warningThresholdSeconds,
    autoLogout,
    remainingSessionTime
  ])

  // Activity listeners for common user interactions
  useEffect(() => {
    if (!isAuthenticated) return

    // List of events that constitute user activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ]

    // Throttle activity updates to avoid excessive calls
    let lastActivityUpdate = 0
    const throttleMs = 1000 // Update at most once per second

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActivityUpdate > throttleMs) {
        lastActivityUpdate = now
        resetTimeout()
      }
    }

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true })
    })

    // Cleanup function
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
    }
  }, [isAuthenticated, resetTimeout])

  return {
    isActive: isAuthenticated && !isSessionExpired,
    isExpired: isSessionExpired,
    isNearExpiry,
    secondsRemaining: Math.max(0, secondsRemaining),
    minutesRemaining: Math.max(0, minutesRemaining),
    resetTimeout,
    extendSession,
    triggerTimeout
  }
}

/**
 * Simple hook for just checking if session is about to expire
 * Useful for showing warning indicators
 */
export function useSessionWarning(thresholdSeconds: number = 15): boolean {
  const { isNearExpiry } = useSessionTimeout({ warningThresholdSeconds: thresholdSeconds })
  return isNearExpiry
}

/**
 * Hook for getting remaining session time in a formatted string
 * Returns user-friendly time display
 */
export function useSessionTimeDisplay(): string {
  const { secondsRemaining, minutesRemaining, isActive } = useSessionTimeout()
  
  if (!isActive) return ''
  
  if (minutesRemaining >= 1) {
    return `${minutesRemaining}m`
  } else {
    return `${secondsRemaining}s`
  }
}