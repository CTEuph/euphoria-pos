/**
 * Tests for LoginScreen component
 * Tests PIN entry, authentication flow, error handling, and accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from './LoginScreen'
import type { LoginResult } from '../types'

// Mock the Electron API
const mockElectronAuth = {
  login: vi.fn()
}

// Mock window.electron
Object.defineProperty(window, 'electron', {
  value: {
    auth: mockElectronAuth
  },
  writable: true
})

// Mock PinPad component for isolated testing
vi.mock('./PinPad', () => ({
  PinPad: ({ onKeyPress, disabled, className }: any) => (
    <div data-testid="pin-pad" className={className}>
      {/* Simple button layout for testing */}
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Clear', '←', 'Enter'].map(key => (
        <button
          key={key}
          onClick={() => onKeyPress(key)}
          disabled={disabled}
          data-testid={`pin-key-${key}`}
        >
          {key}
        </button>
      ))}
    </div>
  )
}))

describe('LoginScreen', () => {
  const mockOnLoginSuccess = vi.fn()
  const mockOnLoginError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderLoginScreen = (props = {}) => {
    return render(
      <LoginScreen
        onLoginSuccess={mockOnLoginSuccess}
        onLoginError={mockOnLoginError}
        {...props}
      />
    )
  }

  describe('Rendering', () => {
    it('should render main elements', () => {
      renderLoginScreen()

      expect(screen.getByText('Euphoria POS')).toBeInTheDocument()
      expect(screen.getByText('Enter your PIN to continue')).toBeInTheDocument()
      expect(screen.getByText(/employee pin/i)).toBeInTheDocument()
      expect(screen.getByTestId('pin-pad')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /clear/i })).toHaveLength(2) // One in main UI, one in PinPad
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument()
    })

    it('should display initial PIN placeholder', () => {
      renderLoginScreen()
      expect(screen.getByText('Enter PIN...')).toBeInTheDocument()
    })

    it('should have proper accessibility attributes', () => {
      renderLoginScreen()
      
      const pinDisplay = screen.getByRole('textbox')
      expect(pinDisplay).toHaveAttribute('aria-label', 'PIN entered, 0 digits')
      expect(pinDisplay).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('PIN Entry', () => {
    it('should update PIN display when digits are entered', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Enter some digits via PinPad
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))

      // Should show 3 dots
      const pinDisplay = screen.getByRole('textbox')
      expect(pinDisplay).toHaveAttribute('aria-label', 'PIN entered, 3 digits')
      
      // Should not show placeholder
      expect(screen.queryByText('Enter PIN...')).not.toBeInTheDocument()
    })

    it('should clear PIN when Clear button is pressed', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Enter digits
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))

      // Clear
      await user.click(screen.getByTestId('pin-key-Clear'))

      // Should show placeholder again
      expect(screen.getByText('Enter PIN...')).toBeInTheDocument()
      
      const pinDisplay = screen.getByRole('textbox')
      expect(pinDisplay).toHaveAttribute('aria-label', 'PIN entered, 0 digits')
    })

    it('should remove last digit when backspace is pressed', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Enter digits
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))

      // Backspace
      await user.click(screen.getByTestId('pin-key-←'))

      // Should have 2 digits now
      const pinDisplay = screen.getByRole('textbox')
      expect(pinDisplay).toHaveAttribute('aria-label', 'PIN entered, 2 digits')
    })

    it('should limit PIN to 10 digits', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Enter 11 digits
      for (let i = 0; i < 11; i++) {
        await user.click(screen.getByTestId('pin-key-1'))
      }

      // Should only have 10 digits
      const pinDisplay = screen.getByRole('textbox')
      expect(pinDisplay).toHaveAttribute('aria-label', 'PIN entered, 10 digits')
    })
  })

  describe('Authentication', () => {
    it('should call login when Enter is pressed with valid PIN', async () => {
      mockElectronAuth.login.mockResolvedValue({
        success: true,
        employee: { id: '1', firstName: 'John', lastName: 'Doe', role: 'cashier' }
      })

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))

      // Submit
      await user.click(screen.getByTestId('pin-key-Enter'))

      await waitFor(() => {
        expect(mockElectronAuth.login).toHaveBeenCalledWith({ pin: '1234' })
      })
    })

    it('should call login when Login button is clicked', async () => {
      mockElectronAuth.login.mockResolvedValue({
        success: true,
        employee: { id: '1', firstName: 'John', lastName: 'Doe', role: 'cashier' }
      })

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))

      // Click Login button
      await user.click(screen.getByRole('button', { name: /login/i }))

      await waitFor(() => {
        expect(mockElectronAuth.login).toHaveBeenCalledWith({ pin: '1234' })
      })
    })

    it('should show loading state during authentication', async () => {
      // Mock slow authentication
      mockElectronAuth.login.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      )

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))

      // Submit
      await user.click(screen.getByRole('button', { name: /login/i }))

      // Should show loading state
      expect(screen.getByText('Authenticating...')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /authenticating/i })).toBeDisabled()
    })

    it('should call onLoginSuccess when authentication succeeds', async () => {
      const mockResult: LoginResult = {
        success: true,
        employee: { 
          id: '1', 
          employeeCode: 'EMP001',
          firstName: 'John', 
          lastName: 'Doe', 
          role: 'cashier',
          pin: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      mockElectronAuth.login.mockResolvedValue(mockResult)

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN and submit
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))
      await user.click(screen.getByRole('button', { name: /login/i }))

      await waitFor(() => {
        expect(mockOnLoginSuccess).toHaveBeenCalledWith(mockResult)
      })
    })

    it('should display error when authentication fails', async () => {
      mockElectronAuth.login.mockResolvedValue({
        success: false,
        error: 'Invalid PIN'
      })

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN and submit
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))
      await user.click(screen.getByRole('button', { name: /login/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid PIN')
      })

      expect(mockOnLoginError).toHaveBeenCalledWith('Invalid PIN')
    })

    it('should clear PIN after failed authentication', async () => {
      mockElectronAuth.login.mockResolvedValue({
        success: false,
        error: 'Invalid PIN'
      })

      renderLoginScreen()
      const user = userEvent.setup()

      // Enter PIN and submit
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByTestId('pin-key-4'))
      await user.click(screen.getByRole('button', { name: /login/i }))

      await waitFor(() => {
        expect(screen.getByText('Enter PIN...')).toBeInTheDocument()
      })
    })

    it('should prevent submission with PIN less than 3 digits', () => {
      renderLoginScreen()

      const loginButton = screen.getByRole('button', { name: /login/i })
      expect(loginButton).toBeDisabled()
    })

    it('should clear error when user starts typing again', async () => {
      mockElectronAuth.login.mockResolvedValue({
        success: false,
        error: 'Invalid PIN'
      })

      renderLoginScreen()
      const user = userEvent.setup()

      // Cause an error
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-3'))
      await user.click(screen.getByRole('button', { name: /login/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // Start typing again
      await user.click(screen.getByTestId('pin-key-5'))

      // Error should be cleared
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('Validation', () => {
    it('should show error for empty PIN submission', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Try to submit without PIN
      await user.click(screen.getByTestId('pin-key-Enter'))

      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid PIN')
    })

    it('should show error for PIN less than 3 digits', async () => {
      renderLoginScreen()
      const user = userEvent.setup()

      // Enter 2 digits
      await user.click(screen.getByTestId('pin-key-1'))
      await user.click(screen.getByTestId('pin-key-2'))
      await user.click(screen.getByTestId('pin-key-Enter'))

      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid PIN')
    })
  })
})