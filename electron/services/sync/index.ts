import { startWebSocketServer, stopWebSocketServer } from './wsServer'
import { startWebSocketClient, stopWebSocketClient } from './wsClient'
import { reconcile } from './reconcile'

export interface SyncHandle {
  stop(): void
}

let reconcileInterval: NodeJS.Timer | null = null

export function startLaneSync(): SyncHandle {
  // Get configuration from environment
  const terminalId = process.env.TERMINAL_ID || 'L1'
  const terminalPort = Number(process.env.TERMINAL_PORT) || 8123
  const peerTerminals = process.env.PEER_TERMINALS?.split(',') || []

  // Start WebSocket server
  startWebSocketServer(terminalPort)

  // Start WebSocket client if we have peer terminals
  if (peerTerminals.length > 0) {
    startWebSocketClient(peerTerminals, terminalId)
  }

  // Schedule reconciliation every 10 minutes
  reconcileInterval = setInterval(() => {
    reconcile().catch(console.error)
  }, 600000) // 10 minutes

  console.log(`Lane sync started - Terminal: ${terminalId}, Port: ${terminalPort}`)

  return {
    stop() {
      stopWebSocketServer()
      stopWebSocketClient()
      
      if (reconcileInterval) {
        clearInterval(reconcileInterval)
        reconcileInterval = null
      }
      
      console.log('Lane sync stopped')
    }
  }
}