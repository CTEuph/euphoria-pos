import { getValidatedConfig } from './configValidator'

let cachedConfig: ReturnType<typeof getValidatedConfig> | null = null

/**
 * Get the terminal ID for this instance
 */
export function getTerminalId(): string {
  if (!cachedConfig) {
    cachedConfig = getValidatedConfig()
  }
  return cachedConfig.terminalId
}

/**
 * Get the full configuration
 */
export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = getValidatedConfig()
  }
  return cachedConfig
}