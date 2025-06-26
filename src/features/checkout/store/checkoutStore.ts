import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CartItem, Product, Customer, TAX_RATE } from '@/shared/lib/mockData'
import { 
  transactionPreservationService, 
  createTransactionSnapshot, 
  shouldPreserveTransaction,
  type TransactionSnapshot 
} from '@/features/employee/services/transactionPreservationService'

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
  
  // Transaction preservation
  preserveCurrentTransaction: (employeeId: string) => void
  restoreTransaction: (snapshot: TransactionSnapshot) => void
  getPreservedTransactions: (employeeId?: string) => TransactionSnapshot[]
  hasPreservedTransactions: (employeeId?: string) => boolean
  clearPreservedTransactions: (employeeId?: string) => void
  
  // Utility functions
  getCartItem: (productId: string) => CartItem | undefined
  hasItem: (productId: string) => boolean
}

// Helper function to calculate derived values
const calculateDerivedValues = (cart: CartItem[]) => {
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  
  return { subtotal, tax, total, itemCount }
}

export const useCheckoutStore = create<CheckoutStore>()(
  persist(
    (set, get) => ({
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

  // Transaction preservation methods
  preserveCurrentTransaction: (employeeId: string) => {
    const state = get()
    
    if (shouldPreserveTransaction(state)) {
      const snapshot = createTransactionSnapshot(state, employeeId)
      transactionPreservationService.preserveTransaction(snapshot)
    }
  },

  restoreTransaction: (snapshot: TransactionSnapshot) => {
    const derived = calculateDerivedValues(snapshot.cart)
    set({
      cart: snapshot.cart,
      customer: snapshot.customer,
      ...derived
    })
  },

  getPreservedTransactions: (employeeId?: string) => {
    if (employeeId) {
      return transactionPreservationService.getPreservedTransactionsForEmployee(employeeId)
    }
    return transactionPreservationService.getAllPreservedTransactions()
  },

  hasPreservedTransactions: (employeeId?: string) => {
    return transactionPreservationService.hasPreservedTransactions(employeeId)
  },

  clearPreservedTransactions: (employeeId?: string) => {
    if (employeeId) {
      transactionPreservationService.clearPreservedTransactionsForEmployee(employeeId)
    } else {
      transactionPreservationService.clearAllPreservedTransactions()
    }
  }
    }),
    {
      name: 'euphoria-pos-checkout', // localStorage key
      storage: createJSONStorage(() => localStorage),
      
      // Only persist essential cart data for quick recovery
      partialize: (state) => ({
        cart: state.cart,
        customer: state.customer,
        subtotal: state.subtotal,
        tax: state.tax,
        total: state.total,
        itemCount: state.itemCount
      })
    }
  )
)