import { v4 as uuidv4 } from 'uuid'
import { db } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'

export type MessageType = 
  | 'transaction:new'
  | 'inventory:update'
  | 'employee:upsert'
  | 'product:upsert'
  | 'discount_rule:upsert'
  | 'pos_config:update'
  | 'inventory:checksum'

export interface OutboxMessage {
  id: string
  type: MessageType
  payload: unknown
  origin: string // Terminal ID
  ts: string // ISO timestamp
}

// Publish a message to the outbox
export async function publish(type: MessageType, payload: unknown): Promise<void> {
  const message = {
    id: uuidv4(),
    type,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: new Date().toISOString()
  }

  await db.insert(schema.outbox).values(message)
}

// Mark a message as sent
export async function markSent(id: string, peer?: 'lane' | 'cloud'): Promise<void> {
  const status = peer === 'lane' ? 'peer_ack' : peer === 'cloud' ? 'cloud_ack' : 'sent'
  
  await db
    .update(schema.outbox)
    .set({ status })
    .where(schema.outbox.id.eq(id))
}

// Mark a message as error
export async function markError(id: string): Promise<void> {
  await db
    .update(schema.outbox)
    .set({ status: 'error' })
    .where(schema.outbox.id.eq(id))
}

// Increment retry count
export async function incrementRetries(id: string): Promise<void> {
  await db
    .update(schema.outbox)
    .set({ 
      retries: schema.outbox.retries.plus(1) 
    })
    .where(schema.outbox.id.eq(id))
}

// Get pending messages for sync
export async function getPendingMessages(status: string = 'pending') {
  return await db
    .select()
    .from(schema.outbox)
    .where(schema.outbox.status.eq(status))
    .orderBy(schema.outbox.createdAt)
}

// Clean up old acknowledged messages
export async function cleanupOldMessages(daysOld: number = 30): Promise<void> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)
  
  await db
    .delete(schema.outbox)
    .where(
      schema.outbox.status.eq('cloud_ack')
        .and(schema.outbox.createdAt.lt(cutoffDate.toISOString()))
    )
}