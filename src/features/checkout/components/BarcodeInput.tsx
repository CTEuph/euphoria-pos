import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Scan, Search } from 'lucide-react'
import { mockProducts, Product } from '@/shared/lib/mockData'
import { useCheckoutStore } from '../store/checkoutStore'
import { ProductSearchDropdown } from './ProductSearchDropdown'
import { Button } from '@/components/ui/button'
import { toast } from '@/shared/hooks/useToast'
import { playErrorSound } from '@/shared/lib/audio'

// Simple search function - no complex state management
const searchProducts = (term: string): Product[] => {
  if (!term.trim()) return []
  
  const words = term.toLowerCase().split(' ').filter(Boolean)
  return mockProducts.filter(product => {
    const searchable = `${product.name} ${product.barcode}`.toLowerCase()
    return words.every(word => searchable.includes(word))
  }).slice(0, 8)
}

export function BarcodeInput() {
  const [inputValue, setInputValue] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isScanning, setIsScanning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const { addItem } = useCheckoutStore()

  // Simple computed values - no complex state management
  const isSearchMode = inputValue.length < 12 || /[a-zA-Z]/.test(inputValue)
  const searchResults = useMemo(() => isSearchMode ? searchProducts(inputValue) : [], [inputValue, isSearchMode])
  const hasResults = searchResults.length > 0
  const isDropdownOpen = isSearchMode && hasResults
  const selectedResult = hasResults && selectedIndex >= 0 && selectedIndex < searchResults.length 
    ? searchResults[selectedIndex] 
    : null

  // Handle barcode scanning (numeric input, 12+ digits)
  const handleScan = useCallback((code: string) => {
    if (!code.trim()) return

    const product = mockProducts.find(p => p.barcode === code.trim())
    
    if (product) {
      addItem(product)
      setInputValue('')
      setIsScanning(true)
      setTimeout(() => setIsScanning(false), 1000)
      toast.success(`Added ${product.name}`)
    } else {
      toast.error('Product not found')
      playErrorSound()
      setInputValue('')
    }
  }, [addItem])

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    setSelectedIndex(0) // Reset selection when input changes
    
    // Auto-submit for barcode mode (check new value, not current state)
    const newIsSearchMode = value.length < 12 || /[a-zA-Z]/.test(value)
    if (!newIsSearchMode && value.length >= 12 && /^\d+$/.test(value)) {
      setTimeout(() => handleScan(value), 100)
    }
  }, [handleScan])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (isDropdownOpen) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => {
            const newIndex = prev < searchResults.length - 1 ? prev + 1 : 0
            // Scroll the selected item into view
            setTimeout(() => {
              const selectedItem = document.querySelector('[role="option"][aria-selected="true"]')
              if (selectedItem) {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }
            }, 0)
            return newIndex
          })
          return
          
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          setSelectedIndex(prev => {
            const newIndex = prev > 0 ? prev - 1 : searchResults.length - 1
            // Scroll the selected item into view
            setTimeout(() => {
              const selectedItem = document.querySelector('[role="option"][aria-selected="true"]')
              if (selectedItem) {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }
            }, 0)
            return newIndex
          })
          return
          
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          if (selectedResult) {
            addItem(selectedResult)
            setInputValue('')
            setSelectedIndex(0)
            toast.success(`Added ${selectedResult.name}`)
          }
          return
          
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          setInputValue('')
          setSelectedIndex(0)
          return
      }
    }
  }, [isDropdownOpen, searchResults.length, selectedResult, addItem])

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    
    if (isDropdownOpen && selectedResult) {
      // Search mode with selection
      addItem(selectedResult)
      setInputValue('')
      setSelectedIndex(0)
      toast.success(`Added ${selectedResult.name}`)
    } else if (!isSearchMode && inputValue.trim()) {
      // Barcode mode
      handleScan(inputValue)
    }
  }, [isDropdownOpen, selectedResult, isSearchMode, inputValue, addItem, handleScan])

  // Handle dropdown product selection
  const handleSelectProduct = useCallback((product: Product) => {
    addItem(product)
    setInputValue('')
    setSelectedIndex(0)
    toast.success(`Added ${product.name}`)
    
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [addItem])

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
            {isScanning ? (
              <div className="w-5 h-5 text-green-500">✓</div>
            ) : isSearchMode ? (
              <Search className="w-5 h-5 text-purple-500" />
            ) : (
              <Scan className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isSearchMode ? "Search products by name..." : "Scan barcode or enter manually..."}
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
            autoFocus
            autoComplete="off"
            id="product-search"
          />
          
          {/* Search Dropdown */}
          <ProductSearchDropdown
            ref={dropdownRef}
            results={searchResults}
            selectedIndex={selectedIndex}
            onSelect={handleSelectProduct}
            onClose={() => {
              setInputValue('')
              setSelectedIndex(0)
            }}
            isOpen={isDropdownOpen}
          />
        </div>
        
        <Button 
          type="submit" 
          className="px-6 bg-purple-600 hover:bg-purple-700"
          disabled={!inputValue.trim()}
        >
          {isSearchMode ? <Search className="w-5 h-5" /> : <Scan className="w-5 h-5" />}
        </Button>
      </form>
      
      <div className="mt-2 text-xs text-gray-500">
        {isSearchMode ? (
          <>
            Search products by typing name or barcode • {hasResults ? `${searchResults.length} results` : 'No results'} • Use ↑↓ arrows to navigate
          </>
        ) : (
          'Scan products with barcode scanner or type manually and press Enter'
        )}
      </div>
    </div>
  )
}