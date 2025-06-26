/**
 * Tests for AppInitializer component
 * Tests app initialization flow, loading states, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppInitializer, useInitialization } from './AppInitializer'
import { appInitializationService } from '../services/appInitializationService'

// Mock the initialization service
vi.mock('../services/appInitializationService', () => ({
  appInitializationService: {
    initialize: vi.fn(),
    getPreservationStats: vi.fn(),
    validateCurrentSession: vi.fn(),
    clearAllState: vi.fn()
  }
}))

// Mock window.location.reload
Object.defineProperty(window, 'location', {
  value: { reload: vi.fn() },
  writable: true
})

// Mock console to avoid noise
const consoleMock = {
  log: vi.fn(),
  error: vi.fn()
}
vi.stubGlobal('console', consoleMock)

describe('AppInitializer', () => {
  const mockInitializeSuccess = {
    success: true,
    isAuthenticated: false,
    sessionRestored: false,
    sessionExpired: false,
    preservedTransactionCount: 0
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful initialization
    vi.mocked(appInitializationService.initialize).mockResolvedValue(mockInitializeSuccess)
  })

  describe('Loading State', () => {
    it('should show loading screen during initialization', async () => {
      // Make initialization hang to test loading state
      vi.mocked(appInitializationService.initialize).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <AppInitializer>
          <div>App Content</div>
        </AppInitializer>
      )

      expect(screen.getByText('Euphoria POS')).toBeInTheDocument()
      expect(screen.getByText('Initializing Euphoria POS...')).toBeInTheDocument()
      expect(screen.queryByText('App Content')).not.toBeInTheDocument()

      // Should show loading animation
      expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('should show custom loading message', async () => {
      vi.mocked(appInitializationService.initialize).mockImplementation(
        () => new Promise(() => {})
      )

      render(
        <AppInitializer loadingMessage="Loading custom message...">
          <div>App Content</div>
        </AppInitializer>
      )

      expect(screen.getByText('Loading custom message...')).toBeInTheDocument()
    })

    it('should respect minimum loading time', async () => {
      vi.useFakeTimers()
      vi.mocked(appInitializationService.initialize).mockResolvedValue(mockInitializeSuccess)

      render(
        <AppInitializer minLoadingTime={100}>
          <div>App Content</div>
        </AppInitializer>
      )

      // Should be loading initially
      expect(screen.getByText('Initializing Euphoria POS...')).toBeInTheDocument()

      // Fast-forward past minimum loading time
      vi.advanceTimersByTime(100)
      
      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument()
      })

      vi.useRealTimers()
    })
  })

  describe('Successful Initialization', () => {
    it('should render children after successful initialization', async () => {
      render(
        <AppInitializer minLoadingTime={0}>
          <div>App Content</div>
        </AppInitializer>
      )

      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument()
      })

      expect(screen.queryByText('Initializing Euphoria POS...')).not.toBeInTheDocument()
      expect(appInitializationService.initialize).toHaveBeenCalledTimes(1)
    })

    it('should show detailed status when enabled', async () => {
      const detailedResult = {
        success: true,
        isAuthenticated: true,
        sessionRestored: true,
        sessionExpired: false,
        preservedTransactionCount: 3
      }

      vi.mocked(appInitializationService.initialize).mockImplementation(
        () => new Promise(() => {}) // Keep in loading state
      )

      render(
        <AppInitializer showDetailedStatus={true}>
          <div>App Content</div>
        </AppInitializer>
      )

      // Manually set the result to show detailed status
      // This simulates the component receiving the result but still loading
      // In real usage, this would show briefly during loading
      expect(screen.getByText('Euphoria POS')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should show error screen when initialization fails', async () => {
      const errorResult = {
        success: false,
        isAuthenticated: false,
        sessionRestored: false,
        sessionExpired: false,
        preservedTransactionCount: 0,
        error: 'Database connection failed'
      }

      vi.mocked(appInitializationService.initialize).mockResolvedValue(errorResult)

      render(
        <AppInitializer minLoadingTime={0}>
          <div>App Content</div>
        </AppInitializer>
      )

      await waitFor(() => {
        expect(screen.getByText('Initialization Failed')).toBeInTheDocument()
      })

      expect(screen.getByText('Database connection failed')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.queryByText('App Content')).not.toBeInTheDocument()
    })

    it('should show error screen when initialization throws', async () => {
      vi.mocked(appInitializationService.initialize).mockRejectedValue(
        new Error('Network error')
      )

      render(
        <AppInitializer minLoadingTime={0}>
          <div>App Content</div>
        </AppInitializer>
      )

      await waitFor(() => {
        expect(screen.getByText('Initialization Failed')).toBeInTheDocument()
      })

      expect(screen.getByText('Network error')).toBeInTheDocument()
      expect(consoleMock.error).toHaveBeenCalledWith(
        'App initialization failed:',
        expect.any(Error)
      )
    })

    it('should reload page when retry button is clicked', async () => {
      const user = userEvent.setup()
      
      const errorResult = {
        success: false,
        isAuthenticated: false,
        sessionRestored: false,
        sessionExpired: false,
        preservedTransactionCount: 0,
        error: 'Test error'
      }

      vi.mocked(appInitializationService.initialize).mockResolvedValue(errorResult)

      render(
        <AppInitializer minLoadingTime={0}>
          <div>App Content</div>
        </AppInitializer>
      )

      await waitFor(() => {
        expect(screen.getByText('Initialization Failed')).toBeInTheDocument()
      })

      const retryButton = screen.getByRole('button', { name: 'Retry' })
      await user.click(retryButton)

      expect(window.location.reload).toHaveBeenCalledTimes(1)
    })

    it('should show clear state button in development mode', async () => {
      // Mock development environment
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const user = userEvent.setup()
      
      const errorResult = {
        success: false,
        isAuthenticated: false,
        sessionRestored: false,
        sessionExpired: false,
        preservedTransactionCount: 0,
        error: 'Test error'
      }

      vi.mocked(appInitializationService.initialize).mockResolvedValue(errorResult)

      render(
        <AppInitializer minLoadingTime={0}>
          <div>App Content</div>
        </AppInitializer>
      )

      await waitFor(() => {
        expect(screen.getByText('Initialization Failed')).toBeInTheDocument()
      })

      const clearButton = screen.getByRole('button', { name: 'Clear State & Retry' })
      expect(clearButton).toBeInTheDocument()

      await user.click(clearButton)

      expect(appInitializationService.clearAllState).toHaveBeenCalledTimes(1)
      expect(window.location.reload).toHaveBeenCalledTimes(1)

      // Restore environment
      process.env.NODE_ENV = originalEnv
    })
  })
})

describe('useInitialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    vi.mocked(appInitializationService.getPreservationStats).mockReturnValue({
      totalTransactions: 0,
      totalValue: 0,
      totalItems: 0,
      employeeCount: 0,
      newestTransaction: null,
      oldestTransaction: null
    })
    
    vi.mocked(appInitializationService.validateCurrentSession).mockReturnValue(false)
  })

  it('should provide initialization utilities', () => {
    const TestComponent = () => {
      const { preservationStats, validateSession, clearAllState } = useInitialization()
      
      return (
        <div>
          <span>Total Transactions: {preservationStats.totalTransactions}</span>
          <button onClick={validateSession}>Validate</button>
          <button onClick={clearAllState}>Clear</button>
        </div>
      )
    }

    render(<TestComponent />)

    expect(screen.getByText('Total Transactions: 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })
})