import { useCallback, useEffect, useRef, useState } from 'react'
import { playErrorSound, setAudioEnabled } from '@/shared/lib/audio'
import type { ScannerConfig, ScannerHookReturn, DEFAULT_SCANNER_SHORTCUTS } from '../types'

/**
 * Global barcode scanner simulation hook
 * Captures keyboard input from anywhere on checkout screen
 * Includes keyboard shortcuts for instant product scanning
 */
export function useBarcodeScanner(config: ScannerConfig): ScannerHookReturn {
  const {
    onScan,
    enabled = true,
    minLength = 12,
    timeout = 2000,
    shortcuts = {}
  } = config

  // State for barcode accumulation
  const [currentBarcode, setCurrentBarcode] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanTime, setLastScanTime] = useState(0)

  // Refs for cleanup and timeout management
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const enabledRef = useRef(enabled)

  // Update enabled ref when prop changes
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // Clear barcode and reset scanning state
  const clearBarcode = useCallback(() => {
    setCurrentBarcode('')
    setIsScanning(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  // Manual scan simulation for testing
  const simulateScan = useCallback((barcode: string) => {
    if (!enabledRef.current) return
    onScan(barcode, false)
    clearBarcode()
  }, [onScan, clearBarcode])

  // Enable audio feedback
  const enableAudio = useCallback(() => {
    setAudioEnabled(true)
  }, [])

  // Handle barcode completion (manual or timeout)
  const completeScan = useCallback(() => {
    if (currentBarcode.length >= minLength) {
      onScan(currentBarcode, false)
      setLastScanTime(Date.now())
    }
    clearBarcode()
  }, [currentBarcode, minLength, onScan, clearBarcode])

  // Handle keyboard shortcuts
  const handleShortcut = useCallback((key: string, modifiers: { shift: boolean, ctrl: boolean, alt: boolean }) => {
    if (!enabledRef.current) return false

    // Build shortcut string
    const shortcutParts: string[] = []
    if (modifiers.shift) shortcutParts.push('shift')
    if (modifiers.ctrl) shortcutParts.push('ctrl')
    if (modifiers.alt) shortcutParts.push('alt')
    shortcutParts.push(key.toLowerCase())
    
    const shortcutKey = shortcutParts.join('+')
    
    // Check if this shortcut exists
    const barcode = shortcuts[shortcutKey]
    if (barcode) {
      onScan(barcode, true) // Mark as shortcut scan
      setLastScanTime(Date.now())
      return true // Indicate shortcut was handled
    }
    
    return false
  }, [shortcuts, onScan])

  // Global keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if scanner disabled
    if (!enabledRef.current) return

    // Skip if user is typing in an input/textarea/contenteditable
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true' ||
      target.closest('[contenteditable="true"]')
    ) {
      return
    }

    // Handle keyboard shortcuts first
    if (event.key.length === 1) { // Single character keys only
      const shortcutHandled = handleShortcut(event.key, {
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey
      })
      
      if (shortcutHandled) {
        event.preventDefault()
        return
      }
    }

    // Handle barcode input (numeric keys only)
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault() // Prevent any default behavior
      
      const now = Date.now()
      
      // If too much time has passed, start fresh
      if (now - lastScanTime > timeout) {
        setCurrentBarcode(event.key)
      } else {
        setCurrentBarcode(prev => prev + event.key)
      }
      
      setIsScanning(true)
      setLastScanTime(now)
      
      // Set/reset timeout for barcode completion
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      timeoutRef.current = setTimeout(() => {
        completeScan()
      }, timeout)
      
    } else if (event.key === 'Enter' && currentBarcode.length > 0) {
      // Complete scan on Enter
      event.preventDefault()
      completeScan()
      
    } else if (event.key === 'Escape' && currentBarcode.length > 0) {
      // Cancel current barcode entry
      event.preventDefault()
      clearBarcode()
    }
  }, [handleShortcut, currentBarcode, lastScanTime, timeout, completeScan, clearBarcode])

  // Setup global keyboard listener
  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown, { capture: true })
      
      return () => {
        document.removeEventListener('keydown', handleKeyDown, { capture: true })
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }
  }, [enabled, handleKeyDown])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    currentBarcode,
    isScanning,
    clearBarcode,
    simulateScan,
    enableAudio,
    playErrorSound,
  }
}