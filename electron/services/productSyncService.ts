import { net } from 'electron'
import { db, withTxn } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'
import { publish } from './messageBus'

export async function refreshProductsFromCloud(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase configuration missing, skipping product refresh')
    return
  }

  try {
    // Get last sync timestamp
    const lastSyncConfig = await db
      .select()
      .from(schema.posConfig)
      .where(schema.posConfig.key.eq('last_product_sync'))
      .limit(1)
    
    const lastSyncTimestamp = lastSyncConfig[0]?.value 
      ? JSON.parse(lastSyncConfig[0].value as string) 
      : '2000-01-01T00:00:00Z'

    // Fetch products from cloud
    const products = await fetchFromCloud(
      `${supabaseUrl}/functions/v1/pull/products?since=${lastSyncTimestamp}`,
      supabaseKey
    )

    if (!products || products.length === 0) {
      console.log('No new products to sync')
      return
    }

    // Update local database
    await withTxn(async (tx) => {
      for (const product of products) {
        // Upsert product
        const existing = await tx
          .select()
          .from(schema.products)
          .where(schema.products.id.eq(product.id))
          .limit(1)

        if (existing.length > 0) {
          await tx
            .update(schema.products)
            .set({
              ...product,
              updatedAt: new Date().toISOString()
            })
            .where(schema.products.id.eq(product.id))
        } else {
          await tx.insert(schema.products).values(product)
        }

        // Upsert barcodes
        if (product.barcodes) {
          for (const barcode of product.barcodes) {
            const existingBarcode = await tx
              .select()
              .from(schema.productBarcodes)
              .where(schema.productBarcodes.id.eq(barcode.id))
              .limit(1)

            if (existingBarcode.length === 0) {
              await tx.insert(schema.productBarcodes).values(barcode)
            }
          }
        }

        // Upsert inventory
        if (product.inventory) {
          const existingInventory = await tx
            .select()
            .from(schema.inventory)
            .where(schema.inventory.productId.eq(product.id))
            .limit(1)

          if (existingInventory.length > 0) {
            await tx
              .update(schema.inventory)
              .set({
                currentStock: product.inventory.currentStock,
                reservedStock: product.inventory.reservedStock || 0,
                lastUpdated: new Date().toISOString(),
                lastSyncedAt: new Date().toISOString()
              })
              .where(schema.inventory.productId.eq(product.id))
          } else {
            await tx.insert(schema.inventory).values({
              productId: product.id,
              currentStock: product.inventory.currentStock,
              reservedStock: product.inventory.reservedStock || 0,
              lastUpdated: new Date().toISOString(),
              lastSyncedAt: new Date().toISOString()
            })
          }
        }
      }

      // Update last sync timestamp
      const newTimestamp = new Date().toISOString()
      const configExists = await tx
        .select()
        .from(schema.posConfig)
        .where(schema.posConfig.key.eq('last_product_sync'))
        .limit(1)

      if (configExists.length > 0) {
        await tx
          .update(schema.posConfig)
          .set({
            value: JSON.stringify(newTimestamp),
            updatedAt: newTimestamp
          })
          .where(schema.posConfig.key.eq('last_product_sync'))
      } else {
        await tx.insert(schema.posConfig).values({
          key: 'last_product_sync',
          value: JSON.stringify(newTimestamp),
          updatedAt: newTimestamp
        })
      }
    })

    // Publish bulk update message for peer sync
    await publish('product:bulk_upsert', {
      products,
      timestamp: new Date().toISOString()
    })

    console.log(`Synced ${products.length} products from cloud`)
  } catch (error) {
    console.error('Failed to refresh products from cloud:', error)
  }
}

function fetchFromCloud(url: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    })

    request.on('response', (response) => {
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(new Error('Invalid JSON response'))
          }
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${data}`))
        }
      })
    })

    request.on('error', (error) => {
      reject(error)
    })

    request.end()
  })
}