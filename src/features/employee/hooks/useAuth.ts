/**
 * useAuth Hook - React hook for managing authentication state
 * Provides convenient interface to authentication store and IPC methods
 * Designed for macOS Electron app with automatic activity tracking
 */

import { useCallback, useEffect } from 'react'
import { useAuthStore, authSelectors } from '../store/authStore'
import type { LoginCredentials, LoginResult, PermissionKey } from '../types'

export interface UseAuthReturn {
  // State
  currentUser: ReturnType<typeof authSelectors.getCurrentUser>
  isAuthenticated: boolean
  isSessionExpired: boolean
  permissions: ReturnType<typeof useAuthStore.getState>['permissions']
  
  // User info
  userRole: ReturnType<typeof authSelectors.getUserRole>
  userFullName: ReturnType<typeof authSelectors.getUserFullName>
  isManagerOrAbove: boolean
  isOwner: boolean
  
  // Session info
  sessionDuration: number
  timeSinceLastActivity: number
  remainingSessionTime: number
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<LoginResult>
  logout: () => void
  updateActivity: () => void
  extendSession: () => void
  
  // Permission checks
  canPerformAction: (action: PermissionKey) => boolean
  requiresPermission: (action: PermissionKey) => void
  hasRole: (requiredRole: 'cashier' | 'manager' | 'owner') => boolean
  hasPermission: (permission: string) => boolean
  
  // Session management
  checkSessionTimeout: () => boolean
  handleSessionExpiry: () => void
}

/**
 * React hook for authentication management
 * Automatically tracks user activity and manages session state
 */
