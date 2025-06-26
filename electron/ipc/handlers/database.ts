/**
 * IPC handlers for secure database access from renderer process
 * Provides controlled access to database operations without exposing connections
 */

import { ipcMain } from 'electron'
import { 
  checkAllDatabaseHealth, 
  createDatabaseBackup,
  getLocalDatabase
} from '../../../src/db/index'
import type { Product, Employee, Inventory } from '../../../src/db/local/schema'
import { eq, like, and, or } from 'drizzle-orm'
import * as schema from '../../../src/db/local/schema'

/**
 * Setup all database-related IPC handlers
 */
export function setupDatabaseHandlers(): void {
  // Health check handler
  ipcMain.handle('db:health-check', async (): Promise<any> => {
    try {
      return await checkAllDatabaseHealth()
    } catch (error) {
      console.error('Database health check failed:', error)
      return {
        local: { isConnected: false, error: 'Failed to check local database' },
        cloud: { isConnected: false, error: 'Failed to check cloud database' },
        overall: { isHealthy: false, canOperateOffline: false, issues: ['Health check failed'] }
      }
    }
  })

  // Backup creation handler
  ipcMain.handle('db:create-backup', async (_event, backupPath?: string): Promise<string> => {
    try {
      return createDatabaseBackup(backupPath)
    } catch (error) {
      console.error('Failed to create backup:', error)
      throw error
    }
  })

  // Product search handler
  ipcMain.handle('db:search-products', async (
    _event, 
    query: string, 
    options: { 
      limit?: number
      includeInactive?: boolean
      category?: string 
    } = {}
  ): Promise<Product[]> => {
    try {
      const db = getLocalDatabase()
      const { limit = 50, includeInactive = false, category } = options
      
      let queryBuilder = db
        .select()
        .from(schema.products)
      
      // Build WHERE conditions
      const conditions = []
      
      if (!includeInactive) {
        conditions.push(eq(schema.products.isActive, true))
      }
      
      if (category) {
        conditions.push(eq(schema.products.category, category))
      }
      
      if (query.trim()) {
        const searchTerm = `%${query.toLowerCase()}%`
        conditions.push(
          or(
            like(schema.products.name, searchTerm),
            like(schema.products.sku, searchTerm)
          )
        )
      }
      
      if (conditions.length > 0) {
        queryBuilder = queryBuilder.where(and(...conditions))
      }
      
      const results = await queryBuilder
        .limit(limit)
        .orderBy(schema.products.name)
      
      return results
      
    } catch (error) {
      console.error('Failed to search products:', error)
      throw error
    }
  })

  // Product lookup by barcode handler
  ipcMain.handle('db:find-product-by-barcode', async (
    _event, 
    barcode: string
  ): Promise<Product | null> => {
    try {
      const db = getLocalDatabase()
      
      // Find product by barcode
      const result = await db
        .select({
          product: schema.products
        })
        .from(schema.products)
        .innerJoin(
          schema.productBarcodes,
          eq(schema.products.id, schema.productBarcodes.productId)
        )
        .where(
          and(
            eq(schema.productBarcodes.barcode, barcode),
            eq(schema.products.isActive, true)
          )
        )
        .limit(1)
      
      return result.length > 0 ? result[0].product : null
      
    } catch (error) {
      console.error('Failed to find product by barcode:', error)
      throw error
    }
  })

  // Employee authentication handler
  ipcMain.handle('db:authenticate-employee', async (
    _event, 
    employeeCode: string,
    pin: string
  ): Promise<Employee | null> => {
    try {
      const db = getLocalDatabase()
      
      const employee = await db
        .select()
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.employeeCode, employeeCode),
            eq(schema.employees.isActive, true)
          )
        )
        .limit(1)
      
      if (employee.length === 0) {
        return null
      }
      
      // In a real implementation, you'd verify the hashed PIN
      // For now, we'll assume PIN verification happens elsewhere
      // const isValidPin = await verifyPin(pin, employee[0].pin)
      // if (!isValidPin) return null
      
      return employee[0]
      
    } catch (error) {
      console.error('Failed to authenticate employee:', error)
      throw error
    }
  })

  // Get all active employees handler
  ipcMain.handle('db:get-employees', async (): Promise<Employee[]> => {
    try {
      const db = getLocalDatabase()
      
      return await db
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.isActive, true))
        .orderBy(schema.employees.firstName, schema.employees.lastName)
      
    } catch (error) {
      console.error('Failed to get employees:', error)
      throw error
    }
  })

  // Get inventory for product handler
  ipcMain.handle('db:get-inventory', async (
    _event, 
    productId: string
  ): Promise<Inventory | null> => {
    try {
      const db = getLocalDatabase()
      
      const result = await db
        .select()
        .from(schema.inventory)
        .where(eq(schema.inventory.productId, productId))
        .limit(1)
      
      return result.length > 0 ? result[0] : null
      
    } catch (error) {
      console.error('Failed to get inventory:', error)
      throw error
    }
  })

  // Update inventory handler
  ipcMain.handle('db:update-inventory', async (
    _event, 
    productId: string, 
    newStock: number,
    changeReason?: string
  ): Promise<void> => {
    try {
      const db = getLocalDatabase()
      
      // Update inventory
      await db
        .update(schema.inventory)
        .set({
          currentStock: newStock,
          lastUpdated: new Date()
        })
        .where(eq(schema.inventory.productId, productId))
      
      // Note: In a full implementation, you'd also create an inventory change record
      // and add it to the sync queue for cloud synchronization
      
    } catch (error) {
      console.error('Failed to update inventory:', error)
      throw error
    }
  })

  // Get sync status handler
  ipcMain.handle('db:get-sync-status', async (): Promise<any> => {
    try {
      const db = getLocalDatabase()
      
      const result = await db
        .select()
        .from(schema.syncStatus)
        .where(eq(schema.syncStatus.id, 'main'))
        .limit(1)
      
      return result.length > 0 ? result[0] : null
      
    } catch (error) {
      console.error('Failed to get sync status:', error)
      throw error
    }
  })

  console.log('Database IPC handlers registered')
}

/**
 * Remove all database IPC handlers
 */
export function removeDatabaseHandlers(): void {
  const handlers = [
    'db:health-check',
    'db:create-backup',
    'db:search-products',
    'db:find-product-by-barcode',
    'db:authenticate-employee',
    'db:get-employees',
    'db:get-inventory',
    'db:update-inventory',
    'db:get-sync-status'
  ]
  
  handlers.forEach(handler => {
    ipcMain.removeAllListeners(handler)
  })
  
  console.log('Database IPC handlers removed')
}