/**
 * Transaction Preservation Service
 * Handles preservation and restoration of transaction data during session changes
 * Ensures cart state is maintained when employees login/logout/timeout
 */

import { CartItem, Customer } from '@/shared/lib/mockData'
import type { PreservedTransaction } from '../types'

export interface TransactionSnapshot {
  cart: CartItem[]
  customer: Customer | null
  subtotal: number
  tax: number
  total: number
  itemCount: number
  timestamp: Date
  preservedBy: string // employee ID
  sessionId?: string // optional session identifier
}

export interface PreservationOptions {
  /** Maximum number of preserved transactions to keep */
  maxPreservedTransactions?: number
  /** Maximum age of preserved transactions in hours */
  maxAgeHours?: number
  /** Whether to auto-restore the most recent transaction */
  autoRestore?: boolean
  /** Custom storage key prefix */
  storageKeyPrefix?: string
}

/**
 * Service for managing transaction preservation during session changes
 * Uses localStorage for persistence across app restarts
 */
export class TransactionPreservationService {
  private readonly storageKey: string
  private readonly options: Required<PreservationOptions>

  constructor(options: PreservationOptions = {}) {
    this.options = {
      maxPreservedTransactions: 5,
      maxAgeHours: 24,
      autoRestore: true,
      storageKeyPrefix: 'euphoria-pos-preserved',
      ...options
    }
    
    this.storageKey = `${this.options.storageKeyPrefix}-transactions`
  }

  /**
   * Preserve current transaction state
   */
  preserveTransaction(snapshot: TransactionSnapshot): void {
    try {
      const preserved = this.getPreservedTransactions()
      
      // Add new transaction to the beginning
      preserved.unshift({
        ...snapshot,
        timestamp: new Date()
      })
      
      // Clean up old transactions
      this.cleanupPreservedTransactions(preserved)
      
      // Save to storage
      localStorage.setItem(this.storageKey, JSON.stringify(preserved))
      
      console.log(`Transaction preserved for employee ${snapshot.preservedBy}: ${snapshot.itemCount} items, $${snapshot.total.toFixed(2)}`)
    } catch (error) {
      console.error('Failed to preserve transaction:', error)
    }
  }

  /**
   * Get the most recent preserved transaction for an employee
   */
  getLatestPreservedTransaction(employeeId?: string): TransactionSnapshot | null {
    try {
      const preserved = this.getPreservedTransactions()
      
      if (employeeId) {
        // Find latest transaction for specific employee
        return preserved.find(t => t.preservedBy === employeeId) || null
      } else {
        // Return most recent transaction
        return preserved[0] || null
      }
    } catch (error) {
      console.error('Failed to get preserved transaction:', error)
      return null
    }
  }

  /**
   * Get all preserved transactions
   */
  getAllPreservedTransactions(): TransactionSnapshot[] {
    return this.getPreservedTransactions()
  }

  /**
   * Get preserved transactions for a specific employee
   */
  getPreservedTransactionsForEmployee(employeeId: string): TransactionSnapshot[] {
    try {
      const preserved = this.getPreservedTransactions()
      return preserved.filter(t => t.preservedBy === employeeId)
    } catch (error) {
      console.error('Failed to get employee transactions:', error)
      return []
    }
  }

  /**
   * Remove a specific preserved transaction
   */
  removePreservedTransaction(timestamp: Date, employeeId?: string): boolean {
    try {
      const preserved = this.getPreservedTransactions()
      const initialLength = preserved.length
      
      const filtered = preserved.filter(t => {
        const isTargetTransaction = t.timestamp.getTime() === timestamp.getTime()
        const employeeMatch = employeeId ? t.preservedBy === employeeId : true
        
        // Keep transaction if it's NOT the target or if employee doesn't match
        return !(isTargetTransaction && employeeMatch)
      })
      
      if (filtered.length < initialLength) {
        localStorage.setItem(this.storageKey, JSON.stringify(filtered))
        return true
      }
      
      return false
    } catch (error) {
      console.error('Failed to remove preserved transaction:', error)
      return false
    }
  }

  /**
   * Clear all preserved transactions
   */
  clearAllPreservedTransactions(): void {
    try {
      localStorage.removeItem(this.storageKey)
      console.log('All preserved transactions cleared')
    } catch (error) {
      console.error('Failed to clear preserved transactions:', error)
    }
  }

