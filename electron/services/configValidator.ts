export function validateConfig() {
  const required = {
    TERMINAL_ID: process.env.TERMINAL_ID,
    TERMINAL_PORT: process.env.TERMINAL_PORT,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
  }

  const missing: string[] = []

  for (const [key, value] of Object.entries(required)) {
    if (!value || value === 'UNSET') {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`)
  }

  // Validate terminal ID uniqueness
  if (required.TERMINAL_ID === 'L1' && process.env.NODE_ENV === 'production') {
    console.warn('WARNING: Using default terminal ID "L1" in production. Please set a unique TERMINAL_ID.')
  }

  // Validate terminal port
  const port = Number(required.TERMINAL_PORT)
  if (isNaN(port) || port < 1024 || port > 65535) {
    throw new Error('TERMINAL_PORT must be a valid port number between 1024 and 65535')
  }

  console.log('Configuration validated successfully')
}