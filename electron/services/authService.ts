/**
 * Authentication service for PIN-based employee authentication
 * Handles PIN hashing, validation, and secure authentication operations
 */

import bcrypt from 'bcryptjs'
import { ulid } from 'ulid'
import { getLocalDatabase } from '../../src/db'
import { employees } from '../../src/db/local/schema'
import { eq } from 'drizzle-orm'
import type { 
  Employee, 
  LoginCredentials, 
  LoginResult, 
  PinValidationResult,
  AuthAttempt,
  RateLimitState 
} from '../../src/features/employee/types'

// Configuration constants
const BCRYPT_ROUNDS = 12 // Higher security for production
const MAX_LOGIN_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000 // 1 hour window for tracking attempts

// In-memory rate limiting store (could be moved to database if needed)
const rateLimitStore = new Map<string, RateLimitState>()

/**
 * Hash a PIN for secure storage
 */
export async function hashPin(pin: string): Promise<string> {
  if (!pin || pin.length < 3) {
    throw new Error('PIN must be at least 3 characters long')
  }
  
  try {
    return await bcrypt.hash(pin, BCRYPT_ROUNDS)
  } catch (error) {
    throw new Error('Failed to hash PIN')
  }
}

/**
 * Compare a plain PIN with a hashed PIN
 */
export async function comparePin(plainPin: string, hashedPin: string): Promise<boolean> {
  if (!plainPin || !hashedPin) {
    return false
  }
  
  try {
    return await bcrypt.compare(plainPin, hashedPin)
  } catch (error) {
    console.error('PIN comparison failed:', error)
    return false
  }
}

/**
 * Get rate limiting state for an employee code
 */
function getRateLimitState(employeeCode: string): RateLimitState {
  const now = new Date()
  const cutoff = new Date(now.getTime() - ATTEMPT_WINDOW_MS)
  
  let state = rateLimitStore.get(employeeCode)
  
  if (!state) {
    state = {
      attempts: [],
      isLocked: false
    }
    rateLimitStore.set(employeeCode, state)
  }
  
  // Clean old attempts outside the window
  state.attempts = state.attempts.filter(attempt => attempt.timestamp > cutoff)
  
  // Check if lockout has expired
  if (state.isLocked && state.lockExpiry && now > state.lockExpiry) {
    state.isLocked = false
    state.lockExpiry = undefined
  }
  
  return state
}

/**
 * Record an authentication attempt
 */
function recordAttempt(employeeCode: string, success: boolean): void {
  const state = getRateLimitState(employeeCode)
  const now = new Date()
  
  state.attempts.push({
    employeeCode,
    timestamp: now,
    success
  })
  
  // Check if we should lock the account
  if (!success) {
    const failedAttempts = state.attempts.filter(a => !a.success)
    
    if (failedAttempts.length >= MAX_LOGIN_ATTEMPTS) {
      state.isLocked = true
      state.lockExpiry = new Date(now.getTime() + LOCKOUT_DURATION_MS)
    }
  }
  
  rateLimitStore.set(employeeCode, state)
}

/**
 * Get remaining attempts before lockout
 */
function getRemainingAttempts(employeeCode: string): number {
  const state = getRateLimitState(employeeCode)
  const failedAttempts = state.attempts.filter(a => !a.success).length
  return Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts)
}

/**
 * Validate PIN and return employee if valid
 */
export async function validatePin(employeeCode: string, pin: string): Promise<PinValidationResult> {
  try {
    // Check rate limiting first
    const state = getRateLimitState(employeeCode)
    
    if (state.isLocked) {
      return {
        isValid: false,
        isLocked: true,
        attemptsRemaining: 0
      }
    }
    
    // Get database connection
    const db = getLocalDatabase()
    
    // Find employee by code
    const employeeResult = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeCode, employeeCode))
      .limit(1)
    
    if (employeeResult.length === 0) {
      // Record failed attempt even for non-existent employee (security)
      recordAttempt(employeeCode, false)
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      }
    }
    
    const employee = employeeResult[0]
    
    // Check if employee is active
    if (!employee.isActive) {
      recordAttempt(employeeCode, false)
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      }
    }
    
    // Validate PIN
    const pinIsValid = await comparePin(pin, employee.pin)
    
    // Record the attempt
    recordAttempt(employeeCode, pinIsValid)
    
    if (pinIsValid) {
      return {
        isValid: true,
        employee
      }
    } else {
      return {
        isValid: false,
        attemptsRemaining: getRemainingAttempts(employeeCode)
      }
    }
    
  } catch (error) {
    console.error('PIN validation error:', error)
    recordAttempt(employeeCode, false)
    return {
      isValid: false,
      attemptsRemaining: getRemainingAttempts(employeeCode)
    }
  }
}

