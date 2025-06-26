/**
 * Unit tests for TransformerFactory
 * Tests the unified transformer interface and factory methods
 */

import { describe, it, expect } from 'vitest'
import { TransformerFactory, SyncTransformUtils } from '../../../../../src/services/sync/transformers'
import type { Product, Employee, Inventory } from '../../../../../src/db/local/schema'

describe('TransformerFactory', () => {
  describe('singleton instances', () => {
    it('should return consistent transformer instances', () => {
      const transformer1 = TransformerFactory.getProductTransformer()
      const transformer2 = TransformerFactory.getProductTransformer()

      expect(transformer1).toBe(transformer2)
    })

    it('should return different types of transformers', () => {
      const productTransformer = TransformerFactory.getProductTransformer()
      const employeeTransformer = TransformerFactory.getEmployeeTransformer()
      const inventoryTransformer = TransformerFactory.getInventoryTransformer()

      expect(productTransformer).toBeTruthy()
      expect(employeeTransformer).toBeTruthy()
      expect(inventoryTransformer).toBeTruthy()
      expect(productTransformer).not.toBe(employeeTransformer)
    })
  })

  describe('unified transformation methods', () => {
    const mockProduct: Product = {
      id: 'PRODUCT123',
      sku: 'WINE-001',
      name: 'Test Wine',
      category: 'wine',
      size: '750ml',
      cost: 10.00,
      retailPrice: 20.00,
      parentProductId: null,
      unitsInParent: 1,
      loyaltyPointMultiplier: 1.0,
      isActive: true,
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T10:00:00Z')
    }

    const mockEmployee: Employee = {
      id: 'EMPLOYEE123',
      employeeCode: 'EMP001',
      firstName: 'John',
      lastName: 'Doe',
      pin: '123456',
      isActive: true,
      canOverridePrice: false,
      canVoidTransaction: false,
      isManager: false,
      createdAt: new Date('2024-01-01T10:00:00Z'),
      updatedAt: new Date('2024-01-01T10:00:00Z')
    }

    const mockInventory: Inventory = {
      productId: 'PRODUCT123',
      currentStock: 25,
      reservedStock: 5,
      lastUpdated: new Date('2024-01-01T10:00:00Z'),
      lastSyncedAt: null
    }

    describe('toCloud', () => {
      it('should transform product to cloud format', () => {
        const cloudProduct = TransformerFactory.toCloud(mockProduct, 'product')

        expect(cloudProduct).toBeTruthy()
        expect(cloudProduct.id).toBe('PRODUCT123')
        expect(cloudProduct.retail_price).toBe(20.00)
      })

      it('should transform employee to cloud format', () => {
        const cloudEmployee = TransformerFactory.toCloud(mockEmployee, 'employee')

        expect(cloudEmployee).toBeTruthy()
        expect(cloudEmployee.id).toBe('EMPLOYEE123')
        expect(cloudEmployee.employee_code).toBe('EMP001')
      })

      it('should transform inventory to cloud format', () => {
        const cloudInventory = TransformerFactory.toCloud(mockInventory, 'inventory')

        expect(cloudInventory).toBeTruthy()
        expect(cloudInventory.product_id).toBe('PRODUCT123')
        expect(cloudInventory.current_stock).toBe(25)
      })

      it('should throw error for unsupported type', () => {
        expect(() => {
          TransformerFactory.toCloud(mockProduct, 'unsupported' as any)
        }).toThrow('Unsupported data type for transformation')
      })
    })

    describe('toLocal', () => {
      it('should transform cloud product to local format', () => {
        const cloudProduct = TransformerFactory.toCloud(mockProduct, 'product')
        const localProduct = TransformerFactory.toLocal(cloudProduct, 'product')

        expect(localProduct).toBeTruthy()
        expect(localProduct.id).toBe('PRODUCT123')
        expect(localProduct.retailPrice).toBe(20.00)
      })

      it('should transform cloud employee to local format', () => {
        const cloudEmployee = TransformerFactory.toCloud(mockEmployee, 'employee')
        const localEmployee = TransformerFactory.toLocal(cloudEmployee, 'employee')

        expect(localEmployee).toBeTruthy()
        expect(localEmployee.id).toBe('EMPLOYEE123')
        expect(localEmployee.employeeCode).toBe('EMP001')
      })

      it('should transform cloud inventory to local format', () => {
        const cloudInventory = TransformerFactory.toCloud(mockInventory, 'inventory')
        const localInventory = TransformerFactory.toLocal(cloudInventory, 'inventory')

        expect(localInventory).toBeTruthy()
        expect(localInventory.productId).toBe('PRODUCT123')
        expect(localInventory.currentStock).toBe(25)
      })
    })

    describe('batch operations', () => {
      it('should transform multiple products to cloud format', () => {
        const products = [mockProduct, { ...mockProduct, id: 'PRODUCT456', sku: 'WINE-002' }]
        const cloudProducts = TransformerFactory.batchToCloud(products, 'product')

        expect(cloudProducts).toHaveLength(2)
        expect(cloudProducts[0].id).toBe('PRODUCT123')
        expect(cloudProducts[1].id).toBe('PRODUCT456')
        expect(cloudProducts[1].sku).toBe('WINE-002')
      })

      it('should transform multiple items to local format', () => {
        const products = [mockProduct, { ...mockProduct, id: 'PRODUCT456' }]
        const cloudProducts = TransformerFactory.batchToCloud(products, 'product')
        const localProducts = TransformerFactory.batchToLocal(cloudProducts, 'product')

        expect(localProducts).toHaveLength(2)
        expect(localProducts[0].id).toBe('PRODUCT123')
        expect(localProducts[1].id).toBe('PRODUCT456')
      })
    })

    describe('validation', () => {
      it('should validate transformation for products', () => {
        const cloudProduct = TransformerFactory.toCloud(mockProduct, 'product')
        const isValid = TransformerFactory.validateTransformation(mockProduct, cloudProduct, 'product')

        expect(isValid).toBe(true)
      })

      it('should validate transformation for employees', () => {
        const cloudEmployee = TransformerFactory.toCloud(mockEmployee, 'employee')
        const isValid = TransformerFactory.validateTransformation(mockEmployee, cloudEmployee, 'employee')

        expect(isValid).toBe(true)
      })

      it('should return false for unsupported type', () => {
        const isValid = TransformerFactory.validateTransformation(mockProduct, mockProduct, 'unsupported' as any)

        expect(isValid).toBe(false)
      })
    })
  })
})

