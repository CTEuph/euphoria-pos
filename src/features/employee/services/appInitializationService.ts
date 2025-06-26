/**
 * App Initialization Service
 * Handles session validation and state restoration on app startup
 * Ensures authentication state consistency across app restarts
 */

import { useAuthStore } from '../store/authStore'
import { TransactionPreservationService } from './transactionPreservationService'

export interface InitializationResult {
  /** Whether initialization was successful */
  success: boolean
  /** Current authentication status after initialization */
  isAuthenticated: boolean
  /** Session was restored from persistence */
  sessionRestored: boolean
  /** Session was expired and cleared */
  sessionExpired: boolean
  /** Number of preserved transactions found */
  preservedTransactionCount: number
  /** Any error that occurred during initialization */
  error?: string
}

export class AppInitializationService {
  private preservationService: TransactionPreservationService

  constructor(preservationService?: TransactionPreservationService) {
    this.preservationService = preservationService || new TransactionPreservationService()
  }

  /**
   * Initialize the application authentication state
   * Should be called once during app startup
   */
  async initialize(): Promise<InitializationResult> {
    try {
      console.log('Initializing Euphoria POS authentication...')
      
      const authStore = useAuthStore.getState()
      const result: InitializationResult = {
        success: true,
        isAuthenticated: false,
        sessionRestored: false,
        sessionExpired: false,
        preservedTransactionCount: 0
      }

      // Check if there's a persisted session
      if (authStore.currentUser && authStore.isAuthenticated) {
        console.log(`Found persisted session for ${authStore.currentUser.employeeCode}`)
        
        // Validate the session timeout
        const isSessionValid = this.validateSession()
        
        if (isSessionValid) {
          // Session is still valid, restore it
          result.isAuthenticated = true
          result.sessionRestored = true
          
          // Update activity to refresh the session
          authStore.updateActivity()
          
          console.log(`Session restored for ${authStore.currentUser.firstName} ${authStore.currentUser.lastName}`)
        } else {
          // Session has expired, clear it
          result.sessionExpired = true
          authStore.clearExpiredSession()
          
          console.log(`Session expired for ${authStore.currentUser.firstName} ${authStore.currentUser.lastName}, cleared`)
        }
      } else {
        console.log('No persisted session found')
      }

      // Check for preserved transactions
      const preservedTransactions = this.preservationService.getAllPreservedTransactions()
      result.preservedTransactionCount = preservedTransactions.length

      if (preservedTransactions.length > 0) {
        console.log(`Found ${preservedTransactions.length} preserved transactions`)
        
        // Clean up old preserved transactions (older than 24 hours)
        this.cleanupOldTransactions()
      }

      // Log initialization summary
      console.log('App initialization complete:', {
        authenticated: result.isAuthenticated,
        sessionRestored: result.sessionRestored,
        sessionExpired: result.sessionExpired,
        preservedTransactions: result.preservedTransactionCount
      })

      return result
    } catch (error) {
      console.error('App initialization failed:', error)
      
      // Clear any corrupted state
      useAuthStore.getState().logout()
      
      return {
        success: false,
        isAuthenticated: false,
        sessionRestored: false,
        sessionExpired: false,
        preservedTransactionCount: 0,
        error: error instanceof Error ? error.message : 'Unknown initialization error'
      }
    }
  }

  /**
   * Validate the current session based on timeout rules
   */
  private validateSession(): boolean {
    const authStore = useAuthStore.getState()
    
    if (!authStore.isAuthenticated || !authStore.lastActivityTime) {
      return false
    }

    // Check if session has exceeded timeout
    const now = new Date()
    const timeSinceActivity = (now.getTime() - authStore.lastActivityTime.getTime()) / (1000 * 60)
    const hasTimedOut = timeSinceActivity > authStore.sessionTimeoutMinutes

    if (hasTimedOut) {
      console.log(`Session timeout: ${timeSinceActivity.toFixed(1)} minutes since last activity (limit: ${authStore.sessionTimeoutMinutes} minutes)`)
      return false
    }

    return true
  }

  /**
   * Clean up old preserved transactions
   */
  private cleanupOldTransactions(): void {
    try {
      const stats = this.preservationService.getPreservationStats()
      
      if (stats.oldestTransaction) {
        const now = new Date()
        const ageHours = (now.getTime() - stats.oldestTransaction.getTime()) / (1000 * 60 * 60)
        
        // Remove transactions older than 24 hours
        if (ageHours > 24) {
          const allTransactions = this.preservationService.getAllPreservedTransactions()
          const cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          
          let removedCount = 0
          allTransactions.forEach(transaction => {
            if (transaction.timestamp < cutoffTime) {
              this.preservationService.removePreservedTransaction(transaction.timestamp)
              removedCount++
            }
          })
          
          if (removedCount > 0) {
            console.log(`Cleaned up ${removedCount} old preserved transactions`)
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old transactions:', error)
    }
  }

  /**
   * Get preservation statistics for debugging
   */
  getPreservationStats() {
    return this.preservationService.getPreservationStats()
  }

  /**
   * Manual session validation - useful for testing
   */
  validateCurrentSession(): boolean {
    return this.validateSession()
  }

  /**
   * Force clear all application state - useful for troubleshooting
   */
  clearAllState(): void {
    console.log('Clearing all application state...')
    
    // Clear authentication
    useAuthStore.getState().logout()
    
    // Clear preserved transactions
    this.preservationService.clearAllPreservedTransactions()
    
    // Clear localStorage items
    localStorage.removeItem('euphoria-pos-auth')
    localStorage.removeItem('euphoria-pos-checkout')
    localStorage.removeItem('euphoria-pos-preserved-transactions')
    
    console.log('All application state cleared')
  }
}

// Export singleton instance
export const appInitializationService = new AppInitializationService()