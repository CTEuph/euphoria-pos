import React from 'react';
import { SearchIcon, WineIcon, GlassWaterIcon, BeerIcon, CoffeeIcon, CigaretteIcon, ShoppingBasketIcon } from 'lucide-react';
export const LeftSidebar = ({
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery
}) => {
  const categories = [{
    id: 'all',
    name: 'All Products',
    icon: <ShoppingBasketIcon className="h-5 w-5" />
  }, {
    id: 'wine',
    name: 'Wine',
    icon: <WineIcon className="h-5 w-5" />
  }, {
    id: 'spirits',
    name: 'Spirits',
    icon: <GlassWaterIcon className="h-5 w-5" />
  }, {
    id: 'beer',
    name: 'Beer',
    icon: <BeerIcon className="h-5 w-5" />
  }, {
    id: 'rtd',
    name: 'RTD',
    icon: <CoffeeIcon className="h-5 w-5" />
  }, {
    id: 'tobacco',
    name: 'Tobacco',
    icon: <CigaretteIcon className="h-5 w-5" />
  }];
  return <aside className="w-[300px] border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="relative">
          <input type="text" placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full border border-slate-300 rounded-md py-2 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul>
          {categories.map(category => <li key={category.id}>
              <button onClick={() => setSelectedCategory(category.id)} className={`w-full flex items-center px-4 py-3 text-left ${selectedCategory === category.id ? 'bg-blue-50 text-blue-600 border-r-4 border-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="mr-3">{category.icon}</span>
                <span className="font-medium">{category.name}</span>
              </button>
            </li>)}
        </ul>
      </nav>
      <div className="p-4 border-t border-slate-200">
        <button className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors">
          New Product
        </button>
      </div>
    </aside>;
};