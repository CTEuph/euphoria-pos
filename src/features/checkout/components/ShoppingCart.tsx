import { useState, useRef, useCallback } from 'react'
import { Minus, Plus, Trash2, User, CreditCard } from 'lucide-react'
import { useCheckoutStore } from '../store/checkoutStore'
import { CustomerSearch } from '@/features/customer/components/CustomerSearch'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/employee/hooks/useAuth'

export function ShoppingCart() {
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const cartScrollRef = useRef<HTMLDivElement>(null)
  const { permissions, isAuthenticated, currentUser } = useAuth()
  const { 
    cart, 
    customer, 
    subtotal, 
    tax, 
    total, 
    itemCount, 
    updateQuantity, 
    removeItem, 
    clearCart,
    processPayment,
    isProcessing
  } = useCheckoutStore()

  // Scroll to bottom when cart changes (new items added)
  const scrollToBottom = useCallback(() => {
    if (cartScrollRef.current) {
      cartScrollRef.current.scrollTop = cartScrollRef.current.scrollHeight
    }
  }, [])

  // Use a ref callback to scroll when cart length changes
  const prevCartLength = useRef(cart.length)
  if (cart.length > prevCartLength.current) {
    setTimeout(scrollToBottom, 50) // Small delay to ensure DOM is updated
  }
  prevCartLength.current = cart.length

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  // Handle payment processing
  const handlePayment = async (paymentMethod: 'cash' | 'card' | 'split') => {
    if (!currentUser?.id) {
      alert('Error: No employee logged in')
      return
    }

    setIsProcessingPayment(true)
    
    try {
      const result = await processPayment(
        paymentMethod,
        total, // For now, assume exact payment
        currentUser.id
      )

      if (result.success) {
        alert(`Payment successful! Transaction #${result.transactionNumber}`)
      } else {
        alert(`Payment failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Payment processing error:', error)
      alert('Payment failed: Unexpected error occurred')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Cart Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Cart ({itemCount})
          </h2>
          {cart.length > 0 && isAuthenticated && permissions.canProcessSales && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={clearCart}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Customer Info */}
      <div className="p-4 border-b border-gray-200">
        {customer ? (
          <div className="flex items-center space-x-3 p-3 bg-purple-50 rounded-lg">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{customer.name}</div>
              <div className="text-sm text-gray-500">{customer.phone}</div>
              <div className="text-sm text-purple-600">
                {customer.loyaltyPoints.toLocaleString()} points
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => useCheckoutStore.getState().setCustomer(null)}
            >
              ✕
            </Button>
          </div>
        ) : (
          isAuthenticated && permissions.canProcessSales ? (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setShowCustomerSearch(true)}
            >
              <User className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          ) : (
            <div className="text-center p-3 bg-gray-50 text-gray-500 rounded-lg text-sm">
              {!isAuthenticated 
                ? "Log in to add customers" 
                : "No permission to manage customers"
              }
            </div>
          )
        )}
      </div>

      {/* Cart Items */}
      <div ref={cartScrollRef} className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-4xl mb-2">🛒</div>
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs">Scan or add products to get started</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-2">
                    <h4 className="font-medium text-sm text-gray-900 leading-tight">
                      {item.name}
                    </h4>
                    <p className="text-xs text-gray-500">{item.size}</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    className="text-red-600 hover:text-red-700 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-8 h-8 p-0"
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="font-medium text-sm w-8 text-center">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-8 h-8 p-0"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="font-semibold text-sm">
                    {formatCurrency(item.total)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Summary and Payment */}
      {cart.length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tax:</span>
              <span>{formatCurrency(tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-semibold border-t pt-2">
              <span>Total:</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
          
          <div className="space-y-2">
            {isAuthenticated && permissions.canProcessSales ? (
              <>
                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  onClick={() => handlePayment('card')}
                  disabled={isProcessing || isProcessingPayment}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {isProcessing || isProcessingPayment ? 'Processing...' : 'Process Payment'}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handlePayment('card')}
                    disabled={isProcessing || isProcessingPayment}
                  >
                    💳 Card
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handlePayment('cash')}
                    disabled={isProcessing || isProcessingPayment}
                  >
                    💵 Cash
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center p-3 bg-yellow-50 text-yellow-700 rounded-lg text-sm">
                {!isAuthenticated 
                  ? "Please log in to process payments" 
                  : "You don't have permission to process sales"
                }
              </div>
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