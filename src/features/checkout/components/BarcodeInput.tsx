import { useState, useRef, useEffect } from 'react'
import { Scan, Search } from 'lucide-react'
import { mockProducts } from '@/shared/lib/mockData'
import { useCheckoutStore } from '../store/checkoutStore'
import { Button } from '@/components/ui/button'

export function BarcodeInput() {
  const [barcode, setBarcode] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addItem } = useCheckoutStore()

  const handleScan = (code: string) => {
    if (!code.trim()) return

    // Find product by barcode
    const product = mockProducts.find(p => p.barcode === code.trim())
    
    if (product) {
      addItem(product)
      setBarcode('')
      // Show success feedback
      setIsScanning(true)
      setTimeout(() => setIsScanning(false), 1000)
    } else {
      // Handle unknown barcode - could show a modal or notification
      alert(`Product not found for barcode: ${code}`)
      setBarcode('')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleScan(barcode)
  }

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBarcode(value)
    
    // Auto-submit when barcode reaches typical length (assumes scanner input)
    if (value.length >= 12 && /^\d+$/.test(value)) {
      setTimeout(() => handleScan(value), 100)
    }
  }

  // Focus input on mount and when component becomes visible
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <div className="bg-white border-b border-gray-200 p-4">
      <form onSubmit={handleSubmit} className="flex space-x-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            {isScanning ? (
              <div className="w-5 h-5 text-green-500">✓</div>
            ) : (
              <Scan className="w-5 h-5 text-gray-400" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={barcode}
            onChange={handleBarcodeChange}
            placeholder="Scan barcode or enter manually..."
            className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
            autoFocus
          />
        </div>
        <Button 
          type="submit" 
          className="px-6 bg-purple-600 hover:bg-purple-700"
          disabled={!barcode.trim()}
        >
          <Search className="w-5 h-5" />
        </Button>
      </form>
      
      <div className="mt-2 text-xs text-gray-500">
        Scan products with barcode scanner or type manually and press Enter
      </div>
    </div>
  )
}