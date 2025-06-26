/**
 * Inventory transformer for converting between local SQLite and cloud PostgreSQL formats
 * Handles the key differences:
 * - Local inventory tracking vs cloud authoritative inventory
 * - SQLite integer timestamps vs PostgreSQL timestamptz
 * - Conflict resolution for concurrent updates from multiple terminals
 * - Version-based optimistic locking
 */

import { BaseTransformer, TransformUtils, TransformationError } from './base'
import type { Inventory } from '../../../db/local/schema'
import type { CloudInventory, InventoryMovement } from '../../../db/cloud/types'

/**
 * Extended inventory interface with sync metadata
 */
export interface InventoryWithSync extends Inventory {
  conflictResolution?: {
    cloudVersion?: number
    lastCloudUpdate?: Date
    hasPendingChanges?: boolean
  }
}

/**
 * Inventory update payload for batch operations
 */
export interface InventoryUpdatePayload {
  productId: string
  oldStock: number
  newStock: number
  changeAmount: number
  changeReason: 'sale' | 'return' | 'adjustment' | 'receive'
  terminalId: string
  employeeId?: string
  notes?: string
}

/**
 * Transform inventory between local and cloud formats
 */
export class InventoryTransformer extends BaseTransformer<Inventory, CloudInventory> {
  /**
   * Convert local SQLite inventory to cloud PostgreSQL format
   */
  toCloud(local: Inventory): CloudInventory {
    try {
      const cloud: CloudInventory = {
        product_id: local.productId,
        current_stock: local.currentStock,
        reserved_stock: local.reservedStock,
        last_updated: TransformUtils.sqliteTimestampToIso(local.lastUpdated.getTime())!,
        last_synced_from_terminal: undefined, // Will be set by sync service
        version_number: 1 // Will be managed by cloud triggers
      }
      
      return cloud
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform inventory to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'InventoryTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  /**
   * Convert cloud PostgreSQL inventory to local SQLite format
   */
  toLocal(cloud: CloudInventory): Inventory {
    try {
      const local: Inventory = {
        productId: cloud.product_id,
        currentStock: cloud.current_stock,
        reservedStock: cloud.reserved_stock,
        lastUpdated: new Date(cloud.last_updated),
        lastSyncedAt: cloud.last_synced_from_terminal ? new Date() : null
      }
      
      return local
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform inventory to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'InventoryTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
  
  /**
   * Custom validation for inventory with tolerance for minor discrepancies
   */
  validate(local: Inventory, cloud: CloudInventory): boolean {
    try {
      return (
        local.productId === cloud.product_id &&
        local.currentStock === cloud.current_stock &&
        local.reservedStock === cloud.reserved_stock
        // Note: timestamp comparison omitted as they may differ slightly due to sync timing
      )
    } catch {
      return false
    }
  }
}

/**
 * Inventory movement transformer for audit trail
 */
export class InventoryMovementTransformer extends BaseTransformer<InventoryUpdatePayload, InventoryMovement> {
  toCloud(local: InventoryUpdatePayload): InventoryMovement {
    try {
      const movement: InventoryMovement = {
        id: TransformUtils.generateUlid(),
        product_id: local.productId,
        terminal_id: local.terminalId,
        change_type: local.changeReason,
        change_amount: local.changeAmount,
        new_stock_level: local.newStock,
        employee_id: local.employeeId,
        notes: local.notes,
        created_at: new Date().toISOString()
      }
      
      return movement
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform inventory movement to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'InventoryMovementTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  toLocal(cloud: InventoryMovement): InventoryUpdatePayload {
    try {
      const local: InventoryUpdatePayload = {
        productId: cloud.product_id,
        oldStock: cloud.new_stock_level - cloud.change_amount,
        newStock: cloud.new_stock_level,
        changeAmount: cloud.change_amount,
        changeReason: cloud.change_type,
        terminalId: cloud.terminal_id,
        employeeId: cloud.employee_id || undefined,
        notes: cloud.notes || undefined
      }
      
      return local
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform inventory movement to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'InventoryMovementTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
}

/**
 * Utility functions for inventory-specific transformations
 */
export class InventoryTransformUtils {
  /**
   * Calculate stock change from current to target levels
   */
  static calculateStockChange(
    currentStock: number,
    targetStock: number,
    reason: 'sale' | 'return' | 'adjustment' | 'receive'
  ): InventoryUpdatePayload {
    const changeAmount = targetStock - currentStock
    
    return {
      productId: '', // Will be set by caller
      oldStock: currentStock,
      newStock: targetStock,
      changeAmount,
      changeReason: reason,
      terminalId: '', // Will be set by caller
    }
  }
  
  /**
   * Validate inventory levels
   */
  static validateInventoryLevels(inventory: Inventory): {
    isValid: boolean
    warnings: string[]
    errors: string[]
  } {
    const warnings: string[] = []
    const errors: string[] = []
    
    // Check for negative stock
    if (inventory.currentStock < 0) {
      errors.push('Current stock cannot be negative')
    }
    
    if (inventory.reservedStock < 0) {
      errors.push('Reserved stock cannot be negative')
    }
    
    // Check for stock warnings
    if (inventory.currentStock === 0) {
      warnings.push('Product is out of stock')
    } else if (inventory.currentStock <= 5) {
      warnings.push('Product stock is low')
    }
    
    // Check reserved stock vs available stock
    if (inventory.reservedStock > inventory.currentStock) {
      warnings.push('Reserved stock exceeds current stock')
    }
    
    return {
      isValid: errors.length === 0,
      warnings,
      errors
    }
  }
  
  /**
   * Resolve inventory conflicts between local and cloud
   */
  static resolveInventoryConflict(
    localInventory: Inventory,
    cloudInventory: CloudInventory,
    strategy: 'cloud_wins' | 'local_wins' | 'merge' | 'manual'
  ): {
    resolved: Inventory
    action: 'use_cloud' | 'use_local' | 'merge' | 'requires_manual_resolution'
    details: string
  } {
    switch (strategy) {
      case 'cloud_wins':
        return {
          resolved: {
            ...localInventory,
            currentStock: cloudInventory.current_stock,
            reservedStock: cloudInventory.reserved_stock,
            lastUpdated: new Date(cloudInventory.last_updated),
            lastSyncedAt: new Date()
          },
          action: 'use_cloud',
          details: 'Cloud inventory data takes precedence'
        }
      
      case 'local_wins':
        return {
          resolved: localInventory,
          action: 'use_local',
          details: 'Local inventory data preserved, will sync to cloud'
        }
      
      case 'merge':
        // Simple merge strategy - take latest timestamp
        const cloudTime = new Date(cloudInventory.last_updated).getTime()
        const localTime = localInventory.lastUpdated.getTime()
        
        if (cloudTime > localTime) {
          return {
            resolved: {
              ...localInventory,
              currentStock: cloudInventory.current_stock,
              reservedStock: cloudInventory.reserved_stock,
              lastUpdated: new Date(cloudInventory.last_updated),
              lastSyncedAt: new Date()
            },
            action: 'use_cloud',
            details: 'Cloud data is more recent, using cloud values'
          }
        } else {
          return {
            resolved: localInventory,
            action: 'use_local',
            details: 'Local data is more recent, keeping local values'
          }
        }
      
      case 'manual':
      default:
        return {
          resolved: localInventory,
          action: 'requires_manual_resolution',
          details: `Conflict detected: Local stock=${localInventory.currentStock}, Cloud stock=${cloudInventory.current_stock}`
        }
    }
  }
  
  /**
   * Create inventory audit entry
   */
  static createInventoryAudit(
    productId: string,
    oldStock: number,
    newStock: number,
    reason: string,
    terminalId: string,
    employeeId?: string
  ): InventoryUpdatePayload {
    return {
      productId,
      oldStock,
      newStock,
      changeAmount: newStock - oldStock,
      changeReason: reason as any,
      terminalId,
      employeeId,
      notes: `Stock updated: ${oldStock} → ${newStock} (${reason})`
    }
  }
  
  /**
   * Calculate available stock (current - reserved)
   */
  static getAvailableStock(inventory: Inventory): number {
    return Math.max(0, inventory.currentStock - inventory.reservedStock)
  }
  
  /**
   * Check if enough stock is available for a given quantity
   */
  static hasAvailableStock(inventory: Inventory, requestedQuantity: number): boolean {
    return this.getAvailableStock(inventory) >= requestedQuantity
  }
  
  /**
   * Reserve stock for an order
   */
  static reserveStock(
    inventory: Inventory,
    quantity: number
  ): { success: boolean; newInventory?: Inventory; error?: string } {
    if (!this.hasAvailableStock(inventory, quantity)) {
      return {
        success: false,
        error: `Insufficient stock. Available: ${this.getAvailableStock(inventory)}, Requested: ${quantity}`
      }
    }
    
    const newInventory: Inventory = {
      ...inventory,
      reservedStock: inventory.reservedStock + quantity,
      lastUpdated: new Date()
    }
    
    return { success: true, newInventory }
  }
  
  /**
   * Release reserved stock
   */
  static releaseReservedStock(
    inventory: Inventory,
    quantity: number
  ): { success: boolean; newInventory?: Inventory; error?: string } {
    if (inventory.reservedStock < quantity) {
      return {
        success: false,
        error: `Cannot release more stock than reserved. Reserved: ${inventory.reservedStock}, Requested: ${quantity}`
      }
    }
    
    const newInventory: Inventory = {
      ...inventory,
      reservedStock: inventory.reservedStock - quantity,
      lastUpdated: new Date()
    }
    
    return { success: true, newInventory }
  }
}