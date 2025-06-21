import { getDb } from '../localDb'
import { inventory, products } from '../../../drizzle/sqlite-schema'
import { eq, sql } from 'drizzle-orm'
import { publish } from '../messageBus'
import * as crypto from 'crypto'

interface InventoryRow {
  productId: string
  currentStock: number
  reservedStock: number
  lastUpdated: Date
}

interface InventoryChecksum {
  checksum: string
  timestamp: Date
  itemCount: number
}

interface InventoryDiff {
  productId: string
  localStock: number
  remoteStock: number
  difference: number
}

/**
 * Calculate checksum for inventory state
 */
export function calculateInventoryChecksum(): InventoryChecksum {
  const db = getDb()
  
  // Get all inventory rows ordered by productId for consistent hashing
  const inventoryRows = db.select({
    productId: inventory.productId,
    currentStock: inventory.currentStock,
    reservedStock: inventory.reservedStock
  })
  .from(inventory)
  .orderBy(inventory.productId)
  .all()
  
  // Create deterministic string representation
  const inventoryString = inventoryRows
    .map(row => `${row.productId}:${row.currentStock}:${row.reservedStock}`)
    .join('|')
  
  // Calculate SHA256 checksum
  const checksum = crypto
    .createHash('sha256')
    .update(inventoryString)
    .digest('hex')
  
  return {
    checksum,
    timestamp: new Date(),
    itemCount: inventoryRows.length
  }
}

/**
 * Compare local inventory with remote inventory data
 */
export function compareInventory(
  localInventory: InventoryRow[],
  remoteInventory: InventoryRow[]
): InventoryDiff[] {
  const diffs: InventoryDiff[] = []
  const remoteMap = new Map(
    remoteInventory.map(item => [item.productId, item])
  )
  
  // Check local items against remote
  for (const localItem of localInventory) {
    const remoteItem = remoteMap.get(localItem.productId)
    
    if (!remoteItem) {
      // Item exists locally but not remotely
      diffs.push({
        productId: localItem.productId,
        localStock: localItem.currentStock,
        remoteStock: 0,
        difference: localItem.currentStock
      })
    } else if (localItem.currentStock !== remoteItem.currentStock) {
      // Stock levels differ
      diffs.push({
        productId: localItem.productId,
        localStock: localItem.currentStock,
        remoteStock: remoteItem.currentStock,
        difference: localItem.currentStock - remoteItem.currentStock
      })
    }
    
    // Remove from map to track items only in remote
    remoteMap.delete(localItem.productId)
  }
  
  // Check items that exist only in remote
  for (const [productId, remoteItem] of remoteMap) {
    diffs.push({
      productId,
      localStock: 0,
      remoteStock: remoteItem.currentStock,
      difference: -remoteItem.currentStock
    })
  }
  
  return diffs
}

/**
 * Reconcile inventory differences
 * Uses last_updated timestamp to determine which value wins
 */
export async function reconcileInventory(
  diffs: InventoryDiff[],
  remoteInventory: InventoryRow[]
): Promise<void> {
  if (diffs.length === 0) {
    console.log('Inventory reconciliation: No differences found')
    return
  }
  
  const db = getDb()
  console.log(`Reconciling ${diffs.length} inventory differences`)
  
  // Create map of remote inventory for easy lookup
  const remoteMap = new Map(
    remoteInventory.map(item => [item.productId, item])
  )
  
  for (const diff of diffs) {
    const localItem = db.select()
      .from(inventory)
      .where(eq(inventory.productId, diff.productId))
      .get()
    
    const remoteItem = remoteMap.get(diff.productId)
    
    // Determine which value to use based on last_updated timestamp
    let useRemoteValue = false
    
    if (!localItem && remoteItem) {
      // Item only exists remotely - use remote value
      useRemoteValue = true
    } else if (localItem && remoteItem) {
      // Both exist - use the one with more recent update
      useRemoteValue = remoteItem.lastUpdated > localItem.lastUpdated
    }
    
    if (useRemoteValue && remoteItem) {
      // Update local inventory with remote value
      await db.insert(inventory)
        .values({
          productId: remoteItem.productId,
          currentStock: remoteItem.currentStock,
          reservedStock: remoteItem.reservedStock,
          lastUpdated: remoteItem.lastUpdated,
          lastSyncedAt: new Date()
        })
        .onConflictDoUpdate({
          target: inventory.productId,
          set: {
            currentStock: remoteItem.currentStock,
            reservedStock: remoteItem.reservedStock,
            lastUpdated: remoteItem.lastUpdated,
            lastSyncedAt: new Date()
          }
        })
      
      console.log(`Reconciled ${diff.productId}: local=${diff.localStock} → remote=${diff.remoteStock}`)
      
      // Publish inventory update event
      await publish('inventory.reconciled', {
        productId: diff.productId,
        previousStock: diff.localStock,
        newStock: diff.remoteStock,
        source: 'reconciliation'
      })
    }
  }
}

/**
 * Perform full inventory reconciliation with a peer
 */
export async function performInventoryReconciliation(
  peerInventory: InventoryRow[]
): Promise<void> {
  const db = getDb()
  
  try {
    // Get local inventory
    const localInventory = db.select({
      productId: inventory.productId,
      currentStock: inventory.currentStock,
      reservedStock: inventory.reservedStock,
      lastUpdated: inventory.lastUpdated
    })
    .from(inventory)
    .all()
    
    // Compare inventories
    const diffs = compareInventory(localInventory, peerInventory)
    
    if (diffs.length > 0) {
      console.log(`Found ${diffs.length} inventory differences`)
      
      // Reconcile differences
      await reconcileInventory(diffs, peerInventory)
      
      // Publish reconciliation complete event
      await publish('inventory.reconciliation.complete', {
        differencesFound: diffs.length,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('Inventory reconciliation error:', error)
    throw error
  }
}

/**
 * Request inventory state from all peers
 */
export async function requestInventoryFromPeers(): Promise<void> {
  // This will be called by the sync scheduler
  // Import here to avoid circular dependency
  const { requestInventoryFromAllPeers } = await import('./wsClient')
  
  // Request inventory from all connected peers
  await requestInventoryFromAllPeers()
  
  // Also publish to message bus for audit trail
  await publish('inventory.reconciliation.request', {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString()
  })
}

/**
 * Get current inventory state for sharing with peers
 */
export function getInventorySnapshot(): InventoryRow[] {
  const db = getDb()
  
  return db.select({
    productId: inventory.productId,
    currentStock: inventory.currentStock,
    reservedStock: inventory.reservedStock,
    lastUpdated: inventory.lastUpdated
  })
  .from(inventory)
  .all()
}