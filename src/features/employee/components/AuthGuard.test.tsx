/**
 * Tests for AuthGuard component
 * Tests authentication gating, role-based access, and transaction restoration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthGuard, useAuthGuard } from './AuthGuard'
import { useAuthStore } from '../store/authStore'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { TransactionPreservationService } from '../services/transactionPreservationService'
import type { Employee } from '../types'

// Mock transaction preservation service
vi.mock('../services/transactionPreservationService', () => ({
  TransactionPreservationService: vi.fn(() => ({
    getLatestPreservedTransaction: vi.fn(),
    removePreservedTransaction: vi.fn()
  }))
}))

// Mock console to avoid noise
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}
vi.stubGlobal('console', consoleMock)

describe('AuthGuard', () => {
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

  const mockManagerEmployee: Employee = {
    ...mockEmployee,
    id: 'emp_01234567890123456790',
    employeeCode: 'MGR001',
    firstName: 'Jane',
    lastName: 'Manager',
    role: 'manager'
  }

  beforeEach(() => {
    // Reset stores
    useAuthStore.getState().logout()
    useCheckoutStore.getState().clearCart()
    vi.clearAllMocks()
  })

  describe('Authentication Gating', () => {
    it('should render children when requireAuth is false', () => {
      render(
        <AuthGuard requireAuth={false}>
          <div>Protected Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should show login screen when not authenticated and requireAuth is true', () => {
      render(
        <AuthGuard requireAuth={true}>
          <div>Protected Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Enter your PIN to continue')).toBeInTheDocument()
      expect(screen.getByText('Euphoria POS')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should render children when authenticated', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should show default login screen with standard message', () => {
      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Enter your PIN to continue')).toBeInTheDocument()
      expect(screen.getByText('Employee PIN')).toBeInTheDocument()
    })
  })

  describe('Role-Based Access Control', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee // cashier role
      })
    })

    it('should allow access when user has required role', () => {
      render(
        <AuthGuard requiredRole="cashier">
          <div>Cashier Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Cashier Content')).toBeInTheDocument()
    })

    it('should deny access when user lacks required role', () => {
      render(
        <AuthGuard requiredRole="manager">
          <div>Manager Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.getByText('You need manager privileges to access this section.')).toBeInTheDocument()
      expect(screen.getByText('Current role:')).toBeInTheDocument()
      expect(screen.getByText('cashier')).toBeInTheDocument()
      expect(screen.queryByText('Manager Content')).not.toBeInTheDocument()
    })

    it('should allow manager to access cashier content', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockManagerEmployee
      })

      render(
        <AuthGuard requiredRole="cashier">
          <div>Cashier Content</div>
        </AuthGuard>
      )

      expect(screen.getByText('Cashier Content')).toBeInTheDocument()
    })
  })

  describe('Transaction Restoration', () => {
    const mockPreservedTransaction = {
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
      itemCount: 1,
      preservedBy: 'emp_01234567890123456789',
      sessionId: 'session-123',
      timestamp: new Date('2024-01-01T12:00:00Z')
    }

    it('should restore preserved transaction on login', async () => {
      const mockService = {
        getLatestPreservedTransaction: vi.fn().mockReturnValue(mockPreservedTransaction),
        removePreservedTransaction: vi.fn()
      }
      
      vi.mocked(TransactionPreservationService).mockImplementation(() => mockService as any)

      const restoreTransactionSpy = vi.spyOn(useCheckoutStore.getState(), 'restoreTransaction')

      // Start not authenticated
      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )

      // Login to trigger restoration
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      await waitFor(() => {
        expect(mockService.getLatestPreservedTransaction).toHaveBeenCalledWith(mockEmployee.id)
        expect(restoreTransactionSpy).toHaveBeenCalledWith({
          cart: mockPreservedTransaction.cart,
          customer: mockPreservedTransaction.customer,
          subtotal: mockPreservedTransaction.subtotal,
          tax: mockPreservedTransaction.tax,
          total: mockPreservedTransaction.total
        })
        expect(mockService.removePreservedTransaction).toHaveBeenCalledWith(mockPreservedTransaction.timestamp)
      })

      expect(consoleMock.log).toHaveBeenCalledWith(
        'Restored preserved transaction for EMP001: 1 items, $11.00'
      )
    })

    it('should handle missing preserved transaction gracefully', async () => {
      const mockService = {
        getLatestPreservedTransaction: vi.fn().mockReturnValue(null),
        removePreservedTransaction: vi.fn()
      }
      
      vi.mocked(TransactionPreservationService).mockImplementation(() => mockService as any)

      const restoreTransactionSpy = vi.spyOn(useCheckoutStore.getState(), 'restoreTransaction')

      // Login (no preserved transaction)
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )

      await waitFor(() => {
        expect(mockService.getLatestPreservedTransaction).toHaveBeenCalledWith(mockEmployee.id)
      })

      expect(restoreTransactionSpy).not.toHaveBeenCalled()
      expect(mockService.removePreservedTransaction).not.toHaveBeenCalled()
    })

    it('should handle restoration errors gracefully', async () => {
      const mockService = {
        getLatestPreservedTransaction: vi.fn().mockImplementation(() => {
          throw new Error('Storage error')
        }),
        removePreservedTransaction: vi.fn()
      }
      
      vi.mocked(TransactionPreservationService).mockImplementation(() => mockService as any)

      // Login should not crash
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      )

      await waitFor(() => {
        expect(consoleMock.error).toHaveBeenCalledWith(
          'Failed to restore preserved transaction:',
          expect.any(Error)
        )
      })

      // Should still render protected content
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should skip restoration when autoRestoreTransactions is false', async () => {
      const mockService = {
        getLatestPreservedTransaction: vi.fn(),
        removePreservedTransaction: vi.fn()
      }
      
      vi.mocked(TransactionPreservationService).mockImplementation(() => mockService as any)

      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(
        <AuthGuard autoRestoreTransactions={false}>
          <div>Protected Content</div>
        </AuthGuard>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })

      expect(mockService.getLatestPreservedTransaction).not.toHaveBeenCalled()
    })
  })
})

describe('useAuthGuard', () => {
  const TestComponent = ({ testAction }: { testAction: () => void }) => {
    testAction()
    return <div>Test Component</div>
  }

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
    useAuthStore.getState().logout()
    vi.clearAllMocks()
  })

  it('should provide requireAuth function', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })

    const TestComponentWithAuth = () => {
      const { requireAuth } = useAuthGuard()
      requireAuth('test action')
      return <div>Authenticated Content</div>
    }

    render(<TestComponentWithAuth />)
    expect(screen.getByText('Authenticated Content')).toBeInTheDocument()
  })

  it('should throw error when not authenticated', () => {
    const TestComponentWithAuth = () => {
      const { requireAuth } = useAuthGuard()
      requireAuth('test action')
      return <div>Should not render</div>
    }

    expect(() => render(<TestComponentWithAuth />)).toThrow('Authentication required for test action')
  })

  it('should provide requireRole function', () => {
    useAuthStore.getState().login({
      success: true,
      employee: { ...mockEmployee, role: 'manager' }
    })

    const TestComponentWithRole = () => {
      const { requireRole } = useAuthGuard()
      requireRole('manager', 'manager action')
      return <div>Manager Content</div>
    }

    render(<TestComponentWithRole />)
    expect(screen.getByText('Manager Content')).toBeInTheDocument()
  })

  it('should throw error when lacking required role', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee // cashier
    })

    const TestComponentWithRole = () => {
      const { requireRole } = useAuthGuard()
      requireRole('manager', 'manager action')
      return <div>Should not render</div>
    }

    expect(() => render(<TestComponentWithRole />)).toThrow('manager role required for manager action')
  })

  it('should provide canAccess function', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })

    const TestComponentWithAccess = () => {
      const { canAccess } = useAuthGuard()
      return (
        <div>
          <span>Can access general: {canAccess() ? 'Yes' : 'No'}</span>
          <span>Can access cashier: {canAccess('cashier') ? 'Yes' : 'No'}</span>
          <span>Can access manager: {canAccess('manager') ? 'Yes' : 'No'}</span>
        </div>
      )
    }

    render(<TestComponentWithAccess />)
    expect(screen.getByText('Can access general: Yes')).toBeInTheDocument()
    expect(screen.getByText('Can access cashier: Yes')).toBeInTheDocument()
    expect(screen.getByText('Can access manager: No')).toBeInTheDocument()
  })
})