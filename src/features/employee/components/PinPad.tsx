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
        return 'outline' as const  // Changed from destructive to outline for white styling
      case '←':
        return 'secondary' as const
      default:
        return 'outline' as const
    }
  }

  return (
    <div className={cn("grid grid-cols-3 gap-3", className)}>
      {PIN_PAD_LAYOUT.flat().map((key, index) => (
        <Button
          key={`${key}-${index}`}
          variant={getKeyVariant(key)}
          size="lg"
          onClick={() => handleKeyClick(key)}
          disabled={disabled}
          className={cn(
            "h-14 text-xl font-semibold",
            // Number keys
            /^\d$/.test(key) && "bg-white border border-gray-300 hover:bg-gray-50 text-gray-900",
            // Clear key - now white like other buttons
            key === 'Clear' && "bg-white border border-gray-300 hover:bg-gray-50 text-gray-900",
            // Backspace key  
            key === '←' && "bg-gray-200 hover:bg-gray-300 text-gray-700",
          )}
          aria-label={getKeyAriaLabel(key)}
          aria-disabled={disabled}
        >
          {getKeyDisplayText(key)}
        </Button>
      ))}
    </div>
  )
}