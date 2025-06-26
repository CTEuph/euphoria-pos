/**
 * Unit tests for ProductTransformer
 * Tests bidirectional transformation between local SQLite and cloud PostgreSQL formats
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  ProductTransformer, 
  ProductBarcodeTransformer, 
  ProductTransformUtils,
  type LocalProductWithBarcodes 
} from '../../../../../src/services/sync/transformers/ProductTransformer'
import type { CloudProductWithBarcodes } from '../../../../../src/db/cloud/types'

describe('ProductTransformer', () => {
  let transformer: ProductTransformer
  
  beforeEach(() => {
    transformer = new ProductTransformer()
  })

  describe('toCloud', () => {
    it('should transform local product to cloud format', () => {
      const localProduct: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.5,
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z'),
        barcodes: [
          {
            id: 'BARCODE123',
            productId: 'ULID123456789',
            barcode: '1234567890123',
            isPrimary: true,
            createdAt: new Date('2024-01-01T10:00:00Z')
          }
        ]
      }

      const cloudProduct = transformer.toCloud(localProduct)

      expect(cloudProduct).toEqual({
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retail_price: 24.99,
        parent_product_id: undefined,
        units_in_parent: 1,
        loyalty_point_multiplier: 1.5,
        is_active: true,
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-02T10:00:00.000Z',
        version_number: 1,
        last_modified_by: undefined,
        barcodes: [
          {
            id: 'BARCODE123',
            product_id: 'ULID123456789',
            barcode: '1234567890123',
            is_primary: true,
            created_at: '2024-01-01T10:00:00.000Z'
          }
        ]
      })
    })

    it('should handle null values correctly', () => {
      const localProduct: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z')
      }

      const cloudProduct = transformer.toCloud(localProduct)

      expect(cloudProduct.parent_product_id).toBeUndefined()
      expect(cloudProduct.barcodes).toBeUndefined()
    })
  })

  describe('toLocal', () => {
    it('should transform cloud product to local format', () => {
      const cloudProduct: CloudProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retail_price: 24.99,
        parent_product_id: undefined,
        units_in_parent: 1,
        loyalty_point_multiplier: 1.5,
        is_active: true,
        created_at: '2024-01-01T10:00:00.000Z',
        updated_at: '2024-01-02T10:00:00.000Z',
        version_number: 1,
        last_modified_by: undefined,
        barcodes: [
          {
            id: 'BARCODE123',
            product_id: 'ULID123456789',
            barcode: '1234567890123',
            is_primary: true,
            created_at: '2024-01-01T10:00:00.000Z'
          }
        ]
      }

      const localProduct = transformer.toLocal(cloudProduct)

      expect(localProduct).toEqual({
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.5,
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00.000Z'),
        updatedAt: new Date('2024-01-02T10:00:00.000Z'),
        barcodes: [
          {
            id: 'BARCODE123',
            productId: 'ULID123456789',
            barcode: '1234567890123',
            isPrimary: true,
            createdAt: new Date('2024-01-01T10:00:00.000Z')
          }
        ]
      })
    })
  })

  describe('validate', () => {
    it('should validate matching local and cloud products', () => {
      const localProduct: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date('2024-01-01T10:00:00Z'),
        updatedAt: new Date('2024-01-02T10:00:00Z'),
        barcodes: [
          {
            id: 'BARCODE123',
            productId: 'ULID123456789',
            barcode: '1234567890123',
            isPrimary: true,
            createdAt: new Date('2024-01-01T10:00:00Z')
          }
        ]
      }

      const cloudProduct = transformer.toCloud(localProduct)
      const isValid = transformer.validate(localProduct, cloudProduct)

      expect(isValid).toBe(true)
    })

    it('should detect mismatched products', () => {
      const localProduct: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const cloudProduct = transformer.toCloud(localProduct)
      cloudProduct.name = 'Different Wine'

      const isValid = transformer.validate(localProduct, cloudProduct)

      expect(isValid).toBe(false)
    })
  })

  describe('batch operations', () => {
    it('should transform multiple products to cloud format', () => {
      const localProducts: LocalProductWithBarcodes[] = [
        {
          id: 'ULID1',
          sku: 'WINE-001',
          name: 'Wine 1',
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
        },
        {
          id: 'ULID2',
          sku: 'WINE-002',
          name: 'Wine 2',
          category: 'wine',
          size: '750ml',
          cost: 15.00,
          retailPrice: 30.00,
          parentProductId: null,
          unitsInParent: 1,
          loyaltyPointMultiplier: 1.0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]

      const cloudProducts = transformer.batchToCloud(localProducts)

      expect(cloudProducts).toHaveLength(2)
      expect(cloudProducts[0].sku).toBe('WINE-001')
      expect(cloudProducts[1].sku).toBe('WINE-002')
    })
  })
})

describe('ProductBarcodeTransformer', () => {
  let transformer: ProductBarcodeTransformer

  beforeEach(() => {
    transformer = new ProductBarcodeTransformer()
  })

  it('should transform barcode to cloud format', () => {
    const localBarcode = {
      id: 'BARCODE123',
      productId: 'PRODUCT123',
      barcode: '1234567890123',
      isPrimary: true,
      createdAt: new Date('2024-01-01T10:00:00Z')
    }

    const cloudBarcode = transformer.toCloud(localBarcode)

    expect(cloudBarcode).toEqual({
      id: 'BARCODE123',
      product_id: 'PRODUCT123',
      barcode: '1234567890123',
      is_primary: true,
      created_at: '2024-01-01T10:00:00.000Z'
    })
  })

  it('should transform barcode to local format', () => {
    const cloudBarcode = {
      id: 'BARCODE123',
      product_id: 'PRODUCT123',
      barcode: '1234567890123',
      is_primary: true,
      created_at: '2024-01-01T10:00:00.000Z'
    }

    const localBarcode = transformer.toLocal(cloudBarcode)

    expect(localBarcode).toEqual({
      id: 'BARCODE123',
      productId: 'PRODUCT123',
      barcode: '1234567890123',
      isPrimary: true,
      createdAt: new Date('2024-01-01T10:00:00Z')
    })
  })
})

describe('ProductTransformUtils', () => {
  describe('validateProductData', () => {
    it('should validate correct product data', () => {
      const product: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 12.50,
        retailPrice: 24.99,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        barcodes: [
          {
            id: 'BARCODE123',
            productId: 'ULID123456789',
            barcode: '1234567890123',
            isPrimary: true,
            createdAt: new Date()
          }
        ]
      }

      const validation = ProductTransformUtils.validateProductData(product)

      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect invalid product data', () => {
      const product: LocalProductWithBarcodes = {
        id: '',
        sku: '',
        name: '',
        category: 'invalid' as any,
        size: 'invalid' as any,
        cost: -5,
        retailPrice: 10,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        barcodes: [
          {
            id: 'BARCODE1',
            productId: 'ULID123456789',
            barcode: '1234567890123',
            isPrimary: true,
            createdAt: new Date()
          },
          {
            id: 'BARCODE2',
            productId: 'ULID123456789',
            barcode: '1234567890123', // Duplicate barcode
            isPrimary: true, // Duplicate primary
            createdAt: new Date()
          }
        ]
      }

      const validation = ProductTransformUtils.validateProductData(product)

      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
      expect(validation.errors).toContain('Product ID is required')
      expect(validation.errors).toContain('SKU is required')
      expect(validation.errors).toContain('Product name is required')
      expect(validation.errors).toContain('Cost cannot be negative')
      expect(validation.errors).toContain('Invalid category: invalid')
      expect(validation.errors).toContain('Product cannot have multiple primary barcodes')
      expect(validation.errors).toContain('Product has duplicate barcodes')
    })

    it('should warn about low retail price', () => {
      const product: LocalProductWithBarcodes = {
        id: 'ULID123456789',
        sku: 'WINE-001',
        name: 'Cabernet Sauvignon 2020',
        category: 'wine',
        size: '750ml',
        cost: 25.00,
        retailPrice: 20.00, // Less than cost
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const validation = ProductTransformUtils.validateProductData(product)

      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Retail price should not be less than cost')
    })
  })

  describe('createBarcodeRecord', () => {
    it('should create a valid barcode record', () => {
      const barcode = ProductTransformUtils.createBarcodeRecord(
        'PRODUCT123',
        '1234567890123',
        true
      )

      expect(barcode.productId).toBe('PRODUCT123')
      expect(barcode.barcode).toBe('1234567890123')
      expect(barcode.isPrimary).toBe(true)
      expect(barcode.id).toBeTruthy()
      expect(barcode.createdAt).toBeInstanceOf(Date)
    })
  })

  describe('mergeProductWithBarcodes', () => {
    it('should merge product with its barcodes', () => {
      const product = {
        id: 'PRODUCT123',
        sku: 'WINE-001',
        name: 'Wine',
        category: 'wine' as any,
        size: '750ml' as any,
        cost: 10,
        retailPrice: 20,
        parentProductId: null,
        unitsInParent: 1,
        loyaltyPointMultiplier: 1.0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const barcodes = [
        {
          id: 'BARCODE1',
          productId: 'PRODUCT123',
          barcode: '1111111111111',
          isPrimary: true,
          createdAt: new Date()
        },
        {
          id: 'BARCODE2',
          productId: 'PRODUCT456', // Different product
          barcode: '2222222222222',
          isPrimary: false,
          createdAt: new Date()
        }
      ]

      const merged = ProductTransformUtils.mergeProductWithBarcodes(product, barcodes)

      expect(merged.barcodes).toHaveLength(1)
      expect(merged.barcodes![0].barcode).toBe('1111111111111')
    })
  })
})