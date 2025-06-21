import { WebSocketServer, type WebSocket } from 'ws'
import { inboxProcessed } from '../../../drizzle/sqlite-schema'
import { getDb, generateId, now } from '../localDb'
import { markSent } from '../messageBus'
import { getInventorySnapshot, performInventoryReconciliation } from './reconcile'
import { eq } from 'drizzle-orm'

interface PeerMessage {
  id: string
  fromTerminal: string
  topic: string
  payload: any
  timestamp: string
}

let wss: WebSocketServer | null = null
const connectedPeers = new Map<string, WebSocket>()

/**
 * Start the WebSocket server for peer-to-peer sync
 */
export function startPeerServer(port: number): void {
  if (wss) {
    console.log('WebSocket server already running')
    return
  }

  try {
    wss = new WebSocketServer({ port })
    
    wss.on('listening', () => {
      console.log(`WebSocket server listening on port ${port}`)
    })
    
    wss.on('connection', (ws: WebSocket, req) => {
      const clientIp = req.socket.remoteAddress
      console.log(`New peer connection from ${clientIp}`)
      
      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const parsedData = JSON.parse(data.toString())
          
          // Handle inventory reconciliation requests/responses
          if (parsedData.type === 'inventory_request') {
            console.log('Received inventory request from peer')
            const inventorySnapshot = getInventorySnapshot()
            
            ws.send(JSON.stringify({
              type: 'inventory_response',
              requestId: parsedData.requestId,
              inventory: inventorySnapshot,
              timestamp: new Date().toISOString()
            }))
            return
          } else if (parsedData.type === 'inventory_response') {
            console.log('Received inventory response from peer')
            if (parsedData.inventory) {
              await performInventoryReconciliation(parsedData.inventory)
            }
            return
          }
          
          // Handle regular peer messages
          const message: PeerMessage = parsedData
          console.log(`Received message from peer:`, message)
          
          // Check if we've already processed this message
          const db = getDb()
          const existing = await db
            .select()
            .from(inboxProcessed)
            .where(eq(inboxProcessed.messageId, message.id))
            .limit(1)
          
          if (existing.length > 0) {
            console.log(`Message ${message.id} already processed, skipping`)
            // Still send ACK to peer
            ws.send(JSON.stringify({ type: 'ack', messageId: message.id }))
            return
          }
          
          // Process the message based on topic
          await processIncomingMessage(message)
          
          // Record as processed
          await db.insert(inboxProcessed).values({
            messageId: message.id,
            fromTerminal: message.fromTerminal,
            topic: message.topic,
            payload: message.payload,
            processedAt: now()
          })
          
          // Send acknowledgment
          ws.send(JSON.stringify({ type: 'ack', messageId: message.id }))
          
        } catch (error) {
          console.error('Error processing peer message:', error)
          ws.send(JSON.stringify({ type: 'error', error: 'Failed to process message' }))
        }
      })
      
      ws.on('close', () => {
        console.log(`Peer connection closed from ${clientIp}`)
      })
      
      ws.on('error', (error) => {
        console.error(`WebSocket error from ${clientIp}:`, error)
      })
    })
    
    wss.on('error', (error) => {
      console.error('WebSocket server error:', error)
    })
    
  } catch (error) {
    console.error('Failed to start WebSocket server:', error)
    throw error
  }
}

/**
 * Stop the WebSocket server
 */
export function stopPeerServer(): void {
  if (wss) {
    wss.close(() => {
      console.log('WebSocket server stopped')
    })
    wss = null
  }
  connectedPeers.clear()
}

/**
 * Process incoming message based on topic
 */
async function processIncomingMessage(message: PeerMessage): Promise<void> {
  console.log(`Processing ${message.topic} message from ${message.fromTerminal}`)
  
  // This will be expanded to handle different message types
  switch (message.topic) {
    case 'transaction':
      // Handle transaction sync
      console.log('Transaction sync:', message.payload)
      break
      
    case 'inventory':
      // Handle inventory update
      console.log('Inventory sync:', message.payload)
      break
      
    case 'customer':
      // Handle customer sync
      console.log('Customer sync:', message.payload)
      break
      
    default:
      console.log(`Unknown message topic: ${message.topic}`)
  }
}