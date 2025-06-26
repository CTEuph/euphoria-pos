/**
 * Product transformer for converting between local SQLite and cloud PostgreSQL formats
 * Handles the key differences:
 * - ULID (text) vs UUID (text) primary keys
 * - Separate productBarcodes table vs embedded barcode arrays
 * - SQLite integer timestamps vs PostgreSQL timestamptz
 * - SQLite real vs PostgreSQL decimal
 */

import { BaseTransformer, TransformUtils, TransformationError } from './base'
import type { Product, ProductBarcode } from '../../../db/local/schema'
import type { CloudProduct, CloudProductBarcode } from '../../../db/cloud/types'

export interface LocalProductWithBarcodes extends Product {
  barcodes?: ProductBarcode[]
}

export interface CloudProductWithBarcodes extends CloudProduct {
  barcodes?: CloudProductBarcode[]
}

/**
 * Transform products between local and cloud formats
 */
export class ProductTransformer extends BaseTransformer<LocalProductWithBarcodes, CloudProductWithBarcodes> {
  /**
   * Convert local SQLite product to cloud PostgreSQL format
   */
  toCloud(local: LocalProductWithBarcodes): CloudProductWithBarcodes {
    try {
      const cloud: CloudProductWithBarcodes = {
        id: local.id, // Keep ULID as-is (will be stored as text in PostgreSQL)
        sku: local.sku,
        name: local.name,
        category: local.category as any, // Type assertion for enum compatibility
        size: local.size as any,
        cost: local.cost,
        retail_price: local.retailPrice,
        parent_product_id: local.parentProductId || undefined,
        units_in_parent: local.unitsInParent,
        loyalty_point_multiplier: local.loyaltyPointMultiplier,
        is_active: local.isActive,
        created_at: TransformUtils.sqliteTimestampToIso(local.createdAt.getTime())!,
        updated_at: TransformUtils.sqliteTimestampToIso(local.updatedAt.getTime())!,
        version_number: 1, // Start with version 1 for new records
        last_modified_by: undefined // Will be set by the sync service
      }
      
      // Transform barcodes if present
      if (local.barcodes) {
        cloud.barcodes = local.barcodes.map(barcode => ({
          id: barcode.id,
          product_id: barcode.productId,
          barcode: barcode.barcode,
          is_primary: barcode.isPrimary || false,
          created_at: TransformUtils.sqliteTimestampToIso(barcode.createdAt.getTime())!
        }))
      }
      
      return cloud
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform product to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'ProductTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  /**
   * Convert cloud PostgreSQL product to local SQLite format
   */
  toLocal(cloud: CloudProductWithBarcodes): LocalProductWithBarcodes {
    try {
      const local: LocalProductWithBarcodes = {
        id: cloud.id, // Keep as text (ULID)
        sku: cloud.sku,
        name: cloud.name,
        category: cloud.category,
        size: cloud.size,
        cost: cloud.cost,
        retailPrice: cloud.retail_price,
        parentProductId: cloud.parent_product_id || null,
        unitsInParent: cloud.units_in_parent,
        loyaltyPointMultiplier: cloud.loyalty_point_multiplier,
        isActive: cloud.is_active,
        createdAt: new Date(cloud.created_at),
        updatedAt: new Date(cloud.updated_at)
      }
      
      // Transform barcodes if present
      if (cloud.barcodes) {
        local.barcodes = cloud.barcodes.map(barcode => ({
          id: barcode.id,
          productId: barcode.product_id,
          barcode: barcode.barcode,
          isPrimary: barcode.is_primary,
          createdAt: new Date(barcode.created_at)
        }))
      }
      
      return local
      
    } catch (error) {
      throw new TransformationError(
        `Failed to transform product to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'ProductTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
  
  /**
   * Custom validation for products
   */
  validate(local: LocalProductWithBarcodes, cloud: CloudProductWithBarcodes): boolean {
    try {
      // Check core fields
      const coreFieldsMatch = (
        local.id === cloud.id &&
        local.sku === cloud.sku &&
        local.name === cloud.name &&
        local.category === cloud.category &&
        local.size === cloud.size &&
        Math.abs(local.cost - cloud.cost) < 0.01 && // Allow for floating point precision
        Math.abs(local.retailPrice - cloud.retail_price) < 0.01 &&
        local.isActive === cloud.is_active
      )
      
      if (!coreFieldsMatch) return false
      
      // Check barcodes if present
      if (local.barcodes && cloud.barcodes) {
        if (local.barcodes.length !== cloud.barcodes.length) return false
        
        for (let i = 0; i < local.barcodes.length; i++) {
          const localBarcode = local.barcodes[i]
          const cloudBarcode = cloud.barcodes[i]
          
          if (
            localBarcode.barcode !== cloudBarcode.barcode ||
            localBarcode.isPrimary !== cloudBarcode.is_primary
          ) {
            return false
          }
        }
      }
      
      return true
      
    } catch {
      return false
    }
  }
}

/**
 * Barcode-only transformer for separate barcode operations
 */
export class ProductBarcodeTransformer extends BaseTransformer<ProductBarcode, CloudProductBarcode> {
  toCloud(local: ProductBarcode): CloudProductBarcode {
    try {
      return {
        id: local.id,
        product_id: local.productId,
        barcode: local.barcode,
        is_primary: local.isPrimary || false,
        created_at: TransformUtils.sqliteTimestampToIso(local.createdAt.getTime())!
      }
    } catch (error) {
      throw new TransformationError(
        `Failed to transform barcode to cloud format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'ProductBarcodeTransformer',
          operation: 'toCloud',
          data: local
        }
      )
    }
  }
  
  toLocal(cloud: CloudProductBarcode): ProductBarcode {
    try {
      return {
        id: cloud.id,
        productId: cloud.product_id,
        barcode: cloud.barcode,
        isPrimary: cloud.is_primary,
        createdAt: new Date(cloud.created_at)
      }
    } catch (error) {
      throw new TransformationError(
        `Failed to transform barcode to local format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          transformer: 'ProductBarcodeTransformer',
          operation: 'toLocal',
          data: cloud
        }
      )
    }
  }
}

/**
 * Utility functions for product-specific transformations
 */
export class ProductTransformUtils {
  /**
   * Merge barcodes into a product record
   */
  static mergeProductWithBarcodes(
    product: Product,
    barcodes: ProductBarcode[]
  ): LocalProductWithBarcodes {
    return {
      ...product,
      barcodes: barcodes.filter(b => b.productId === product.id)
    }
  }
  
  /**
   * Split product with barcodes into separate records
   */
  static splitProductWithBarcodes(
    productWithBarcodes: LocalProductWithBarcodes
  ): { product: Product; barcodes: ProductBarcode[] } {
    const { barcodes, ...product } = productWithBarcodes
    return {
      product: product as Product,
      barcodes: barcodes || []
    }
  }
  
  /**
   * Generate barcode record for a product
   */
  static createBarcodeRecord(
    productId: string,
    barcode: string,
    isPrimary: boolean = false
  ): ProductBarcode {
    return {
      id: TransformUtils.generateUlid(),
      productId,
      barcode,
      isPrimary,
      createdAt: new Date()
    }
  }
  
  /**
   * Validate product data integrity
   */
  static validateProductData(product: LocalProductWithBarcodes): {
    isValid: boolean
    errors: string[]
  } {
    const errors: string[] = []
    
    // Basic field validation
    if (!product.id?.trim()) errors.push('Product ID is required')
    if (!product.sku?.trim()) errors.push('SKU is required')
    if (!product.name?.trim()) errors.push('Product name is required')
    if (product.cost < 0) errors.push('Cost cannot be negative')
    if (product.retailPrice < 0) errors.push('Retail price cannot be negative')
    if (product.retailPrice < product.cost) errors.push('Retail price should not be less than cost')
    
    // Category validation
    const validCategories = ['wine', 'liquor', 'beer', 'other']
    if (!validCategories.includes(product.category)) {
      errors.push(`Invalid category: ${product.category}`)
    }
    
    // Size validation
    const validSizes = ['750ml', '1L', '1.5L', '1.75L', 'other']
    if (!validSizes.includes(product.size)) {
      errors.push(`Invalid size: ${product.size}`)
    }
    
    // Barcode validation
    if (product.barcodes) {
      const primaryBarcodes = product.barcodes.filter(b => b.isPrimary)
      if (primaryBarcodes.length > 1) {
        errors.push('Product cannot have multiple primary barcodes')
      }
      
      const uniqueBarcodes = new Set(product.barcodes.map(b => b.barcode))
      if (uniqueBarcodes.size !== product.barcodes.length) {
        errors.push('Product has duplicate barcodes')
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
}