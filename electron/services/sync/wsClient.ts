import WebSocket from 'ws'
import { getPendingMessages, markSent, incrementRetryCount } from '../messageBus'
import type { Outbox } from '../../../drizzle/sqlite-schema'

interface PeerConnection {
  url: string
  ws: WebSocket | null
  isConnected: boolean
  reconnectTimer?: NodeJS.Timeout
}

const peers = new Map<string, PeerConnection>()
const pendingAcks = new Map<string, { messageId: string; resolve: () => void; reject: (err: Error) => void }>()
const RECONNECT_DELAY = 5000 // 5 seconds
const ACK_TIMEOUT = 10000 // 10 seconds

/**
 * Connect to peer terminals for sync
 */
export function connectToPeers(peerUrls: string[], terminalId: string): void {
  for (const url of peerUrls) {
    if (!peers.has(url)) {
      peers.set(url, {
        url,
        ws: null,
        isConnected: false
      })
    }
    
    connectToPeer(url, terminalId)
  }
}

/**
 * Connect to a single peer
 */
function connectToPeer(url: string, terminalId: string): void {
  const peer = peers.get(url)
  if (!peer) return
  
  try {
    console.log(`Connecting to peer: ${url}`)
    
    const ws = new WebSocket(url)
    peer.ws = ws
    
    ws.on('open', () => {
      console.log(`Connected to peer: ${url}`)
      peer.isConnected = true
      
      // Clear any reconnect timer
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer)
        peer.reconnectTimer = undefined
      }
      
      // Start sending pending messages
      sendPendingMessagesToPeer(peer, terminalId)
    })
    
    ws.on('message', (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString())
        
        if (response.type === 'ack' && response.messageId) {
          // Handle acknowledgment
          const pending = pendingAcks.get(response.messageId)
          if (pending) {
            pending.resolve()
            pendingAcks.delete(response.messageId)
            
            // Mark message as peer acknowledged
            markSent(response.messageId, 'peer_ack')
          }
        }
      } catch (error) {
        console.error('Error parsing peer response:', error)
      }
    })
    
    ws.on('close', () => {
      console.log(`Disconnected from peer: ${url}`)
      peer.isConnected = false
      peer.ws = null
      
      // Schedule reconnection
      scheduleReconnect(url, terminalId)
    })
    
    ws.on('error', (error) => {
      console.error(`WebSocket client error for ${url}:`, error)
      peer.isConnected = false
    })
    
  } catch (error) {
    console.error(`Failed to connect to peer ${url}:`, error)
    scheduleReconnect(url, terminalId)
  }
}

/**
 * Schedule reconnection to a peer
 */
function scheduleReconnect(url: string, terminalId: string): void {
  const peer = peers.get(url)
  if (!peer) return
  
  // Clear existing timer
  if (peer.reconnectTimer) {
    clearTimeout(peer.reconnectTimer)
  }
  
  peer.reconnectTimer = setTimeout(() => {
    console.log(`Attempting to reconnect to peer: ${url}`)
    connectToPeer(url, terminalId)
  }, RECONNECT_DELAY)
}

/**
 * Send pending messages to a connected peer
 */
async function sendPendingMessagesToPeer(peer: PeerConnection, terminalId: string): Promise<void> {
  if (!peer.ws || !peer.isConnected) return
  
  try {
    const pendingMessages = await getPendingMessages('pending', 100)
    
    for (const message of pendingMessages) {
      await sendMessageToPeer(peer, message, terminalId)
    }
  } catch (error) {
    console.error('Error sending pending messages:', error)
  }
}

/**
 * Send a single message to a peer
 */
async function sendMessageToPeer(
  peer: PeerConnection, 
  message: Outbox, 
  terminalId: string
): Promise<void> {
  if (!peer.ws || !peer.isConnected) return
  
  const peerMessage = {
    id: message.id,
    fromTerminal: terminalId,
    topic: message.topic,
    payload: message.payload,
    timestamp: message.createdAt.toISOString()
  }
  
  return new Promise((resolve, reject) => {
    // Set up ACK timeout
    const timeoutId = setTimeout(() => {
      pendingAcks.delete(message.id)
      incrementRetryCount(message.id)
      reject(new Error(`ACK timeout for message ${message.id}`))
    }, ACK_TIMEOUT)
    
    // Store pending ACK handler
    pendingAcks.set(message.id, {
      messageId: message.id,
      resolve: () => {
        clearTimeout(timeoutId)
        resolve()
      },
      reject
    })
    
    // Send the message
    peer.ws!.send(JSON.stringify(peerMessage), (error) => {
      if (error) {
        clearTimeout(timeoutId)
        pendingAcks.delete(message.id)
        reject(error)
      }
    })
  })
}

/**
 * Disconnect from all peers
 */
export function disconnectFromPeers(): void {
  for (const [url, peer] of peers) {
    if (peer.reconnectTimer) {
      clearTimeout(peer.reconnectTimer)
    }
    
    if (peer.ws) {
      peer.ws.close()
    }
  }
  
  peers.clear()
  pendingAcks.clear()
}

/**
 * Send new message to all connected peers
 */
export async function broadcastToPeers(message: Outbox, terminalId: string): Promise<void> {
  const promises: Promise<void>[] = []
  
  for (const [url, peer] of peers) {
    if (peer.isConnected && peer.ws) {
      promises.push(sendMessageToPeer(peer, message, terminalId))
    }
  }
  
  await Promise.allSettled(promises)
}