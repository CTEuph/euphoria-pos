/**
 * PinPad component for touch-friendly PIN entry
 * Large buttons optimized for touchscreen POS systems
 */

import { Button } from '@/components/ui/button'
import { cn } from '@/shared/lib/utils'

interface PinPadProps {
  onKeyPress: (key: string) => void
  disabled?: boolean
  className?: string
}

const PIN_PAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'], 
  ['7', '8', '9'],
  ['Clear', '0', '←']
] as const

const SPECIAL_KEYS = {
  'Clear': 'Clear all digits',
  '←': 'Delete last digit',
  'Enter': 'Submit PIN',
  '↵': 'Submit PIN'
} as const

export function PinPad({ onKeyPress, disabled = false, className }: PinPadProps) {
  const handleKeyClick = (key: string) => {
    if (disabled) return
    onKeyPress(key)
  }

  const getKeyAriaLabel = (key: string): string => {
    if (key in SPECIAL_KEYS) {
      return SPECIAL_KEYS[key as keyof typeof SPECIAL_KEYS]
    }
    return `Enter digit ${key}`
  }

  const getKeyDisplayText = (key: string): string => {
    switch (key) {
      case '←':
        return '⌫'
      case 'Clear':
        return 'Clear'
      default:
        return key
    }
  }

  const getKeyVariant = (key: string) => {
    switch (key) {
      case 'Clear':
        return 'destructive' as const
      case '←':
        return 'secondary' as const
      default:
        return 'outline' as const
    }
  }

  return (
    <div className={cn("grid grid-cols-3 gap-4 p-6 bg-white rounded-2xl shadow-lg", className)}>
      {PIN_PAD_LAYOUT.flat().map((key, index) => (
        <Button
          key={`${key}-${index}`}
          variant={getKeyVariant(key)}
          size="lg"
          onClick={() => handleKeyClick(key)}
          disabled={disabled}
          className={cn(
            "h-16 text-2xl font-bold transition-all duration-150",
            "hover:scale-105 active:scale-95",
            "focus:ring-4 focus:ring-blue-200",
            // Number keys
            /^\d$/.test(key) && "bg-white border-2 border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-900",
            // Clear key
            key === 'Clear' && "bg-red-500 hover:bg-red-600 text-white border-red-500",
            // Backspace key  
            key === '←' && "bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300",
            // Disabled state
            disabled && "opacity-50 cursor-not-allowed hover:scale-100 active:scale-100"
          )}
          aria-label={getKeyAriaLabel(key)}
          aria-disabled={disabled}
        >
          {getKeyDisplayText(key)}
        </Button>
      ))}
      
      {/* Enter button spans full width */}
      <Button
        variant="default"
        size="lg"
        onClick={() => handleKeyClick('Enter')}
        disabled={disabled}
        className={cn(
          "col-span-3 h-16 text-2xl font-bold mt-4",
          "bg-blue-600 hover:bg-blue-700 text-white",
          "transition-all duration-150 hover:scale-105 active:scale-95",
          "focus:ring-4 focus:ring-blue-200",
          disabled && "opacity-50 cursor-not-allowed hover:scale-100 active:scale-95"
        )}
        aria-label={getKeyAriaLabel('Enter')}
        aria-disabled={disabled}
      >
        Login ↵
      </Button>
    </div>
  )
}