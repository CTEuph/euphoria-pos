import { getPendingMessages, markSent, incrementRetryCount } from '../messageBus'
import type { Outbox } from '../../../drizzle/sqlite-schema'

interface CloudSyncConfig {
  supabaseUrl: string
  supabaseServiceKey: string
  terminalId: string
  syncInterval?: number
  batchSize?: number
  maxRetries?: number
}

interface CloudSyncResponse {
  success: boolean
  messageId: string
  error?: string
}

let syncInterval: NodeJS.Timeout | null = null
let isRunning = false
const DEFAULT_SYNC_INTERVAL = 30000 // 30 seconds
const DEFAULT_BATCH_SIZE = 50
const DEFAULT_MAX_RETRIES = 3

/**
 * Start cloud sync process
 * This will periodically send peer-acknowledged messages to Supabase
 */
export function startCloudSync(config: CloudSyncConfig): void {
  if (isRunning) {
    console.log('Cloud sync already running')
    return
  }
  
  const {
    supabaseUrl,
    supabaseServiceKey,
    terminalId,
    syncInterval = DEFAULT_SYNC_INTERVAL,
    batchSize = DEFAULT_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES
  } = config
  
  if (!supabaseUrl || supabaseUrl === 'your_supabase_url') {
    console.log('Cloud sync disabled - no Supabase URL configured')
    return
  }
  
  if (!supabaseServiceKey || supabaseServiceKey === 'your_supabase_service_key') {
    console.log('Cloud sync disabled - no Supabase service key configured')
    return
  }
  
  console.log(`Starting cloud sync for terminal ${terminalId}`)
  console.log(`Sync interval: ${syncInterval}ms, Batch size: ${batchSize}`)
  
  isRunning = true
  
  // Run initial sync
  syncToCloud(config)
  
  // Schedule periodic sync
  syncInterval = setInterval(() => {
    syncToCloud(config)
  }, syncInterval)
}

/**
 * Stop cloud sync process
 */
export function stopCloudSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  isRunning = false
  console.log('Cloud sync stopped')
}

/**
 * Perform sync to cloud
 */
async function syncToCloud(config: CloudSyncConfig): Promise<void> {
  const {
    supabaseUrl,
    supabaseServiceKey,
    terminalId,
    batchSize = DEFAULT_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES
  } = config
  
  try {
    // Get messages that have been acknowledged by peers but not cloud
    const messages = await getPendingMessages('peer_ack', batchSize)
    
    if (messages.length === 0) {
      return
    }
    
    console.log(`Syncing ${messages.length} messages to cloud`)
    
    // Process messages in parallel with controlled concurrency
    const concurrency = 5
    const results: CloudSyncResponse[] = []
    
    for (let i = 0; i < messages.length; i += concurrency) {
      const batch = messages.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(msg => sendToCloud(msg, supabaseUrl, supabaseServiceKey, terminalId, maxRetries))
      )
      results.push(...batchResults)
    }
    
    // Process results
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    console.log(`Cloud sync completed: ${successful} successful, ${failed} failed`)
    
  } catch (error) {
    console.error('Error during cloud sync:', error)
  }
}

/**
 * Send a single message to cloud
 */
async function sendToCloud(
  message: Outbox,
  supabaseUrl: string,
  serviceKey: string,
  terminalId: string,
  maxRetries: number
): Promise<CloudSyncResponse> {
  // Check retry count
  if (message.retryCount >= maxRetries) {
    console.error(`Message ${message.id} exceeded max retries (${maxRetries})`)
    return { success: false, messageId: message.id, error: 'Max retries exceeded' }
  }
  
  try {
    // Prepare payload for Supabase Edge Function
    const payload = {
      messageId: message.id,
      terminalId,
      topic: message.topic,
      data: message.payload,
      timestamp: message.createdAt.toISOString(),
      peerAckedAt: message.peerAckedAt?.toISOString()
    }
    
    // Call Supabase Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-pos-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })
    
    if (response.ok) {
      // Mark as cloud acknowledged
      await markSent(message.id, 'cloud_ack')
      return { success: true, messageId: message.id }
    } else {
      const error = await response.text()
      console.error(`Cloud sync failed for message ${message.id}:`, error)
      
      // Increment retry count
      await incrementRetryCount(message.id)
      
      return { success: false, messageId: message.id, error }
    }
    
  } catch (error) {
    console.error(`Error sending message ${message.id} to cloud:`, error)
    
    // Increment retry count
    await incrementRetryCount(message.id)
    
    return { 
      success: false, 
      messageId: message.id, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Get cloud sync status
 */
export function getCloudSyncStatus() {
  return {
    isRunning,
    hasInterval: syncInterval !== null
  }
}

/**
 * Manually trigger cloud sync (for testing)
 */
export async function triggerCloudSync(config: CloudSyncConfig): Promise<void> {
  console.log('Manually triggering cloud sync')
  await syncToCloud(config)
}