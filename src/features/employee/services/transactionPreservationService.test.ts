/**
 * Tests for Transaction Preservation Service
 * Tests transaction preservation, restoration, and cleanup logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TransactionPreservationService, createTransactionSnapshot, shouldPreserveTransaction } from './transactionPreservationService'
import type { CartItem, Customer } from '@/shared/lib/mockData'

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
})

// Mock console to avoid noise in tests
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}

vi.stubGlobal('console', consoleMock)

describe('TransactionPreservationService', () => {
  let service: TransactionPreservationService
  
  // Mock data
  const mockCartItems: CartItem[] = [
    {
      id: 'product-1',
      name: 'Test Product 1',
      sku: 'TEST001',
      price: 10.00,
      quantity: 2,
      total: 20.00,
      category: 'liquor',
      barcode: '1234567890123'
    },
    {
      id: 'product-2',
      name: 'Test Product 2',
      sku: 'TEST002',
      price: 15.00,
      quantity: 1,
      total: 15.00,
      category: 'wine',
      barcode: '1234567890124'
    }
  ]

  const mockCustomer: Customer = {
    id: 'customer-1',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-1234',
    loyalty: {
      points: 100,
      tier: 'bronze'
    }
  }

  const mockCheckoutState = {
    cart: mockCartItems,
    customer: mockCustomer,
    subtotal: 35.00,
    tax: 3.50,
    total: 38.50,
    itemCount: 3
  }

  beforeEach(() => {
    service = new TransactionPreservationService()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
    
    // Clear localStorage mock
    mockLocalStorage.getItem.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Transaction Preservation', () => {
    it('should preserve a transaction', () => {
      const snapshot = createTransactionSnapshot(mockCheckoutState, 'emp-001')
      
      service.preserveTransaction(snapshot)
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'euphoria-pos-preserved-transactions',
        expect.stringContaining('emp-001')
      )
      expect(consoleMock.log).toHaveBeenCalledWith(
        'Transaction preserved for employee emp-001: 3 items, $38.50'
      )
    })

    it('should handle preservation errors gracefully', () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage error')
      })
      
      const snapshot = createTransactionSnapshot(mockCheckoutState, 'emp-001')
      
      expect(() => service.preserveTransaction(snapshot)).not.toThrow()
      expect(consoleMock.error).toHaveBeenCalledWith(
        'Failed to preserve transaction:',
        expect.any(Error)
      )
    })

    it('should limit preserved transactions by count', () => {
      const limitedService = new TransactionPreservationService({ maxPreservedTransactions: 2 })
      
      // Mock existing transactions
      const existingTransactions = [
        createTransactionSnapshot(mockCheckoutState, 'emp-001'),
        createTransactionSnapshot(mockCheckoutState, 'emp-002')
      ]
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingTransactions))
      
      // Add a third transaction
      const newSnapshot = createTransactionSnapshot(mockCheckoutState, 'emp-003')
      limitedService.preserveTransaction(newSnapshot)
      
      // Should save only 2 transactions (newest first)
      const savedCall = mockLocalStorage.setItem.mock.calls[0]
      const savedData = JSON.parse(savedCall[1])
      
      expect(savedData).toHaveLength(2)
      expect(savedData[0].preservedBy).toBe('emp-003') // Newest first
    })

    it('should cleanup old transactions by age', () => {
      const service = new TransactionPreservationService({ maxAgeHours: 1 })
      
      // Create old transaction (2 hours ago)
      const oldTransaction = createTransactionSnapshot(mockCheckoutState, 'emp-old')
      oldTransaction.timestamp = new Date('2024-01-01T10:00:00Z') // 2 hours ago
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify([oldTransaction]))
      
      // Add new transaction
      const newSnapshot = createTransactionSnapshot(mockCheckoutState, 'emp-new')
      service.preserveTransaction(newSnapshot)
      
      // Should only save the new transaction
      const savedCall = mockLocalStorage.setItem.mock.calls[0]
      const savedData = JSON.parse(savedCall[1])
      
      expect(savedData).toHaveLength(1)
      expect(savedData[0].preservedBy).toBe('emp-new')
    })
  })

  describe('Transaction Retrieval', () => {
    beforeEach(() => {
      const transactions = [
        createTransactionSnapshot(mockCheckoutState, 'emp-001'),
        createTransactionSnapshot(mockCheckoutState, 'emp-002'),
        createTransactionSnapshot(mockCheckoutState, 'emp-001') // Second transaction for emp-001
      ]
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(transactions))
    })

    it('should get latest preserved transaction for any employee', () => {
      const latest = service.getLatestPreservedTransaction()
      
      expect(latest).toBeTruthy()
      expect(latest?.preservedBy).toBe('emp-001')
    })

    it('should get latest preserved transaction for specific employee', () => {
      const latest = service.getLatestPreservedTransaction('emp-002')
      
      expect(latest).toBeTruthy()
      expect(latest?.preservedBy).toBe('emp-002')
    })

    it('should return null when no transactions exist', () => {
      mockLocalStorage.getItem.mockReturnValue(null)
      
      const latest = service.getLatestPreservedTransaction()
      
      expect(latest).toBeNull()
    })

    it('should get all preserved transactions', () => {
      const all = service.getAllPreservedTransactions()
      
      expect(all).toHaveLength(3)
    })

    it('should get preserved transactions for specific employee', () => {
      const empTransactions = service.getPreservedTransactionsForEmployee('emp-001')
      
      expect(empTransactions).toHaveLength(2)
      expect(empTransactions.every(t => t.preservedBy === 'emp-001')).toBe(true)
    })

    it('should check if preserved transactions exist', () => {
      expect(service.hasPreservedTransactions()).toBe(true)
      expect(service.hasPreservedTransactions('emp-001')).toBe(true)
      expect(service.hasPreservedTransactions('emp-999')).toBe(false)
    })

    it('should handle corrupted storage gracefully', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json')
      
      const latest = service.getLatestPreservedTransaction()
      
      expect(latest).toBeNull()
      expect(consoleMock.error).toHaveBeenCalledWith(
        'Failed to parse preserved transactions:',
        expect.any(Error)
      )
    })
  })

  describe('Transaction Removal', () => {
    const mockTransactions = [
      createTransactionSnapshot(mockCheckoutState, 'emp-001'),
      createTransactionSnapshot(mockCheckoutState, 'emp-002')
    ]

    beforeEach(() => {
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockTransactions))
    })

    it('should remove specific preserved transaction', () => {
      const timestamp = mockTransactions[0].timestamp
      
      const removed = service.removePreservedTransaction(timestamp)
      
      expect(removed).toBe(true)
      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })

    it('should clear all preserved transactions', () => {
      service.clearAllPreservedTransactions()
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        'euphoria-pos-preserved-transactions'
      )
    })

    it('should clear preserved transactions for specific employee', () => {
      service.clearPreservedTransactionsForEmployee('emp-001')
      
      const savedCall = mockLocalStorage.setItem.mock.calls[0]
      const savedData = JSON.parse(savedCall[1])
      
      expect(savedData).toHaveLength(1)
      expect(savedData[0].preservedBy).toBe('emp-002')
    })
  })

  describe('Statistics', () => {
    it('should provide preservation statistics', () => {
      const transactions = [
        createTransactionSnapshot({ ...mockCheckoutState, total: 100 }, 'emp-001'),
        createTransactionSnapshot({ ...mockCheckoutState, total: 200 }, 'emp-002'),
        createTransactionSnapshot({ ...mockCheckoutState, total: 150 }, 'emp-001')
      ]
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(transactions))
      
      const stats = service.getPreservationStats()
      
      expect(stats.totalTransactions).toBe(3)
      expect(stats.totalValue).toBe(450)
      expect(stats.totalItems).toBe(9) // 3 items per transaction
      expect(stats.employeeCount).toBe(2)
      expect(stats.newestTransaction).toBeInstanceOf(Date)
      expect(stats.oldestTransaction).toBeInstanceOf(Date)
    })

    it('should handle empty statistics', () => {
      mockLocalStorage.getItem.mockReturnValue(null)
      
      const stats = service.getPreservationStats()
      
      expect(stats.totalTransactions).toBe(0)
      expect(stats.totalValue).toBe(0)
      expect(stats.totalItems).toBe(0)
      expect(stats.employeeCount).toBe(0)
      expect(stats.newestTransaction).toBeNull()
      expect(stats.oldestTransaction).toBeNull()
    })
  })
})

describe('Helper Functions', () => {
  const mockCheckoutState = {
    cart: [
      {
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST001',
        price: 10.00,
        quantity: 1,
        total: 10.00,
        category: 'liquor' as const,
        barcode: '1234567890123'
      }
    ],
    customer: null,
    subtotal: 10.00,
    tax: 1.00,
    total: 11.00,
    itemCount: 1
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createTransactionSnapshot', () => {
    it('should create a transaction snapshot', () => {
      const snapshot = createTransactionSnapshot(mockCheckoutState, 'emp-001', 'session-123')
      
      expect(snapshot.cart).toEqual(mockCheckoutState.cart)
      expect(snapshot.customer).toBe(mockCheckoutState.customer)
      expect(snapshot.subtotal).toBe(mockCheckoutState.subtotal)
      expect(snapshot.tax).toBe(mockCheckoutState.tax)
      expect(snapshot.total).toBe(mockCheckoutState.total)
      expect(snapshot.itemCount).toBe(mockCheckoutState.itemCount)
      expect(snapshot.preservedBy).toBe('emp-001')
      expect(snapshot.sessionId).toBe('session-123')
      expect(snapshot.timestamp).toBeInstanceOf(Date)
    })

    it('should clone cart items to prevent mutations', () => {
      const snapshot = createTransactionSnapshot(mockCheckoutState, 'emp-001')
      
      // Modify original cart
      mockCheckoutState.cart[0].quantity = 999
      
      // Snapshot should be unchanged
      expect(snapshot.cart[0].quantity).toBe(1)
    })
  })

  describe('shouldPreserveTransaction', () => {
    it('should return true for non-empty transactions', () => {
      const result = shouldPreserveTransaction(mockCheckoutState)
      
      expect(result).toBe(true)
    })

    it('should return false for empty cart', () => {
      const emptyState = {
        cart: [],
        itemCount: 0,
        total: 0
      }
      
      const result = shouldPreserveTransaction(emptyState)
      
      expect(result).toBe(false)
    })

    it('should return false for zero total', () => {
      const zeroState = {
        cart: mockCheckoutState.cart,
        itemCount: 1,
        total: 0
      }
      
      const result = shouldPreserveTransaction(zeroState)
      
      expect(result).toBe(false)
    })
  })
})