/**
 * Audio feedback utilities for Euphoria POS
 * Simplified for Electron - no browser permission concerns
 */

class AudioManager {
  private isEnabled: boolean = true

  constructor() {
    // Audio manager ready for Electron environment
  }

  /**
   * Play error sound for failed barcode scans
   * Critical for cashier workflow - audible feedback needed
   */
  playErrorSound(): void {
    if (!this.isEnabled) return

    try {
      // Use Web Audio API for a simple beep in Electron
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // High pitch error beep
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (error) {
      console.warn('Error sound playback failed:', error)
      // Fallback: try to trigger system beep
      console.log('\u0007') // Bell character
    }
  }

  /**
   * Play success sound for successful scans (optional, subtle)
   */
  playSuccessSound(): void {
    if (!this.isEnabled) return

    try {
      // Use Web Audio API for a subtle click
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Low pitch success click
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime)
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (error) {
      console.warn('Success sound playback failed:', error)
    }
  }

  /**
   * Enable/disable audio feedback
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
  }

  /**
   * Get current audio status
   */
  getStatus(): { enabled: boolean } {
    return {
      enabled: this.isEnabled
    }
  }
}

// Singleton instance for global use
export const audioManager = new AudioManager()

// Convenience functions
export const playErrorSound = () => audioManager.playErrorSound()
export const playSuccessSound = () => audioManager.playSuccessSound()
export const setAudioEnabled = (enabled: boolean) => audioManager.setEnabled(enabled)
export const getAudioStatus = () => audioManager.getStatus()