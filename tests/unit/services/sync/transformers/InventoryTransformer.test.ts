/**
 * Unit tests for InventoryTransformer
 * Tests bidirectional transformation between local SQLite and cloud PostgreSQL formats
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  InventoryTransformer, 
  InventoryMovementTransformer,
  InventoryTransformUtils,
  type InventoryUpdatePayload
} from '../../../../../src/services/sync/transformers/InventoryTransformer'
import type { Inventory } from '../../../../../src/db/local/schema'
import type { CloudInventory, InventoryMovement } from '../../../../../src/db/cloud/types'

describe('InventoryTransformer', () => {
  let transformer: InventoryTransformer
  
  beforeEach(() => {
    transformer = new InventoryTransformer()
  })

  describe('toCloud', () => {
    it('should transform local inventory to cloud format', () => {
      const localInventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date('2024-01-01T10:00:00Z'),
        lastSyncedAt: new Date('2024-01-01T09:00:00Z')
      }

      const cloudInventory = transformer.toCloud(localInventory)

      expect(cloudInventory).toEqual({
        product_id: 'PRODUCT123',
        current_stock: 25,
        reserved_stock: 5,
        last_updated: '2024-01-01T10:00:00.000Z',
        last_synced_from_terminal: undefined,
        version_number: 1
      })
    })

    it('should handle null lastSyncedAt', () => {
      const localInventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date('2024-01-01T10:00:00Z'),
        lastSyncedAt: null
      }

      const cloudInventory = transformer.toCloud(localInventory)

      expect(cloudInventory.last_synced_from_terminal).toBeUndefined()
    })
  })

  describe('toLocal', () => {
    it('should transform cloud inventory to local format', () => {
      const cloudInventory: CloudInventory = {
        product_id: 'PRODUCT123',
        current_stock: 25,
        reserved_stock: 5,
        last_updated: '2024-01-01T10:00:00.000Z',
        last_synced_from_terminal: 'TERMINAL001',
        version_number: 2
      }

      const localInventory = transformer.toLocal(cloudInventory)

      expect(localInventory).toEqual({
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date('2024-01-01T10:00:00.000Z'),
        lastSyncedAt: expect.any(Date)
      })
    })

    it('should handle null terminal sync', () => {
      const cloudInventory: CloudInventory = {
        product_id: 'PRODUCT123',
        current_stock: 25,
        reserved_stock: 5,
        last_updated: '2024-01-01T10:00:00.000Z',
        last_synced_from_terminal: undefined,
        version_number: 1
      }

      const localInventory = transformer.toLocal(cloudInventory)

      expect(localInventory.lastSyncedAt).toBeNull()
    })
  })

  describe('validate', () => {
    it('should validate matching local and cloud inventory', () => {
      const localInventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date('2024-01-01T10:00:00Z'),
        lastSyncedAt: null
      }

      const cloudInventory = transformer.toCloud(localInventory)
      const isValid = transformer.validate(localInventory, cloudInventory)

      expect(isValid).toBe(true)
    })

    it('should detect mismatched inventory', () => {
      const localInventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const cloudInventory = transformer.toCloud(localInventory)
      cloudInventory.current_stock = 30 // Different stock level

      const isValid = transformer.validate(localInventory, cloudInventory)

      expect(isValid).toBe(false)
    })
  })
})

describe('InventoryMovementTransformer', () => {
  let transformer: InventoryMovementTransformer
  
  beforeEach(() => {
    transformer = new InventoryMovementTransformer()
  })

  describe('toCloud', () => {
    it('should transform inventory update payload to cloud movement', () => {
      const updatePayload: InventoryUpdatePayload = {
        productId: 'PRODUCT123',
        oldStock: 30,
        newStock: 25,
        changeAmount: -5,
        changeReason: 'sale',
        terminalId: 'TERMINAL001',
        employeeId: 'EMPLOYEE123',
        notes: 'Sold 5 units'
      }

      const movement = transformer.toCloud(updatePayload)

      expect(movement).toEqual({
        id: expect.any(String),
        product_id: 'PRODUCT123',
        terminal_id: 'TERMINAL001',
        change_type: 'sale',
        change_amount: -5,
        new_stock_level: 25,
        employee_id: 'EMPLOYEE123',
        notes: 'Sold 5 units',
        created_at: expect.any(String)
      })
    })
  })

  describe('toLocal', () => {
    it('should transform cloud movement to local update payload', () => {
      const movement: InventoryMovement = {
        id: 'MOVEMENT123',
        product_id: 'PRODUCT123',
        terminal_id: 'TERMINAL001',
        change_type: 'sale',
        change_amount: -5,
        new_stock_level: 25,
        employee_id: 'EMPLOYEE123',
        notes: 'Sold 5 units',
        created_at: '2024-01-01T10:00:00.000Z'
      }

      const updatePayload = transformer.toLocal(movement)

      expect(updatePayload).toEqual({
        productId: 'PRODUCT123',
        oldStock: 30, // 25 - (-5)
        newStock: 25,
        changeAmount: -5,
        changeReason: 'sale',
        terminalId: 'TERMINAL001',
        employeeId: 'EMPLOYEE123',
        notes: 'Sold 5 units'
      })
    })
  })
})

describe('InventoryTransformUtils', () => {
  describe('validateInventoryLevels', () => {
    it('should validate correct inventory levels', () => {
      const inventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 25,
        reservedStock: 5,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const validation = InventoryTransformUtils.validateInventoryLevels(inventory)

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
      expect(validation.warnings).toHaveLength(0)
    })

    it('should detect negative stock levels', () => {
      const inventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: -5,
        reservedStock: -2,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const validation = InventoryTransformUtils.validateInventoryLevels(inventory)

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Current stock cannot be negative')
      expect(validation.errors).toContain('Reserved stock cannot be negative')
    })

    it('should warn about low stock', () => {
      const inventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 3,
        reservedStock: 0,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const validation = InventoryTransformUtils.validateInventoryLevels(inventory)

      expect(validation.isValid).toBe(true)
      expect(validation.warnings).toContain('Product stock is low')
    })

    it('should warn about out of stock', () => {
      const inventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 0,
        reservedStock: 0,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const validation = InventoryTransformUtils.validateInventoryLevels(inventory)

      expect(validation.isValid).toBe(true)
      expect(validation.warnings).toContain('Product is out of stock')
    })

    it('should warn about reserved stock exceeding current stock', () => {
      const inventory: Inventory = {
        productId: 'PRODUCT123',
        currentStock: 10,
        reservedStock: 15,
        lastUpdated: new Date(),
        lastSyncedAt: null
      }

      const validation = InventoryTransformUtils.validateInventoryLevels(inventory)

      expect(validation.isValid).toBe(true)
      expect(validation.warnings).toContain('Reserved stock exceeds current stock')
    })
  })

  describe('resolveInventoryConflict', () => {
    const localInventory: Inventory = {
      productId: 'PRODUCT123',
      currentStock: 25,
      reservedStock: 5,
      lastUpdated: new Date('2024-01-01T12:00:00Z'),
      lastSyncedAt: null
    }

    const cloudInventory: CloudInventory = {
      product_id: 'PRODUCT123',
      current_stock: 30,
      reserved_stock: 3,
      last_updated: '2024-01-01T11:00:00.000Z',
      version_number: 1
    }

    it('should resolve using cloud_wins strategy', () => {
      const resolution = InventoryTransformUtils.resolveInventoryConflict(
        localInventory,
        cloudInventory,
        'cloud_wins'
      )

      expect(resolution.action).toBe('use_cloud')
      expect(resolution.resolved.currentStock).toBe(30)
      expect(resolution.resolved.reservedStock).toBe(3)
    })

    it('should resolve using local_wins strategy', () => {
      const resolution = InventoryTransformUtils.resolveInventoryConflict(
        localInventory,
        cloudInventory,
        'local_wins'
      )

      expect(resolution.action).toBe('use_local')
      expect(resolution.resolved.currentStock).toBe(25)
      expect(resolution.resolved.reservedStock).toBe(5)
    })

    it('should resolve using merge strategy with local data newer', () => {
      const resolution = InventoryTransformUtils.resolveInventoryConflict(
        localInventory,
        cloudInventory,
        'merge'
      )

      expect(resolution.action).toBe('use_local')
      expect(resolution.details).toContain('Local data is more recent')
    })

    it('should resolve using merge strategy with cloud data newer', () => {
      const newerCloudInventory = {
        ...cloudInventory,
        last_updated: '2024-01-01T13:00:00.000Z'
      }

      const resolution = InventoryTransformUtils.resolveInventoryConflict(
        localInventory,
        newerCloudInventory,
        'merge'
      )

      expect(resolution.action).toBe('use_cloud')
      expect(resolution.details).toContain('Cloud data is more recent')
    })

    it('should require manual resolution', () => {
      const resolution = InventoryTransformUtils.resolveInventoryConflict(
        localInventory,
        cloudInventory,
        'manual'
      )

      expect(resolution.action).toBe('requires_manual_resolution')
      expect(resolution.details).toContain('Conflict detected')
    })
  })

  describe('stock operations', () => {
    const inventory: Inventory = {
      productId: 'PRODUCT123',
      currentStock: 20,
      reservedStock: 5,
      lastUpdated: new Date(),
      lastSyncedAt: null
    }

    describe('getAvailableStock', () => {
      it('should calculate available stock correctly', () => {
        const available = InventoryTransformUtils.getAvailableStock(inventory)
        expect(available).toBe(15) // 20 - 5
      })

      it('should return 0 when reserved exceeds current', () => {
        const overReserved = { ...inventory, reservedStock: 25 }
        const available = InventoryTransformUtils.getAvailableStock(overReserved)
        expect(available).toBe(0)
      })
    })

    describe('hasAvailableStock', () => {
      it('should return true when enough stock available', () => {
        expect(InventoryTransformUtils.hasAvailableStock(inventory, 10)).toBe(true)
        expect(InventoryTransformUtils.hasAvailableStock(inventory, 15)).toBe(true)
      })

      it('should return false when not enough stock available', () => {
        expect(InventoryTransformUtils.hasAvailableStock(inventory, 16)).toBe(false)
        expect(InventoryTransformUtils.hasAvailableStock(inventory, 25)).toBe(false)
      })
    })

    describe('reserveStock', () => {
      it('should reserve stock successfully', () => {
        const result = InventoryTransformUtils.reserveStock(inventory, 10)

        expect(result.success).toBe(true)
        expect(result.newInventory!.reservedStock).toBe(15) // 5 + 10
        expect(result.newInventory!.currentStock).toBe(20) // Unchanged
      })

      it('should fail when insufficient stock', () => {
        const result = InventoryTransformUtils.reserveStock(inventory, 20)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Insufficient stock')
      })
    })

    describe('releaseReservedStock', () => {
      it('should release reserved stock successfully', () => {
        const result = InventoryTransformUtils.releaseReservedStock(inventory, 3)

        expect(result.success).toBe(true)
        expect(result.newInventory!.reservedStock).toBe(2) // 5 - 3
        expect(result.newInventory!.currentStock).toBe(20) // Unchanged
      })

      it('should fail when trying to release more than reserved', () => {
        const result = InventoryTransformUtils.releaseReservedStock(inventory, 10)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Cannot release more stock than reserved')
      })
    })
  })

  describe('calculateStockChange', () => {
    it('should calculate stock increase', () => {
      const change = InventoryTransformUtils.calculateStockChange(20, 25, 'receive')

      expect(change.oldStock).toBe(20)
      expect(change.newStock).toBe(25)
      expect(change.changeAmount).toBe(5)
      expect(change.changeReason).toBe('receive')
    })

    it('should calculate stock decrease', () => {
      const change = InventoryTransformUtils.calculateStockChange(25, 20, 'sale')

      expect(change.oldStock).toBe(25)
      expect(change.newStock).toBe(20)
      expect(change.changeAmount).toBe(-5)
      expect(change.changeReason).toBe('sale')
    })
  })

  describe('createInventoryAudit', () => {
    it('should create audit entry', () => {
      const audit = InventoryTransformUtils.createInventoryAudit(
        'PRODUCT123',
        20,
        25,
        'adjustment',
        'TERMINAL001',
        'EMPLOYEE123'
      )

      expect(audit).toEqual({
        productId: 'PRODUCT123',
        oldStock: 20,
        newStock: 25,
        changeAmount: 5,
        changeReason: 'adjustment',
        terminalId: 'TERMINAL001',
        employeeId: 'EMPLOYEE123',
        notes: 'Stock updated: 20 → 25 (adjustment)'
      })
    })
  })
})