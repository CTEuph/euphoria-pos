/**
 * Authentication Store - Zustand slice for managing authentication state
 * Handles current user, session, permissions, and logout functionality
 * Designed for macOS desktop app - no server sessions needed
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Employee, EmployeeRole, LoginResult } from '../types'
import { ROLE_PERMISSIONS } from '../types'

interface AuthState {
  // Current session
  currentUser: Employee | null
  isAuthenticated: boolean
  sessionStartTime: Date | null
  lastActivityTime: Date | null
  
  // Permissions (computed from role)
  permissions: ReturnType<typeof ROLE_PERMISSIONS[EmployeeRole]> | null
  
  // Session timeout settings
  sessionTimeoutMinutes: number
  isSessionExpired: boolean
  
  // Actions
  login: (result: LoginResult) => void
  logout: () => void
  updateActivity: () => void
  checkSessionTimeout: () => boolean
  extendSession: () => void
  clearExpiredSession: () => void
  
  // Getters
  getSessionDuration: () => number
  getTimeSinceLastActivity: () => number
  canPerformAction: (action: keyof typeof ROLE_PERMISSIONS[EmployeeRole]) => boolean
}

/**
 * Authentication store with persistence for macOS desktop app
 * Persists authentication state to localStorage for cart preservation
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      sessionStartTime: null,
      lastActivityTime: null,
      permissions: null,
      sessionTimeoutMinutes: 1, // 1 minute for POS security
      isSessionExpired: false,

      // Login action - set user and initialize session
      login: (result: LoginResult) => {
        if (!result.success || !result.employee) {
          console.error('Invalid login result provided to authStore.login')
          return
        }

        const now = new Date()
        const permissions = ROLE_PERMISSIONS[result.employee.role]

        set({
          currentUser: result.employee,
          isAuthenticated: true,
          sessionStartTime: now,
          lastActivityTime: now,
          permissions,
          isSessionExpired: false
        })

        console.log(`User ${result.employee.firstName} ${result.employee.lastName} logged in with role: ${result.employee.role}`)
      },

      // Logout action - clear all authentication state
      logout: () => {
        const { currentUser } = get()
        
        set({
          currentUser: null,
          isAuthenticated: false,
          sessionStartTime: null,
          lastActivityTime: null,
          permissions: null,
          isSessionExpired: false
        })

        if (currentUser) {
          console.log(`User ${currentUser.firstName} ${currentUser.lastName} logged out`)
        }
      },

      // Update last activity time
      updateActivity: () => {
        const { isAuthenticated } = get()
        
        if (isAuthenticated) {
          set({
            lastActivityTime: new Date(),
            isSessionExpired: false
          })
        }
      },

      // Check if session has expired based on inactivity
      checkSessionTimeout: () => {
        const { isAuthenticated, lastActivityTime, sessionTimeoutMinutes } = get()
        
        if (!isAuthenticated || !lastActivityTime) {
          return false
        }

        const now = new Date()
        const timeSinceActivity = now.getTime() - lastActivityTime.getTime()
        const timeoutMs = sessionTimeoutMinutes * 60 * 1000
        
        const hasExpired = timeSinceActivity > timeoutMs
        
        if (hasExpired) {
          set({ isSessionExpired: true })
        }
        
        return hasExpired
      },

      // Extend session - reset activity timer
      extendSession: () => {
        const { isAuthenticated } = get()
        
        if (isAuthenticated) {
          set({
            lastActivityTime: new Date(),
            isSessionExpired: false
          })
        }
      },

      // Clear expired session while preserving transaction data
      clearExpiredSession: () => {
        const { currentUser } = get()
        
        set({
          currentUser: null,
          isAuthenticated: false,
          sessionStartTime: null,
          lastActivityTime: null,
          permissions: null,
          isSessionExpired: false
        })

        if (currentUser) {
          console.log(`Session expired for user ${currentUser.firstName} ${currentUser.lastName}`)
        }
      },

      // Get total session duration in minutes
      getSessionDuration: () => {
        const { sessionStartTime } = get()
        
        if (!sessionStartTime) return 0
        
        const now = new Date()
        return Math.floor((now.getTime() - sessionStartTime.getTime()) / (1000 * 60))
      },

      // Get time since last activity in minutes
      getTimeSinceLastActivity: () => {
        const { lastActivityTime } = get()
        
        if (!lastActivityTime) return 0
        
        const now = new Date()
        return Math.floor((now.getTime() - lastActivityTime.getTime()) / (1000 * 60))
      },

      // Check if current user can perform a specific action
      canPerformAction: (action) => {
        const { permissions } = get()
        
        if (!permissions) return false
        
        return permissions[action] === true
      }
    }),
    {
      name: 'euphoria-pos-auth', // localStorage key
      storage: createJSONStorage(() => localStorage),
      
      // Only persist essential data for cart preservation
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        sessionStartTime: state.sessionStartTime,
        lastActivityTime: state.lastActivityTime,
        permissions: state.permissions,
        isSessionExpired: state.isSessionExpired
      }),
      
      // Custom serialization for Date objects
      serialize: (state) => {
        return JSON.stringify({
          ...state,
          state: {
            ...state.state,
            sessionStartTime: state.state.sessionStartTime?.toISOString() || null,
            lastActivityTime: state.state.lastActivityTime?.toISOString() || null
          }
        })
      },
      
      // Custom deserialization for Date objects
      deserialize: (str) => {
        const parsed = JSON.parse(str)
        return {
          ...parsed,
          state: {
            ...parsed.state,
            sessionStartTime: parsed.state.sessionStartTime ? new Date(parsed.state.sessionStartTime) : null,
            lastActivityTime: parsed.state.lastActivityTime ? new Date(parsed.state.lastActivityTime) : null
          }
        }
      }
    }
  )
)

// Computed selectors for common use cases
export const authSelectors = {
  // Get current user info
  getCurrentUser: () => useAuthStore.getState().currentUser,
  
  // Check if user is authenticated
  isAuthenticated: () => useAuthStore.getState().isAuthenticated,
  
  // Get user's role
  getUserRole: () => useAuthStore.getState().currentUser?.role || null,
  
  // Get user's full name
  getUserFullName: () => {
    const user = useAuthStore.getState().currentUser
    return user ? `${user.firstName} ${user.lastName}` : null
  },
  
  // Check if current user is manager or above
  isManagerOrAbove: () => {
    const role = useAuthStore.getState().currentUser?.role
    return role === 'manager' || role === 'owner'
  },
  
  // Check if current user is owner
  isOwner: () => {
    return useAuthStore.getState().currentUser?.role === 'owner'
  },
  
  // Get remaining session time in minutes
  getRemainingSessionTime: () => {
    const { lastActivityTime, sessionTimeoutMinutes } = useAuthStore.getState()
    
    if (!lastActivityTime) return 0
    
    const now = new Date()
    const timeSinceActivity = (now.getTime() - lastActivityTime.getTime()) / (1000 * 60)
    return Math.max(0, sessionTimeoutMinutes - timeSinceActivity)
  }
}