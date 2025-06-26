/**
 * IPC handlers for secure authentication operations
 * All PIN validation and employee management happens in main process for security
 */

import { ipcMain } from 'electron'
import { 
  validatePin,
  authenticateEmployee,
  createEmployee,
  resetEmployeePin,
  clearRateLimit,
  getRateLimitStatus,
  hashPin
} from '../../services/authService'
import type { 
  LoginCredentials,
  LoginResult,
  PinValidationResult,
  Employee,
  RateLimitState
} from '../../../src/features/employee/types'

/**
 * Setup all authentication-related IPC handlers
 */
export function setupAuthHandlers(): void {
  console.log('Setting up authentication IPC handlers...')

  /**
   * Authenticate employee with PIN
   * Returns employee data (without PIN hash) on success
   */
  ipcMain.handle('auth:login', async (
    _event, 
    credentials: LoginCredentials
  ): Promise<LoginResult> => {
    try {
      console.log('Processing authentication request')
      const result = await authenticateEmployee(credentials)
      
      // Log authentication attempt (success/failure) without sensitive data
      if (result.success) {
        console.log(`Authentication successful for employee: ${result.employee?.employeeCode}`)
      } else {
        console.log(`Authentication failed: ${result.error}`)
      }
      
      return result
    } catch (error) {
      console.error('Authentication error:', error)
      return {
        success: false,
        error: 'Authentication system error. Please try again.'
      }
    }
  })

  /**
   * Validate PIN for specific employee code
   * Used for additional validation or PIN verification
   */
  ipcMain.handle('auth:validate-pin', async (
    _event,
    employeeCode: string,
    pin: string
  ): Promise<PinValidationResult> => {
    try {
      return await validatePin(employeeCode, pin)
    } catch (error) {
      console.error('PIN validation error:', error)
      return {
        isValid: false,
        attemptsRemaining: 0
      }
    }
  })

  /**
   * Create new employee (admin function)
   * Requires elevated permissions in UI
   */
  ipcMain.handle('auth:create-employee', async (
    _event,
    employeeCode: string,
    firstName: string,
    lastName: string,
    plainPin: string,
    role: 'cashier' | 'manager' | 'owner' = 'cashier',
    createdByEmployeeId: string
  ): Promise<{ success: boolean; employee?: Employee; error?: string }> => {
    try {
      console.log(`Creating new employee: ${employeeCode} (${role}) by ${createdByEmployeeId}`)
      
      const employee = await createEmployee(employeeCode, firstName, lastName, plainPin, role)
      
      console.log(`Employee created successfully: ${employee.employeeCode}`)
      return {
        success: true,
        employee
      }
    } catch (error) {
      console.error('Employee creation failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create employee'
      }
    }
  })

  /**
   * Reset employee PIN (manager/owner function)
   * Requires elevated permissions in UI
   */
  ipcMain.handle('auth:reset-pin', async (
    _event,
    targetEmployeeId: string,
    newPlainPin: string,
    resetByEmployeeId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`PIN reset requested for employee ${targetEmployeeId} by ${resetByEmployeeId}`)
      
      const success = await resetEmployeePin(targetEmployeeId, newPlainPin, resetByEmployeeId)
      
      if (success) {
        console.log(`PIN reset successful for employee ${targetEmployeeId}`)
        return { success: true }
      } else {
        return { 
          success: false, 
          error: 'Failed to reset PIN. Employee may not exist.' 
        }
      }
    } catch (error) {
      console.error('PIN reset failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PIN reset failed'
      }
    }
  })

  /**
   * Clear rate limiting for an employee (admin function)
   * Used to unlock accounts that have been rate limited
   */
  ipcMain.handle('auth:clear-rate-limit', async (
    _event,
    employeeCode: string,
    clearedByEmployeeId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(`Clearing rate limit for ${employeeCode} by ${clearedByEmployeeId}`)
      
      clearRateLimit(employeeCode)
      
      console.log(`Rate limit cleared for ${employeeCode}`)
      return { success: true }
    } catch (error) {
      console.error('Failed to clear rate limit:', error)
      return {
        success: false,
        error: 'Failed to clear rate limit'
      }
    }
  })

  /**
   * Get rate limiting status for debugging/admin purposes
   */
  ipcMain.handle('auth:get-rate-limit-status', async (
    _event,
    employeeCode: string
  ): Promise<RateLimitState> => {
    try {
      return getRateLimitStatus(employeeCode)
    } catch (error) {
      console.error('Failed to get rate limit status:', error)
      return {
        attempts: [],
        isLocked: false
      }
    }
  })

  /**
   * Hash a PIN (utility function for testing or admin tools)
   * Should be used sparingly and only by admin functions
   */
  ipcMain.handle('auth:hash-pin', async (
    _event,
    plainPin: string
  ): Promise<{ success: boolean; hash?: string; error?: string }> => {
    try {
      const hash = await hashPin(plainPin)
      return {
        success: true,
        hash
      }
    } catch (error) {
      console.error('PIN hashing failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'PIN hashing failed'
      }
    }
  })

  /**
   * Session-related handlers (lightweight for desktop app)
   */
  
  /**
   * Log user activity for session timeout tracking
   * This just logs activity - timeout is handled in renderer
   */
  ipcMain.handle('auth:log-activity', async (
    _event,
    employeeId: string,
    activity: string
  ): Promise<void> => {
    // Simple activity logging for debugging
    console.log(`Activity: ${activity} by employee ${employeeId} at ${new Date().toISOString()}`)
  })

  /**
   * Security audit: Get recent authentication events for admin review
   * Returns sanitized log data without sensitive information
   */
  ipcMain.handle('auth:get-recent-activity', async (
    _event,
    limit: number = 50
  ): Promise<any[]> => {
    // For now, return empty array - real implementation would query logs
    // This is a placeholder for future audit functionality
    console.log(`Recent activity requested (limit: ${limit})`)
    return []
  })

  console.log('Authentication IPC handlers setup complete')
}

/**
 * Cleanup function to remove all auth handlers
 */
export function removeAuthHandlers(): void {
  const handlers = [
    'auth:login',
    'auth:validate-pin', 
    'auth:create-employee',
    'auth:reset-pin',
    'auth:clear-rate-limit',
    'auth:get-rate-limit-status',
    'auth:hash-pin',
    'auth:log-activity',
    'auth:get-recent-activity'
  ]
  
  handlers.forEach(channel => {
    ipcMain.removeAllListeners(channel)
  })
  
  console.log('Authentication IPC handlers removed')
}