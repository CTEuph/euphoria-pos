/**
 * LoginScreen component for PIN-based authentication
 * Provides secure authentication interface for POS system
 */

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { PinPad } from './PinPad'
import { useAuth } from '../hooks/useAuth'
import { cn } from '@/shared/lib/utils'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
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
    
    // Auto-submit after 6 digits
    if (newPin.length === 6) {
      handlePinSubmit(newPin)
    }
  }, [error])

  const handlePinSubmit = useCallback(async (pinToSubmit?: string) => {
    const currentPin = pinToSubmit || pin
    if (!currentPin || currentPin.length < 6) {
      setError('Please enter a 6-digit PIN')
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
    } else if (/^\d$/.test(key) && pin.length < 6) {
      // Allow up to 6 digits for PIN
      const newPin = pin + key
      handlePinChange(newPin)
    }
  }, [pin, isLoading, handlePinChange, handlePinClear])

  const [isVisible, setIsVisible] = useState(true)
  
  // Perfect wave timing - locked in values
  const animationDuration = 0.9 // seconds for ramp up/down
  const delayMultiplier = 0.4 // percentage of ramp up when next starts
  const minOpacity = 0.2 // starting opacity
  const maxOpacity = 1.0 // peak opacity
  const minScale = 0.91 // starting scale
  const maxScale = 1.1 // peak scale
  const restPause = 1.5 // seconds to pause between full cycles

  // Listen for page visibility and window focus changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }

    const handleWindowFocus = () => {
      setIsVisible(true)
    }

    const handleWindowBlur = () => {
      // Don't pause for Electron apps, but reset on focus for better reliability
    }

    // Standard visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Window focus events (works well in Electron)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  const WaveDot = ({ index }: { index: number }) => {
    const progress = useMotionValue(0)
    const opacity = useTransform(progress, [0, 1], [minOpacity, maxOpacity])
    const scale = useTransform(progress, [0, 1], [minScale, maxScale])

    // Perfect smooth easing
    const perfectEase = [0.25, 0.1, 0.25, 1]

    useEffect(() => {
      let timeoutId: NodeJS.Timeout
      let animationControls: any
      let isRunning = true
      let startTime = Date.now()

      const runWaveCycle = () => {
        if (!isRunning || !isVisible) return

        const waveStartDelay = index * (animationDuration * 1000 * delayMultiplier)
        
        timeoutId = setTimeout(async () => {
          if (!isRunning || !isVisible) return

          try {
            // Smooth ramp up
            animationControls = animate(progress, 1, {
              duration: animationDuration,
              ease: perfectEase
            })
            await animationControls

            if (!isRunning || !isVisible) return

            // Smooth ramp down
            animationControls = animate(progress, 0, {
              duration: animationDuration,
              ease: perfectEase
            })
            await animationControls

            if (!isRunning || !isVisible) return

            // Calculate when the entire wave finishes and add rest pause
            // Wave finishes when last dot (index 5) completes its animation
            // Last dot starts at: 5 * 360ms = 1800ms
            // Last dot finishes at: 1800ms + 1800ms (0.9s up + 0.9s down) = 3600ms total
            // All dots restart together after rest pause
            const totalWaveTime = (5 * 360) + (animationDuration * 2 * 1000) // 1800ms + 1800ms = 3600ms
            const timeUntilRestart = totalWaveTime - waveStartDelay + (restPause * 1000)
            
            timeoutId = setTimeout(() => {
              if (isRunning && isVisible) runWaveCycle()
            }, timeUntilRestart)

          } catch (error) {
            // Animation was cancelled, ignore
          }
        }, waveStartDelay)
      }

      // Start or restart animation when component mounts or becomes visible
      if (isVisible) {
        startTime = Date.now()
        runWaveCycle()
      }

      // Cleanup function
      return () => {
        isRunning = false
        if (timeoutId) clearTimeout(timeoutId)
        if (animationControls) animationControls.stop()
        progress.set(0) // Reset to initial state
      }
    }, [index, progress, isVisible]) // Re-run when visibility changes

    return (
      <motion.div
        className="w-3 h-3 rounded-full"
        style={{
          backgroundColor: 'rgb(147 51 234)',
          opacity,
          scale
        }}
      />
    )
  }

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
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <WaveDot key={index} index={index} />
              ))}
            </div>
          ) : (
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full transition-colors duration-200 ${
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