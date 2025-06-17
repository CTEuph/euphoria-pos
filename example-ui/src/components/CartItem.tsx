import React from 'react';
import { Plus, Minus, Trash2Icon } from 'lucide-react';
export const CartItem = ({
  item,
  updateQuantity,
  removeFromCart
}) => {
  return <div className="flex py-3 border-b border-slate-200">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border border-slate-200">
        <img src={item.image} alt={item.name} className="h-full w-full object-cover object-center" />
      </div>
      <div className="ml-4 flex flex-1 flex-col">
        <div className="flex justify-between text-base font-medium text-slate-800">
          <h3 className="truncate" title={item.name}>
            {item.name}
          </h3>
          <p className="ml-4">${(item.price * item.quantity).toFixed(2)}</p>
        </div>
        <p className="mt-1 text-sm text-slate-500">{item.type}</p>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center border border-slate-300 rounded-md">
            <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1 text-slate-600 hover:text-blue-600" aria-label="Decrease quantity">
              <Minus className="h-4 w-4" />
            </button>
            <span className="px-2 py-1 text-slate-800 min-w-[30px] text-center">
              {item.quantity}
            </span>
            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 text-slate-600 hover:text-blue-600" aria-label="Increase quantity">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-red-500" aria-label="Remove item">
            <Trash2Icon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>;
};