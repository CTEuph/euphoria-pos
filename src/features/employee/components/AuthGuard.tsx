/**
 * AuthGuard component to protect routes requiring authentication
 * Shows login screen when user is not authenticated
 * Automatically restores preserved transactions after login
 */

import { useEffect } from 'react'
import { LoginScreen } from './LoginScreen'
import { useAuth } from '../hooks/useAuth'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { TransactionPreservationService } from '../services/transactionPreservationService'

export interface AuthGuardProps {
  /** Child components to render when authenticated */
  children: React.ReactNode
  /** Whether authentication is required (default: true) */
  requireAuth?: boolean
  /** Minimum role required to access the protected content */
  requiredRole?: 'cashier' | 'manager' | 'owner'
  /** Custom message to show on login screen */
  loginMessage?: string
  /** Whether to automatically restore preserved transactions after login */
  autoRestoreTransactions?: boolean
}

export function AuthGuard({
  children,
  requireAuth = true,
  requiredRole,
  loginMessage,
  autoRestoreTransactions = true
}: AuthGuardProps) {
  const { isAuthenticated, currentUser, hasRole } = useAuth()
  const checkoutStore = useCheckoutStore()
  
  // Auto-restore preserved transactions after successful login
  useEffect(() => {
    if (isAuthenticated && currentUser && autoRestoreTransactions) {
      restorePreservedTransaction()
    }
  }, [isAuthenticated, currentUser, autoRestoreTransactions])

  const restorePreservedTransaction = () => {
    if (!currentUser) return

    try {
      const preservationService = new TransactionPreservationService()
      const preserved = preservationService.getLatestPreservedTransaction(currentUser.id)
      
      if (preserved) {
        // Restore the transaction to checkout store
        checkoutStore.restoreTransaction({
          cart: preserved.cart,
          customer: preserved.customer,
          subtotal: preserved.subtotal,
          tax: preserved.tax,
          total: preserved.total
        })
        
        // Remove the preserved transaction since it's been restored
        preservationService.removePreservedTransaction(preserved.timestamp)
        
        console.log(`Restored preserved transaction for ${currentUser.employeeCode}: ${preserved.itemCount} items, $${preserved.total.toFixed(2)}`)
      }
    } catch (error) {
      console.error('Failed to restore preserved transaction:', error)
    }
  }

  // If authentication is not required, render children directly
  if (!requireAuth) {
    return <>{children}</>
  }

  // If not authenticated, show login screen
  if (!isAuthenticated) {
    return (
      <LoginScreen 
        onLoginSuccess={(result) => {
          console.log('Login successful:', result.employee?.employeeCode)
        }}
        onLoginError={(error) => {
          console.error('Login failed:', error)
        }}
      />
    )
  }

  // If authenticated but doesn't have required role, show access denied
  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Access Denied
          </h2>
          <p className="text-slate-600 mb-4">
            You need {requiredRole} privileges to access this section.
          </p>
          <p className="text-sm text-slate-500">
            Current role: <span className="font-medium capitalize">{currentUser?.role}</span>
          </p>
        </div>
      </div>
    )
  }

  // User is authenticated and has required role, render protected content
  return <>{children}</>
}

/**
 * Hook to check if current user has required permissions for a specific action
 */
export function useAuthGuard() {
  const { isAuthenticated, hasRole, hasPermission } = useAuth()
  
  const requireAuth = (action?: string) => {
    if (!isAuthenticated) {
      throw new Error(`Authentication required${action ? ` for ${action}` : ''}`)
    }
  }
  
  const requireRole = (role: 'cashier' | 'manager' | 'owner', action?: string) => {
    requireAuth(action)
    if (!hasRole(role)) {
      throw new Error(`${role} role required${action ? ` for ${action}` : ''}`)
    }
  }
  
  const requirePermission = (permission: string, action?: string) => {
    requireAuth(action)
    if (!hasPermission(permission)) {
      throw new Error(`Permission '${permission}' required${action ? ` for ${action}` : ''}`)
    }
  }
  
  return {
    requireAuth,
    requireRole,
    requirePermission,
    canAccess: (role?: 'cashier' | 'manager' | 'owner') => {
      return isAuthenticated && (role ? hasRole(role) : true)
    }
  }
}