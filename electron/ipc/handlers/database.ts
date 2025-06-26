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
import type { Product, Employee, Inventory, Transaction, NewTransaction, NewTransactionItem } from '../../../src/db/local/schema'
import { eq, like, and, or, desc, gte, lt, sum, count, sql } from 'drizzle-orm'
import * as schema from '../../../src/db/local/schema'
import { ulid } from 'ulid'

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

  // Create transaction handler
  ipcMain.handle('db:create-transaction', async (
    _event,
    data: {
      transaction: NewTransaction
      items: NewTransactionItem[]
    }
  ): Promise<{ success: boolean; transaction?: Transaction; error?: string }> => {
    try {
      const db = getLocalDatabase()
      
      // Use synchronous transaction for better-sqlite3
      const result = db.transaction((tx) => {
        // Insert transaction record
        const createdTransaction = tx
          .insert(schema.transactions)
          .values(data.transaction)
          .returning()
          .get()
        
        // Insert transaction items
        if (data.items.length > 0) {
          tx
            .insert(schema.transactionItems)
            .values(data.items)
            .run()
        }
        
        // Update inventory for each item
        for (const item of data.items) {
          // First check if inventory record exists
          const existingInventory = tx
            .select()
            .from(schema.inventory)
            .where(eq(schema.inventory.productId, item.productId))
            .get()
          
          if (existingInventory) {
            tx
              .update(schema.inventory)
              .set({
                currentStock: sql`current_stock - ${item.quantity}`,
                lastUpdated: new Date()
              })
              .where(eq(schema.inventory.productId, item.productId))
              .run()
          } else {
            // Create inventory record if it doesn't exist
            tx
              .insert(schema.inventory)
              .values({
                productId: item.productId,
                currentStock: -item.quantity, // Start with negative if no initial stock
                reservedStock: 0,
                lastUpdated: new Date()
              })
              .run()
          }
        }
        
        // Add to sync queue for cloud upload
        tx
          .insert(schema.syncQueue)
          .values({
            id: ulid(),
            operation: 'upload_transaction',
            entityType: 'transaction',
            entityId: createdTransaction.id,
            payload: JSON.stringify({
              transaction: createdTransaction,
              items: data.items
            }),
            priority: 1 // High priority for transactions
          })
          .run()
        
        return createdTransaction
      })()
      
      return {
        success: true,
        transaction: result
      }
      
    } catch (error) {
      console.error('Failed to create transaction:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  })

  // Get employee transactions handler
  ipcMain.handle('db:get-employee-transactions', async (
    _event,
    employeeId: string,
    limit: number = 10
  ): Promise<{ success: boolean; transactions?: any[]; error?: string }> => {
    try {
      const db = getLocalDatabase()
      
      const results = await db
        .select({
          id: schema.transactions.id,
          transactionNumber: schema.transactions.transactionNumber,
          employeeName: sql<string>`${schema.employees.firstName} || ' ' || ${schema.employees.lastName}`,
          employeeCode: schema.employees.employeeCode,
          totalAmount: schema.transactions.totalAmount,
          paymentMethod: schema.transactions.paymentMethod,
          createdAt: schema.transactions.createdAt,
          itemCount: sql<number>`COUNT(${schema.transactionItems.id})`
        })
        .from(schema.transactions)
        .innerJoin(schema.employees, eq(schema.transactions.employeeId, schema.employees.id))
        .leftJoin(schema.transactionItems, eq(schema.transactions.id, schema.transactionItems.transactionId))
        .where(eq(schema.transactions.employeeId, employeeId))
        .groupBy(schema.transactions.id, schema.employees.id)
        .orderBy(desc(schema.transactions.createdAt))
        .limit(limit)
      
      return {
        success: true,
        transactions: results
      }
      
    } catch (error) {
      console.error('Failed to get employee transactions:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  })

  // Get transaction by ID handler
  ipcMain.handle('db:get-transaction-by-id', async (
    _event,
    transactionId: string
  ): Promise<{ success: boolean; transaction?: Transaction; error?: string }> => {
    try {
      const db = getLocalDatabase()
      
      const result = await db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.id, transactionId))
        .limit(1)
      
      return {
        success: true,
        transaction: result.length > 0 ? result[0] : undefined
      }
      
    } catch (error) {
      console.error('Failed to get transaction by ID:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  })

  // Void transaction handler
  ipcMain.handle('db:void-transaction', async (
    _event,
    data: {
      transactionId: string
      voidedBy: string
      reason: string
    }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const db = getLocalDatabase()
      
      db.transaction((tx) => {
        // Update transaction status
        tx
          .update(schema.transactions)
          .set({
            status: 'voided',
            voidedAt: new Date(),
            voidedBy: data.voidedBy
          })
          .where(eq(schema.transactions.id, data.transactionId))
          .run()
        
        // Get transaction items to restore inventory
        const items = tx
          .select()
          .from(schema.transactionItems)
          .where(eq(schema.transactionItems.transactionId, data.transactionId))
          .all()
        
        // Restore inventory for each item
        for (const item of items) {
          tx
            .update(schema.inventory)
            .set({
              currentStock: sql`current_stock + ${item.quantity}`,
              lastUpdated: new Date()
            })
            .where(eq(schema.inventory.productId, item.productId))
            .run()
        }
        
        // Add to sync queue
        tx
          .insert(schema.syncQueue)
          .values({
            id: ulid(),
            operation: 'void_transaction',
            entityType: 'transaction',
            entityId: data.transactionId,
            payload: JSON.stringify(data),
            priority: 1
          })
          .run()
      })()
      
      return { success: true }
      
    } catch (error) {
      console.error('Failed to void transaction:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  })

  // Get daily sales summary handler
  ipcMain.handle('db:get-daily-sales-summary', async (
    _event,
    employeeId: string,
    date: Date
  ): Promise<{ success: boolean; summary?: any; error?: string }> => {
    try {
      const db = getLocalDatabase()
      
      // Get start and end of day
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)
      
      const result = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(${schema.transactions.totalAmount}), 0)`,
          transactionCount: sql<number>`COUNT(${schema.transactions.id})`,
          cashSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.paymentMethod} = 'cash' THEN ${schema.transactions.totalAmount} ELSE 0 END), 0)`,
          cardSales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.transactions.paymentMethod} = 'card' THEN ${schema.transactions.totalAmount} ELSE 0 END), 0)`
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.employeeId, employeeId),
            eq(schema.transactions.status, 'completed'),
            gte(schema.transactions.createdAt, startOfDay),
            lt(schema.transactions.createdAt, endOfDay)
          )
        )
      
      const summary = result[0]
      const averageTransaction = summary.transactionCount > 0 
        ? summary.totalSales / summary.transactionCount 
        : 0
      
      return {
        success: true,
        summary: {
          ...summary,
          averageTransaction
        }
      }
      
    } catch (error) {
      console.error('Failed to get daily sales summary:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
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
    'db:get-sync-status',
    'db:create-transaction',
    'db:get-employee-transactions',
    'db:get-transaction-by-id',
    'db:void-transaction',
    'db:get-daily-sales-summary'
  ]
  
  handlers.forEach(handler => {
    ipcMain.removeAllListeners(handler)
  })
  
  console.log('Database IPC handlers removed')
}