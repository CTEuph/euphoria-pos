/**
 * Types for checkout feature including barcode scanner simulation
 */

export interface ScannerState {
  // Data
  currentBarcode: string      // Accumulating barcode digits
  isScanning: boolean         // Currently capturing input
  lastScanTime: number        // For timeout detection
  
  // Configuration
  timeout: number             // Barcode completion timeout (2000ms)
  minLength: number           // Minimum barcode length (12)
}

export interface ScannerConfig {
  // Callback when barcode is successfully captured
  onScan: (barcode: string, isShortcut?: boolean) => void
  
  // Whether scanner is enabled (disabled during modals)
  enabled?: boolean
  
  // Minimum barcode length (default: 12)
  minLength?: number
  
  // Timeout for barcode completion in ms (default: 2000)
  timeout?: number
  
  // Keyboard shortcuts mapping
  shortcuts?: Record<string, string>
}

export interface ScannerHookReturn {
  // Current state
  currentBarcode: string
  isScanning: boolean
  
  // Manual controls
  clearBarcode: () => void
  simulateScan: (barcode: string) => void
  
  // Audio controls
  enableAudio: () => void
  playErrorSound: () => void
}

// Keyboard shortcut mappings for common products
export const DEFAULT_SCANNER_SHORTCUTS = {
  'shift+j': '082184090563',  // Jack Daniels 750ml
  'shift+g': '087116010501',  // Grey Goose 750ml  
  'shift+c': '080686035411',  // Corona 6-pack
  'shift+b': '088004014134',  // Budweiser 12-pack
  'shift+w': '085000006405',  // Wine example
} as const

export type ScannerShortcut = keyof typeof DEFAULT_SCANNER_SHORTCUTS