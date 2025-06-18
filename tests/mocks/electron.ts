import { vi } from 'vitest'

// Type for mock Electron API
interface MockElectronAPI {
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

// Mock Electron IPC API for testing
export const mockElectronAPI: MockElectronAPI = {
  auth: {
    verifyPin: vi.fn().mockResolvedValue({ id: '1', firstName: 'Test', lastName: 'User' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getCurrentEmployee: vi.fn().mockResolvedValue({ id: '1', name: 'Test User' })
  },
  database: {
    getProducts: vi.fn().mockResolvedValue([]),
    getProduct: vi.fn().mockResolvedValue(null)
  },
  scanner: {
    onScan: vi.fn().mockReturnValue(() => {}) // Returns cleanup function
  }
}

// Mock the window.electron global
Object.defineProperty(window, 'electron', {
  value: mockElectronAPI,
  writable: true
})

export default mockElectronAPI