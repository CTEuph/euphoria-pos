import { useState, useRef, useEffect, useCallback } from 'react'
import { Scan, Search } from 'lucide-react'
import { mockProducts } from '@/shared/lib/mockData'
import { useCheckoutStore } from '../store/checkoutStore'
import { useProductSearch } from '../hooks/useProductSearch'
import { ProductSearchDropdown } from './ProductSearchDropdown'
import { Button } from '@/components/ui/button'
import { toast } from '@/shared/hooks/useToast'
import { playErrorSound } from '@/shared/lib/audio'

export function BarcodeInput() {
  const [inputValue, setInputValue] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const { addItem } = useCheckoutStore()
  const {
    searchResults,
    selectedIndex,
    isOpen,
    hasResults,
    selectedResult,
    search,
    addSelectedToCart,
    clearSearch,
    handleKeyDown: handleSearchKeyDown
  } = useProductSearch()

  // Determine if input should be in search mode vs barcode mode
  const isSearchMode = useCallback((value: string) => {
    // Search mode if: less than 12 chars OR contains letters OR empty
    return value.length < 12 || /[a-zA-Z]/.test(value) || value.trim() === ''
  }, [])

  // Handle barcode scanning (numeric input, 12+ digits)
  const handleScan = useCallback((code: string) => {
    if (!code.trim()) return

    // Find product by barcode
    const product = mockProducts.find(p => p.barcode === code.trim())
    
    if (product) {
      addItem(product)
      setInputValue('')
      setSearchMode(false)
      clearSearch()
      
      // Show success feedback
      setIsScanning(true)
      setTimeout(() => setIsScanning(false), 1000)
      toast.success(`Added ${product.name}`)
    } else {
      // Handle unknown barcode with toast and audio feedback
      toast.error('Product not found')
      playErrorSound()
      setInputValue('')
      setSearchMode(false)
      clearSearch()
    }
  }, [addItem, clearSearch])

  // Handle form submission (Enter key or button click)
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    
    if (searchMode && hasResults && selectedResult) {
      // Search mode: add selected result
      addSelectedToCart()
      setInputValue('')
      setSearchMode(false)
    } else if (!searchMode && inputValue.trim()) {
      // Barcode mode: try to scan
      handleScan(inputValue)
    }
  }, [searchMode, hasResults, selectedResult, addSelectedToCart, inputValue, handleScan])

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    const shouldSearchMode = isSearchMode(value)
    setSearchMode(shouldSearchMode)
    
    if (shouldSearchMode) {
      // Search mode: update search term
      search(value)
    } else {
      // Barcode mode: clear search and auto-submit when complete
      clearSearch()
      
      // Auto-submit when barcode reaches typical length (scanner input)
      if (value.length >= 12 && /^\d+$/.test(value)) {
        setTimeout(() => handleScan(value), 100)
      }
    }
  }, [isSearchMode, search, clearSearch, handleScan])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (searchMode && isOpen) {
      // Let search hook handle navigation
      const handled = handleSearchKeyDown(e.nativeEvent)
      if (handled) {
        e.preventDefault()
      }
    }
  }, [searchMode, isOpen, handleSearchKeyDown])

  // Handle dropdown product selection
  const handleSelectProduct = useCallback((product: any) => {
    addItem(product)
    setInputValue('')
    setSearchMode(false)
    clearSearch()
    toast.success(`Added ${product.name}`)
    
    // Return focus to input
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [addItem, clearSearch])

  // Focus input on mount and when component becomes visible
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        inputRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current.contains(event.target as Node)
      ) {
        clearSearch()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, clearSearch])

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
            {isScanning ? (
              <div className="w-5 h-5 text-green-500">✓</div>
            ) : searchMode ? (
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
            placeholder={searchMode ? "Search products by name..." : "Scan barcode or enter manually..."}
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
            onClose={clearSearch}
            isOpen={isOpen && searchMode}
          />
        </div>
        
        <Button 
          type="submit" 
          className="px-6 bg-purple-600 hover:bg-purple-700"
          disabled={!inputValue.trim() && !(searchMode && hasResults)}
        >
          {searchMode ? <Search className="w-5 h-5" /> : <Scan className="w-5 h-5" />}
        </Button>
      </form>
      
      <div className="mt-2 text-xs text-gray-500">
        {searchMode ? (
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