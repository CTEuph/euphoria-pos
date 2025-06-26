/**
 * Tests for LogoutConfirmation component
 * Tests logout confirmation dialog, transaction preservation info, and user interactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LogoutConfirmation, LogoutButton } from './LogoutConfirmation'
import { useAuthStore } from '../store/authStore'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import type { Employee } from '../types'

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

describe('LogoutConfirmation', () => {
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

  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn()
  }

  beforeEach(() => {
    // Reset stores
    useAuthStore.getState().logout()
    useCheckoutStore.getState().clearCart()
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should not render when closed', () => {
      render(
        <LogoutConfirmation
          {...mockProps}
          isOpen={false}
        />
      )
      
      expect(screen.queryByText('Confirm Logout')).not.toBeInTheDocument()
    })

    it('should render confirmation dialog when open', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('Confirm Logout')).toBeInTheDocument()
      expect(screen.getByText('Logging out John Doe')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
    })

    it('should show generic message when no user logged in', () => {
      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('Logging out current user')).toBeInTheDocument()
    })

    it('should display custom message when provided', () => {
      const customMessage = 'Session expired due to inactivity'
      
      render(
        <LogoutConfirmation
          {...mockProps}
          message={customMessage}
        />
      )
      
      expect(screen.getByText(customMessage)).toBeInTheDocument()
    })

    it('should show employee information', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('Employee: EMP001 • cashier')).toBeInTheDocument()
    })
  })

  describe('Transaction Information', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should show active transaction info when cart has items', () => {
      // Add items to cart
      const checkoutStore = useCheckoutStore.getState()
      checkoutStore.addItem({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST001',
        price: 10.00,
        category: 'liquor',
        barcode: '1234567890123'
      })

      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('Active Transaction')).toBeInTheDocument()
      expect(screen.getByText('1 item in cart')).toBeInTheDocument()
      expect(screen.getByText(/Total: \$\d+\.\d{2}/)).toBeInTheDocument()
      expect(screen.getByText(/transaction will be preserved/i)).toBeInTheDocument()
    })

    it('should show multiple items correctly', () => {
      const checkoutStore = useCheckoutStore.getState()
      
      // Add multiple items
      checkoutStore.addItem({
        id: 'product-1',
        name: 'Test Product 1',
        sku: 'TEST001',
        price: 10.00,
        category: 'liquor',
        barcode: '1234567890123'
      })
      checkoutStore.addItem({
        id: 'product-2',
        name: 'Test Product 2',
        sku: 'TEST002',
        price: 15.00,
        category: 'wine',
        barcode: '1234567890124'
      })

      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('2 items in cart')).toBeInTheDocument()
      expect(screen.getByText(/Total: \$\d+\.\d{2}/)).toBeInTheDocument()
    })

    it('should show no transaction message when cart is empty', () => {
      render(<LogoutConfirmation {...mockProps} />)
      
      expect(screen.getByText('No active transaction to preserve')).toBeInTheDocument()
      expect(screen.queryByText('Active Transaction')).not.toBeInTheDocument()
    })

    it('should hide transaction info when showTransactionInfo is false', () => {
      const checkoutStore = useCheckoutStore.getState()
      checkoutStore.addItem({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST001',
        price: 10.00,
        category: 'liquor',
        barcode: '1234567890123'
      })

      render(
        <LogoutConfirmation
          {...mockProps}
          showTransactionInfo={false}
        />
      )
      
      expect(screen.queryByText('Active Transaction')).not.toBeInTheDocument()
      expect(screen.queryByText('No active transaction')).not.toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should call onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()
      
      render(<LogoutConfirmation {...mockProps} />)
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)
      
      expect(mockProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onConfirm when Logout is clicked', async () => {
      const user = userEvent.setup()
      
      render(<LogoutConfirmation {...mockProps} />)
      
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      await user.click(logoutButton)
      
      await waitFor(() => {
        expect(mockProps.onConfirm).toHaveBeenCalledTimes(1)
      })
    })

    it('should show loading state during logout', async () => {
      const user = userEvent.setup()
      
      render(<LogoutConfirmation {...mockProps} />)
      
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      await user.click(logoutButton)
      
      // Should show loading state
      expect(screen.getByText('Logging out...')).toBeInTheDocument()
      expect(logoutButton).toBeDisabled()
      
      // Cancel button should also be disabled
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })

    it('should handle keyboard interactions', async () => {
      const user = userEvent.setup()
      
      render(<LogoutConfirmation {...mockProps} />)
      
      // Tab to Cancel button and press Enter
      await user.tab()
      await user.keyboard('{Enter}')
      
      expect(mockProps.onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<LogoutConfirmation {...mockProps} />)
      
      const dialog = screen.getByRole('button', { name: /logout/i }).closest('[role]')
      expect(dialog).toBeTruthy()
      
      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(2) // Cancel and Logout
    })

    it('should focus management work correctly', () => {
      render(<LogoutConfirmation {...mockProps} />)
      
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      const logoutButton = screen.getByRole('button', { name: /logout/i })
      
      expect(cancelButton).toBeInTheDocument()
      expect(logoutButton).toBeInTheDocument()
    })
  })
})

describe('LogoutButton', () => {
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
    useCheckoutStore.getState().clearCart()
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render logout button', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(<LogoutButton />)
      
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
    })

    it('should be disabled when no user is logged in', () => {
      render(<LogoutButton />)
      
      const button = screen.getByRole('button', { name: /logout/i })
      expect(button).toBeDisabled()
    })

    it('should render custom children', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })

      render(<LogoutButton>Sign Out</LogoutButton>)
      
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })
  })

  describe('Confirmation Flow', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should show confirmation dialog when clicked', async () => {
      const user = userEvent.setup()
      
      render(<LogoutButton />)
      
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      expect(screen.getByText('Confirm Logout')).toBeInTheDocument()
    })

    it('should logout immediately when requireConfirmation is false', async () => {
      const user = userEvent.setup()
      
      render(<LogoutButton requireConfirmation={false} />)
      
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      // Should logout immediately without confirmation
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(screen.queryByText('Confirm Logout')).not.toBeInTheDocument()
    })

    it('should preserve transaction when logging out with active cart', async () => {
      const user = userEvent.setup()
      
      // Add item to cart
      const checkoutStore = useCheckoutStore.getState()
      checkoutStore.addItem({
        id: 'product-1',
        name: 'Test Product',
        sku: 'TEST001',
        price: 10.00,
        category: 'liquor',
        barcode: '1234567890123'
      })
      
      const preserveSpy = vi.spyOn(checkoutStore, 'preserveCurrentTransaction')
      
      render(<LogoutButton requireConfirmation={false} />)
      
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      expect(preserveSpy).toHaveBeenCalledWith(mockEmployee.id)
    })

    it('should show custom confirmation message', async () => {
      const user = userEvent.setup()
      const customMessage = 'Your session will be terminated'
      
      render(<LogoutButton confirmationMessage={customMessage} />)
      
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      expect(screen.getByText(customMessage)).toBeInTheDocument()
    })
  })

  describe('Confirmation Dialog Integration', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should close confirmation dialog when cancelled', async () => {
      const user = userEvent.setup()
      
      render(<LogoutButton />)
      
      // Open confirmation
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      expect(screen.getByText('Confirm Logout')).toBeInTheDocument()
      
      // Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)
      
      expect(screen.queryByText('Confirm Logout')).not.toBeInTheDocument()
    })

    it('should complete logout when confirmed', async () => {
      const user = userEvent.setup()
      
      render(<LogoutButton />)
      
      // Open confirmation
      const button = screen.getByRole('button', { name: /logout/i })
      await user.click(button)
      
      // Confirm logout
      const confirmButton = screen.getByRole('button', { name: /logout/i })
      await user.click(confirmButton)
      
      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(false)
      })
    })
  })
})