/**
 * Authenticate employee with PIN
 */
export async function authenticateEmployee(credentials: LoginCredentials): Promise<LoginResult> {
  const { pin } = credentials
  
  if (!pin || pin.length === 0) {
    return {
      success: false,
      error: 'PIN is required'
    }
  }
  
  // Extract employee code from PIN (for now, we'll need to check all employees)
  // In a real implementation, you might have a separate employee code input
  // For this demo, we'll try to find any employee with matching PIN
  
  try {
    const db = getLocalDatabase()
    const allActiveEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.isActive, true))
    
    // Try to find matching employee
    for (const employee of allActiveEmployees) {
      const pinResult = await validatePin(employee.employeeCode, pin)
      
      if (pinResult.isValid && pinResult.employee) {
        return {
          success: true,
          employee: pinResult.employee
        }
      }
      
      if (pinResult.isLocked) {
        return {
          success: false,
          error: 'Account is temporarily locked due to too many failed attempts'
        }
      }
    }
    
    return {
      success: false,
      error: 'Invalid PIN'
    }
    
  } catch (error) {
    console.error('Authentication error:', error)
    return {
      success: false,
      error: 'Authentication failed. Please try again.'
    }
  }
}

/**
 * Create a new employee with hashed PIN
 */
export async function createEmployee(
  employeeCode: string,
  firstName: string,
  lastName: string,
  plainPin: string,
  role: 'cashier' | 'manager' | 'owner' = 'cashier'
): Promise<Employee> {
  try {
    const hashedPin = await hashPin(plainPin)
    const now = new Date()
    
    const newEmployee = {
      id: ulid(),
      employeeCode,
      firstName,
      lastName,
      pin: hashedPin,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }
    
    const db = getLocalDatabase()
    await db.insert(employees).values(newEmployee)
    
    // Return the created employee (without the hashed PIN)
    return { ...newEmployee, pin: '' } as Employee
    
  } catch (error) {
    console.error('Failed to create employee:', error)
    throw new Error('Failed to create employee')
  }
}

/**
 * Reset an employee's PIN (manager/owner function)
 */
export async function resetEmployeePin(
  targetEmployeeId: string,
  newPlainPin: string,
  resetByEmployeeId: string
): Promise<boolean> {
  try {
    const hashedPin = await hashPin(newPlainPin)
    const now = new Date()
    
    const db = getLocalDatabase()
    
    // Update the employee's PIN
    await db
      .update(employees)
      .set({ 
        pin: hashedPin,
        updatedAt: now
      })
      .where(eq(employees.id, targetEmployeeId))
    
    // Clear any rate limiting for this employee
    const targetEmployee = await db
      .select()
      .from(employees)
      .where(eq(employees.id, targetEmployeeId))
      .limit(1)
    
    if (targetEmployee.length > 0) {
      rateLimitStore.delete(targetEmployee[0].employeeCode)
    }
    
    console.log(`PIN reset for employee ${targetEmployeeId} by ${resetByEmployeeId}`)
    return true
    
  } catch (error) {
    console.error('PIN reset failed:', error)
    return false
  }
}

/**
 * Clear rate limiting for an employee (admin function)
 */
export function clearRateLimit(employeeCode: string): void {
  rateLimitStore.delete(employeeCode)
}

/**
 * Get current rate limit status for debugging
 */
export function getRateLimitStatus(employeeCode: string): RateLimitState {
  return getRateLimitState(employeeCode)
}