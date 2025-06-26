import { useState, useEffect } from 'react'
import { Clock, User, Settings, LogOut, Shield, AlertTriangle, BarChart3, Package, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/employee/hooks/useAuth'
import { useSessionTimeout } from '@/features/employee/hooks/useSessionTimeout'
import { LogoutButton } from '@/features/employee/components/LogoutConfirmation'
import { cn } from '@/shared/lib/utils'

export function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const { 
    currentUser, 
    isAuthenticated, 
    userFullName, 
    userRole, 
    isManagerOrAbove,
    permissions 
  } = useAuth()
  
  const { 
    isActive, 
    isNearExpiry, 
    secondsRemaining, 
    sessionHealth 
  } = useSessionTimeout()

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formattedTime = currentTime.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
  
  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })

  // Session status indicator
  const getSessionStatusIndicator = () => {
    if (!isAuthenticated) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs">
          <AlertTriangle className="w-3 h-3" />
          Not Logged In
        </div>
      )
    }

    if (!isActive) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs">
          <AlertTriangle className="w-3 h-3" />
          Session Expired
        </div>
      )
    }

    if (isNearExpiry) {
      return (
        <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-md text-xs animate-pulse">
          <Clock className="w-3 h-3" />
          {secondsRemaining}s
        </div>
      )
    }

    return (
      <div className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-md text-xs",
        sessionHealth === 'good' && "bg-green-100 text-green-700",
        sessionHealth === 'warning' && "bg-yellow-100 text-yellow-700",
        sessionHealth === 'critical' && "bg-red-100 text-red-700"
      )}>
        <Shield className="w-3 h-3" />
        Active
      </div>
    )
  }

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
          <div className="text-sm font-medium text-gray-900">{formattedDate}</div>
          <div className="text-xs text-gray-500 flex items-center justify-center">
            <Clock className="w-3 h-3 mr-1" />
            {formattedTime}
          </div>
        </div>
      </div>

      {/* Right side - Employee info and actions */}
      <div className="flex items-center space-x-3">
        {isAuthenticated && currentUser ? (
          <>
            {/* Employee information */}
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {userFullName}
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-end gap-2">
                <span className="capitalize">{userRole}</span>
                <span>•</span>
                <span>{currentUser.employeeCode}</span>
              </div>
            </div>

            {/* Session status */}
            <div className="flex flex-col items-center gap-1">
              {getSessionStatusIndicator()}
            </div>

            {/* Action buttons */}
            <div className="flex items-center space-x-2">
              {/* Reports button - Manager+ */}
              {permissions.canViewReports && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                  title="Reports & Analytics"
                >
                  <BarChart3 className="w-4 h-4" />
                </Button>
              )}

              {/* Inventory Management - Manager+ */}
              {permissions.canManageInventory && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                  title="Inventory Management"
                >
                  <Package className="w-4 h-4" />
                </Button>
              )}

              {/* Employee Management - Owner only */}
              {permissions.canManageEmployees && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                  title="Employee Management"
                >
                  <Users className="w-4 h-4" />
                </Button>
              )}

              {/* Settings - Owner only */}
              {permissions.canAccessSettings && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-gray-600 hover:text-gray-900"
                  title="System Settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              )}
              
              <LogoutButton 
                variant="ghost" 
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </LogoutButton>
            </div>
          </>
        ) : (
          /* Not authenticated state */
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-500">Not Logged In</div>
              <div className="text-xs text-gray-400">Please authenticate</div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // This would typically open a login modal or redirect to login
                  console.log('Open login modal')
                }}
              >
                <User className="w-4 h-4 mr-1" />
                Login
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}