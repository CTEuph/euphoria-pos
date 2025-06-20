import { v4 as uuidv4 } from 'uuid'
import { db, withTxn, Transaction, NewTransaction, NewInventoryChange } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'
import { publish } from './messageBus'
import { getCurrentEmployee } from '../ipc/handlers/auth'

export interface CompleteSaleDTO {
  customerId?: string
  items: Array<{
    productId: string
    quantity: number
    unitPrice: number
    discountAmount?: number
    discountReason?: string
  }>
  payments: Array<{
    method: string
    amount: number
    cardLastFour?: string
    cardType?: string
    authorizationCode?: string
    tenderedAmount?: number
    changeAmount?: number
    giftCardId?: string
    pointsUsed?: number
  }>
  subtotal: number
  taxAmount: number
  discountAmount: number
  totalAmount: number
  pointsEarned?: number
  pointsRedeemed?: number
  salesChannel?: string
  metadata?: any
}

export async function completeSale(dto: CompleteSaleDTO): Promise<string> {
  const employee = getCurrentEmployee()
  if (!employee) {
    throw new Error('Not authenticated')
  }

  const terminalId = process.env.TERMINAL_ID || 'L1'
  const transactionId = uuidv4()
  const transactionNumber = await generateTransactionNumber()

  return await withTxn(async (tx) => {
    // 1. Create transaction record
    const transaction: NewTransaction = {
      id: transactionId,
      transactionNumber,
      customerId: dto.customerId || null,
      employeeId: employee.id,
      subtotal: dto.subtotal,
      taxAmount: dto.taxAmount,
      discountAmount: dto.discountAmount || 0,
      totalAmount: dto.totalAmount,
      pointsEarned: dto.pointsEarned || 0,
      pointsRedeemed: dto.pointsRedeemed || 0,
      status: 'completed',
      salesChannel: dto.salesChannel || 'pos',
      terminalId,
      syncStatus: 'pending',
      zinreloSyncStatus: dto.customerId ? 'pending' : 'not_applicable',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      metadata: dto.metadata || null
    }

    await tx.insert(schema.transactions).values(transaction)

    // 2. Create transaction items and inventory changes
    for (const item of dto.items) {
      const itemId = uuidv4()
      
      await tx.insert(schema.transactionItems).values({
        id: itemId,
        transactionId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount || 0,
        totalPrice: item.unitPrice * item.quantity - (item.discountAmount || 0),
        discountReason: item.discountReason,
        pointsEarned: 0, // Calculate based on product settings
        isReturned: false
      })

      // Update inventory
      const newStock = await tx
        .update(schema.inventory)
        .set({
          currentStock: schema.inventory.currentStock.minus(item.quantity),
          lastUpdated: new Date().toISOString()
        })
        .where(schema.inventory.productId.eq(item.productId))
        .returning({ newStock: schema.inventory.currentStock })

      // Record inventory change
      const inventoryChange: NewInventoryChange = {
        id: uuidv4(),
        productId: item.productId,
        changeType: 'sale',
        changeAmount: -item.quantity,
        newStockLevel: newStock[0]?.newStock || 0,
        transactionId,
        transactionItemId: itemId,
        terminalId,
        employeeId: employee.id,
        createdAt: new Date().toISOString()
      }

      await tx.insert(schema.inventoryChanges).values(inventoryChange)

      // Publish inventory update for sync
      await publish('inventory:update', {
        productId: item.productId,
        change: -item.quantity
      })
    }

    // 3. Create payment records
    for (const payment of dto.payments) {
      await tx.insert(schema.payments).values({
        id: uuidv4(),
        transactionId,
        ...payment
      })
    }

    // 4. Publish transaction for sync
    await publish('transaction:new', {
      ...transaction,
      items: dto.items,
      payments: dto.payments
    })

    return transactionId
  })
}

async function generateTransactionNumber(): Promise<string> {
  const terminalId = process.env.TERMINAL_ID || 'L1'
  const date = new Date()
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  
  // Get today's transaction count
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  
  const count = await db
    .select({ count: schema.transactions.id.count() })
    .from(schema.transactions)
    .where(
      schema.transactions.createdAt.gte(startOfDay.toISOString())
        .and(schema.transactions.terminalId.eq(terminalId))
    )

  const sequence = (count[0]?.count || 0) + 1
  return `${terminalId}-${dateStr}-${String(sequence).padStart(4, '0')}`
}