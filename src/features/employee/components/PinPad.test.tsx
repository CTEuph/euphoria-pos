/**
 * Tests for PinPad component
 * Tests touch-friendly interface, keyboard handling, and accessibility
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinPad } from './PinPad'

describe('PinPad', () => {
  const mockOnKeyPress = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPinPad = (props = {}) => {
    return render(
      <PinPad
        onKeyPress={mockOnKeyPress}
        {...props}
      />
    )
  }

  describe('Rendering', () => {
    it('should render all numeric keys', () => {
      renderPinPad()

      for (let i = 0; i <= 9; i++) {
        expect(screen.getByRole('button', { name: `Enter digit ${i}` })).toBeInTheDocument()
      }
    })

    it('should render special keys', () => {
      renderPinPad()

      expect(screen.getByRole('button', { name: 'Clear all digits' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete last digit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Submit PIN' })).toBeInTheDocument()
    })

    it('should have proper grid layout', () => {
      renderPinPad()
      
      const container = screen.getByRole('button', { name: 'Enter digit 1' }).parentElement
      expect(container).toHaveClass('grid', 'grid-cols-3')
    })

    it('should display keys with correct text', () => {
      renderPinPad()

      // Check number keys
      expect(screen.getByRole('button', { name: 'Enter digit 1' })).toHaveTextContent('1')
      expect(screen.getByRole('button', { name: 'Enter digit 9' })).toHaveTextContent('9')
      
      // Check special keys  
      expect(screen.getByRole('button', { name: 'Clear all digits' })).toHaveTextContent('Clear')
      expect(screen.getByRole('button', { name: 'Delete last digit' })).toHaveTextContent('⌫')
      expect(screen.getByRole('button', { name: 'Submit PIN' })).toHaveTextContent('Login ↵')
    })
  })

  describe('Key Press Handling', () => {
    it('should call onKeyPress with correct values for number keys', async () => {
      renderPinPad()
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Enter digit 5' }))
      expect(mockOnKeyPress).toHaveBeenCalledWith('5')

      await user.click(screen.getByRole('button', { name: 'Enter digit 0' }))
      expect(mockOnKeyPress).toHaveBeenCalledWith('0')
    })

    it('should call onKeyPress for special keys', async () => {
      renderPinPad()
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Clear all digits' }))
      expect(mockOnKeyPress).toHaveBeenCalledWith('Clear')

      await user.click(screen.getByRole('button', { name: 'Delete last digit' }))
      expect(mockOnKeyPress).toHaveBeenCalledWith('←')

      await user.click(screen.getByRole('button', { name: 'Submit PIN' }))
      expect(mockOnKeyPress).toHaveBeenCalledWith('Enter')
    })

    it('should not call onKeyPress when disabled', async () => {
      renderPinPad({ disabled: true })
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'Enter digit 1' }))
      expect(mockOnKeyPress).not.toHaveBeenCalled()
    })
  })

  describe('Disabled State', () => {
    it('should disable all buttons when disabled prop is true', () => {
      renderPinPad({ disabled: true })

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeDisabled()
        expect(button).toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('should apply disabled styling', () => {
      renderPinPad({ disabled: true })

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveClass('opacity-50', 'cursor-not-allowed')
      })
    })

    it('should enable all buttons when disabled prop is false', () => {
      renderPinPad({ disabled: false })

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).not.toBeDisabled()
        expect(button).toHaveAttribute('aria-disabled', 'false')
      })
    })
  })

  describe('Styling and Variants', () => {
    it('should apply correct variants to different key types', () => {
      renderPinPad()

      // Number keys should have outline variant
      const numberKey = screen.getByRole('button', { name: 'Enter digit 1' })
      expect(numberKey).toHaveClass('border-2', 'border-slate-300')

      // Clear key should have destructive variant
      const clearKey = screen.getByRole('button', { name: 'Clear all digits' })
      expect(clearKey).toHaveClass('bg-red-500')

      // Backspace key should have secondary variant
      const backspaceKey = screen.getByRole('button', { name: 'Delete last digit' })
      expect(backspaceKey).toHaveClass('bg-slate-200')

      // Enter key should have primary variant
      const enterKey = screen.getByRole('button', { name: 'Submit PIN' })
      expect(enterKey).toHaveClass('bg-blue-600')
    })

    it('should have large touch-friendly buttons', () => {
      renderPinPad()

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveClass('h-16', 'text-2xl')
      })
    })

    it('should apply custom className when provided', () => {
      renderPinPad({ className: 'custom-class' })

      const container = screen.getByRole('button', { name: 'Enter digit 1' }).parentElement
      expect(container).toHaveClass('custom-class')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels for all keys', () => {
      renderPinPad()

      // Number keys
      for (let i = 0; i <= 9; i++) {
        const button = screen.getByRole('button', { name: `Enter digit ${i}` })
        expect(button).toHaveAttribute('aria-label', `Enter digit ${i}`)
      }

      // Special keys
      expect(screen.getByRole('button', { name: 'Clear all digits' }))
        .toHaveAttribute('aria-label', 'Clear all digits')
      expect(screen.getByRole('button', { name: 'Delete last digit' }))
        .toHaveAttribute('aria-label', 'Delete last digit')
      expect(screen.getByRole('button', { name: 'Submit PIN' }))
        .toHaveAttribute('aria-label', 'Submit PIN')
    })

    it('should have proper focus management', () => {
      renderPinPad()

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveClass('focus:ring-4')
      })
    })

    it('should handle keyboard navigation', async () => {
      renderPinPad()
      const user = userEvent.setup()

      const firstButton = screen.getByRole('button', { name: 'Enter digit 1' })
      firstButton.focus()

      // Should be able to tab through buttons
      await user.tab()
      expect(screen.getByRole('button', { name: 'Enter digit 2' })).toHaveFocus()
    })
  })

  describe('Visual Feedback', () => {
    it('should have hover and active states', () => {
      renderPinPad()

      const numberKey = screen.getByRole('button', { name: 'Enter digit 1' })
      expect(numberKey).toHaveClass('hover:scale-105', 'active:scale-95')
    })

    it('should have transition effects', () => {
      renderPinPad()

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveClass('transition-all', 'duration-150')
      })
    })
  })
})