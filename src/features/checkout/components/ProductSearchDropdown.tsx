import { forwardRef } from 'react'
import { Package, Hash } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Product } from '@/shared/lib/mockData'

interface ProductSearchDropdownProps {
  results: Product[]
  selectedIndex: number
  onSelect: (product: Product) => void
  onClose: () => void
  isOpen: boolean
  className?: string
}

interface ProductSearchItemProps {
  product: Product
  isSelected: boolean
  onClick: () => void
}

const ProductSearchItem = forwardRef<HTMLDivElement, ProductSearchItemProps>(
  ({ product, isSelected, onClick }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 p-3 cursor-pointer transition-colors",
          "hover:bg-purple-50 border-b border-gray-100 last:border-b-0",
          isSelected && "bg-purple-100 border-purple-200"
        )}
        onClick={onClick}
        role="option"
        aria-selected={isSelected}
      >
        {/* Product Icon */}
        <div className={cn(
          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
          "bg-gray-100 text-gray-600",
          isSelected && "bg-purple-200 text-purple-700"
        )}>
          <Package className="w-4 h-4" />
        </div>
        
        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className={cn(
              "text-sm font-medium truncate",
              isSelected ? "text-purple-900" : "text-gray-900"
            )}>
              {product.name}
            </p>
            <span className={cn(
              "text-sm font-semibold ml-2 flex-shrink-0",
              isSelected ? "text-purple-700" : "text-gray-700"
            )}>
              ${product.price.toFixed(2)}
            </span>
          </div>
          
          <div className="flex items-center gap-4 mt-1">
            {/* SKU/Barcode */}
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Hash className="w-3 h-3" />
              <span className="font-mono">{product.barcode}</span>
            </div>
            
            {/* Size & Category */}
            <div className="flex items-center gap-2 text-xs">
              <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                product.category === 'wine' && "bg-red-100 text-red-700",
                product.category === 'liquor' && "bg-amber-100 text-amber-700", 
                product.category === 'beer' && "bg-yellow-100 text-yellow-700",
                product.category === 'rtd' && "bg-blue-100 text-blue-700",
                product.category === 'accessories' && "bg-gray-100 text-gray-700"
              )}>
                {product.category}
              </span>
              <span className="text-gray-500">{product.size}</span>
            </div>
          </div>
          
          {/* Stock Status */}
          <div className="flex items-center justify-between mt-1">
            <span className={cn(
              "text-xs font-medium",
              product.inStock ? "text-green-600" : "text-red-600"
            )}>
              {product.inStock ? "In Stock" : "Out of Stock"}
            </span>
          </div>
        </div>
      </div>
    )
  }
)

ProductSearchItem.displayName = 'ProductSearchItem'

export const ProductSearchDropdown = forwardRef<HTMLDivElement, ProductSearchDropdownProps>(
  ({ results, selectedIndex, onSelect, onClose, isOpen, className }, ref) => {
    if (!isOpen || results.length === 0) {
      return null
    }

    return (
      <>
        {/* Backdrop to close dropdown when clicking outside */}
        <div 
          className="fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
        
        {/* Dropdown Content */}
        <div
          ref={ref}
          className={cn(
            "absolute top-full left-0 right-0 z-50 mt-1",
            "bg-white border border-gray-200 rounded-lg shadow-lg",
            "max-h-64 overflow-y-auto",
            className
          )}
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No products found</p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            <>
              {/* Results Header */}
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-medium text-gray-600">
                  {results.length} product{results.length !== 1 ? 's' : ''} found
                </p>
              </div>
              
              {/* Product Results */}
              <div className="max-h-48 overflow-y-auto">
                {results.map((product, index) => (
                  <ProductSearchItem
                    key={product.id}
                    product={product}
                    isSelected={index === selectedIndex}
                    onClick={() => onSelect(product)}
                  />
                ))}
              </div>
              
              {/* Navigation Hint */}
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Use ↑↓ arrows to navigate, Enter to select, Esc to close
                </p>
              </div>
            </>
          )}
        </div>
      </>
    )
  }
)

ProductSearchDropdown.displayName = 'ProductSearchDropdown'