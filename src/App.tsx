import { useState, useMemo } from 'react'
import { TopBar } from '@/features/layout/components/TopBar'
import { Sidebar } from '@/features/layout/components/Sidebar'
import { ProductGrid } from '@/features/product/components/ProductGrid'
import { ShoppingCart } from '@/features/checkout/components/ShoppingCart'
import { BarcodeInput } from '@/features/checkout/components/BarcodeInput'
import { mockProducts } from '@/shared/lib/mockData'

function App() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

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

  return (
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
  )
}

export default App