import { useMemo, useCallback, useEffect } from 'react'
import { useCheckoutStore } from '../store/checkoutStore'
import { mockProducts, Product } from '@/shared/lib/mockData'

export interface UseProductSearchReturn {
  // State
  searchTerm: string
  searchResults: Product[]
  selectedIndex: number
  isOpen: boolean
  
  // Computed
  hasResults: boolean
  selectedResult: Product | null
  
  // Actions
  search: (term: string) => void
  selectResult: (index: number) => void
  addSelectedToCart: () => void
  clearSearch: () => void
  
  // Navigation
  selectNext: () => void
  selectPrevious: () => void
  handleKeyDown: (event: KeyboardEvent) => boolean
}

/**
 * Intelligent product search with substring matching
 * Supports "ja dan" finding "Jack Daniels" style searches
 */
const searchProducts = (term: string, products: Product[]): Product[] => {
  if (!term.trim()) return []
  
  // Split search term into words, filter empty strings
  const words = term.toLowerCase().split(' ').filter(Boolean)
  
  return products.filter(product => {
    // Create searchable string from name and barcode
    const searchable = `${product.name} ${product.barcode}`.toLowerCase()
    
    // All words must be found in the searchable string (substring matching)
    return words.every(word => searchable.includes(word))
  }).slice(0, 8) // Limit to 8 results for performance and UX
}

export function useProductSearch(): UseProductSearchReturn {
  const {
    searchTerm,
    searchResults,
    selectedResultIndex,
    isSearchDropdownOpen,
    hasSearchResults,
    selectedResult,
    setSearchTerm,
    setSelectedResultIndex,
    selectSearchResult,
    clearSearch,
    openSearchDropdown,
    closeSearchDropdown
  } = useCheckoutStore()
  
  // Memoized search results to prevent unnecessary recalculations
  const results = useMemo(() => {
    return searchProducts(searchTerm, mockProducts)
  }, [searchTerm])
  
  // Update search results when term changes
  useEffect(() => {
    useCheckoutStore.setState({ searchResults: results })
    
    // Open dropdown if we have results and a search term
    if (results.length > 0 && searchTerm.trim()) {
      openSearchDropdown()
    } else {
      closeSearchDropdown()
    }
  }, [results, searchTerm, openSearchDropdown, closeSearchDropdown])
  
  // Search action with debouncing handled by the component
  const search = useCallback((term: string) => {
    setSearchTerm(term)
  }, [setSearchTerm])
  
  // Navigate to next result
  const selectNext = useCallback(() => {
    const maxIndex = searchResults.length - 1
    const nextIndex = selectedResultIndex < maxIndex ? selectedResultIndex + 1 : 0
    setSelectedResultIndex(nextIndex)
  }, [selectedResultIndex, searchResults.length, setSelectedResultIndex])
  
  // Navigate to previous result
  const selectPrevious = useCallback(() => {
    const maxIndex = searchResults.length - 1
    const prevIndex = selectedResultIndex > 0 ? selectedResultIndex - 1 : maxIndex
    setSelectedResultIndex(prevIndex)
  }, [selectedResultIndex, searchResults.length, setSelectedResultIndex])
  
  // Add currently selected result to cart
  const addSelectedToCart = useCallback(() => {
    if (selectedResult) {
      selectSearchResult(selectedResult)
    }
  }, [selectedResult, selectSearchResult])
  
  // Keyboard navigation handler
  const handleKeyDown = useCallback((event: KeyboardEvent): boolean => {
    if (!isSearchDropdownOpen || !hasSearchResults) return false
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        selectNext()
        return true
        
      case 'ArrowUp':
        event.preventDefault()
        selectPrevious()
        return true
        
      case 'Enter':
        event.preventDefault()
        addSelectedToCart()
        return true
        
      case 'Escape':
        event.preventDefault()
        clearSearch()
        return true
        
      default:
        return false
    }
  }, [isSearchDropdownOpen, hasSearchResults, selectNext, selectPrevious, addSelectedToCart, clearSearch])
  
  // Initialize selection to first result when results change
  useEffect(() => {
    if (searchResults.length > 0 && selectedResultIndex === -1) {
      setSelectedResultIndex(0)
    }
  }, [searchResults.length, selectedResultIndex, setSelectedResultIndex])
  
  return {
    // State
    searchTerm,
    searchResults,
    selectedIndex: selectedResultIndex,
    isOpen: isSearchDropdownOpen,
    
    // Computed
    hasResults: hasSearchResults,
    selectedResult,
    
    // Actions
    search,
    selectResult: setSelectedResultIndex,
    addSelectedToCart,
    clearSearch,
    
    // Navigation
    selectNext,
    selectPrevious,
    handleKeyDown
  }
}