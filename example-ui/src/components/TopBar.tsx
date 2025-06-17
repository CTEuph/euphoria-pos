import React from 'react';
import { SearchIcon, UserIcon, BellIcon, SettingsIcon } from 'lucide-react';
export const TopBar = ({
  lookupCustomer
}) => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  return <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center">
        <div className="mr-6">
          <h1 className="text-xl font-bold text-blue-600">Euphoria Liquor</h1>
        </div>
        <div className="relative ml-4 flex items-center">
          <div className="h-5 w-5 text-slate-500 mr-2" />
          <input type="text" placeholder="Scan barcode or enter SKU" className="border border-slate-300 rounded-md py-1.5 px-3 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      <div className="flex items-center space-x-6">
        <div className="text-right">
          <div className="text-sm text-slate-500">{currentDate}</div>
          <div className="font-medium">{currentTime}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Cashier</div>
          <div className="font-medium">Sam Wilson</div>
        </div>
        <div className="flex space-x-3">
          <button className="p-2 rounded-full hover:bg-slate-100" title="Search">
            <SearchIcon className="h-5 w-5 text-slate-600" />
          </button>
          <button className="p-2 rounded-full hover:bg-slate-100" title="Customer Lookup" onClick={() => lookupCustomer()}>
            <UserIcon className="h-5 w-5 text-slate-600" />
          </button>
          <button className="p-2 rounded-full hover:bg-slate-100" title="Notifications">
            <BellIcon className="h-5 w-5 text-slate-600" />
          </button>
          <button className="p-2 rounded-full hover:bg-slate-100" title="Settings">
            <SettingsIcon className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>
    </header>;
};