import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { vi } from 'vitest'

// Custom render function that can be extended with providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, options)

// Test utilities for POS-specific testing
export const createMockProduct = (overrides = {}) => ({
  id: '1',
  name: 'Test Product',
  price: 10.99,
  category: 'test' as const,
  size: '750ml',
  barcode: '123456789012',
  image: undefined,
  inStock: true,
  cost: 5.99,
  ...overrides
})

export const createMockCartItem = (overrides = {}) => ({
  ...createMockProduct(),
  quantity: 1,
  total: 10.99,
  ...overrides
})

// Mock keyboard event helper
export const createKeyboardEvent = (key: string, modifiers: { shift?: boolean, ctrl?: boolean, alt?: boolean } = {}) => {
  return new KeyboardEvent('keydown', {
    key,
    shiftKey: modifiers.shift || false,
    ctrlKey: modifiers.ctrl || false,
    altKey: modifiers.alt || false,
    bubbles: true
  })
}

// Mock audio context for testing audio feedback
export const createMockAudioContext = () => ({
  createOscillator: vi.fn().mockReturnValue({
    connect: vi.fn(),
    frequency: { setValueAtTime: vi.fn() },
    start: vi.fn(),
    stop: vi.fn()
  }),
  createGain: vi.fn().mockReturnValue({
    connect: vi.fn(),
    gain: { 
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    }
  }),
  destination: {},
  currentTime: 0
})

// Wait for async operations in tests
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Re-export everything from testing library
export * from '@testing-library/react'
export { customRender as render }