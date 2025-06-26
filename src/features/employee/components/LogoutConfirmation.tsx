/**
 * LogoutConfirmation component for secure logout with transaction preservation
 * Shows confirmation dialog with current transaction summary
 * Designed for POS touch interface with large buttons
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '../hooks/useAuth'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { cn } from '@/shared/lib/utils'

export interface LogoutConfirmationProps {
  /** Whether the confirmation dialog is open */
  isOpen: boolean
  /** Callback when dialog should be closed */
  onClose: () => void
  /** Callback when logout is confirmed */
  onConfirm: () => void
  /** Optional additional message to display */
  message?: string
  /** Whether to show transaction preservation info */
  showTransactionInfo?: boolean
  /** Custom class name */
  className?: string
}

export function LogoutConfirmation({
  isOpen,
  onClose,
  onConfirm,
  message,
  showTransactionInfo = true,
  className
}: LogoutConfirmationProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { currentUser, userFullName } = useAuth()
  const { cart, itemCount, total } = useCheckoutStore()

  const hasActiveTransaction = cart.length > 0 && itemCount > 0 && total > 0

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true)
    
    try {
      // Give user feedback
      await new Promise(resolve => setTimeout(resolve, 500))
      onConfirm()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={cn(
        "bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in fade-in-0 zoom-in-95 duration-200",
        className
      )}>
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">👋</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Confirm Logout
          </h2>
          <p className="text-slate-600">
            {userFullName ? `Logging out ${userFullName}` : 'Logging out current user'}
          </p>
        </div>

        {/* Custom message */}
        {message && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Transaction preservation info */}
        {showTransactionInfo && hasActiveTransaction && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-yellow-800 font-semibold mb-2 flex items-center gap-2">
              <span>⚠️</span>
              Active Transaction
            </h3>
            <div className="text-yellow-700 text-sm space-y-1">
              <p>{itemCount} item{itemCount !== 1 ? 's' : ''} in cart</p>
              <p className="font-medium">Total: ${total.toFixed(2)}</p>
              <p className="text-xs mt-2">
                Your transaction will be preserved and restored when you log back in.
              </p>
            </div>
          </div>
        )}

        {/* Warning for no active transaction */}
        {showTransactionInfo && !hasActiveTransaction && (
          <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-slate-600 text-sm flex items-center gap-2">
              <span>ℹ️</span>
              No active transaction to preserve
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={isLoggingOut}
            className="flex-1 h-14 text-lg"
          >
            Cancel
          </Button>
          
          <Button
            size="lg"
            onClick={handleConfirmLogout}
            disabled={isLoggingOut}
            className="flex-1 h-14 text-lg bg-orange-600 hover:bg-orange-700"
          >
            {isLoggingOut ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Logging out...
              </div>
            ) : (
              'Logout'
            )}
          </Button>
        </div>

        {/* Employee info */}
        {currentUser && (
          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-slate-500 text-sm">
              Employee: {currentUser.employeeCode} • {currentUser.role}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Simple logout button with built-in confirmation
 * Useful for integrating into headers or toolbars
 */
export interface LogoutButtonProps {
  /** Custom button text */
  children?: React.ReactNode
  /** Button variant */
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  /** Button size */
  size?: 'default' | 'sm' | 'lg'
  /** Whether to show confirmation dialog */
  requireConfirmation?: boolean
  /** Custom confirmation message */
  confirmationMessage?: string
  /** Custom class name */
  className?: string
}

export function LogoutButton({
  children = 'Logout',
  variant = 'ghost',
  size = 'default',
  requireConfirmation = true,
  confirmationMessage,
  className
}: LogoutButtonProps) {
  const [showConfirmation, setShowConfirmation] = useState(false)
  const { logout, currentUser } = useAuth()
  const checkoutStore = useCheckoutStore()

  const handleLogout = () => {
    if (requireConfirmation) {
      setShowConfirmation(true)
    } else {
      performLogout()
    }
  }

  const performLogout = () => {
    // Preserve transaction if there's an active cart
    if (currentUser && checkoutStore.cart.length > 0) {
      checkoutStore.preserveCurrentTransaction(currentUser.id)
    }
    
    logout()
    setShowConfirmation(false)
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleLogout}
        className={className}
        disabled={!currentUser}
      >
        {children}
      </Button>

      {requireConfirmation && (
        <LogoutConfirmation
          isOpen={showConfirmation}
          onClose={() => setShowConfirmation(false)}
          onConfirm={performLogout}
          message={confirmationMessage}
        />
      )}
    </>
  )
}