export function useAuth(): UseAuthReturn {
  // Get store state and actions
  const {
    currentUser,
    isAuthenticated,
    isSessionExpired,
    permissions,
    login: storeLogin,
    logout: storeLogout,
    updateActivity: storeUpdateActivity,
    extendSession: storeExtendSession,
    checkSessionTimeout: storeCheckSessionTimeout,
    clearExpiredSession,
    canPerformAction: storeCanPerformAction,
    getSessionDuration,
    getTimeSinceLastActivity
  } = useAuthStore()

  // Activity tracking - update activity on any hook usage
  useEffect(() => {
    if (isAuthenticated && !isSessionExpired) {
      storeUpdateActivity()
    }
  }, [isAuthenticated, isSessionExpired, storeUpdateActivity])

  // Login action with IPC integration
  const login = useCallback(async (credentials: LoginCredentials): Promise<LoginResult> => {
    try {
      // Check if Electron API is available
      if (!window.electron?.auth?.login) {
        console.error('Electron auth API is not available')
        return {
          success: false,
          error: 'Authentication system not available. Please restart the application.'
        }
      }

      // Call Electron IPC authentication
      const result = await window.electron.auth.login(credentials)
      
      if (result.success && result.employee) {
        // Update store state
        storeLogin(result)
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication system error'
      console.error('Login error:', error)
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [storeLogin])

  // Logout action
  const logout = useCallback(() => {
    storeLogout()
  }, [storeLogout])

  // Update activity wrapper
  const updateActivity = useCallback(() => {
    if (isAuthenticated && !isSessionExpired) {
      storeUpdateActivity()
    }
  }, [isAuthenticated, isSessionExpired, storeUpdateActivity])

  // Extend session wrapper
  const extendSession = useCallback(() => {
    if (isAuthenticated) {
      storeExtendSession()
    }
  }, [isAuthenticated, storeExtendSession])

  // Permission check wrapper
  const canPerformAction = useCallback((action: PermissionKey): boolean => {
    return storeCanPerformAction(action)
  }, [storeCanPerformAction])

  // Permission requirement checker - throws if user lacks permission
  const requiresPermission = useCallback((action: PermissionKey): void => {
    if (!isAuthenticated) {
      throw new Error('Authentication required')
    }
    
    if (!canPerformAction(action)) {
      const userRole = currentUser?.role || 'unknown'
      throw new Error(`Permission denied: ${action} requires higher privileges than ${userRole}`)
    }
  }, [isAuthenticated, canPerformAction, currentUser?.role])

  // Session timeout check wrapper
  const checkSessionTimeout = useCallback((): boolean => {
    return storeCheckSessionTimeout()
  }, [storeCheckSessionTimeout])

  // Handle session expiry
  const handleSessionExpiry = useCallback(() => {
    if (isSessionExpired) {
      clearExpiredSession()
    }
  }, [isSessionExpired, clearExpiredSession])

  // Role checking function
  const hasRole = useCallback((requiredRole: 'cashier' | 'manager' | 'owner'): boolean => {
    if (!isAuthenticated || !currentUser) return false
    
    const userRole = currentUser.role
    
    // Role hierarchy: owner > manager > cashier
    if (requiredRole === 'cashier') {
      return ['cashier', 'manager', 'owner'].includes(userRole)
    } else if (requiredRole === 'manager') {
      return ['manager', 'owner'].includes(userRole)
    } else if (requiredRole === 'owner') {
      return userRole === 'owner'
    }
    
    return false
  }, [isAuthenticated, currentUser])

  // Permission checking function
  const hasPermission = useCallback((permission: string): boolean => {
    if (!isAuthenticated || !permissions) return false
    
    // Map permission strings to actual permission properties
    const permissionMap: Record<string, keyof typeof permissions> = {
      'canProcessSales': 'canProcessSales',
      'canProcessRefunds': 'canProcessRefunds',
      'canVoidTransactions': 'canVoidTransactions',
      'canApplyDiscounts': 'canApplyDiscounts',
      'canOverridePrices': 'canOverridePrices',
      'canViewReports': 'canViewReports',
      'canManageInventory': 'canManageInventory',
      'canManageEmployees': 'canManageEmployees',
      'canAccessSettings': 'canAccessSettings',
      'canProcessReturns': 'canProcessReturns'
    }
    
    const permissionKey = permissionMap[permission]
    return permissionKey ? permissions[permissionKey] : false
  }, [isAuthenticated, permissions])

  // Computed values using selectors and store state
  const userRole = currentUser?.role || null
  const userFullName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : null
  const isManagerOrAbove = userRole === 'manager' || userRole === 'owner'
  const isOwner = userRole === 'owner'
  const remainingSessionTime = authSelectors.getRemainingSessionTime()
  
  // Session timing
  const sessionDuration = getSessionDuration()
  const timeSinceLastActivity = getTimeSinceLastActivity()

  return {
    // State
    currentUser,
    isAuthenticated,
    isSessionExpired,
    permissions,
    
    // User info
    userRole,
    userFullName,
    isManagerOrAbove,
    isOwner,
    
    // Session info
    sessionDuration,
    timeSinceLastActivity,
    remainingSessionTime,
    
    // Actions
    login,
    logout,
    updateActivity,
    extendSession,
    
    // Permission checks
    canPerformAction,
    requiresPermission,
    hasRole,
    hasPermission,
    
    // Session management
    checkSessionTimeout,
    handleSessionExpiry
  }
}

/**
 * Hook for checking if user has specific permission
 * Useful for conditional rendering based on permissions
 */
export function usePermission(action: PermissionKey): boolean {
  const { canPerformAction } = useAuth()
  return canPerformAction(action)
}

/**
 * Hook for requiring specific permission
 * Throws error if user lacks permission - useful for protected operations
 */
export function useRequirePermission(action: PermissionKey): void {
  const { requiresPermission } = useAuth()
  
  useEffect(() => {
    requiresPermission(action)
  }, [requiresPermission, action])
}

/**
 * Hook for session status monitoring
 * Returns session health information
 */
export function useSessionStatus() {
  const {
    isAuthenticated,
    isSessionExpired,
    sessionDuration,
    timeSinceLastActivity,
    remainingSessionTime,
    checkSessionTimeout
  } = useAuth()

  // Check for timeout on every render
  const hasTimedOut = checkSessionTimeout()

  return {
    isAuthenticated,
    isSessionExpired,
    hasTimedOut,
    sessionDuration,
    timeSinceLastActivity,
    remainingSessionTime,
    isNearExpiry: remainingSessionTime < 0.25, // Less than 15 seconds remaining
    sessionHealth: remainingSessionTime > 0.5 ? 'good' : remainingSessionTime > 0.25 ? 'warning' : 'critical'
  }
}