/**
 * Tests for authentication service
 * Tests PIN hashing, validation, rate limiting, and authentication flows
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  hashPin, 
  comparePin, 
  validatePin, 
  authenticateEmployee,
  createEmployee,
  resetEmployeePin,
  clearRateLimit 
} from './authService'

// Mock the database
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn()
}

vi.mock('../../src/db', () => ({
  getLocalDatabase: vi.fn(() => mockDb)
}))

vi.mock('../../src/db/local/schema', () => ({
  employees: {}
}))

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clear any rate limiting between tests
    clearRateLimit('TEST001')
    clearRateLimit('TEST002')
  })

  describe('PIN hashing', () => {
    it('should hash a PIN securely', async () => {
      const pin = '123456'
      const hash1 = await hashPin(pin)
      const hash2 = await hashPin(pin)
      
      expect(hash1).toBeDefined()
      expect(hash1).not.toBe(pin)
      expect(hash1).not.toBe(hash2) // Different salt each time
      expect(hash1.length).toBeGreaterThan(50) // bcrypt hashes are long
    })

    it('should reject invalid PINs', async () => {
      await expect(hashPin('')).rejects.toThrow('PIN must be at least 3 characters long')
      await expect(hashPin('12')).rejects.toThrow('PIN must be at least 3 characters long')
    })
  })

  describe('PIN comparison', () => {
    it('should validate correct PIN', async () => {
      const pin = '123456'
      const hash = await hashPin(pin)
      
      const isValid = await comparePin(pin, hash)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect PIN', async () => {
      const pin = '123456'
      const wrongPin = '567890'
      const hash = await hashPin(pin)
      
      const isValid = await comparePin(wrongPin, hash)
      expect(isValid).toBe(false)
    })

    it('should handle empty inputs gracefully', async () => {
      const hash = await hashPin('123456')
      
      expect(await comparePin('', hash)).toBe(false)
      expect(await comparePin('123456', '')).toBe(false)
      expect(await comparePin('', '')).toBe(false)
    })
  })

  describe('Employee authentication', () => {
    it('should reject authentication with empty PIN', async () => {
      const result = await authenticateEmployee({ pin: '' })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('PIN is required')
    })

    it('should reject authentication with invalid PIN', async () => {
      // Mock returning empty array for employees (no matches)
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])) // No employees found
        }))
      })
      
      const result = await authenticateEmployee({ pin: '999999' })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid PIN')
    })
  })

  describe('Rate limiting', () => {
    it('should track failed attempts', async () => {
      // Mock database to return no employees (simulating failed lookup)
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([]))
          }))
        }))
      })
      
      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        const result = await validatePin('TEST001', '123456')
        expect(result.isValid).toBe(false)
        expect(result.attemptsRemaining).toBe(10 - i - 1)
      }
    })

    it('should lock account after max attempts', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([]))
          }))
        }))
      })
      
      // Make 10 failed attempts to trigger lockout
      for (let i = 0; i < 10; i++) {
        await validatePin('TEST002', '123456')
      }
      
      // Next attempt should be locked
      const result = await validatePin('TEST002', '123456')
      expect(result.isValid).toBe(false)
      expect(result.isLocked).toBe(true)
      expect(result.attemptsRemaining).toBe(0)
    })

    it('should clear rate limit when requested', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([]))
          }))
        }))
      })
      
      // Make some failed attempts
      for (let i = 0; i < 5; i++) {
        await validatePin('TEST001', '123456')
      }
      
      // Clear rate limit
      clearRateLimit('TEST001')
      
      // Next attempt should have full attempts remaining
      const result = await validatePin('TEST001', '123456')
      expect(result.attemptsRemaining).toBe(9) // 10 - 1 (current attempt)
    })
  })

  describe('Employee creation', () => {
    it('should create employee with hashed PIN', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn(() => Promise.resolve())
      })
      
      const employee = await createEmployee('TEST001', 'Test', 'User', '123456', 'cashier')
      
      expect(employee.employeeCode).toBe('TEST001')
      expect(employee.firstName).toBe('Test')
      expect(employee.lastName).toBe('User')
      expect(employee.role).toBe('cashier')
      expect(employee.pin).toBe('') // PIN should be hidden in response
      expect(employee.isActive).toBe(true)
      expect(mockDb.insert).toHaveBeenCalled()
    })
  })

  describe('PIN reset', () => {
    it('should reset employee PIN', async () => {
      mockDb.update.mockReturnValue({ 
        set: vi.fn(() => ({ 
          where: vi.fn(() => Promise.resolve()) 
        })) 
      })
      
      // Mock select for clearing rate limit
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ employeeCode: 'TEST001' }]))
          }))
        }))
      })
      
      const result = await resetEmployeePin('employee-id', '567890', 'admin-id')
      
      expect(result).toBe(true)
      expect(mockDb.update).toHaveBeenCalled()
    })
  })
})