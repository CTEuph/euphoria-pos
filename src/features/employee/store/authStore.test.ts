/**
 * Tests for Authentication Store
 * Tests login/logout, session management, permissions, and persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore, authSelectors } from './authStore'
import type { LoginResult, Employee } from '../types'

// Mock localStorage for testing
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console methods to avoid noise in tests
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}

vi.stubGlobal('console', consoleMock)

describe('AuthStore', () => {
  // Test employee data
  const mockEmployee: Employee = {
    id: 'emp_01234567890123456789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin', // Would be hashed PIN
    role: 'cashier',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  const mockLoginResult: LoginResult = {
    success: true,
    employee: mockEmployee
  }

  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.getState().logout()
    vi.clearAllMocks()
    
    // Mock current time for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState()
      
      expect(state.currentUser).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.sessionStartTime).toBeNull()
      expect(state.lastActivityTime).toBeNull()
      expect(state.permissions).toBeNull()
      expect(state.sessionTimeoutMinutes).toBe(1)
      expect(state.isSessionExpired).toBe(false)
    })
  })

  describe('Login', () => {
    it('should set authentication state on successful login', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      const state = useAuthStore.getState()
      expect(state.currentUser).toEqual(mockEmployee)
      expect(state.isAuthenticated).toBe(true)
      expect(state.sessionStartTime).toEqual(new Date('2024-01-01T12:00:00Z'))
      expect(state.lastActivityTime).toEqual(new Date('2024-01-01T12:00:00Z'))
      expect(state.permissions).toBeDefined()
      expect(state.isSessionExpired).toBe(false)
    })

    it('should set cashier permissions for cashier role', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      const state = useAuthStore.getState()
      expect(state.permissions?.canProcessSales).toBe(true)
      expect(state.permissions?.canProcessRefunds).toBe(false)
      expect(state.permissions?.canVoidTransactions).toBe(false)
      expect(state.permissions?.canViewReports).toBe(false)
      expect(state.permissions?.canResetPins).toBe(false)
      expect(state.permissions?.canAccessSettings).toBe(false)
    })

    it('should set manager permissions for manager role', () => {
      const managerEmployee = { ...mockEmployee, role: 'manager' as const }
      const managerResult = { success: true, employee: managerEmployee }
      
      const store = useAuthStore.getState()
      store.login(managerResult)
      
      const state = useAuthStore.getState()
      expect(state.permissions?.canProcessSales).toBe(true)
      expect(state.permissions?.canProcessRefunds).toBe(true)
      expect(state.permissions?.canVoidTransactions).toBe(true)
      expect(state.permissions?.canViewReports).toBe(true)
      expect(state.permissions?.canResetPins).toBe(true)
      expect(state.permissions?.canAccessSettings).toBe(false)
    })

    it('should set owner permissions for owner role', () => {
      const ownerEmployee = { ...mockEmployee, role: 'owner' as const }
      const ownerResult = { success: true, employee: ownerEmployee }
      
      const store = useAuthStore.getState()
      store.login(ownerResult)
      
      const state = useAuthStore.getState()
      expect(state.permissions?.canProcessSales).toBe(true)
      expect(state.permissions?.canProcessRefunds).toBe(true)
      expect(state.permissions?.canVoidTransactions).toBe(true)
      expect(state.permissions?.canViewReports).toBe(true)
      expect(state.permissions?.canResetPins).toBe(true)
      expect(state.permissions?.canAccessSettings).toBe(true)
    })

    it('should handle invalid login result gracefully', () => {
      const invalidResult = { success: false, error: 'Invalid PIN' }
      const store = useAuthStore.getState()
      
      store.login(invalidResult as any)
      
      const state = useAuthStore.getState()
      expect(state.currentUser).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(consoleMock.error).toHaveBeenCalledWith('Invalid login result provided to authStore.login')
    })

    it('should log successful login', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      expect(consoleMock.log).toHaveBeenCalledWith('User John Doe logged in with role: cashier')
    })
  })

  describe('Logout', () => {
    it('should clear all authentication state on logout', () => {
      const store = useAuthStore.getState()
      
      // Login first
      store.login(mockLoginResult)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      
      // Then logout
      store.logout()
      
      const state = useAuthStore.getState()
      expect(state.currentUser).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.sessionStartTime).toBeNull()
      expect(state.lastActivityTime).toBeNull()
      expect(state.permissions).toBeNull()
      expect(state.isSessionExpired).toBe(false)
    })

    it('should log successful logout', () => {
      const store = useAuthStore.getState()
      
      store.login(mockLoginResult)
      store.logout()
      
      expect(consoleMock.log).toHaveBeenCalledWith('User John Doe logged out')
    })

    it('should handle logout when not logged in', () => {
      const store = useAuthStore.getState()
      
      // Logout without being logged in
      store.logout()
      
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      // Should not crash or log anything
    })
  })

  describe('Activity Tracking', () => {
    it('should update last activity time', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000)
      store.updateActivity()
      
      const state = useAuthStore.getState()
      expect(state.lastActivityTime).toEqual(new Date('2024-01-01T12:00:30Z'))
      expect(state.isSessionExpired).toBe(false)
    })

    it('should not update activity when not authenticated', () => {
      const store = useAuthStore.getState()
      
      store.updateActivity()
      
      const state = useAuthStore.getState()
      expect(state.lastActivityTime).toBeNull()
    })

    it('should clear session expired flag when updating activity', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Force session to expire
      vi.advanceTimersByTime(2 * 60 * 1000) // 2 minutes
      store.checkSessionTimeout()
      expect(useAuthStore.getState().isSessionExpired).toBe(true)
      
      // Update activity should clear expired flag
      store.updateActivity()
      expect(useAuthStore.getState().isSessionExpired).toBe(false)
    })
  })

  describe('Session Timeout', () => {
    it('should detect session timeout after 1 minute of inactivity', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 1 minute and 1 second
      vi.advanceTimersByTime(61 * 1000)
      
      const hasExpired = store.checkSessionTimeout()
      
      expect(hasExpired).toBe(true)
      expect(useAuthStore.getState().isSessionExpired).toBe(true)
    })

    it('should not timeout within the timeout period', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 30 seconds (less than 1 minute timeout)
      vi.advanceTimersByTime(30 * 1000)
      
      const hasExpired = store.checkSessionTimeout()
      
      expect(hasExpired).toBe(false)
      expect(useAuthStore.getState().isSessionExpired).toBe(false)
    })

    it('should return false when not authenticated', () => {
      const store = useAuthStore.getState()
      
      const hasExpired = store.checkSessionTimeout()
      
      expect(hasExpired).toBe(false)
    })

    it('should extend session and reset timeout', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000)
      store.extendSession()
      
      // Advance another 30 seconds (total 1 minute from login, but only 30s from extend)
      vi.advanceTimersByTime(30 * 1000)
      
      const hasExpired = store.checkSessionTimeout()
      expect(hasExpired).toBe(false)
    })

    it('should clear expired session', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      store.clearExpiredSession()
      
      const state = useAuthStore.getState()
      expect(state.currentUser).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isSessionExpired).toBe(false)
      expect(consoleMock.log).toHaveBeenCalledWith('Session expired for user John Doe')
    })
  })

  describe('Session Duration Tracking', () => {
    it('should calculate session duration correctly', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)
      
      const duration = store.getSessionDuration()
      expect(duration).toBe(5)
    })

    it('should return 0 when not logged in', () => {
      const store = useAuthStore.getState()
      
      const duration = store.getSessionDuration()
      expect(duration).toBe(0)
    })

    it('should calculate time since last activity', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      // Advance time by 3 minutes
      vi.advanceTimersByTime(3 * 60 * 1000)
      
      const timeSinceActivity = store.getTimeSinceLastActivity()
      expect(timeSinceActivity).toBe(3)
    })
  })

  describe('Permission Checks', () => {
    it('should check permissions correctly for cashier', () => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
      
      expect(store.canPerformAction('canProcessSales')).toBe(true)
      expect(store.canPerformAction('canProcessRefunds')).toBe(false)
      expect(store.canPerformAction('canManageEmployees')).toBe(false)
    })

    it('should return false when not authenticated', () => {
      const store = useAuthStore.getState()
      
      expect(store.canPerformAction('canProcessSales')).toBe(false)
    })
  })

  describe('Selectors', () => {
    beforeEach(() => {
      const store = useAuthStore.getState()
      store.login(mockLoginResult)
    })

    it('should get current user', () => {
      expect(authSelectors.getCurrentUser()).toEqual(mockEmployee)
    })

    it('should check authentication status', () => {
      expect(authSelectors.isAuthenticated()).toBe(true)
    })

    it('should get user role', () => {
      expect(authSelectors.getUserRole()).toBe('cashier')
    })

    it('should get user full name', () => {
      expect(authSelectors.getUserFullName()).toBe('John Doe')
    })

    it('should check if user is manager or above', () => {
      expect(authSelectors.isManagerOrAbove()).toBe(false)
      
      // Test with manager
      const managerEmployee = { ...mockEmployee, role: 'manager' as const }
      const store = useAuthStore.getState()
      store.logout()
      store.login({ success: true, employee: managerEmployee })
      
      expect(authSelectors.isManagerOrAbove()).toBe(true)
    })

    it('should check if user is owner', () => {
      expect(authSelectors.isOwner()).toBe(false)
      
      // Test with owner
      const ownerEmployee = { ...mockEmployee, role: 'owner' as const }
      const store = useAuthStore.getState()
      store.logout()
      store.login({ success: true, employee: ownerEmployee })
      
      expect(authSelectors.isOwner()).toBe(true)
    })

    it('should calculate remaining session time', () => {
      // Advance time by 30 seconds
      vi.advanceTimersByTime(30 * 1000)
      
      const remaining = authSelectors.getRemainingSessionTime()
      expect(remaining).toBe(0.5) // 0.5 minutes remaining
    })

    it('should return null for user info when not authenticated', () => {
      const store = useAuthStore.getState()
      store.logout()
      
      expect(authSelectors.getCurrentUser()).toBeNull()
      expect(authSelectors.isAuthenticated()).toBe(false)
      expect(authSelectors.getUserRole()).toBeNull()
      expect(authSelectors.getUserFullName()).toBeNull()
      expect(authSelectors.getRemainingSessionTime()).toBe(0)
    })
  })
})