/**
 * Data transformation layer for Euphoria POS
 * Handles conversion between local SQLite and cloud PostgreSQL formats
 */

// Base transformer exports
export { 
  BaseTransformer, 
  TransformUtils, 
  TransformationError,
  type DataTransformer,
  type BatchTransformer
} from './base'

// Product transformers
export {
  ProductTransformer,
  ProductBarcodeTransformer,
  ProductTransformUtils,
  type LocalProductWithBarcodes,
  type CloudProductWithBarcodes
} from './ProductTransformer'

// Employee transformers
export {
  EmployeeTransformer,
  EmployeePermissionsTransformer,
  EmployeeTransformUtils,
  type EmployeeWithPermissions,
  type CloudEmployeeWithPermissions
} from './EmployeeTransformer'

// Inventory transformers
export {
  InventoryTransformer,
  InventoryMovementTransformer,
  InventoryTransformUtils,
  type InventoryWithSync,
  type InventoryUpdatePayload
} from './InventoryTransformer'

// Import classes for internal use in TransformerFactory
import { ProductTransformer } from './ProductTransformer'
import { EmployeeTransformer } from './EmployeeTransformer'
import { InventoryTransformer, InventoryMovementTransformer } from './InventoryTransformer'
import { TransformationError } from './base'

/**
 * Unified transformer factory for all data types
 */
export class TransformerFactory {
  private static productTransformer = new ProductTransformer()
  private static employeeTransformer = new EmployeeTransformer()
  private static inventoryTransformer = new InventoryTransformer()
  private static inventoryMovementTransformer = new InventoryMovementTransformer()
  
  /**
   * Get product transformer instance
   */
  static getProductTransformer(): ProductTransformer {
    return this.productTransformer
  }
  
  /**
   * Get employee transformer instance
   */
  static getEmployeeTransformer(): EmployeeTransformer {
    return this.employeeTransformer
  }
  
  /**
   * Get inventory transformer instance
   */
  static getInventoryTransformer(): InventoryTransformer {
    return this.inventoryTransformer
  }
  
  /**
   * Get inventory movement transformer instance
   */
  static getInventoryMovementTransformer(): InventoryMovementTransformer {
    return this.inventoryMovementTransformer
  }
  
  /**
   * Transform any supported data type to cloud format
   */
  static toCloud<T>(data: T, type: 'product' | 'employee' | 'inventory' | 'inventory_movement'): any {
    switch (type) {
      case 'product':
        return this.productTransformer.toCloud(data as any)
      case 'employee':
        return this.employeeTransformer.toCloud(data as any)
      case 'inventory':
        return this.inventoryTransformer.toCloud(data as any)
      case 'inventory_movement':
        return this.inventoryMovementTransformer.toCloud(data as any)
      default:
        throw new TransformationError('Unsupported data type for transformation', {
          transformer: 'TransformerFactory',
          operation: 'toCloud'
        })
    }
  }
  
  /**
   * Transform any supported data type to local format
   */
  static toLocal<T>(data: T, type: 'product' | 'employee' | 'inventory' | 'inventory_movement'): any {
    switch (type) {
      case 'product':
        return this.productTransformer.toLocal(data as any)
      case 'employee':
        return this.employeeTransformer.toLocal(data as any)
      case 'inventory':
        return this.inventoryTransformer.toLocal(data as any)
      case 'inventory_movement':
        return this.inventoryMovementTransformer.toLocal(data as any)
      default:
        throw new TransformationError('Unsupported data type for transformation', {
          transformer: 'TransformerFactory',
          operation: 'toLocal'
        })
    }
  }
  
  /**
   * Batch transform array of data to cloud format
   */
  static batchToCloud<T>(
    data: T[], 
    type: 'product' | 'employee' | 'inventory' | 'inventory_movement'
  ): any[] {
    return data.map(item => this.toCloud(item, type))
  }
  
  /**
   * Batch transform array of data to local format
   */
  static batchToLocal<T>(
    data: T[], 
    type: 'product' | 'employee' | 'inventory' | 'inventory_movement'
  ): any[] {
    return data.map(item => this.toLocal(item, type))
  }
  
  /**
   * Validate transformation for any supported data type
   */
  static validateTransformation<T>(
    local: T, 
    cloud: T, 
    type: 'product' | 'employee' | 'inventory' | 'inventory_movement'
  ): boolean {
    switch (type) {
      case 'product':
        return this.productTransformer.validate(local as any, cloud as any)
      case 'employee':
        return this.employeeTransformer.validate(local as any, cloud as any)
      case 'inventory':
        return this.inventoryTransformer.validate(local as any, cloud as any)
      case 'inventory_movement':
        return this.inventoryMovementTransformer.validate(local as any, cloud as any)
      default:
        return false
    }
  }
}

/**
 * Transformation utilities for common operations
 */
export class SyncTransformUtils {
  /**
   * Transform a sync payload for uploading to cloud
   */
  static prepareSyncUploadPayload(data: {
    products?: any[]
    employees?: any[]
    inventory?: any[]
    transactions?: any[]
  }) {
    const payload: any = {}
    
    if (data.products) {
      payload.products = TransformerFactory.batchToCloud(data.products, 'product')
    }
    
    if (data.employees) {
      payload.employees = TransformerFactory.batchToCloud(data.employees, 'employee')
    }
    
    if (data.inventory) {
      payload.inventory = TransformerFactory.batchToCloud(data.inventory, 'inventory')
    }
    
    return payload
  }
  
  /**
   * Transform downloaded data from cloud for local storage
   */
  static prepareLocalDownloadData(cloudData: {
    products?: any[]
    employees?: any[]
    inventory?: any[]
  }) {
    const localData: any = {}
    
    if (cloudData.products) {
      localData.products = TransformerFactory.batchToLocal(cloudData.products, 'product')
    }
    
    if (cloudData.employees) {
      localData.employees = TransformerFactory.batchToLocal(cloudData.employees, 'employee')
    }
    
    if (cloudData.inventory) {
      localData.inventory = TransformerFactory.batchToLocal(cloudData.inventory, 'inventory')
    }
    
    return localData
  }
  
  /**
   * Create transformation summary for debugging
   */
  static createTransformationSummary(
    operation: 'toCloud' | 'toLocal',
    type: string,
    inputCount: number,
    outputCount: number,
    errors: TransformationError[] = []
  ) {
    return {
      operation,
      type,
      inputCount,
      outputCount,
      successCount: outputCount,
      errorCount: errors.length,
      errors: errors.map(e => ({
        message: e.message,
        context: e.context
      })),
      timestamp: new Date().toISOString()
    }
  }
}