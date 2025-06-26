import { ShoppingCart, Package } from 'lucide-react'
import { Product } from '@/shared/lib/mockData'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/employee/hooks/useAuth'

interface ProductGridProps {
  products: Product[]
  loading?: boolean
}

export function ProductGrid({ products, loading = false }: ProductGridProps) {
  const { addItem, hasItem } = useCheckoutStore()
  const { permissions, isAuthenticated } = useAuth()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      wine: 'bg-red-100 text-red-800',
      liquor: 'bg-amber-100 text-amber-800',
      beer: 'bg-yellow-100 text-yellow-800',
      rtd: 'bg-blue-100 text-blue-800',
      accessories: 'bg-gray-100 text-gray-800'
    }
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="animate-pulse">
              <div className="bg-gray-200 h-32 rounded-lg mb-3"></div>
              <div className="bg-gray-200 h-4 rounded mb-2"></div>
              <div className="bg-gray-200 h-3 rounded mb-2"></div>
              <div className="bg-gray-200 h-6 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Package className="w-16 h-16 mb-4" />
        <h3 className="text-lg font-medium mb-2">No products found</h3>
        <p className="text-sm">Try adjusting your search or category filter</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-6">
      {products.map((product) => (
        <div
          key={product.id}
          className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200"
        >
          {/* Product Image Placeholder */}
          <div className="aspect-square bg-gray-100 rounded-t-lg flex items-center justify-center">
            <div className="text-4xl">
              {product.category === 'wine' && '🍷'}
              {product.category === 'liquor' && '🥃'}
              {product.category === 'beer' && '🍺'}
              {product.category === 'rtd' && '🥤'}
              {product.category === 'accessories' && '🔧'}
            </div>
          </div>

          {/* Product Info */}
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${getCategoryColor(product.category)}`}>
                {product.category.toUpperCase()}
              </span>
              <span className="text-xs text-gray-500">{product.size}</span>
            </div>

            <h3 className="font-medium text-sm text-gray-900 mb-2 line-clamp-2 leading-tight">
              {product.name}
            </h3>

            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-bold text-gray-900">
                {formatCurrency(product.price)}
              </div>
              <div className={`text-xs px-2 py-1 rounded-full ${
                product.inStock 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {product.inStock ? 'In Stock' : 'Out of Stock'}
              </div>
            </div>

            {isAuthenticated && permissions.canProcessSales ? (
              <Button
                onClick={() => addItem(product)}
                disabled={!product.inStock}
                className={`w-full ${
                  hasItem(product.id) 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {hasItem(product.id) ? 'Added' : 'Add to Cart'}
              </Button>
            ) : (
              <Button
                disabled
                className="w-full bg-gray-300 text-gray-500 cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                {!isAuthenticated ? 'Login Required' : 'No Permission'}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}