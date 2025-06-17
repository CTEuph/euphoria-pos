import React, { useState } from 'react';
import { CartItem } from './CartItem';
import { CustomerInfo } from './CustomerInfo';
import { CreditCardIcon, BanknoteIcon, DivideIcon, ReceiptIcon, TrashIcon } from 'lucide-react';
export const RightSidebar = ({
  cartItems,
  updateQuantity,
  removeFromCart,
  clearCart,
  customerInfo,
  setCustomerInfo
}) => {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.0825; // 8.25% tax rate
  const total = subtotal + tax;
  return <aside className="w-[350px] border-l border-slate-200 bg-white flex flex-col">
      <div className="p-4 flex-1 overflow-y-auto">
        <CustomerInfo customer={customerInfo} setCustomerInfo={setCustomerInfo} />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Current Sale</h2>
          {cartItems.length > 0 && <button onClick={clearCart} className="flex items-center text-sm text-red-500 hover:text-red-700">
              <TrashIcon className="h-4 w-4 mr-1" />
              Clear All
            </button>}
        </div>
        {cartItems.length === 0 ? <div className="text-center py-8 text-slate-500">
            <ReceiptIcon className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p>No items in cart</p>
            <p className="text-sm">Select products to add them here</p>
          </div> : <div className="divide-y divide-slate-200">
            {cartItems.map(item => <CartItem key={item.id} item={item} updateQuantity={updateQuantity} removeFromCart={removeFromCart} />)}
          </div>}
      </div>
      <div className="border-t border-slate-200 p-4 bg-white">
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Tax (8.25%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-slate-800 pt-2 border-t border-slate-200">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button className="bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center">
            <CreditCardIcon className="h-5 w-5 mr-2" />
            Card
          </button>
          <button className="bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center">
            <BanknoteIcon className="h-5 w-5 mr-2" />
            Cash
          </button>
        </div>
        <button className="w-full border border-blue-600 text-blue-600 py-3 px-4 rounded-md hover:bg-blue-50 transition-colors flex items-center justify-center">
          <DivideIcon className="h-5 w-5 mr-2" />
          Split Payment
        </button>
      </div>
    </aside>;
};