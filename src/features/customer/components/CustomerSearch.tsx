import { useState } from 'react'
import { Search, User, Phone, CreditCard } from 'lucide-react'
import { mockCustomers, Customer } from '@/shared/lib/mockData'
import { useCheckoutStore } from '@/features/checkout/store/checkoutStore'
import { Button } from '@/components/ui/button'

interface CustomerSearchProps {
  isOpen: boolean
  onClose: () => void
}

export function CustomerSearch({ isOpen, onClose }: CustomerSearchProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const { setCustomer } = useCheckoutStore()

  // Filter customers based on search term
  const filteredCustomers = mockCustomers.filter(customer => 
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm) ||
    (customer.email && customer.email.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSelectCustomer = (customer: Customer) => {
    setCustomer(customer)
    onClose()
    setSearchTerm('')
  }

  const handleCreateNew = () => {
    // This would open a new customer form in a real implementation
    alert('Create new customer functionality would go here')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Find Customer</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Customer List */}
        <div className="max-h-64 overflow-y-auto">
          {searchTerm.trim() === '' ? (
            <div className="p-8 text-center text-gray-500">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Start typing to search for customers</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-500 mb-4">
                <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No customers found for "{searchTerm}"</p>
              </div>
              <Button onClick={handleCreateNew} className="bg-purple-600 hover:bg-purple-700">
                Create New Customer
              </Button>
            </div>
          ) : (
            <div className="py-2">
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => handleSelectCustomer(customer)}
                  className="w-full px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                >
                  <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div className="flex items-center space-x-3 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Phone className="w-3 h-3 mr-1" />
                        {customer.phone}
                      </span>
                      <span className="flex items-center">
                        <CreditCard className="w-3 h-3 mr-1" />
                        {customer.loyaltyPoints.toLocaleString()} pts
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {searchTerm.trim() && filteredCustomers.length === 0 && (
            <Button onClick={handleCreateNew} className="bg-purple-600 hover:bg-purple-700">
              Create New Customer
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}