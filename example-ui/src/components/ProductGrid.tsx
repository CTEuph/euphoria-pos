import React from 'react';
import { ProductCard } from './ProductCard';
export const ProductGrid = ({
  selectedCategory,
  searchQuery,
  addToCart
}) => {
  // Sample product data - in a real app, this would come from an API
  const products = [{
    id: 1,
    name: 'Dom Pérignon Vintage 2012',
    type: 'Champagne',
    price: 219.99,
    category: 'wine',
    image: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 2,
    name: 'Macallan 18 Year',
    type: 'Single Malt Scotch',
    price: 349.99,
    category: 'spirits',
    image: 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 3,
    name: 'Veuve Clicquot Brut',
    type: 'Champagne',
    price: 59.99,
    category: 'wine',
    image: 'https://images.unsplash.com/photo-1592861611588-15b5b0b0dc0f?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 4,
    name: 'Grey Goose',
    type: 'Vodka',
    price: 39.99,
    category: 'spirits',
    image: 'https://images.unsplash.com/photo-1614313511387-1436a4480ebb?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 5,
    name: 'Heineken',
    type: 'Lager Beer',
    price: 12.99,
    category: 'beer',
    image: 'https://images.unsplash.com/photo-1618885472179-5e474019f2a9?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 6,
    name: 'White Claw Variety Pack',
    type: 'Hard Seltzer',
    price: 18.99,
    category: 'rtd',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 7,
    name: 'Marlboro Red',
    type: 'Cigarettes',
    price: 10.99,
    category: 'tobacco',
    image: 'https://images.unsplash.com/photo-1579187707643-35646d22b596?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 8,
    name: 'Caymus Cabernet Sauvignon',
    type: 'Red Wine',
    price: 89.99,
    category: 'wine',
    image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }, {
    id: 9,
    name: 'Don Julio 1942',
    type: 'Tequila',
    price: 179.99,
    category: 'spirits',
    image: 'https://images.unsplash.com/photo-1578271887552-5ac3a72752bc?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60'
  }];
  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesSearch = searchQuery === '' || product.name.toLowerCase().includes(searchQuery.toLowerCase()) || product.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });
  return <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800">
          {selectedCategory === 'all' ? 'All Products' : products.find(p => p.category === selectedCategory)?.category}
        </h2>
        <p className="text-slate-500">{filteredProducts.length} items</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map(product => <ProductCard key={product.id} product={product} addToCart={addToCart} />)}
      </div>
    </main>;
};