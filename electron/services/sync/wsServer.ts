import { WebSocketServer } from 'ws'
import { eq, sql } from 'drizzle-orm'
import { db, withTxn } from '../localDb'
import * as schema from '../../../drizzle/sqlite-schema'
import { v4 as uuidv4 } from 'uuid'

let wss: WebSocketServer | null = null

export function startWebSocketServer(port: number) {
  if (wss) {
    console.log('WebSocket server already running')
    return
  }

  wss = new WebSocketServer({ port })

  wss.on('connection', (ws) => {
    console.log('Peer lane connected')

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString())
        
        // Check if we've already processed this message
        const processed = await db
          .select()
          .from(schema.inboxProcessed)
          .where(eq(schema.inboxProcessed.id, message.id))
          .limit(1)

        if (processed.length > 0) {
          // Already processed, just send ack
          ws.send(JSON.stringify({ ack: message.id }))
          return
        }

        // Process the message based on type
        await processIncomingMessage(message)

        // Mark as processed
        await db.insert(schema.inboxProcessed).values({
          id: message.id,
          createdAt: new Date().toISOString()
        })

        // Send acknowledgment
        ws.send(JSON.stringify({ ack: message.id }))
      } catch (error) {
        console.error('Error processing peer message:', error)
        ws.send(JSON.stringify({ error: 'Processing failed' }))
      }
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
    })

    ws.on('close', () => {
      console.log('Peer lane disconnected')
    })
  })

  console.log(`WebSocket server listening on port ${port}`)
}

export function stopWebSocketServer() {
  if (wss) {
    wss.close(() => {
      console.log('WebSocket server stopped')
    })
    wss = null
  }
}

async function processIncomingMessage(message: any) {
  const { type, payload } = message

  await withTxn(async (tx) => {
    switch (type) {
      case 'transaction:new':
        // Upsert transaction data
        await upsertTransaction(tx, payload)
        break

      case 'inventory:update':
        // Update inventory levels
        await updateInventory(tx, payload)
        break

      case 'employee:upsert':
        // Upsert employee data
        await upsertEmployee(tx, payload)
        break

      case 'product:upsert':
        // Upsert product data
        await upsertProduct(tx, payload)
        break

      case 'pos_config:update':
        // Update POS configuration
        await updatePosConfig(tx, payload)
        break

      case 'discount_rule:upsert':
        // Upsert discount rules
        await upsertDiscountRule(tx, payload)
        break

      default:
        console.warn('Unknown message type:', type)
    }
  })
}

// Helper functions for upserting data
async function upsertTransaction(tx: any, data: any) {
  // Check if transaction exists
  const existing = await tx
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, data.id))
    .limit(1)

  if (existing.length === 0) {
    // Insert new transaction
    await tx.insert(schema.transactions).values(data)
    
    // Insert transaction items if provided
    if (data.items && Array.isArray(data.items)) {
      await tx.insert(schema.transactionItems).values(data.items)
    }
    
    // Insert payments if provided
    if (data.payments && Array.isArray(data.payments)) {
      await tx.insert(schema.payments).values(data.payments)
    }
  }
}

async function updateInventory(tx: any, data: any) {
  const { productId, change } = data
  
  // Update inventory level
  await tx
    .update(schema.inventory)
    .set({
      currentStock: schema.inventory.currentStock.plus(change),
      lastUpdated: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString()
    })
    .where(schema.inventory.productId.eq(productId))
}

async function upsertEmployee(tx: any, data: any) {
  const existing = await tx
    .select()
    .from(schema.employees)
    .where(schema.employees.id.eq(data.id))
    .limit(1)

  if (existing.length > 0) {
    await tx
      .update(schema.employees)
      .set({
        ...data,
        updatedAt: new Date().toISOString()
      })
      .where(schema.employees.id.eq(data.id))
  } else {
    await tx.insert(schema.employees).values(data)
  }
}

async function upsertProduct(tx: any, data: any) {
  const existing = await tx
    .select()
    .from(schema.products)
    .where(schema.products.id.eq(data.id))
    .limit(1)

  if (existing.length > 0) {
    await tx
      .update(schema.products)
      .set({
        ...data,
        updatedAt: new Date().toISOString()
      })
      .where(schema.products.id.eq(data.id))
  } else {
    await tx.insert(schema.products).values(data)
  }

  // Update inventory if provided
  if (data.inventory) {
    const invExists = await tx
      .select()
      .from(schema.inventory)
      .where(schema.inventory.productId.eq(data.id))
      .limit(1)

    if (invExists.length > 0) {
      await tx
        .update(schema.inventory)
        .set(data.inventory)
        .where(schema.inventory.productId.eq(data.id))
    } else {
      await tx.insert(schema.inventory).values({
        ...data.inventory,
        productId: data.id
      })
    }
  }
}

async function updatePosConfig(tx: any, data: any) {
  const { key, value } = data
  
  const existing = await tx
    .select()
    .from(schema.posConfig)
    .where(schema.posConfig.key.eq(key))
    .limit(1)

  if (existing.length > 0) {
    await tx
      .update(schema.posConfig)
      .set({
        value,
        updatedAt: new Date().toISOString()
      })
      .where(schema.posConfig.key.eq(key))
  } else {
    await tx.insert(schema.posConfig).values({
      key,
      value,
      updatedAt: new Date().toISOString()
    })
  }
}

async function upsertDiscountRule(tx: any, data: any) {
  const existing = await tx
    .select()
    .from(schema.discountRules)
    .where(schema.discountRules.id.eq(data.id))
    .limit(1)

  if (existing.length > 0) {
    await tx
      .update(schema.discountRules)
      .set({
        ...data,
        updatedAt: new Date().toISOString()
      })
      .where(schema.discountRules.id.eq(data.id))
  } else {
    await tx.insert(schema.discountRules).values(data)
  }
}