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
  
  // Search state
  searchTerm: string
  searchResults: Product[]
  selectedResultIndex: number
  isSearchDropdownOpen: boolean
  
  // Computed values
  get subtotal(): number
  get tax(): number
  get total(): number
  get itemCount(): number
  
  // Search computed values
  get hasSearchResults(): boolean
  get selectedResult(): Product | null
  
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
  
  // Search actions
  setSearchTerm: (term: string) => void
  setSelectedResultIndex: (index: number) => void
  selectSearchResult: (product: Product) => void
  clearSearch: () => void
  openSearchDropdown: () => void
  closeSearchDropdown: () => void
  
  // Utility functions
  getCartItem: (productId: string) => CartItem | undefined
  hasItem: (productId: string) => boolean
}

export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  // Initial state
  cart: [],
  customer: null,
  isProcessing: false,
  
  // Modal states
  isPaymentModalOpen: false,
  isCustomerModalOpen: false,
  
  // Search state
  searchTerm: '',
  searchResults: [],
  selectedResultIndex: -1,
  isSearchDropdownOpen: false,
  
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
  
  // Search computed values
  get hasSearchResults() {
    return get().searchResults.length > 0
  },
  
  get selectedResult() {
    const { searchResults, selectedResultIndex } = get()
    if (selectedResultIndex >= 0 && selectedResultIndex < searchResults.length) {
      return searchResults[selectedResultIndex]
    }
    return null
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
  
  // Modal state actions
  setPaymentModal: (open: boolean) => {
    set({ isPaymentModalOpen: open })
  },
  
  setCustomerModal: (open: boolean) => {
    set({ isCustomerModalOpen: open })
  },
  
  // Search actions
  setSearchTerm: (term: string) => {
    set({ 
      searchTerm: term,
      selectedResultIndex: -1 // Reset selection when term changes
    })
  },
  
  setSelectedResultIndex: (index: number) => {
    const { searchResults } = get()
    if (index >= -1 && index < searchResults.length) {
      set({ selectedResultIndex: index })
    }
  },
  
  selectSearchResult: (product: Product) => {
    get().addItem(product)
    get().clearSearch()
  },
  
  clearSearch: () => {
    set({
      searchTerm: '',
      searchResults: [],
      selectedResultIndex: -1,
      isSearchDropdownOpen: false
    })
  },
  
  openSearchDropdown: () => {
    set({ isSearchDropdownOpen: true })
  },
  
  closeSearchDropdown: () => {
    set({ isSearchDropdownOpen: false })
  },
  
  // Utility functions
  getCartItem: (productId: string) => {
    return get().cart.find(item => item.id === productId)
  },
  
  hasItem: (productId: string) => {
    return get().cart.some(item => item.id === productId)
  }
}))