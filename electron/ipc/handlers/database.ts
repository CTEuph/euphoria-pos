import { ipcMain } from 'electron'
import { db } from '../../services/localDb'
import * as schema from '../../../drizzle/sqlite-schema'
import { assertAuthenticated } from './auth'

export function setupDatabaseHandlers() {
  // Get all products
  ipcMain.handle('db:get-products', async () => {
    assertAuthenticated()
    
    return await db
      .select()
      .from(schema.products)
      .where(schema.products.isActive.eq(true))
  })

  // Get product by barcode
  ipcMain.handle('db:get-product', async (_, barcode: string) => {
    assertAuthenticated()
    
    const productBarcode = await db
      .select()
      .from(schema.productBarcodes)
      .where(schema.productBarcodes.barcode.eq(barcode))
      .limit(1)
    
    if (productBarcode.length === 0) {
      return null
    }

    const product = await db
      .select()
      .from(schema.products)
      .where(schema.products.id.eq(productBarcode[0].productId))
      .limit(1)

    return product[0] || null
  })

  // Get discount rules
  ipcMain.handle('db:get-discount-rules', async () => {
    assertAuthenticated()
    
    return await db
      .select()
      .from(schema.discountRules)
      .where(schema.discountRules.isActive.eq(true))
  })
}