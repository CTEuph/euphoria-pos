import React from 'react';
import { UserIcon, XIcon } from 'lucide-react';
export const CustomerInfo = ({
  customer,
  setCustomerInfo
}) => {
  if (!customer) {
    return <div className="bg-slate-50 rounded-lg p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center text-slate-500">
          <UserIcon className="h-5 w-5 mr-2" />
          <span>No customer selected</span>
        </div>
        <button className="text-blue-600 text-sm font-medium">Look Up</button>
      </div>;
  }
  return <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-blue-800">Customer</h3>
        <button onClick={() => setCustomerInfo(null)} className="text-blue-400 hover:text-blue-600" aria-label="Remove customer">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="text-blue-900 font-medium text-lg mb-1">
        {customer.name}
      </div>
      <div className="text-sm text-blue-700 mb-3">
        <div>{customer.email}</div>
        <div>{customer.phone}</div>
      </div>
      <div className="bg-blue-100 rounded p-2 flex items-center justify-between">
        <span className="text-sm text-blue-800">Loyalty Points</span>
        <span className="font-bold text-blue-800">
          {customer.loyaltyPoints}
        </span>
      </div>
    </div>;
};