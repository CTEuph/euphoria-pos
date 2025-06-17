import React from 'react';
import { PlusIcon } from 'lucide-react';
export const ProductCard = ({
  product,
  addToCart
}) => {
  return <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="h-40 overflow-hidden">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <h3 className="font-medium text-slate-800 mb-1 truncate" title={product.name}>
          {product.name}
        </h3>
        <p className="text-sm text-slate-500 mb-2">{product.type}</p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">${product.price.toFixed(2)}</span>
          <button onClick={() => addToCart(product)} className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors" aria-label={`Add ${product.name} to cart`}>
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>;
};