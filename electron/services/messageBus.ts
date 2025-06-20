import { eq } from 'drizzle-orm'
import { outbox, type NewOutbox } from '../../drizzle/sqlite-schema'
import { getDb, generateId, now, withTxn } from './localDb'

export type OutboxStatus = 'pending' | 'peer_ack' | 'cloud_ack'

export interface PublishOptions {
  retryable?: boolean
  priority?: number
}

/**
 * Publish a message to the outbox for sync
 * @param topic The message topic (e.g., 'transaction', 'inventory', 'customer')
 * @param payload The message payload
 * @param options Publishing options
 * @returns The message ID
 */
export async function publish(
  topic: string,
  payload: any,
  _options: PublishOptions = {}
): Promise<string> {
  const db = getDb()
  const id = generateId()
  const timestamp = now()
  
  const message: NewOutbox = {
    id,
    topic,
    payload,
    status: 'pending',
    retryCount: 0,
    createdAt: timestamp,
    peerAckedAt: null,
    cloudAckedAt: null
  }
  
  await db.insert(outbox).values(message)
  
  console.log(`Published message ${id} to outbox:`, { topic, payload })
  
  return id
}

/**
 * Mark a message as acknowledged by a specific stage
 * @param messageId The message ID
 * @param stage The acknowledgment stage ('peer_ack' or 'cloud_ack')
 */
export async function markSent(
  messageId: string,
  stage: 'peer_ack' | 'cloud_ack'
): Promise<void> {
  const db = getDb()
  const timestamp = now()
  
  if (stage === 'peer_ack') {
    await db
      .update(outbox)
      .set({
        status: 'peer_ack',
        peerAckedAt: timestamp
      })
      .where(eq(outbox.id, messageId))
    
    console.log(`Message ${messageId} acknowledged by peer`)
  } else if (stage === 'cloud_ack') {
    await db
      .update(outbox)
      .set({
        status: 'cloud_ack',
        cloudAckedAt: timestamp
      })
      .where(eq(outbox.id, messageId))
    
    console.log(`Message ${messageId} acknowledged by cloud`)
  }
}

/**
 * Get pending messages for sync
 * @param status Filter by status (default: 'pending')
 * @param limit Maximum number of messages to retrieve
 */
export async function getPendingMessages(
  status: OutboxStatus = 'pending',
  limit: number = 100
) {
  const db = getDb()
  
  return await db
    .select()
    .from(outbox)
    .where(eq(outbox.status, status))
    .limit(limit)
    .orderBy(outbox.createdAt)
}

/**
 * Increment retry count for a message
 * @param messageId The message ID
 */
export async function incrementRetryCount(messageId: string): Promise<void> {
  const db = getDb()
  
  const [message] = await db
    .select()
    .from(outbox)
    .where(eq(outbox.id, messageId))
    .limit(1)
  
  if (message) {
    await db
      .update(outbox)
      .set({
        retryCount: (message.retryCount || 0) + 1
      })
      .where(eq(outbox.id, messageId))
  }
}

/**
 * Publish multiple messages in a transaction
 * @param messages Array of messages to publish
 * @returns Array of message IDs
 */
export async function publishBatch(
  messages: Array<{ topic: string; payload: any; options?: PublishOptions }>
): Promise<string[]> {
  return await withTxn(async (tx) => {
    const ids: string[] = []
    const timestamp = now()
    
    for (const msg of messages) {
      const id = generateId()
      
      const message: NewOutbox = {
        id,
        topic: msg.topic,
        payload: msg.payload,
        status: 'pending',
        retryCount: 0,
        createdAt: timestamp,
        peerAckedAt: null,
        cloudAckedAt: null
      }
      
      await tx.insert(outbox).values(message)
      ids.push(id)
    }
    
    console.log(`Published ${messages.length} messages to outbox`)
    
    return ids
  })
}

/**
 * Clean up old acknowledged messages (for maintenance)
 * @param daysOld Messages older than this many days
 */
export async function cleanupOldMessages(daysOld: number = 30): Promise<number> {
  // const db = getDb()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)
  
  // For now, just return 0 - this would need proper date comparison implementation
  // const result = await db
  //   .delete(outbox)
  //   .where(
  //     and(
  //       eq(outbox.status, 'cloud_ack'),
  //       lt(outbox.cloudAckedAt, cutoffDate)
  //     )
  //   )
  
  console.log(`Cleanup old messages from outbox - not yet implemented`)
  
  return 0 // Return count when implemented
}