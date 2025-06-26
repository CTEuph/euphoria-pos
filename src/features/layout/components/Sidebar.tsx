import { useState } from 'react'
import { Search } from 'lucide-react'
import { categories } from '@/shared/lib/mockData'
import { CustomerSearch } from '@/features/customer/components/CustomerSearch'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/employee/hooks/useAuth'

interface SidebarProps {
  selectedCategory: string | null
  onCategorySelect: (category: string | null) => void
  searchTerm: string
  onSearchChange: (term: string) => void
}

export function Sidebar({ 
  selectedCategory, 
  onCategorySelect, 
  searchTerm, 
  onSearchChange 
}: SidebarProps) {
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const { permissions, isAuthenticated } = useAuth()
  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Categories</h3>
        <div className="space-y-1">
          <Button
            variant={selectedCategory === null ? "default" : "ghost"}
            className="w-full justify-start h-12"
            onClick={() => onCategorySelect(null)}
          >
            <span className="text-lg mr-3">🏪</span>
            <span>All Products</span>
          </Button>
          
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "ghost"}
              className="w-full justify-start h-12"
              onClick={() => onCategorySelect(category.id)}
            >
              <span className="text-lg mr-3">{category.icon}</span>
              <span>{category.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      {isAuthenticated && (
        <div className="p-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
          <div className="space-y-2">
            {/* Customer Lookup - All authenticated users */}
            {permissions.canProcessSales && (
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => setShowCustomerSearch(true)}
              >
                📱 Customer Lookup
              </Button>
            )}
            
            {/* Hold Orders - All authenticated users */}
            {permissions.canManageHoldOrders && (
              <Button 
                variant="outline" 
                className="w-full justify-start"
              >
                📋 Hold Orders
              </Button>
            )}
            
            {/* Returns - Manager+ only */}
            {permissions.canProcessReturns && (
              <Button 
                variant="outline" 
                className="w-full justify-start"
              >
                🔄 Returns
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Customer Search Modal */}
      <CustomerSearch 
        isOpen={showCustomerSearch}
        onClose={() => setShowCustomerSearch(false)}
      />
    </div>
  )
}