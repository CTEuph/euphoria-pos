import { startPeerServer, stopPeerServer } from './wsServer'
import { connectToPeers, disconnectFromPeers } from './wsClient'
import { getPendingMessages } from '../messageBus'
import type { Outbox } from '../../../drizzle/sqlite-schema'

let syncInterval: NodeJS.Timeout | null = null
const SYNC_INTERVAL = 5000 // 5 seconds

/**
 * Get configuration from environment and settings
 */
function getConfig() {
  // Read from settings.local.json if available
  let terminalId = process.env.TERMINAL_ID || 'L1'
  let terminalPort = parseInt(process.env.TERMINAL_PORT || '8123')
  
  try {
    // Try to read from settings.local.json
    const settings = require('../../settings.local.json')
    if (settings.terminalId) terminalId = settings.terminalId
    if (settings.terminalPort) terminalPort = settings.terminalPort
  } catch (error) {
    // Use defaults from env
  }
  
  const peerTerminals = process.env.PEER_TERMINALS 
    ? process.env.PEER_TERMINALS.split(',').map(url => url.trim())
    : []
  
  return { terminalId, terminalPort, peerTerminals }
}

/**
 * Start lane-to-lane sync
 */
export function startLaneSync(): void {
  const { terminalId, terminalPort, peerTerminals } = getConfig()
  
  console.log(`Starting lane sync for terminal ${terminalId} on port ${terminalPort}`)
  console.log(`Peer terminals: ${peerTerminals.join(', ') || 'none'}`)
  
  // Start WebSocket server
  try {
    startPeerServer(terminalPort)
  } catch (error) {
    console.error('Failed to start peer server:', error)
    // Try next port
    try {
      console.log(`Port ${terminalPort} in use, trying ${terminalPort + 1}`)
      startPeerServer(terminalPort + 1)
    } catch (error2) {
      console.error('Failed to start peer server on alternate port:', error2)
    }
  }
  
  // Connect to peer terminals
  if (peerTerminals.length > 0) {
    connectToPeers(peerTerminals, terminalId)
  }
  
  // Start periodic sync of pending messages
  syncInterval = setInterval(async () => {
    try {
      // Get messages that need to be sent to peers
      const pendingMessages = await getPendingMessages('pending', 50)
      
      if (pendingMessages.length > 0) {
        console.log(`Found ${pendingMessages.length} pending messages to sync`)
        // The wsClient will handle sending these when peers connect
      }
    } catch (error) {
      console.error('Error in sync interval:', error)
    }
  }, SYNC_INTERVAL)
}

/**
 * Stop lane-to-lane sync
 */
export function stopLaneSync(): void {
  console.log('Stopping lane sync')
  
  // Stop sync interval
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  
  // Disconnect from peers
  disconnectFromPeers()
  
  // Stop server
  stopPeerServer()
}

/**
 * Get sync status
 */
export function getSyncStatus() {
  const { terminalId, terminalPort, peerTerminals } = getConfig()
  
  return {
    terminalId,
    terminalPort,
    peerCount: peerTerminals.length,
    isRunning: syncInterval !== null
  }
}