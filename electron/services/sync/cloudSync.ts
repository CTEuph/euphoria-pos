import { net } from 'electron'
import { getPendingMessages, markSent, incrementRetries, markError } from '../messageBus'

export interface SyncHandle {
  stop(): void
}

let syncInterval: NodeJS.Timer | null = null
let isRunning = false

// Configuration
const SYNC_INTERVAL_MS = 5000 // Check every 5 seconds
const BACKOFF_BASE_MS = Number(process.env.SYNC_BACKOFF_BASE_MS) || 2000
const MAX_RETRIES = 10

export function startCloudSync(): SyncHandle {
  if (isRunning) {
    console.log('Cloud sync already running')
    return { stop: () => {} }
  }

  isRunning = true

  // Start sync interval
  syncInterval = setInterval(() => {
    syncToCloud().catch(console.error)
  }, SYNC_INTERVAL_MS)

  console.log('Cloud sync started')

  return {
    stop() {
      isRunning = false
      
      if (syncInterval) {
        clearInterval(syncInterval)
        syncInterval = null
      }
      
      console.log('Cloud sync stopped')
    }
  }
}

async function syncToCloud() {
  try {
    // Get messages that have been acknowledged by peer but not cloud
    const messages = await getPendingMessages('peer_ack')
    
    for (const message of messages) {
      if (!isRunning) break
      
      try {
        await sendToCloud(message)
        await markSent(message.id, 'cloud')
      } catch (error) {
        console.error(`Failed to sync message ${message.id} to cloud:`, error)
        
        // Increment retry count
        await incrementRetries(message.id)
        
        // Check if max retries reached
        if (message.retries >= MAX_RETRIES - 1) {
          await markError(message.id)
          console.error(`Max retries reached for cloud sync of message ${message.id}`)
        }
      }
    }
  } catch (error) {
    console.error('Error in cloud sync:', error)
  }
}

async function sendToCloud(message: any) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing')
  }

  // Map message type to edge function endpoint
  const endpoints: Record<string, string> = {
    'transaction:new': '/functions/v1/ingest/transaction',
    'inventory:update': '/functions/v1/ingest/inventory',
    'employee:upsert': '/functions/v1/ingest/employee',
    'product:upsert': '/functions/v1/ingest/product',
    'pos_config:update': '/functions/v1/ingest/config',
    'discount_rule:upsert': '/functions/v1/ingest/discount'
  }

  const endpoint = endpoints[message.type]
  if (!endpoint) {
    throw new Error(`Unknown message type for cloud sync: ${message.type}`)
  }

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: `${supabaseUrl}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-terminal-id': process.env.TERMINAL_ID || 'unknown'
      }
    })

    request.on('response', (response) => {
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        if (response.statusCode === 200) {
          resolve(undefined)
        } else {
          reject(new Error(`Cloud sync failed: ${response.statusCode} - ${data}`))
        }
      })
    })

    request.on('error', (error) => {
      reject(error)
    })

    request.write(JSON.stringify({
      id: message.id,
      type: message.type,
      payload: message.payload,
      timestamp: message.createdAt
    }))
    
    request.end()
  })

  // Apply exponential backoff on retry
  if (message.retries > 0) {
    const backoffMs = BACKOFF_BASE_MS * Math.pow(2, message.retries)
    await new Promise(resolve => setTimeout(resolve, backoffMs))
  }
}