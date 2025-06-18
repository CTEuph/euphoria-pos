import { create } from 'zustand'
import { CartItem, Product, Customer, TAX_RATE } from '@/shared/lib/mockData'

interface CheckoutStore {
  // State
  cart: CartItem[]
  customer: Customer | null
  isProcessing: boolean
  
  // Computed values
  get subtotal(): number
  get tax(): number
  get total(): number
  get itemCount(): number
  
  // Actions
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setCustomer: (customer: Customer | null) => void
  setProcessing: (processing: boolean) => void
  
  // Utility functions
  getCartItem: (productId: string) => CartItem | undefined
  hasItem: (productId: string) => boolean
}

export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  // Initial state
  cart: [],
  customer: null,
  isProcessing: false,
  
  // Computed values
  get subtotal() {
    return get().cart.reduce((sum, item) => sum + item.total, 0)
  },
  
  get tax() {
    return get().subtotal * TAX_RATE
  },
  
  get total() {
    return get().subtotal + get().tax
  },
  
  get itemCount() {
    return get().cart.reduce((sum, item) => sum + item.quantity, 0)
  },
  
  // Actions
  addItem: (product: Product) => {
    const currentCart = get().cart
    const existingItem = currentCart.find(item => item.id === product.id)
    
    if (existingItem) {
      // Update quantity if item already exists
      set({
        cart: currentCart.map(item =>
          item.id === product.id
            ? { 
                ...item, 
                quantity: item.quantity + 1, 
                total: (item.quantity + 1) * item.price 
              }
            : item
        )
      })
    } else {
      // Add new item to cart
      const cartItem: CartItem = {
        ...product,
        quantity: 1,
        total: product.price
      }
      set({
        cart: [...currentCart, cartItem]
      })
    }
  },
  
  removeItem: (productId: string) => {
    set({
      cart: get().cart.filter(item => item.id !== productId)
    })
  },
  
  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    
    set({
      cart: get().cart.map(item =>
        item.id === productId
          ? { 
              ...item, 
              quantity, 
              total: quantity * item.price 
            }
          : item
      )
    })
  },
  
  clearCart: () => {
    set({
      cart: [],
      customer: null
    })
  },
  
  setCustomer: (customer: Customer | null) => {
    set({ customer })
  },
  
  setProcessing: (processing: boolean) => {
    set({ isProcessing: processing })
  },
  
  // Utility functions
  getCartItem: (productId: string) => {
    return get().cart.find(item => item.id === productId)
  },
  
  hasItem: (productId: string) => {
    return get().cart.some(item => item.id === productId)
  }
}))