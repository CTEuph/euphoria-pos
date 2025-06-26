/**
 * useTransactionPreservation Hook
 * Manages automatic transaction preservation during authentication events
 * Integrates checkout store with authentication lifecycle
 */

import { useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { transactionPreservationService, type TransactionSnapshot } from '../services/transactionPreservationService'

export interface UseTransactionPreservationOptions {
  /** Whether to auto-preserve on logout/session expiry */
  autoPreserve?: boolean
  /** Whether to auto-restore most recent transaction on login */
  autoRestore?: boolean
  /** Callback when transaction is preserved */
  onTransactionPreserved?: (snapshot: TransactionSnapshot) => void
  /** Callback when transaction is restored */
  onTransactionRestored?: (snapshot: TransactionSnapshot) => void
  /** Callback when preservation fails */
  onPreservationError?: (error: Error) => void
}

export interface UseTransactionPreservationReturn {
  /** Manually preserve current transaction */
  preserveCurrentTransaction: () => void
  /** Restore a specific transaction */
  restoreTransaction: (snapshot: TransactionSnapshot) => void
  /** Get preserved transactions for current user */
  getPreservedTransactions: () => TransactionSnapshot[]
  /** Check if there are preserved transactions */
  hasPreservedTransactions: boolean
  /** Clear preserved transactions for current user */
  clearPreservedTransactions: () => void
  /** Get latest preserved transaction for current user */
  getLatestPreservedTransaction: () => TransactionSnapshot | null
}

/**
 * Hook for managing transaction preservation during authentication events
 * Automatically preserves cart state on logout/timeout and restores on login
 */
export function useTransactionPreservation(
  options: UseTransactionPreservationOptions = {}
): UseTransactionPreservationReturn {
  const {
    autoPreserve = true,
    autoRestore = true,
    onTransactionPreserved,
    onTransactionRestored,
    onPreservationError
  } = options

  const { currentUser, isAuthenticated, isSessionExpired } = useAuth()
  const checkoutStore = useCheckoutStore()

  // Get current employee ID
  const currentEmployeeId = currentUser?.id

  // Manually preserve current transaction
  const preserveCurrentTransaction = useCallback(() => {
    if (!currentEmployeeId) {
      onPreservationError?.(new Error('No authenticated user to preserve transaction for'))
      return
    }

    try {
      checkoutStore.preserveCurrentTransaction(currentEmployeeId)
      
      // Get the preserved transaction for callback
      const latest = transactionPreservationService.getLatestPreservedTransaction(currentEmployeeId)
      if (latest) {
        onTransactionPreserved?.(latest)
      }
    } catch (error) {
      onPreservationError?.(error as Error)
    }
  }, [currentEmployeeId, checkoutStore, onTransactionPreserved, onPreservationError])

  // Restore a specific transaction
  const restoreTransaction = useCallback((snapshot: TransactionSnapshot) => {
    try {
      checkoutStore.restoreTransaction(snapshot)
      onTransactionRestored?.(snapshot)
    } catch (error) {
      onPreservationError?.(error as Error)
    }
  }, [checkoutStore, onTransactionRestored, onPreservationError])

  // Get preserved transactions for current user
  const getPreservedTransactions = useCallback(() => {
    if (!currentEmployeeId) return []
    return checkoutStore.getPreservedTransactions(currentEmployeeId)
  }, [currentEmployeeId, checkoutStore])

  // Check if there are preserved transactions
  const hasPreservedTransactions = useCallback(() => {
    if (!currentEmployeeId) return false
    return checkoutStore.hasPreservedTransactions(currentEmployeeId)
  }, [currentEmployeeId, checkoutStore])()

  // Clear preserved transactions for current user
  const clearPreservedTransactions = useCallback(() => {
    if (!currentEmployeeId) return
    checkoutStore.clearPreservedTransactions(currentEmployeeId)
  }, [currentEmployeeId, checkoutStore])

  // Get latest preserved transaction for current user
  const getLatestPreservedTransaction = useCallback(() => {
    if (!currentEmployeeId) return null
    return transactionPreservationService.getLatestPreservedTransaction(currentEmployeeId)
  }, [currentEmployeeId])

  // Auto-preserve on session expiry
  useEffect(() => {
    if (autoPreserve && isSessionExpired && currentEmployeeId) {
      // Session has expired - preserve current transaction
      preserveCurrentTransaction()
    }
  }, [autoPreserve, isSessionExpired, currentEmployeeId, preserveCurrentTransaction])

  // Auto-restore on login
  useEffect(() => {
    if (autoRestore && isAuthenticated && currentEmployeeId) {
      // User just logged in - check for preserved transactions
      const latest = transactionPreservationService.getLatestPreservedTransaction(currentEmployeeId)
      
      if (latest) {
        // Only restore if current cart is empty
        const currentCart = checkoutStore.cart
        if (currentCart.length === 0) {
          restoreTransaction(latest)
        }
      }
    }
  }, [autoRestore, isAuthenticated, currentEmployeeId, restoreTransaction, checkoutStore.cart])

  // Auto-preserve on logout (when user goes from authenticated to not authenticated)
  useEffect(() => {
    let previousEmployeeId: string | undefined = undefined
    
    return () => {
      // This cleanup function runs when the effect is re-run or component unmounts
      if (autoPreserve && previousEmployeeId && !currentEmployeeId) {
        // User logged out - preserve transaction for the previous user
        try {
          const state = checkoutStore
          if (state.cart.length > 0) {
            checkoutStore.preserveCurrentTransaction(previousEmployeeId)
          }
        } catch (error) {
          onPreservationError?.(error as Error)
        }
      }
      previousEmployeeId = currentEmployeeId
    }
  }, [autoPreserve, currentEmployeeId, checkoutStore, onPreservationError])

  return {
    preserveCurrentTransaction,
    restoreTransaction,
    getPreservedTransactions,
    hasPreservedTransactions,
    clearPreservedTransactions,
    getLatestPreservedTransaction
  }
}

/**
 * Simple hook for checking if there are preserved transactions for current user
 */
export function useHasPreservedTransactions(): boolean {
  const { hasPreservedTransactions } = useTransactionPreservation({ 
    autoPreserve: false, 
    autoRestore: false 
  })
  return hasPreservedTransactions
}

/**
 * Hook for getting preservation statistics
 */
export function usePreservationStats() {
  const stats = transactionPreservationService.getPreservationStats()
  return stats
}