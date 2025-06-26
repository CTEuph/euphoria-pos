/**
 * Tests for useSessionTimeout hook
 * Tests session timeout monitoring, activity tracking, and warning callbacks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionTimeout, useSessionWarning, useSessionTimeDisplay } from './useSessionTimeout'
import { useAuthStore } from '../store/authStore'
import type { Employee } from '../types'

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

describe('useSessionTimeout', () => {
  const mockEmployee: Employee = {
    id: 'emp_01234567890123456789',
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

  describe('Initial State', () => {
    it('should have correct initial state when not authenticated', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      expect(result.current.isActive).toBe(false)
      expect(result.current.isExpired).toBe(false)
      expect(result.current.isNearExpiry).toBe(false)
      expect(result.current.secondsRemaining).toBe(0)
      expect(result.current.minutesRemaining).toBe(0)
    })

    it('should provide timeout management functions', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      expect(typeof result.current.resetTimeout).toBe('function')
      expect(typeof result.current.extendSession).toBe('function')
      expect(typeof result.current.triggerTimeout).toBe('function')
    })
  })

  describe('Authenticated Session', () => {
    beforeEach(() => {
      // Login a user
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should show active session when authenticated', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      expect(result.current.isActive).toBe(true)
      expect(result.current.isExpired).toBe(false)
      expect(result.current.minutesRemaining).toBe(1)
      expect(result.current.secondsRemaining).toBe(60)
    })

    it('should track remaining time correctly', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time by 30 seconds
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      
      expect(result.current.secondsRemaining).toBe(30)
      expect(result.current.minutesRemaining).toBe(1) // Still rounds up to 1
    })

    it('should detect near expiry', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time to 10 seconds remaining (within 15s threshold)
      act(() => {
        vi.advanceTimersByTime(50 * 1000)
      })
      
      expect(result.current.isNearExpiry).toBe(true)
      expect(result.current.secondsRemaining).toBe(10)
    })

    it('should trigger session expiry', () => {
      const onSessionExpire = vi.fn()
      const { result } = renderHook(() => useSessionTimeout({ onSessionExpire }))
      
      // Advance time past timeout
      act(() => {
        vi.advanceTimersByTime(61 * 1000)
      })
      
      expect(result.current.isExpired).toBe(true)
      expect(result.current.isActive).toBe(false)
      expect(onSessionExpire).toHaveBeenCalled()
    })
  })

  describe('Warning Callbacks', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should fire warning callback when near expiry', () => {
      const onSessionWarning = vi.fn()
      const { result } = renderHook(() => 
        useSessionTimeout({ 
          onSessionWarning,
          warningThresholdSeconds: 20 
        })
      )
      
      // Advance time to trigger warning (40 seconds = 20 seconds remaining)
      act(() => {
        vi.advanceTimersByTime(40 * 1000)
      })
      
      expect(onSessionWarning).toHaveBeenCalledWith(expect.any(Number))
      expect(result.current.isNearExpiry).toBe(true)
    })

    it('should fire warning callback only once', () => {
      const onSessionWarning = vi.fn()
      renderHook(() => 
        useSessionTimeout({ 
          onSessionWarning,
          warningThresholdSeconds: 20 
        })
      )
      
      // Advance time to trigger warning
      act(() => {
        vi.advanceTimersByTime(40 * 1000)
      })
      
      // Advance more time but stay in warning zone
      act(() => {
        vi.advanceTimersByTime(5 * 1000)
      })
      
      // Should only be called once
      expect(onSessionWarning).toHaveBeenCalledTimes(1)
    })

    it('should reset warning flag when session is extended', () => {
      const onSessionWarning = vi.fn()
      const { result } = renderHook(() => 
        useSessionTimeout({ 
          onSessionWarning,
          warningThresholdSeconds: 20 
        })
      )
      
      // Advance time to trigger warning
      act(() => {
        vi.advanceTimersByTime(40 * 1000)
      })
      
      expect(onSessionWarning).toHaveBeenCalledTimes(1)
      expect(result.current.isNearExpiry).toBe(true)
      
      // Extend session
      act(() => {
        result.current.extendSession()
      })
      
      expect(result.current.isNearExpiry).toBe(false)
      
      // Advance to warning zone again
      act(() => {
        vi.advanceTimersByTime(40 * 1000)
      })
      
      // Should fire warning again
      expect(onSessionWarning).toHaveBeenCalledTimes(2)
    })
  })

  describe('Activity Tracking', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should reset timeout on user activity', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      
      expect(result.current.secondsRemaining).toBe(30)
      
      // Simulate user activity
      act(() => {
        document.dispatchEvent(new Event('mousedown'))
        vi.advanceTimersByTime(1000) // Allow throttle to process
      })
      
      // Time should reset
      expect(result.current.secondsRemaining).toBe(60)
    })

    it('should handle various activity events', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      const events = ['mousedown', 'keypress', 'click', 'touchstart']
      
      events.forEach(eventType => {
        // Advance time
        act(() => {
          vi.advanceTimersByTime(10 * 1000)
        })
        
        // Trigger activity
        act(() => {
          document.dispatchEvent(new Event(eventType))
          vi.advanceTimersByTime(1000)
        })
        
        // Should reset to full time
        expect(result.current.secondsRemaining).toBe(60)
      })
    })

    it('should throttle activity updates', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      
      // Rapid activity events
      act(() => {
        document.dispatchEvent(new Event('mousedown'))
        document.dispatchEvent(new Event('mousemove'))
        document.dispatchEvent(new Event('click'))
        vi.advanceTimersByTime(500) // Less than throttle time
      })
      
      // Should only process once due to throttling
      expect(result.current.secondsRemaining).toBe(60)
    })
  })

  describe('Manual Controls', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should reset timeout manually', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time
      act(() => {
        vi.advanceTimersByTime(45 * 1000)
      })
      
      expect(result.current.secondsRemaining).toBe(15)
      
      // Reset manually
      act(() => {
        result.current.resetTimeout()
      })
      
      expect(result.current.secondsRemaining).toBe(60)
    })

    it('should extend session manually', () => {
      const { result } = renderHook(() => useSessionTimeout())
      
      // Advance time
      act(() => {
        vi.advanceTimersByTime(30 * 1000)
      })
      
      // Extend session (should be same as reset)
      act(() => {
        result.current.extendSession()
      })
      
      expect(result.current.secondsRemaining).toBe(60)
    })

    it('should trigger timeout manually', () => {
      const onSessionExpire = vi.fn()
      const { result } = renderHook(() => useSessionTimeout({ onSessionExpire }))
      
      expect(result.current.isActive).toBe(true)
      
      // Trigger timeout manually
      act(() => {
        result.current.triggerTimeout()
      })
      
      expect(result.current.isActive).toBe(false)
      expect(onSessionExpire).toHaveBeenCalled()
    })
  })

  describe('Configuration Options', () => {
    beforeEach(() => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
    })

    it('should respect custom timeout duration', () => {
      const { result } = renderHook(() => useSessionTimeout({ timeoutMinutes: 2 }))
      
      expect(result.current.minutesRemaining).toBe(2)
      expect(result.current.secondsRemaining).toBe(120)
    })

    it('should respect custom warning threshold', () => {
      const onSessionWarning = vi.fn()
      renderHook(() => 
        useSessionTimeout({ 
          onSessionWarning,
          warningThresholdSeconds: 30 
        })
      )
      
      // Advance to 25 seconds remaining (within 30s threshold)
      act(() => {
        vi.advanceTimersByTime(35 * 1000)
      })
      
      expect(onSessionWarning).toHaveBeenCalled()
    })

    it('should respect autoLogout setting', () => {
      const onSessionExpire = vi.fn()
      const { result } = renderHook(() => 
        useSessionTimeout({ 
          onSessionExpire,
          autoLogout: false 
        })
      )
      
      // Advance past timeout
      act(() => {
        vi.advanceTimersByTime(61 * 1000)
      })
      
      // Should call callback but not auto-logout
      expect(onSessionExpire).toHaveBeenCalled()
      // Session should still be marked as expired but handled manually
      expect(result.current.isExpired).toBe(true)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup intervals when unmounted', () => {
      const { unmount } = renderHook(() => useSessionTimeout())
      
      // Should not throw when unmounting
      expect(() => unmount()).not.toThrow()
    })

    it('should cleanup intervals when authentication changes', () => {
      useAuthStore.getState().login({
        success: true,
        employee: mockEmployee
      })
      
      const { result } = renderHook(() => useSessionTimeout())
      
      expect(result.current.isActive).toBe(true)
      
      // Logout
      act(() => {
        useAuthStore.getState().logout()
      })
      
      expect(result.current.isActive).toBe(false)
    })
  })
})

describe('useSessionWarning', () => {
  const mockEmployee: Employee = {
    id: 'emp_01234567890123456789',
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

  it('should return warning status', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    const { result } = renderHook(() => useSessionWarning(20))
    
    expect(result.current).toBe(false)
    
    // Advance to warning threshold
    act(() => {
      vi.advanceTimersByTime(40 * 1000) // 20 seconds remaining
    })
    
    expect(result.current).toBe(true)
  })
})

describe('useSessionTimeDisplay', () => {
  const mockEmployee: Employee = {
    id: 'emp_01234567890123456789',
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

  it('should return empty string when not active', () => {
    const { result } = renderHook(() => useSessionTimeDisplay())
    
    expect(result.current).toBe('')
  })

  it('should format time display correctly', () => {
    useAuthStore.getState().login({
      success: true,
      employee: mockEmployee
    })
    
    const { result } = renderHook(() => useSessionTimeDisplay())
    
    // Should show minutes when >= 1 minute
    expect(result.current).toBe('1m')
    
    // Advance to less than 1 minute
    act(() => {
      vi.advanceTimersByTime(45 * 1000)
    })
    
    // Should show seconds
    expect(result.current).toBe('15s')
  })
})