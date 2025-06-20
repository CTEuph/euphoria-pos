import { eq, sql } from 'drizzle-orm'
import { 
  transactions, 
  transactionItems, 
  payments, 
  inventory,
  inventoryChanges,
  type NewTransaction, 
  type NewTransactionItem,
  type NewPayment,
  type Product
} from '../../drizzle/sqlite-schema'
import { getDb, generateId, now, withTxn } from './localDb'
import { publishBatch } from './messageBus'
import { getCurrentEmployee } from '../ipc/handlers/auth'

export interface TransactionDTO {
  customerId?: string
  items: Array<{
    productId: string
    product: Product
    quantity: number
    unitPrice: number
    discountAmount?: number
    discountReason?: string
  }>
  payments: Array<{
    method: 'cash' | 'credit' | 'debit' | 'gift_card' | 'loyalty_points' | 'employee_tab' | 'third_party'
    amount: number
    tenderedAmount?: number // For cash
    changeAmount?: number // For cash
    cardLastFour?: string
    cardType?: string
    authorizationCode?: string
    giftCardId?: string
    pointsUsed?: number
  }>
  subtotal: number
  taxAmount: number
  discountAmount: number
  totalAmount: number
  salesChannel: 'pos' | 'doordash' | 'grubhub' | 'employee'
  metadata?: any
}

/**
 * Complete a sale transaction
 * This will:
 * 1. Create transaction record
 * 2. Create transaction items
 * 3. Create payment records
 * 4. Update inventory
 * 5. Publish sync messages
 */
export async function completeSale(dto: TransactionDTO): Promise<string> {
  const employee = getCurrentEmployee()
  if (!employee) {
    throw new Error('No employee authenticated')
  }

  const transactionId = generateId()
  const timestamp = now()
  const terminalId = process.env.TERMINAL_ID || 'L1'
  
  // Generate transaction number (could be more sophisticated)
  const transactionNumber = `${terminalId}-${Date.now()}`

  return await withTxn(async (tx) => {
    // 1. Create transaction record
    const newTransaction: NewTransaction = {
      id: transactionId,
      transactionNumber,
      customerId: dto.customerId || null,
      employeeId: employee.id,
      subtotal: dto.subtotal.toFixed(2),
      taxAmount: dto.taxAmount.toFixed(2),
      discountAmount: dto.discountAmount.toFixed(2),
      totalAmount: dto.totalAmount.toFixed(2),
      pointsEarned: calculatePointsEarned(dto),
      pointsRedeemed: calculatePointsRedeemed(dto),
      status: 'completed',
      salesChannel: dto.salesChannel,
      originalTransactionId: null,
      terminalId,
      syncStatus: 'pending',
      zinreloSyncStatus: 'pending',
      zinreloSyncedAt: null,
      createdAt: timestamp,
      completedAt: timestamp,
      metadata: dto.metadata || null
    }

    await tx.insert(transactions).values(newTransaction)

    // 2. Create transaction items and update inventory
    const inventoryUpdates: Array<{ productId: string; changeAmount: number; newStock: number }> = []
    
    for (const item of dto.items) {
      const itemId = generateId()
      
      // Create transaction item
      const newItem: NewTransactionItem = {
        id: itemId,
        transactionId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: (item.discountAmount || 0).toFixed(2),
        totalPrice: ((item.unitPrice * item.quantity) - (item.discountAmount || 0)).toFixed(2),
        discountReason: item.discountReason || null,
        pointsEarned: calculateItemPoints(item),
        isReturned: false,
        returnedAt: null
      }
      
      await tx.insert(transactionItems).values(newItem)

      // Update inventory
      const [currentInventory] = await tx
        .select()
        .from(inventory)
        .where(eq(inventory.productId, item.productId))
        .limit(1)

      if (currentInventory) {
        const newStock = currentInventory.currentStock - item.quantity
        
        await tx
          .update(inventory)
          .set({
            currentStock: newStock,
            lastUpdated: timestamp
          })
          .where(eq(inventory.productId, item.productId))
        
        inventoryUpdates.push({
          productId: item.productId,
          changeAmount: -item.quantity,
          newStock
        })

        // Record inventory change
        await tx.insert(inventoryChanges).values({
          id: generateId(),
          productId: item.productId,
          changeType: 'sale',
          changeAmount: -item.quantity,
          newStockLevel: newStock,
          transactionId,
          transactionItemId: itemId,
          terminalId,
          employeeId: employee.id,
          notes: null,
          createdAt: timestamp
        })
      }
    }

    // 3. Create payment records
    for (const payment of dto.payments) {
      const newPayment: NewPayment = {
        id: generateId(),
        transactionId,
        paymentMethod: payment.method,
        amount: payment.amount.toFixed(2),
        cardLastFour: payment.cardLastFour || null,
        cardType: payment.cardType || null,
        authorizationCode: payment.authorizationCode || null,
        tenderedAmount: payment.tenderedAmount?.toFixed(2) || null,
        changeAmount: payment.changeAmount?.toFixed(2) || null,
        giftCardId: payment.giftCardId || null,
        pointsUsed: payment.pointsUsed || null,
        createdAt: timestamp
      }
      
      await tx.insert(payments).values(newPayment)
    }

    // 4. Publish sync messages
    const messages = [
      {
        topic: 'transaction',
        payload: {
          transaction: newTransaction,
          items: dto.items,
          payments: dto.payments
        }
      },
      ...inventoryUpdates.map(update => ({
        topic: 'inventory',
        payload: update
      }))
    ]

    if (dto.customerId) {
      messages.push({
        topic: 'customer',
        payload: {
          customerId: dto.customerId,
          lastPurchase: timestamp,
          pointsEarned: calculatePointsEarned(dto),
          pointsRedeemed: calculatePointsRedeemed(dto)
        }
      })
    }

    await publishBatch(messages)

    console.log(`Transaction ${transactionNumber} completed successfully`)
    
    return transactionId
  })
}

/**
 * Calculate points earned for a transaction
 */
function calculatePointsEarned(dto: TransactionDTO): number {
  let points = 0
  
  for (const item of dto.items) {
    points += calculateItemPoints(item)
  }
  
  return Math.floor(points)
}

/**
 * Calculate points for a single item
 */
function calculateItemPoints(item: any): number {
  const basePoints = item.unitPrice * item.quantity
  const multiplier = parseFloat(item.product?.loyaltyPointMultiplier || '1.0')
  return Math.floor(basePoints * multiplier)
}

/**
 * Calculate points redeemed from payments
 */
function calculatePointsRedeemed(dto: TransactionDTO): number {
  let pointsUsed = 0
  
  for (const payment of dto.payments) {
    if (payment.method === 'loyalty_points' && payment.pointsUsed) {
      pointsUsed += payment.pointsUsed
    }
  }
  
  return pointsUsed
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(transactionId: string) {
  const db = getDb()
  
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1)
  
  if (!transaction) return null
  
  const items = await db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, transactionId))
  
  const paymentRecords = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, transactionId))
  
  return {
    transaction,
    items,
    payments: paymentRecords
  }
}

/**
 * Get recent transactions
 */
export async function getRecentTransactions(limit: number = 10) {
  const db = getDb()
  
  return await db
    .select()
    .from(transactions)
    .orderBy(sql`${transactions.createdAt} DESC`)
    .limit(limit)
}