describe('SyncTransformUtils', () => {
  const mockProduct: Product = {
    id: 'PRODUCT123',
    sku: 'WINE-001',
    name: 'Test Wine',
    category: 'wine',
    size: '750ml',
    cost: 10.00,
    retailPrice: 20.00,
    parentProductId: null,
    unitsInParent: 1,
    loyaltyPointMultiplier: 1.0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const mockEmployee: Employee = {
    id: 'EMPLOYEE123',
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '123456',
    isActive: true,
    canOverridePrice: false,
    canVoidTransaction: false,
    isManager: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  describe('prepareSyncUploadPayload', () => {
    it('should prepare upload payload with products', () => {
      const data = {
        products: [mockProduct]
      }

      const payload = SyncTransformUtils.prepareSyncUploadPayload(data)

      expect(payload.products).toBeTruthy()
      expect(payload.products).toHaveLength(1)
      expect(payload.products[0].retail_price).toBe(20.00)
    })

    it('should prepare upload payload with employees', () => {
      const data = {
        employees: [mockEmployee]
      }

      const payload = SyncTransformUtils.prepareSyncUploadPayload(data)

      expect(payload.employees).toBeTruthy()
      expect(payload.employees).toHaveLength(1)
      expect(payload.employees[0].employee_code).toBe('EMP001')
    })

    it('should handle empty payload', () => {
      const payload = SyncTransformUtils.prepareSyncUploadPayload({})

      expect(payload).toEqual({})
    })
  })

  describe('prepareLocalDownloadData', () => {
    it('should prepare local data from cloud products', () => {
      const cloudData = {
        products: [TransformerFactory.toCloud(mockProduct, 'product')]
      }

      const localData = SyncTransformUtils.prepareLocalDownloadData(cloudData)

      expect(localData.products).toBeTruthy()
      expect(localData.products).toHaveLength(1)
      expect(localData.products[0].retailPrice).toBe(20.00)
    })

    it('should prepare local data from cloud employees', () => {
      const cloudData = {
        employees: [TransformerFactory.toCloud(mockEmployee, 'employee')]
      }

      const localData = SyncTransformUtils.prepareLocalDownloadData(cloudData)

      expect(localData.employees).toBeTruthy()
      expect(localData.employees).toHaveLength(1)
      expect(localData.employees[0].employeeCode).toBe('EMP001')
    })
  })

  describe('createTransformationSummary', () => {
    it('should create summary for successful transformation', () => {
      const summary = SyncTransformUtils.createTransformationSummary(
        'toCloud',
        'product',
        5,
        5
      )

      expect(summary).toEqual({
        operation: 'toCloud',
        type: 'product',
        inputCount: 5,
        outputCount: 5,
        successCount: 5,
        errorCount: 0,
        errors: [],
        timestamp: expect.any(String)
      })
    })

    it('should create summary with errors', () => {
      const errors = [
        new (class extends Error {
          context = { transformer: 'TestTransformer', operation: 'toCloud' as const }
        })('Test error')
      ] as any[]

      const summary = SyncTransformUtils.createTransformationSummary(
        'toLocal',
        'employee',
        3,
        2,
        errors
      )

      expect(summary.operation).toBe('toLocal')
      expect(summary.type).toBe('employee')
      expect(summary.inputCount).toBe(3)
      expect(summary.outputCount).toBe(2)
      expect(summary.errorCount).toBe(1)
      expect(summary.errors).toHaveLength(1)
    })
  })
})