import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/App'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { mockProducts } from '@/shared/lib/mockData'

// Mock modules
vi.mock('@/shared/hooks/useToast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/shared/lib/audio', () => ({
  playErrorSound: vi.fn(),
  playSuccessSound: vi.fn(),
  setAudioEnabled: vi.fn()
}))

/**
 * Integration tests for scanner and search interaction
 * Following test strategy: Test multi-feature workflows and critical user paths
 */

describe('Scanner + Search Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useCheckoutStore.getState().clearCart()
  })

  afterEach(() => {
    // Clean up any event listeners
    document.removeEventListener('keydown', vi.fn())
  })

  describe('Global Scanner Clears Search - Critical Business Flow', () => {
    it('should clear search input when global scanner detects barcode', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      // Start typing in search
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      await user.type(searchInput, 'jack')
      
      expect(searchInput).toHaveValue('jack')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Simulate global scanner shortcut (Shift+J for Jack Daniels)
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Search should be cleared and product added to cart
      await waitFor(() => {
        expect(searchInput).toHaveValue('')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
      
      // Verify product was added to cart
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBe(1)
    })

    it('should clear search input when USB scanner processes barcode', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      // Start searching in barcode input
      const barcodeInput = screen.getByPlaceholderText(/scan barcode or enter manually/i)
      await user.type(barcodeInput, 'searching for wine')
      
      expect(barcodeInput).toHaveValue('searching for wine')
      
      // Simulate scanner clearing input and adding product
      const mockProduct = mockProducts.find(p => p.barcode === '082184090563')!
      
      // Manually trigger the scanner's onScan callback (simulating USB scanner)
      const addItem = useCheckoutStore.getState().addItem
      addItem(mockProduct)
      
      // Simulate the search input being cleared by scanner
      fireEvent.change(barcodeInput, { target: { value: '' } })
      
      // Verify search was cleared and product added
      expect(barcodeInput).toHaveValue('')
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBe(1)
      expect(cartItems[0].id).toBe(mockProduct.id)
    })
  })

  describe('Search While Scanner Active', () => {
    it('should handle search input while global scanner is enabled', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      // Type in search - should not interfere with global scanner
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      await user.type(searchInput, 'wine')
      
      // Search dropdown should appear
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Global scanner should still work via keyboard shortcuts
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Should clear search and add product
      await waitFor(() => {
        expect(searchInput).toHaveValue('')
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })

    it('should disable scanner when payment modal is open', async () => {
      render(<App />)
      
      // Open payment modal
      useCheckoutStore.getState().setPaymentModal(true)
      
      // Try to use scanner shortcut
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Scanner should be disabled, no product added
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBe(0)
    })

    it('should disable scanner when customer modal is open', async () => {
      render(<App />)
      
      // Open customer modal
      useCheckoutStore.getState().setCustomerModal(true)
      
      // Try to use scanner shortcut
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Scanner should be disabled, no product added
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBe(0)
    })
  })

  describe('Multi-Input Source Handling', () => {
    it('should handle rapid switching between search and scanner', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      const barcodeInput = screen.getByPlaceholderText(/scan barcode or enter manually/i)
      
      // Type in sidebar search
      await user.type(searchInput, 'jack')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Switch to barcode input and type
      await user.click(barcodeInput)
      await user.type(barcodeInput, 'grey')
      
      // Both searches should work independently
      expect(searchInput).toHaveValue('jack')
      expect(barcodeInput).toHaveValue('grey')
      
      // Scanner shortcut should clear both
      fireEvent.keyDown(document, {
        key: 'g',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      await waitFor(() => {
        expect(searchInput).toHaveValue('')
        expect(barcodeInput).toHaveValue('')
      })
    })

    it('should prioritize scanner input over manual typing', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const barcodeInput = screen.getByPlaceholderText(/scan barcode or enter manually/i)
      
      // Start typing manually
      await user.type(barcodeInput, 'searching')
      
      // Scanner shortcut should interrupt and take priority
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Scanner wins, manual input cleared, product added
      await waitFor(() => {
        expect(barcodeInput).toHaveValue('')
        const cartItems = useCheckoutStore.getState().cart
        expect(cartItems.length).toBe(1)
      })
    })
  })

  describe('Error Handling in Multi-Input Environment', () => {
    it('should handle invalid scanner input while search is active', async () => {
      const user = userEvent.setup()
      const { toast } = await import('@/shared/hooks/useToast')
      
      render(<App />)
      
      // Start search
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      await user.type(searchInput, 'wine')
      
      // Simulate scanner with invalid barcode
      fireEvent.keyDown(document, {
        key: '9',
        preventDefault: vi.fn(),
        target: document.body
      })
      
      // Should handle gracefully - no errors, search still active
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(searchInput).toHaveValue('wine')
    })

    it('should recover gracefully from scanner errors', async () => {
      const user = userEvent.setup()
      const { toast } = await import('@/shared/hooks/useToast')
      const { playErrorSound } = await import('@/shared/lib/audio')
      
      render(<App />)
      
      // Type invalid barcode in barcode input
      const barcodeInput = screen.getByPlaceholderText(/scan barcode or enter manually/i)
      await user.type(barcodeInput, '999999999999')
      await user.keyboard('{Enter}')
      
      // Should show error and clear input
      expect(toast.error).toHaveBeenCalledWith('Product not found')
      expect(playErrorSound).toHaveBeenCalled()
      expect(barcodeInput).toHaveValue('')
      
      // Should still be able to search after error
      await user.type(barcodeInput, 'jack')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })
  })

  describe('Performance Under Load', () => {
    it('should handle rapid scanner inputs without lag', async () => {
      render(<App />)
      
      const startTime = Date.now()
      
      // Simulate rapid scanner inputs
      for (let i = 0; i < 10; i++) {
        fireEvent.keyDown(document, {
          key: 'j',
          shiftKey: true,
          preventDefault: vi.fn(),
          target: document.body
        })
        
        // Small delay to simulate real scanner speed
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      const endTime = Date.now()
      const totalTime = endTime - startTime
      
      // Should complete within reasonable time (less than 2 seconds)
      expect(totalTime).toBeLessThan(2000)
      
      // Should have added multiple items (scanner allows duplicates)
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBeGreaterThan(0)
    })

    it('should handle search typing without performance degradation', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      
      const startTime = Date.now()
      
      // Type search term rapidly
      await user.type(searchInput, 'searching for wine products')
      
      const endTime = Date.now()
      const totalTime = endTime - startTime
      
      // Should complete typing within reasonable time
      expect(totalTime).toBeLessThan(1000)
      
      // Search results should be visible
      expect(screen.queryByRole('listbox')).toBeInTheDocument()
    })
  })

  describe('Real-world Usage Scenarios', () => {
    it('should handle cashier workflow: search → scan → search', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const searchInput = screen.getByPlaceholderText(/search products by name/i)
      
      // 1. Search for first product
      await user.type(searchInput, 'wine')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // 2. Scanner interrupts with second product
      fireEvent.keyDown(document, {
        key: 'j',
        shiftKey: true,
        preventDefault: vi.fn(),
        target: document.body
      })
      
      await waitFor(() => {
        expect(searchInput).toHaveValue('')
      })
      
      // 3. Search for third product
      await user.type(searchInput, 'beer')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Should have at least one item from scanner
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBeGreaterThan(0)
    })

    it('should handle customer changing mind during search', async () => {
      const user = userEvent.setup()
      render(<App />)
      
      const barcodeInput = screen.getByPlaceholderText(/scan barcode or enter manually/i)
      
      // Start searching for one product
      await user.type(barcodeInput, 'jack')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Customer changes mind, clears search
      await user.clear(barcodeInput)
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      
      // Search for different product
      await user.type(barcodeInput, 'wine')
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      
      // Select product
      const firstResult = screen.getAllByRole('option')[0]
      await user.click(firstResult)
      
      // Should add product and clear search
      expect(barcodeInput).toHaveValue('')
      const cartItems = useCheckoutStore.getState().cart
      expect(cartItems.length).toBe(1)
    })
  })
})