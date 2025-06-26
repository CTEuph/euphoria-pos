/**
 * Tests for useAuth hook
 * Tests authentication state management, IPC integration, and permission checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuth, usePermission, useRequirePermission, useSessionStatus } from './useAuth'
import { useAuthStore } from '../store/authStore'
import type { LoginResult, Employee } from '../types'

// Mock Electron API
const mockElectronAuth = {
  login: vi.fn()
}

Object.defineProperty(window, 'electron', {
  value: {
    auth: mockElectronAuth
  },
  writable: true
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console to avoid noise
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}

vi.stubGlobal('console', consoleMock)

describe('useAuth', () => {
  const mockEmployee: Employee = {
    id: 'emp_012345656789012345656789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin',
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
    // Reset store state
    useAuthStore.getState().logout()
    vi.clearAllMocks()
    
    // Mock current time
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial State', () => {
    it('should have correct initial state when not authenticated', () => {
      const { result } = renderHook(() => useAuth())
      
      expect(result.current.currentUser).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.isSessionExpired).toBe(false)
      expect(result.current.permissions).toBeNull()
      expect(result.current.userRole).toBeNull()
      expect(result.current.userFullName).toBeNull()
      expect(result.current.isManagerOrAbove).toBe(false)
      expect(result.current.isOwner).toBe(false)
    })

    it('should provide authentication actions', () => {
      const { result } = renderHook(() => useAuth())
      
      expect(typeof result.current.login).toBe('function')
      expect(typeof result.current.logout).toBe('function')
      expect(typeof result.current.updateActivity).toBe('function')
      expect(typeof result.current.extendSession).toBe('function')
      expect(typeof result.current.canPerformAction).toBe('function')
      expect(typeof result.current.requiresPermission).toBe('function')
    })
  })

  describe('Login', () => {
    it('should handle successful login', async () => {
      mockElectronAuth.login.mockResolvedValue(mockLoginResult)
      
      const { result } = renderHook(() => useAuth())
      
      let loginResult: LoginResult
      await act(async () => {
        loginResult = await result.current.login({ pin: '123456' })
      })
      
      expect(mockElectronAuth.login).toHaveBeenCalledWith({ pin: '123456' })
      expect(loginResult!.success).toBe(true)
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.currentUser).toEqual(mockEmployee)
      expect(result.current.userFullName).toBe('John Doe')
      expect(result.current.userRole).toBe('cashier')
    })

    it('should handle failed login', async () => {
      const failedResult = { success: false, error: 'Invalid PIN' }
      mockElectronAuth.login.mockResolvedValue(failedResult)
      
      const { result } = renderHook(() => useAuth())
      
      let loginResult: LoginResult
      await act(async () => {
        loginResult = await result.current.login({ pin: '123456' })
      })
      
      expect(loginResult!.success).toBe(false)
      expect(loginResult!.error).toBe('Invalid PIN')
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('should handle login system errors', async () => {
      mockElectronAuth.login.mockRejectedValue(new Error('IPC Error'))
      
      const { result } = renderHook(() => useAuth())
      
      let loginResult: LoginResult
      await act(async () => {
        loginResult = await result.current.login({ pin: '123456' })
      })
      
      expect(loginResult!.success).toBe(false)
      expect(loginResult!.error).toBe('IPC Error')
    })
  })

  describe('Logout', () => {
    it('should handle logout', async () => {
      mockElectronAuth.login.mockResolvedValue(mockLoginResult)
      
      const { result } = renderHook(() => useAuth())
      
      // Login first
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      expect(result.current.isAuthenticated).toBe(true)
      
      // Then logout
      act(() => {
        result.current.logout()
      })
      
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.currentUser).toBeNull()
    })
  })

  describe('Permission Checks', () => {
    beforeEach(async () => {
      mockElectronAuth.login.mockResolvedValue(mockLoginResult)
      
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
    })

    it('should check permissions correctly for cashier', () => {
      const { result } = renderHook(() => useAuth())
      
      expect(result.current.canPerformAction('canProcessSales')).toBe(true)
      expect(result.current.canPerformAction('canProcessRefunds')).toBe(false)
      expect(result.current.canPerformAction('canAccessSettings')).toBe(false)
    })

    it('should require permissions correctly', () => {
      const { result } = renderHook(() => useAuth())
      
      // Should not throw for allowed action
      expect(() => {
        result.current.requiresPermission('canProcessSales')
      }).not.toThrow()
      
      // Should throw for disallowed action
      expect(() => {
        result.current.requiresPermission('canProcessRefunds')
      }).toThrow('Permission denied: canProcessRefunds requires higher privileges than cashier')
    })

    it('should require authentication for permission checks', () => {
      const { result } = renderHook(() => useAuth())
      
      // Logout first
      act(() => {
        result.current.logout()
      })
      
      expect(() => {
        result.current.requiresPermission('canProcessSales')
      }).toThrow('Authentication required')
    })
  })

  describe('Role Checks', () => {
    it('should identify manager role correctly', async () => {
      const managerEmployee = { ...mockEmployee, role: 'manager' as const }
      const managerResult = { success: true, employee: managerEmployee }
      mockElectronAuth.login.mockResolvedValue(managerResult)
      
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      expect(result.current.userRole).toBe('manager')
      expect(result.current.isManagerOrAbove).toBe(true)
      expect(result.current.isOwner).toBe(false)
    })

    it('should identify owner role correctly', async () => {
      const ownerEmployee = { ...mockEmployee, role: 'owner' as const }
      const ownerResult = { success: true, employee: ownerEmployee }
      mockElectronAuth.login.mockResolvedValue(ownerResult)
      
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      expect(result.current.userRole).toBe('owner')
      expect(result.current.isManagerOrAbove).toBe(true)
      expect(result.current.isOwner).toBe(true)
    })
  })

  describe('Activity Tracking', () => {
    beforeEach(async () => {
      mockElectronAuth.login.mockResolvedValue(mockLoginResult)
    })

    it('should update activity automatically on hook usage', async () => {
      const { result } = renderHook(() => useAuth())
      
      // Mock login to track activity
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      expect(result.current.timeSinceLastActivity).toBe(0)
    })

    it('should update activity manually', async () => {
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      // Advance time
      vi.advanceTimersByTime(30 * 1000)
      
      act(() => {
        result.current.updateActivity()
      })
      
      expect(result.current.timeSinceLastActivity).toBe(0)
    })

    it('should not update activity when not authenticated', () => {
      const { result } = renderHook(() => useAuth())
      
      // Should not throw when not authenticated
      act(() => {
        result.current.updateActivity()
      })
      
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('Session Management', () => {
    beforeEach(async () => {
      mockElectronAuth.login.mockResolvedValue(mockLoginResult)
    })

    it('should track session duration', async () => {
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      // Advance time by 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)
      
      expect(result.current.sessionDuration).toBe(5)
    })

    it('should check session timeout', async () => {
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      // Advance time past timeout (1 minute)
      vi.advanceTimersByTime(61 * 1000)
      
      const hasTimedOut = result.current.checkSessionTimeout()
      expect(hasTimedOut).toBe(true)
      expect(result.current.isSessionExpired).toBe(true)
    })

    it('should extend session', async () => {
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      // Advance time
      vi.advanceTimersByTime(30 * 1000)
      
      act(() => {
        result.current.extendSession()
      })
      
      expect(result.current.remainingSessionTime).toBeGreaterThan(0.5)
    })

    it('should handle session expiry', async () => {
      const { result } = renderHook(() => useAuth())
      
      await act(async () => {
        await result.current.login({ pin: '123456' })
      })
      
      // Force session expiry
      vi.advanceTimersByTime(61 * 1000)
      result.current.checkSessionTimeout()
      
      act(() => {
        result.current.handleSessionExpiry()
      })
      
      expect(result.current.isAuthenticated).toBe(false)
    })
  })
})

describe('usePermission', () => {
  const mockEmployee: Employee = {
    id: 'emp_012345656789012345656789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin',
    role: 'cashier',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  beforeEach(() => {
    useAuthStore.getState().logout()
    vi.clearAllMocks()
    
    // Login a cashier
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
  })

  it('should return permission status', () => {
    const { result: salesResult } = renderHook(() => usePermission('canProcessSales'))
    const { result: refundResult } = renderHook(() => usePermission('canProcessRefunds'))
    
    expect(salesResult.current).toBe(true)
    expect(refundResult.current).toBe(false)
  })
})

describe('useRequirePermission', () => {
  const mockEmployee: Employee = {
    id: 'emp_012345656789012345656789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin',
    role: 'cashier',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  beforeEach(() => {
    useAuthStore.getState().logout()
    vi.clearAllMocks()
  })

  it('should not throw for allowed permissions', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    expect(() => {
      renderHook(() => useRequirePermission('canProcessSales'))
    }).not.toThrow()
  })

  it('should throw for disallowed permissions', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    expect(() => {
      renderHook(() => useRequirePermission('canProcessRefunds'))
    }).toThrow('Permission denied')
  })
})

describe('useSessionStatus', () => {
  const mockEmployee: Employee = {
    id: 'emp_012345656789012345656789',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '$2b$12$hashedpin',
    role: 'cashier',
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  beforeEach(() => {
    useAuthStore.getState().logout()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should provide session health information', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    const { result } = renderHook(() => useSessionStatus())
    
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.sessionHealth).toBe('good')
    expect(result.current.isNearExpiry).toBe(false)
  })

  it('should detect near expiry', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    // Advance to near expiry (50 seconds)
    vi.advanceTimersByTime(50 * 1000)
    
    const { result } = renderHook(() => useSessionStatus())
    
    expect(result.current.sessionHealth).toBe('critical')
    expect(result.current.isNearExpiry).toBe(true)
  })

  it('should detect timeout', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    // Advance past timeout
    vi.advanceTimersByTime(61 * 1000)
    
    const { result } = renderHook(() => useSessionStatus())
    
    expect(result.current.hasTimedOut).toBe(true)
  })
})