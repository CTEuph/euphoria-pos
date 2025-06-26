/**
 * Tests for App Initialization Service
 * Tests session validation, state restoration, and cleanup on app startup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AppInitializationService } from './appInitializationService'
import { useAuthStore } from '../store/authStore'
import { TransactionPreservationService } from './transactionPreservationService'
import type { Employee } from '../types'

// Mock TransactionPreservationService
vi.mock('./transactionPreservationService', () => ({
  TransactionPreservationService: vi.fn(() => ({
    getAllPreservedTransactions: vi.fn(),
    getPreservationStats: vi.fn(),
    removePreservedTransaction: vi.fn(),
    clearAllPreservedTransactions: vi.fn()
  }))
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console to avoid noise
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}

vi.stubGlobal('console', consoleMock)

describe('AppInitializationService', () => {
  let service: AppInitializationService
  let mockPreservationService: any

  const mockEmployee: Employee = {
    id: 'emp_01234567890123456789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin',
    role: 'cashier',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  beforeEach(() => {
    // Setup mock preservation service
    mockPreservationService = {
      getAllPreservedTransactions: vi.fn().mockReturnValue([]),
      getPreservationStats: vi.fn().mockReturnValue({
        totalTransactions: 0,
        totalValue: 0,
        totalItems: 0,
        employeeCount: 0,
        newestTransaction: null,
        oldestTransaction: null
      }),
      removePreservedTransaction: vi.fn(),
      clearAllPreservedTransactions: vi.fn()
    }
    
    // Create service with mocked dependency
    service = new AppInitializationService(mockPreservationService as any)
    
    // Reset auth store
    useAuthStore.getState().logout()
    
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initialization', () => {
    it('should initialize successfully with no persisted session', async () => {
      const result = await service.initialize()

      expect(result.success).toBe(true)
      expect(result.isAuthenticated).toBe(false)
      expect(result.sessionRestored).toBe(false)
      expect(result.sessionExpired).toBe(false)
      expect(result.preservedTransactionCount).toBe(0)
      expect(result.error).toBeUndefined()

      expect(consoleMock.log).toHaveBeenCalledWith('Initializing Euphoria POS authentication...')
      expect(consoleMock.log).toHaveBeenCalledWith('No persisted session found')
    })

    it('should restore valid persisted session', async () => {
      // Set up valid session (within timeout)
      const validLastActivity = new Date('2024-01-01T11:59:30Z') // 30 seconds ago
      
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      useAuthStore.setState({
        lastActivityTime: validLastActivity,
        sessionTimeoutMinutes: 1
      })

      const result = await service.initialize()

      expect(result.success).toBe(true)
      expect(result.isAuthenticated).toBe(true)
      expect(result.sessionRestored).toBe(true)
      expect(result.sessionExpired).toBe(false)

      expect(consoleMock.log).toHaveBeenCalledWith('Found persisted session for EMP001')
      expect(consoleMock.log).toHaveBeenCalledWith('Session restored for John Doe')
    })

    it('should clear expired persisted session', async () => {
      // Set up expired session (beyond timeout)
      const expiredLastActivity = new Date('2024-01-01T11:58:00Z') // 2 minutes ago
      
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      useAuthStore.setState({
        lastActivityTime: expiredLastActivity,
        sessionTimeoutMinutes: 1
      })

      const result = await service.initialize()

      expect(result.success).toBe(true)
      expect(result.isAuthenticated).toBe(false)
      expect(result.sessionRestored).toBe(false)
      expect(result.sessionExpired).toBe(true)

      // Check that session was cleared
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().currentUser).toBe(null)
    })

    it('should handle preserved transactions', async () => {
      const mockTransactions = [
        {
          cart: [],
          customer: null,
          subtotal: 10.00,
          tax: 1.00,
          total: 11.00,
          itemCount: 1,
          preservedBy: 'emp-001',
          sessionId: 'session-123',
          timestamp: new Date('2024-01-01T11:00:00Z')
        },
        {
          cart: [],
          customer: null,
          subtotal: 20.00,
          tax: 2.00,
          total: 22.00,
          itemCount: 2,
          preservedBy: 'emp-002',
          sessionId: 'session-456',
          timestamp: new Date('2024-01-01T11:30:00Z')
        }
      ]

      mockPreservationService.getAllPreservedTransactions.mockReturnValue(mockTransactions)

      const result = await service.initialize()

      expect(result.success).toBe(true)
      expect(result.preservedTransactionCount).toBe(2)

      expect(consoleMock.log).toHaveBeenCalledWith('Found 2 preserved transactions')
    })

    it('should handle initialization errors gracefully', async () => {
      // Mock an error in the preservation service
      mockPreservationService.getAllPreservedTransactions.mockImplementation(() => {
        throw new Error('Storage error')
      })

      const result = await service.initialize()

      expect(result.success).toBe(false)
      expect(result.isAuthenticated).toBe(false)
      expect(result.error).toBe('Storage error')

      expect(consoleMock.error).toHaveBeenCalledWith('App initialization failed:', expect.any(Error))
    })
  })

  describe('Session Validation', () => {
    it('should validate current session when within timeout', () => {
      const validLastActivity = new Date('2024-01-01T11:59:30Z') // 30 seconds ago
      
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      useAuthStore.setState({
        lastActivityTime: validLastActivity,
        sessionTimeoutMinutes: 1
      })

      const isValid = service.validateCurrentSession()

      expect(isValid).toBe(true)
    })

    it('should invalidate session when beyond timeout', () => {
      const expiredLastActivity = new Date('2024-01-01T11:58:00Z') // 2 minutes ago
      
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      useAuthStore.setState({
        lastActivityTime: expiredLastActivity,
        sessionTimeoutMinutes: 1
      })

      const isValid = service.validateCurrentSession()

      expect(isValid).toBe(false)
    })

    it('should invalidate session when not authenticated', () => {
      const isValid = service.validateCurrentSession()

      expect(isValid).toBe(false)
    })

    it('should invalidate session when no last activity time', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      useAuthStore.setState({
        lastActivityTime: null,
        sessionTimeoutMinutes: 1
      })

      const isValid = service.validateCurrentSession()

      expect(isValid).toBe(false)
    })
  })

  describe('Transaction Cleanup', () => {
    it('should cleanup old preserved transactions', async () => {
      const oldTransaction = {
        cart: [],
        customer: null,
        subtotal: 10.00,
        tax: 1.00,
        total: 11.00,
        itemCount: 1,
        preservedBy: 'emp-001',
        sessionId: 'session-123',
        timestamp: new Date('2023-12-31T11:00:00Z') // 25 hours ago
      }

      const recentTransaction = {
        cart: [],
        customer: null,
        subtotal: 20.00,
        tax: 2.00,
        total: 22.00,
        itemCount: 2,
        preservedBy: 'emp-002',
        sessionId: 'session-456',
        timestamp: new Date('2024-01-01T11:00:00Z') // 1 hour ago
      }

      // First call returns transactions for initialization
      mockPreservationService.getAllPreservedTransactions.mockReturnValue([oldTransaction, recentTransaction])
      
      // Setup stats to trigger cleanup
      mockPreservationService.getPreservationStats.mockReturnValue({
        totalTransactions: 2,
        totalValue: 33.00,
        totalItems: 3,
        employeeCount: 2,
        newestTransaction: recentTransaction.timestamp,
        oldestTransaction: oldTransaction.timestamp // This should trigger cleanup since it's 25h old (>24h)
      })

      await service.initialize()

      // Verify cleanup was called
      expect(mockPreservationService.getPreservationStats).toHaveBeenCalled()
      expect(mockPreservationService.getAllPreservedTransactions).toHaveBeenCalled()
      
      // The cleanup should have been triggered and removed the old transaction
      expect(mockPreservationService.removePreservedTransaction).toHaveBeenCalledWith(oldTransaction.timestamp)
      expect(mockPreservationService.removePreservedTransaction).not.toHaveBeenCalledWith(recentTransaction.timestamp)
    })

    it('should handle cleanup errors gracefully', async () => {
      // Set up transactions to trigger cleanup attempt
      mockPreservationService.getAllPreservedTransactions.mockReturnValue([{
        cart: [],
        customer: null,
        subtotal: 10.00,
        tax: 1.00,
        total: 11.00,
        itemCount: 1,
        preservedBy: 'emp-001',
        sessionId: 'session-123',
        timestamp: new Date('2023-12-31T11:00:00Z')
      }])
      
      // Make stats throw an error during cleanup
      mockPreservationService.getPreservationStats.mockImplementation(() => {
        throw new Error('Stats error')
      })

      const result = await service.initialize()

      expect(result.success).toBe(true) // Should not fail initialization
      expect(consoleMock.error).toHaveBeenCalledWith('Failed to cleanup old transactions:', expect.any(Error))
    })
  })

  describe('State Management', () => {
    it('should clear all application state', () => {
      // Set up some state
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      service.clearAllState()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().currentUser).toBe(null)
      expect(mockPreservationService.clearAllPreservedTransactions).toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('euphoria-pos-auth')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('euphoria-pos-checkout')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('euphoria-pos-preserved-transactions')

      expect(consoleMock.log).toHaveBeenCalledWith('Clearing all application state...')
      expect(consoleMock.log).toHaveBeenCalledWith('All application state cleared')
    })

    it('should get preservation statistics', () => {
      const mockStats = {
        totalTransactions: 3,
        totalValue: 100.00,
        totalItems: 10,
        employeeCount: 2,
        newestTransaction: new Date(),
        oldestTransaction: new Date()
      }

      mockPreservationService.getPreservationStats.mockReturnValue(mockStats)

      const stats = service.getPreservationStats()

      expect(stats).toEqual(mockStats)
      expect(mockPreservationService.getPreservationStats).toHaveBeenCalled()
    })
  })
})