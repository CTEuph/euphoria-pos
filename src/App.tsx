import { useState, useMemo, useEffect } from 'react'
import { TopBar } from '@/features/layout/components/TopBar'
import { Sidebar } from '@/features/layout/components/Sidebar'
import { ProductGrid } from '@/features/product/components/ProductGrid'
import { ShoppingCart } from '@/features/checkout/components/ShoppingCart'
import { BarcodeInput } from '@/features/checkout/components/BarcodeInput'
import { AuthGuard } from '@/features/employee/components/AuthGuard'
import { mockProducts } from '@/shared/lib/mockData'
import { useBarcodeScanner } from '@/features/checkout/hooks/useBarcodeScanner'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { DEFAULT_SCANNER_SHORTCUTS } from '@/features/checkout/types'
import { toast } from '@/shared/hooks/useToast'
import { Toaster } from '@/shared/components/Toaster'
import { playErrorSound, playSuccessSound } from '@/shared/lib/audio'

function App() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Checkout store for cart management and modal states
  const { addItem, isPaymentModalOpen, isCustomerModalOpen } = useCheckoutStore()

  // Filter products based on category and search term
  const filteredProducts = useMemo(() => {
    let filtered = mockProducts

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(product => product.category === selectedCategory)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(search) ||
        product.barcode.includes(search)
      )
    }

    return filtered
  }, [selectedCategory, searchTerm])

  // Find product by barcode helper
  const findProductByBarcode = (barcode: string) => {
    return mockProducts.find(product => product.barcode === barcode)
  }

  // Global barcode scanner hook
  const { enableAudio } = useBarcodeScanner({
    onScan: (barcode: string, isShortcut = false) => {
      // Clear any active search when scanner is used
      const searchInput = document.getElementById('product-search') as HTMLInputElement
      if (searchInput && searchInput.value) {
        searchInput.value = ''
        // Trigger input event to update React state
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      }

      const product = findProductByBarcode(barcode)
      if (product) {
        addItem(product)
        const shortcutIcon = isShortcut ? '🎯 ' : '📟 '
        toast.success(`${shortcutIcon}Added ${product.name}`)
        playSuccessSound()
      } else {
        toast.error('Product not found')
        playErrorSound()
      }
    },
    enabled: !isPaymentModalOpen && !isCustomerModalOpen,
    shortcuts: DEFAULT_SCANNER_SHORTCUTS
  })

  // Enable audio on first user interaction
  useEffect(() => {
    const handleFirstClick = () => {
      enableAudio()
      document.removeEventListener('click', handleFirstClick)
    }
    document.addEventListener('click', handleFirstClick)
    return () => document.removeEventListener('click', handleFirstClick)
  }, [enableAudio])

  return (
    <>
      <AuthGuard
        requireAuth={true}
        requiredRole="cashier"
        loginMessage="Welcome to Euphoria POS. Please authenticate to continue."
        autoRestoreTransactions={true}
      >
        <div className="h-screen flex flex-col bg-gray-100">
          {/* Top Bar */}
          <TopBar />
          
          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar */}
            <Sidebar
              selectedCategory={selectedCategory}
              onCategorySelect={setSelectedCategory}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
            
            {/* Center Product Area */}
            <div className="flex-1 flex flex-col">
              {/* Barcode Scanner Input */}
              <BarcodeInput />
              
              {/* Product Grid */}
              <div className="flex-1 overflow-y-auto bg-gray-50">
                <ProductGrid products={filteredProducts} />
              </div>
            </div>
            
            {/* Right Shopping Cart */}
            <ShoppingCart />
          </div>
        </div>
      </AuthGuard>
      
      {/* Toast Notifications */}
      <Toaster />
    </>
  )
}

export default App