/**
 * LoginScreen component for PIN-based authentication
 * Provides secure authentication interface for POS system
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { PinPad } from './PinPad'
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

  const handlePinChange = useCallback((newPin: string) => {
    setPin(newPin)
    // Clear error when user starts typing again
    if (error) {
      setError(null)
      setAttemptsRemaining(null)
    }
  }, [error])

  const handlePinSubmit = useCallback(async () => {
    if (!pin || pin.length < 3) {
      setError('Please enter a valid PIN')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Call the Electron IPC authentication method
      const result = await window.electron.auth.login({ pin })

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
  }, [pin, onLoginSuccess, onLoginError])

  const handlePinClear = useCallback(() => {
    setPin('')
    setError(null)
    setAttemptsRemaining(null)
  }, [])

  const handleKeyPress = useCallback((key: string) => {
    if (isLoading) return

    if (key === 'Enter' || key === '↵') {
      handlePinSubmit()
    } else if (key === 'Clear' || key === '⌫') {
      handlePinClear()
    } else if (key === 'Backspace' || key === '←') {
      setPin(prev => prev.slice(0, -1))
      // Clear error when user starts typing again
      if (error) {
        setError(null)
        setAttemptsRemaining(null)
      }
    } else if (/^\d$/.test(key) && pin.length < 10) {
      // Allow up to 10 digits for PIN
      setPin(prev => prev + key)
      // Clear error when user starts typing again
      if (error) {
        setError(null)
        setAttemptsRemaining(null)
      }
    }
  }, [pin, isLoading, handlePinSubmit, handlePinClear, error])

  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8",
      className
    )}>
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Euphoria POS
        </h1>
        <p className="text-xl text-slate-600">
          Enter your PIN to continue
        </p>
      </div>

      {/* PIN Display */}
      <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 min-w-[400px]">
        <div className="text-center mb-6">
          <div className="block text-lg font-medium text-slate-700 mb-4">
            Employee PIN
          </div>
          
          {/* PIN Dots Display */}
          <div 
            className="flex justify-center items-center gap-3 min-h-[60px] bg-slate-50 rounded-lg p-4 border-2 border-slate-200 focus-within:border-blue-500 transition-colors"
            role="textbox"
            aria-label={`PIN entered, ${pin.length} digits`}
            aria-live="polite"
          >
            {pin.length === 0 ? (
              <span className="text-slate-400 text-lg">Enter PIN...</span>
            ) : (
              Array.from({ length: Math.max(pin.length, 1) }).map((_, index) => (
                <div
                  key={index}
                  className="w-4 h-4 rounded-full bg-slate-800"
                  aria-hidden="true"
                />
              ))
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 text-red-500" aria-hidden="true">
                ⚠️
              </div>
              <p className="text-red-700 font-medium" role="alert">
                {error}
              </p>
            </div>
            {attemptsRemaining !== null && attemptsRemaining > 0 && (
              <p className="text-red-600 text-sm mt-1">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={handlePinClear}
            disabled={isLoading || pin.length === 0}
            className="flex-1"
          >
            Clear
          </Button>
          
          <Button
            size="lg"
            onClick={handlePinSubmit}
            disabled={isLoading || pin.length < 3}
            className="flex-1"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Authenticating...
              </div>
            ) : (
              'Login'
            )}
          </Button>
        </div>
      </div>

      {/* PIN Pad */}
      <PinPad
        onKeyPress={handleKeyPress}
        disabled={isLoading}
        className="max-w-md"
      />

      {/* Footer */}
      <div className="mt-12 text-center text-slate-500 text-sm">
        <p>Secure authentication powered by Euphoria POS</p>
        <p className="mt-1">For assistance, contact your manager</p>
      </div>
    </div>
  )
}