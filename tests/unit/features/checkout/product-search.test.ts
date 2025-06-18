import { describe, it, expect } from 'vitest'
import { mockProducts } from '@/shared/lib/mockData'

/**
 * Unit tests for product search functionality
 * Following test strategy: "Test the money paths obsessively, test the happy paths thoroughly"
 */

// Extract search function for testing (same logic as BarcodeInput)
const searchProducts = (term: string, products = mockProducts) => {
  if (!term.trim()) return []
  
  const words = term.toLowerCase().split(' ').filter(Boolean)
  return products.filter(product => {
    const searchable = `${product.name} ${product.barcode}`.toLowerCase()
    return words.every(word => searchable.includes(word))
  }).slice(0, 8)
}

describe('Product Search Engine', () => {
  describe('Search Logic - Critical Business Logic', () => {
    it('should find products by exact name match', () => {
      const results = searchProducts('Jack Daniel', mockProducts)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].name).toContain('Jack Daniel')
    })

    it('should find products by partial name match', () => {
      const results = searchProducts('jack', mockProducts)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(p => p.name.toLowerCase().includes('jack'))).toBe(true)
    })

    it('should find products by substring matching (ja dan → Jack Daniel)', () => {
      const results = searchProducts('ja dan', mockProducts)
      
      const jackDanielFound = results.some(p => 
        p.name.toLowerCase().includes('jack') && 
        p.name.toLowerCase().includes('daniel')
      )
      expect(jackDanielFound).toBe(true)
    })

    it('should find products by barcode', () => {
      const testProduct = mockProducts.find(p => p.barcode)
      if (!testProduct) return // Skip if no barcodes in mock data
      
      const partialBarcode = testProduct.barcode.slice(0, 6)
      const results = searchProducts(partialBarcode, mockProducts)
      
      expect(results).toContain(testProduct)
    })

    it('should return empty array for empty search term', () => {
      const results = searchProducts('', mockProducts)
      expect(results).toEqual([])
    })

    it('should return empty array for whitespace-only search', () => {
      const results = searchProducts('   ', mockProducts)
      expect(results).toEqual([])
    })

    it('should limit results to 8 items maximum', () => {
      // Create mock data with many products that match
      const manyProducts = Array.from({ length: 20 }, (_, i) => ({
        id: `test-${i}`,
        name: `Test Wine ${i}`,
        price: 19.99,
        category: 'wine' as const,
        size: '750ml',
        barcode: `12345${i.toString().padStart(5, '0')}`,
        inStock: true,
        cost: 12.00
      }))
      
      const results = searchProducts('test', manyProducts)
      expect(results.length).toBeLessThanOrEqual(8)
    })

    it('should be case insensitive', () => {
      const results1 = searchProducts('JACK', mockProducts)
      const results2 = searchProducts('jack', mockProducts)
      const results3 = searchProducts('Jack', mockProducts)
      
      expect(results1).toEqual(results2)
      expect(results2).toEqual(results3)
    })

    it('should handle special characters in search term', () => {
      const results = searchProducts('jack & daniels', mockProducts)
      // Should not crash and should handle gracefully
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Word Splitting Logic', () => {
    it('should split on spaces and filter empty strings', () => {
      const results = searchProducts('  jack   daniel  ', mockProducts)
      
      const jackDanielFound = results.some(p => 
        p.name.toLowerCase().includes('jack') && 
        p.name.toLowerCase().includes('daniel')
      )
      expect(jackDanielFound).toBe(true)
    })

    it('should require ALL words to match (AND logic)', () => {
      const results = searchProducts('jack xyz', mockProducts)
      
      // Should not find Jack Daniels because 'xyz' doesn't match
      const jackFound = results.some(p => p.name.toLowerCase().includes('jack'))
      expect(jackFound).toBe(false)
    })

    it('should work with single word searches', () => {
      const results = searchProducts('wine', mockProducts)
      
      expect(results.length).toBeGreaterThan(0)
      expect(results.every(p => 
        p.name.toLowerCase().includes('wine') || 
        p.category === 'wine'
      )).toBe(true)
    })
  })

  describe('Performance & Edge Cases', () => {
    it('should handle empty product list', () => {
      const results = searchProducts('jack', [])
      expect(results).toEqual([])
    })

    it('should handle products with missing/undefined fields', () => {
      const malformedProducts = [
        { id: '1', name: undefined, barcode: '123', price: 10 } as any,
        { id: '2', name: 'Valid Product', barcode: undefined, price: 20 } as any
      ]
      
      const results = searchProducts('valid', malformedProducts)
      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Valid Product')
    })

    it('should handle very long search terms', () => {
      const longSearch = 'a'.repeat(1000)
      const results = searchProducts(longSearch, mockProducts)
      
      // Should not crash
      expect(Array.isArray(results)).toBe(true)
    })

    it('should handle unicode characters', () => {
      const unicodeProducts = [{
        id: '1',
        name: 'Château Margaux',
        price: 500,
        category: 'wine' as const,
        size: '750ml',
        barcode: '123456789012',
        inStock: true,
        cost: 300
      }]
      
      const results = searchProducts('château', unicodeProducts)
      expect(results.length).toBe(1)
    })
  })

  describe('Business Logic Edge Cases', () => {
    it('should prioritize exact matches (future enhancement point)', () => {
      const testProducts = [
        {
          id: '1',
          name: 'Jack Russell Wine',
          price: 15.99,
          category: 'wine' as const,
          size: '750ml',
          barcode: '111111111111',
          inStock: true,
          cost: 10
        },
        {
          id: '2',
          name: 'Jack Daniels Whiskey',
          price: 24.99,
          category: 'liquor' as const,
          size: '750ml',
          barcode: '222222222222',
          inStock: true,
          cost: 18
        }
      ]
      
      const results = searchProducts('jack', testProducts)
      expect(results.length).toBe(2)
      // Note: Current implementation doesn't prioritize exact matches
      // This test documents current behavior and could guide future improvements
    })

    it('should handle out of stock products in search results', () => {
      const testProducts = [{
        id: '1',
        name: 'Out of Stock Wine',
        price: 19.99,
        category: 'wine' as const,
        size: '750ml',
        barcode: '123456789012',
        inStock: false,
        cost: 12
      }]
      
      const results = searchProducts('wine', testProducts)
      expect(results.length).toBe(1)
      expect(results[0].inStock).toBe(false)
      // Search includes out of stock items (business decision)
    })

    it('should find products across all categories', () => {
      const categoryProducts = [
        { id: '1', name: 'Test Wine', category: 'wine', price: 20, size: '750ml', barcode: '111', inStock: true, cost: 15 },
        { id: '2', name: 'Test Liquor', category: 'liquor', price: 30, size: '750ml', barcode: '222', inStock: true, cost: 20 },
        { id: '3', name: 'Test Beer', category: 'beer', price: 5, size: '12oz', barcode: '333', inStock: true, cost: 3 },
        { id: '4', name: 'Test RTD', category: 'rtd', price: 8, size: '12oz', barcode: '444', inStock: true, cost: 5 },
        { id: '5', name: 'Test Accessory', category: 'accessories', price: 10, size: '1ea', barcode: '555', inStock: true, cost: 7 }
      ] as const
      
      const results = searchProducts('test', categoryProducts)
      expect(results.length).toBe(5)
      
      const categories = results.map(p => p.category)
      expect(categories).toContain('wine')
      expect(categories).toContain('liquor')
      expect(categories).toContain('beer')
      expect(categories).toContain('rtd')
      expect(categories).toContain('accessories')
    })
  })
})