  /**
   * Clear preserved transactions for a specific employee
   */
  clearPreservedTransactionsForEmployee(employeeId: string): void {
    try {
      const preserved = this.getPreservedTransactions()
      const filtered = preserved.filter(t => t.preservedBy !== employeeId)
      
      localStorage.setItem(this.storageKey, JSON.stringify(filtered))
      console.log(`Cleared preserved transactions for employee ${employeeId}`)
    } catch (error) {
      console.error('Failed to clear employee transactions:', error)
    }
  }

  /**
   * Check if there are any preserved transactions available
   */
  hasPreservedTransactions(employeeId?: string): boolean {
    try {
      const preserved = this.getPreservedTransactions()
      
      if (employeeId) {
        return preserved.some(t => t.preservedBy === employeeId)
      }
      
      return preserved.length > 0
    } catch (error) {
      console.error('Failed to check preserved transactions:', error)
      return false
    }
  }

  /**
   * Get summary statistics of preserved transactions
   */
  getPreservationStats(): {
    totalTransactions: number
    totalValue: number
    totalItems: number
    oldestTransaction: Date | null
    newestTransaction: Date | null
    employeeCount: number
  } {
    try {
      const preserved = this.getPreservedTransactions()
      
      if (preserved.length === 0) {
        return {
          totalTransactions: 0,
          totalValue: 0,
          totalItems: 0,
          oldestTransaction: null,
          newestTransaction: null,
          employeeCount: 0
        }
      }
      
      const totalValue = preserved.reduce((sum, t) => sum + t.total, 0)
      const totalItems = preserved.reduce((sum, t) => sum + t.itemCount, 0)
      const employees = new Set(preserved.map(t => t.preservedBy))
      
      return {
        totalTransactions: preserved.length,
        totalValue,
        totalItems,
        oldestTransaction: preserved[preserved.length - 1].timestamp,
        newestTransaction: preserved[0].timestamp,
        employeeCount: employees.size
      }
    } catch (error) {
      console.error('Failed to get preservation stats:', error)
      return {
        totalTransactions: 0,
        totalValue: 0,
        totalItems: 0,
        oldestTransaction: null,
        newestTransaction: null,
        employeeCount: 0
      }
    }
  }

  /**
   * Get preserved transactions from localStorage
   */
  private getPreservedTransactions(): TransactionSnapshot[] {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (!stored) return []
      
      const parsed = JSON.parse(stored)
      
      // Convert timestamp strings back to Date objects
      return parsed.map((t: any) => ({
        ...t,
        timestamp: new Date(t.timestamp)
      }))
    } catch (error) {
      console.error('Failed to parse preserved transactions:', error)
      return []
    }
  }

  /**
   * Clean up old and excess preserved transactions
   */
  private cleanupPreservedTransactions(transactions: TransactionSnapshot[]): void {
    const now = new Date()
    const maxAgeMs = this.options.maxAgeHours * 60 * 60 * 1000
    
    // Remove old transactions
    const filtered = transactions.filter(t => {
      const age = now.getTime() - t.timestamp.getTime()
      return age <= maxAgeMs
    })
    
    // Limit to maximum count
    if (filtered.length > this.options.maxPreservedTransactions) {
      filtered.splice(this.options.maxPreservedTransactions)
    }
    
    // Update the array in place
    transactions.length = 0
    transactions.push(...filtered)
  }
}

/**
 * Default instance of the preservation service
 */
export const transactionPreservationService = new TransactionPreservationService()

/**
 * Helper function to create a transaction snapshot from checkout store state
 */
export function createTransactionSnapshot(
  checkoutState: {
    cart: CartItem[]
    customer: Customer | null
    subtotal: number
    tax: number
    total: number
    itemCount: number
  },
  employeeId: string,
  sessionId?: string
): TransactionSnapshot {
  return {
    cart: checkoutState.cart.map(item => ({ ...item })), // Deep clone cart items
    customer: checkoutState.customer ? { ...checkoutState.customer } : null, // Clone customer
    subtotal: checkoutState.subtotal,
    tax: checkoutState.tax,
    total: checkoutState.total,
    itemCount: checkoutState.itemCount,
    timestamp: new Date(),
    preservedBy: employeeId,
    sessionId
  }
}

/**
 * Helper function to check if a transaction is worth preserving
 * Only preserve transactions with items in cart
 */
export function shouldPreserveTransaction(
  checkoutState: {
    cart: CartItem[]
    itemCount: number
    total: number
  }
): boolean {
  return checkoutState.cart.length > 0 && 
         checkoutState.itemCount > 0 && 
         checkoutState.total > 0
}