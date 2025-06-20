import { create } from 'zustand'
import { CartItem, Product, Customer, TAX_RATE } from '@/shared/lib/mockData'

interface CheckoutStore {
  // State
  cart: CartItem[]
  customer: Customer | null
  isProcessing: boolean
  
  // Modal states for scanner control
  isPaymentModalOpen: boolean
  isCustomerModalOpen: boolean
  
  // Computed values (as regular properties)
  subtotal: number
  tax: number
  total: number
  itemCount: number
  
  // Actions
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setCustomer: (customer: Customer | null) => void
  setProcessing: (processing: boolean) => void
  
  // Modal state actions
  setPaymentModal: (open: boolean) => void
  setCustomerModal: (open: boolean) => void
  
  // Utility functions
  getCartItem: (productId: string) => CartItem | undefined
  hasItem: (productId: string) => boolean
  
  // Transaction completion
  completeTransaction: (payments: any[]) => Promise<{ success: boolean; transactionId?: string; error?: string }>
}

// Helper function to calculate derived values
const calculateDerivedValues = (cart: CartItem[]) => {
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  
  return { subtotal, tax, total, itemCount }
}

export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  // Initial state
  cart: [],
  customer: null,
  isProcessing: false,
  
  // Modal states
  isPaymentModalOpen: false,
  isCustomerModalOpen: false,
  
  // Computed values
  subtotal: 0,
  tax: 0,
  total: 0,
  itemCount: 0,
  
  // Actions
  addItem: (product: Product) => {
    const currentCart = get().cart
    const existingItem = currentCart.find(item => item.id === product.id)
    
    let newCart: CartItem[]
    
    if (existingItem) {
      // Update quantity if item already exists
      newCart = currentCart.map(item =>
        item.id === product.id
          ? { 
              ...item, 
              quantity: item.quantity + 1, 
              total: (item.quantity + 1) * item.price 
            }
          : item
      )
    } else {
      // Add new item to cart
      const cartItem: CartItem = {
        ...product,
        quantity: 1,
        total: product.price
      }
      newCart = [...currentCart, cartItem]
    }
    
    const derived = calculateDerivedValues(newCart)
    set({ cart: newCart, ...derived })
  },
  
  removeItem: (productId: string) => {
    const newCart = get().cart.filter(item => item.id !== productId)
    const derived = calculateDerivedValues(newCart)
    set({ cart: newCart, ...derived })
  },
  
  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    
    const newCart = get().cart.map(item =>
      item.id === productId
        ? { 
            ...item, 
            quantity, 
            total: quantity * item.price 
          }
        : item
    )
    
    const derived = calculateDerivedValues(newCart)
    set({ cart: newCart, ...derived })
  },
  
  clearCart: () => {
    const derived = calculateDerivedValues([])
    set({
      cart: [],
      customer: null,
      ...derived
    })
  },
  
  setCustomer: (customer: Customer | null) => {
    set({ customer })
  },
  
  setProcessing: (processing: boolean) => {
    set({ isProcessing: processing })
  },
  
  // Modal state actions
  setPaymentModal: (open: boolean) => {
    set({ isPaymentModalOpen: open })
  },
  
  setCustomerModal: (open: boolean) => {
    set({ isCustomerModalOpen: open })
  },
  
  // Utility functions
  getCartItem: (productId: string) => {
    return get().cart.find(item => item.id === productId)
  },
  
  hasItem: (productId: string) => {
    return get().cart.some(item => item.id === productId)
  },
  
  // Transaction completion
  completeTransaction: async (payments: any[]) => {
    const state = get()
    
    // Build transaction DTO
    const transactionDTO = {
      customerId: state.customer?.id,
      items: state.cart.map(item => ({
        productId: item.id,
        product: item as any, // In real app, would have full product data
        quantity: item.quantity,
        unitPrice: item.price,
        discountAmount: 0, // TODO: Implement discounts
        discountReason: null
      })),
      payments,
      subtotal: state.subtotal,
      taxAmount: state.tax,
      discountAmount: 0, // TODO: Implement discounts
      totalAmount: state.total,
      salesChannel: 'pos' as const,
      metadata: {
        terminalId: window.electron ? await window.electron.auth.getCurrentEmployee().then(e => e?.employeeCode) : 'DEMO'
      }
    }
    
    try {
      set({ isProcessing: true })
      
      // Call Electron IPC to complete transaction
      if (window.electron) {
        const result = await window.electron.transaction.complete(transactionDTO)
        
        if (result.success) {
          // Clear cart on success
          get().clearCart()
        }
        
        return result
      } else {
        // Demo mode
        console.log('Demo transaction:', transactionDTO)
        get().clearCart()
        return { success: true, transactionId: 'DEMO-' + Date.now() }
      }
    } catch (error) {
      console.error('Transaction error:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Transaction failed' 
      }
    } finally {
      set({ isProcessing: false })
    }
  }
}))