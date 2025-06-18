import '@testing-library/jest-dom'
import { vi, afterEach } from 'vitest'

// Extend Window interface for Electron API
declare global {
  interface Window {
    electron: {
      auth: {
        verifyPin: ReturnType<typeof vi.fn>
        logout: ReturnType<typeof vi.fn>
        getCurrentEmployee: ReturnType<typeof vi.fn>
      }
      database: {
        getProducts: ReturnType<typeof vi.fn>
        getProduct: ReturnType<typeof vi.fn>
      }
      scanner: {
        onScan: ReturnType<typeof vi.fn>
      }
    }
  }
}

// Mock Electron APIs globally
global.window.electron = {
  auth: {
    verifyPin: vi.fn(),
    logout: vi.fn(),
    getCurrentEmployee: vi.fn()
  },
  database: {
    getProducts: vi.fn(),
    getProduct: vi.fn()
  },
  scanner: {
    onScan: vi.fn()
  }
}

// Mock Web Audio API for audio feedback testing
global.AudioContext = vi.fn().mockImplementation(() => ({
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
}))

// Mock crypto.randomUUID for cart item IDs
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(2, 11))
  }
})

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
})