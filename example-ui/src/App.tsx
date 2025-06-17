import React, { useState } from 'react';
import { TopBar } from './components/TopBar';
import { LeftSidebar } from './components/LeftSidebar';
import { ProductGrid } from './components/ProductGrid';
import { RightSidebar } from './components/RightSidebar';
export function App() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cartItems, setCartItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerInfo, setCustomerInfo] = useState(null);
  const addToCart = product => {
    const existingItem = cartItems.find(item => item.id === product.id);
    if (existingItem) {
      setCartItems(cartItems.map(item => item.id === product.id ? {
        ...item,
        quantity: item.quantity + 1
      } : item));
    } else {
      setCartItems([...cartItems, {
        ...product,
        quantity: 1
      }]);
    }
  };
  const removeFromCart = productId => {
    setCartItems(cartItems.filter(item => item.id !== productId));
  };
  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems(cartItems.map(item => item.id === productId ? {
      ...item,
      quantity
    } : item));
  };
  const clearCart = () => {
    setCartItems([]);
  };
  const lookupCustomer = info => {
    // In a real app, this would call an API
    setCustomerInfo({
      name: 'Alex Johnson',
      email: 'alex@example.com',
      phone: '(555) 123-4567',
      loyaltyPoints: 230
    });
  };
  return <div className="flex flex-col h-screen bg-white text-slate-800">
      <TopBar lookupCustomer={lookupCustomer} />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <ProductGrid selectedCategory={selectedCategory} searchQuery={searchQuery} addToCart={addToCart} />
        <RightSidebar cartItems={cartItems} updateQuantity={updateQuantity} removeFromCart={removeFromCart} clearCart={clearCart} customerInfo={customerInfo} setCustomerInfo={setCustomerInfo} />
      </div>
    </div>;
}