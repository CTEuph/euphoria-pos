import { Clock, User, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TopBar() {
  const currentTime = new Date().toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
  const currentDate = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Left side - Logo and store info */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">E</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900">Euphoria Liquor</h1>
            <p className="text-xs text-gray-500">Point of Sale</p>
          </div>
        </div>
      </div>

      {/* Center - Date and Time */}
      <div className="flex items-center space-x-4">
        <div className="text-center">
          <div className="text-sm font-medium text-gray-900">{currentDate}</div>
          <div className="text-xs text-gray-500 flex items-center justify-center">
            <Clock className="w-3 h-3 mr-1" />
            {currentTime}
          </div>
        </div>
      </div>

      {/* Right side - Cashier info and actions */}
      <div className="flex items-center space-x-3">
        <div className="text-right">
          <div className="text-sm font-medium text-gray-900">Jane Doe</div>
          <div className="text-xs text-gray-500">Cashier</div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <User className="w-4 h-4 mr-1" />
            Switch User
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}