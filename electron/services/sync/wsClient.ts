import WebSocket from 'ws'
import { getPendingMessages, markSent, markError, incrementRetries } from '../messageBus'

interface PeerConnection {
  url: string
  ws: WebSocket | null
  reconnectTimer?: NodeJS.Timeout
  pendingAcks: Map<string, NodeJS.Timeout>
}

const peers: Map<string, PeerConnection> = new Map()
let syncInterval: NodeJS.Timer | null = null
let isRunning = false

// Configuration
const SYNC_INTERVAL_MS = 200
const BACKOFF_BASE_MS = Number(process.env.SYNC_BACKOFF_BASE_MS) || 2000
const MAX_RETRIES = 10

export function startWebSocketClient(peerUrls: string[], terminalId: string) {
  if (isRunning) {
    console.log('WebSocket client already running')
    return
  }

  isRunning = true

  // Initialize peer connections
  for (const url of peerUrls) {
    peers.set(url, {
      url,
      ws: null,
      pendingAcks: new Map()
    })
    connectToPeer(url, terminalId)
  }

  // Start sync interval
  syncInterval = setInterval(() => {
    syncPendingMessages(terminalId)
  }, SYNC_INTERVAL_MS)

  console.log('WebSocket client started')
}

export function stopWebSocketClient() {
  isRunning = false

  // Clear sync interval
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }

  // Close all peer connections
  for (const peer of peers.values()) {
    if (peer.ws) {
      peer.ws.close()
    }
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer)
    }
    // Clear all pending ack timers
    for (const timer of peer.pendingAcks.values()) {
      clearTimeout(timer)
    }
  }

  peers.clear()
  console.log('WebSocket client stopped')
}

function connectToPeer(url: string, terminalId: string) {
  const peer = peers.get(url)
  if (!peer) return

  try {
    const ws = new WebSocket(url)
    peer.ws = ws

    ws.on('open', () => {
      console.log(`Connected to peer: ${url}`)
    })

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString())
        
        if (response.ack) {
          // Handle acknowledgment
          const ackTimer = peer.pendingAcks.get(response.ack)
          if (ackTimer) {
            clearTimeout(ackTimer)
            peer.pendingAcks.delete(response.ack)
            markSent(response.ack, 'lane')
          }
        }
      } catch (error) {
        console.error('Error parsing peer response:', error)
      }
    })

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${url}:`, error)
    })

    ws.on('close', () => {
      console.log(`Disconnected from peer: ${url}`)
      peer.ws = null
      
      // Reconnect with exponential backoff
      if (isRunning) {
        const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.random() * 3)
        peer.reconnectTimer = setTimeout(() => {
          connectToPeer(url, terminalId)
        }, backoffMs)
      }
    })
  } catch (error) {
    console.error(`Failed to connect to peer ${url}:`, error)
    
    // Retry connection
    if (isRunning) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, Math.random() * 3)
      peer.reconnectTimer = setTimeout(() => {
        connectToPeer(url, terminalId)
      }, backoffMs)
    }
  }
}

async function syncPendingMessages(terminalId: string) {
  try {
    const messages = await getPendingMessages('pending')
    
    for (const message of messages) {
      // Send to all connected peers
      for (const peer of peers.values()) {
        if (peer.ws && peer.ws.readyState === WebSocket.OPEN) {
          sendMessageToPeer(peer, message, terminalId)
        }
      }
    }
  } catch (error) {
    console.error('Error syncing pending messages:', error)
  }
}

function sendMessageToPeer(peer: PeerConnection, message: any, terminalId: string) {
  const envelope = {
    id: message.id,
    topic: message.type,
    payload: message.payload,
    origin: terminalId,
    ts: message.createdAt
  }

  try {
    peer.ws!.send(JSON.stringify(envelope))
    
    // Set up acknowledgment timeout
    const ackTimer = setTimeout(async () => {
      peer.pendingAcks.delete(message.id)
      
      // Increment retry count
      await incrementRetries(message.id)
      
      // Check if max retries reached
      if (message.retries >= MAX_RETRIES - 1) {
        await markError(message.id)
        console.error(`Max retries reached for message ${message.id}`)
      }
    }, BACKOFF_BASE_MS * Math.pow(2, message.retries || 0))
    
    peer.pendingAcks.set(message.id, ackTimer)
  } catch (error) {
    console.error('Error sending message to peer:', error)
  }
}