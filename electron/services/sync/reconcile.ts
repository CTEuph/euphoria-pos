import { db } from '../localDb'
import * as schema from '../../../drizzle/sqlite-schema'
import { publish } from '../messageBus'

export async function reconcile() {
  try {
    console.log('Starting reconciliation...')
    
    // Calculate inventory checksum
    const checksum = await calculateInventoryChecksum()
    
    // Publish checksum for peer comparison
    await publish('inventory:checksum', {
      checksum,
      timestamp: new Date().toISOString()
    })
    
    console.log('Reconciliation complete')
  } catch (error) {
    console.error('Reconciliation failed:', error)
  }
}

async function calculateInventoryChecksum(): Promise<string> {
  // Get inventory summary
  const result = await db
    .select({
      count: schema.inventoryChanges.id.count(),
      totalChange: schema.inventoryChanges.changeAmount.sum()
    })
    .from(schema.inventoryChanges)
    .where(
      schema.inventoryChanges.createdAt.gte(
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
      )
    )

  const { count, totalChange } = result[0] || { count: 0, totalChange: 0 }
  
  // Simple checksum: count|sum
  return `${count}|${totalChange || 0}`
}

export async function compareChecksums(localChecksum: string, remoteChecksum: string): Promise<boolean> {
  return localChecksum === remoteChecksum
}