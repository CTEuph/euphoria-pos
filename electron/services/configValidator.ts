import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface ConfigValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  config?: {
    terminalId: string
    terminalPort: number
    peerTerminals: string[]
    supabaseUrl?: string
    supabaseServiceKey?: string
    syncBackoffBaseMs: number
  }
}

/**
 * Validate configuration on startup
 * Ensures all required settings are present and valid
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Get terminal ID from environment or settings.local.json
  let terminalId = process.env.TERMINAL_ID
  let terminalPort = parseInt(process.env.TERMINAL_PORT || '8123')
  
  // Try to read from settings.local.json
  try {
    const settingsPath = path.join(__dirname, '..', 'settings.local.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (settings.terminalId) terminalId = settings.terminalId
      if (settings.terminalPort) terminalPort = settings.terminalPort
    }
  } catch (error) {
    warnings.push('Failed to read settings.local.json, using environment variables')
  }
  
  // Validate terminal ID
  if (!terminalId) {
    errors.push('TERMINAL_ID is required. Set it in environment variables or settings.local.json')
  } else if (!/^[A-Z0-9]{2,10}$/.test(terminalId)) {
    errors.push('TERMINAL_ID must be 2-10 characters, uppercase letters and numbers only (e.g., L1, L2, LANE01)')
  }
  
  // Validate terminal port
  if (!terminalPort || terminalPort < 1024 || terminalPort > 65535) {
    errors.push('TERMINAL_PORT must be between 1024 and 65535')
  }
  
  // Check for port conflicts
  if (terminalPort === 5173) {
    errors.push('TERMINAL_PORT cannot be 5173 (reserved for Vite dev server)')
  }
  
  // Parse peer terminals
  const peerTerminals = process.env.PEER_TERMINALS 
    ? process.env.PEER_TERMINALS.split(',').map(url => url.trim())
    : []
  
  // Validate peer terminal URLs
  for (const peer of peerTerminals) {
    if (!peer.startsWith('ws://') && !peer.startsWith('wss://')) {
      errors.push(`Invalid peer terminal URL: ${peer}. Must start with ws:// or wss://`)
    }
  }
  
  // Validate optional cloud sync settings
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY
  
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    errors.push('SUPABASE_URL must start with https://')
  }
  
  if (supabaseUrl && !supabaseServiceKey) {
    warnings.push('SUPABASE_URL is set but SUPABASE_SERVICE_KEY is missing. Cloud sync will be disabled.')
  }
  
  // Validate sync backoff
  const syncBackoffBaseMs = parseInt(process.env.SYNC_BACKOFF_BASE_MS || '1000')
  if (syncBackoffBaseMs < 100 || syncBackoffBaseMs > 60000) {
    warnings.push('SYNC_BACKOFF_BASE_MS should be between 100 and 60000 ms. Using default: 1000ms')
  }
  
  // Check for unique terminal ID (warn if common defaults are used)
  if (terminalId === 'L1' || terminalId === 'L2') {
    warnings.push(`Using default terminal ID '${terminalId}'. Consider setting a unique ID for production.`)
  }
  
  // Check database path permissions
  try {
    const dbPath = app.getPath('userData')
    fs.accessSync(dbPath, fs.constants.W_OK)
  } catch (error) {
    errors.push(`Cannot write to database directory: ${app.getPath('userData')}`)
  }
  
  // Check if running multiple instances on same machine (development warning)
  if (peerTerminals.some(peer => peer.includes('localhost') || peer.includes('127.0.0.1'))) {
    warnings.push('Peer terminals include localhost. This is fine for development but not for production.')
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    config: errors.length === 0 ? {
      terminalId: terminalId!,
      terminalPort,
      peerTerminals,
      supabaseUrl,
      supabaseServiceKey,
      syncBackoffBaseMs
    } : undefined
  }
}

/**
 * Display configuration errors and exit
 */
export function handleConfigErrors(result: ConfigValidationResult): void {
  console.error('\n========================================')
  console.error('CONFIGURATION ERRORS')
  console.error('========================================\n')
  
  if (result.errors.length > 0) {
    console.error('The following errors must be fixed:\n')
    result.errors.forEach((error, index) => {
      console.error(`  ${index + 1}. ${error}`)
    })
    console.error('\n')
  }
  
  if (result.warnings.length > 0) {
    console.warn('Warnings:\n')
    result.warnings.forEach((warning, index) => {
      console.warn(`  ${index + 1}. ${warning}`)
    })
    console.warn('\n')
  }
  
  console.error('To fix these issues:\n')
  console.error('1. Create a file: electron/settings.local.json with:')
  console.error('   {')
  console.error('     "terminalId": "L1",')
  console.error('     "terminalPort": 8123')
  console.error('   }')
  console.error('\n2. Or set environment variables:')
  console.error('   TERMINAL_ID=L1')
  console.error('   TERMINAL_PORT=8123')
  console.error('   PEER_TERMINALS=ws://localhost:8124')
  console.error('\n========================================\n')
}

/**
 * Get validated configuration
 * Throws if configuration is invalid
 */
export function getValidatedConfig() {
  const result = validateConfig()
  
  if (!result.isValid) {
    handleConfigErrors(result)
    throw new Error('Invalid configuration. See errors above.')
  }
  
  // Show warnings but continue
  if (result.warnings.length > 0) {
    console.warn('\nConfiguration warnings:')
    result.warnings.forEach(warning => console.warn(`- ${warning}`))
    console.warn('')
  }
  
  return result.config!
}