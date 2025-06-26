/**
 * LoginScreen component for PIN-based authentication
 * Provides secure authentication interface for POS system
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { PinPad } from './PinPad'
import { useAuth } from '../hooks/useAuth'
import { cn } from '@/shared/lib/utils'
import type { LoginResult } from '../types'

interface LoginScreenProps {
  onLoginSuccess: (result: LoginResult) => void
  onLoginError?: (error: string) => void
  className?: string
}

export function LoginScreen({ 
  onLoginSuccess, 
  onLoginError, 
  className 
}: LoginScreenProps) {
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const { login } = useAuth()

  const handlePinChange = useCallback((newPin: string) => {
    setPin(newPin)
    // Clear error when user starts typing again
    if (error) {
      setError(null)
      setAttemptsRemaining(null)
    }
    
    // Auto-submit after 4 digits
    if (newPin.length === 4) {
      handlePinSubmit(newPin)
    }
  }, [error])

  const handlePinSubmit = useCallback(async (pinToSubmit?: string) => {
    const currentPin = pinToSubmit || pin
    if (!currentPin || currentPin.length < 4) {
      setError('Please enter a 4-digit PIN')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use the auth hook which has better error handling
      const result = await login({ pin: currentPin })

      if (result.success && result.employee) {
        onLoginSuccess(result)
        // Reset form
        setPin('')
        setError(null)
        setAttemptsRemaining(null)
      } else {
        // Handle authentication failure
        setError(result.error || 'Authentication failed')
        onLoginError?.(result.error || 'Authentication failed')
        
        // Clear PIN for security
        setPin('')
        
        // Show attempts remaining if available
        // Note: We'd need to modify the auth service to return this info
        // For now, we'll just show the error
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication system error'
      setError(errorMessage)
      onLoginError?.(errorMessage)
      setPin('')
    } finally {
      setIsLoading(false)
    }
  }, [onLoginSuccess, onLoginError])

  const handlePinClear = useCallback(() => {
    setPin('')
    setError(null)
    setAttemptsRemaining(null)
  }, [])

  const handleKeyPress = useCallback((key: string) => {
    if (isLoading) return

    if (key === 'Clear' || key === '⌫') {
      handlePinClear()
    } else if (key === 'Backspace' || key === '←') {
      const newPin = pin.slice(0, -1)
      handlePinChange(newPin)
    } else if (/^\d$/.test(key) && pin.length < 4) {
      // Allow up to 4 digits for PIN
      const newPin = pin + key
      handlePinChange(newPin)
    }
  }, [pin, isLoading, handlePinChange, handlePinClear])

  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6",
      className
    )}>
      {/* Header - Just the title, bold and clean */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900">
          Euphoria POS
        </h1>
      </div>

      {/* PIN Display - Bigger, cleaner */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 w-full max-w-md mb-8">
        <div 
          className="w-full h-16 bg-gray-50 border border-gray-300 rounded-md px-6 flex items-center justify-center focus-within:ring-2 focus-within:ring-purple-500 focus-within:border-purple-500 transition-colors"
          role="textbox"
          aria-label={`PIN entered, ${pin.length} digits`}
          aria-live="polite"
        >
          {pin.length === 0 ? (
            <span className="text-gray-400 text-lg">••••</span>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full ${
                    index < pin.length ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
        </div>

        {/* Error Display - Compact */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700 text-sm font-medium text-center" role="alert">
              {error}
            </p>
            {attemptsRemaining !== null && attemptsRemaining > 0 && (
              <p className="text-red-600 text-xs mt-1 text-center">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>
        )}

        {/* Loading indicator when processing */}
        {isLoading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-gray-600">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Authenticating...</span>
          </div>
        )}
      </div>

      {/* PIN Pad */}
      <div>
        <PinPad
          onKeyPress={handleKeyPress}
          disabled={isLoading}
          className="max-w-xs"
        />
      </div>
    </div>
  )
}