/**
 * Transaction Service - Handles creation and management of sales transactions
 * Integrates with employee authentication to track who processed each sale
 */

import { ulid } from 'ulid'
import type { 
  NewTransaction, 
  NewTransactionItem, 
  Transaction,
  Employee 
} from '@/db/local/schema'

// IPC channel types
export interface CreateTransactionRequest {
  // Cart information
  items: {
    productId: string
    quantity: number
    unitPrice: number
    totalPrice: number
    caseDiscountApplied?: boolean
    discountAmount?: number
  }[]
  
  // Transaction totals
  subtotal: number
  taxAmount: number
  totalAmount: number
  
  // Payment information
  paymentMethod: 'cash' | 'card' | 'split'
  amountPaid: number
  changeGiven?: number
  
  // Customer (optional)
  customerId?: string
  
  // Employee (who processed the sale)
  employeeId: string
  
  // Sales channel
  salesChannel?: 'pos' | 'doordash' | 'grubhub' | 'employee'
}

export interface CreateTransactionResponse {
  success: boolean
  transaction?: Transaction
  transactionNumber?: string
  error?: string
}

export interface TransactionSummary {
  id: string
  transactionNumber: string
  employeeName: string
  employeeCode: string
  totalAmount: number
  paymentMethod: string
  createdAt: Date
  itemCount: number
}

/**
 * Generate a unique transaction number
 * Format: T + 8-digit timestamp + 3-digit random
 */
function generateTransactionNumber(): string {
  const timestamp = Date.now().toString().slice(-8)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `T${timestamp}${random}`
}

/**
 * Create a new transaction with employee information
 * This is called from the main process via IPC
 */
export async function createTransaction(
  request: CreateTransactionRequest
): Promise<CreateTransactionResponse> {
  try {
    if (!window.electron?.db?.createTransaction) {
      throw new Error('Database service not available')
    }

    // Generate unique IDs
    const transactionId = ulid()
    const transactionNumber = generateTransactionNumber()

    // Prepare transaction record
    const newTransaction: NewTransaction = {
      id: transactionId,
      transactionNumber,
      customerId: request.customerId || null,
      employeeId: request.employeeId, // 👈 KEY: Employee who processed the sale
      subtotal: request.subtotal,
      taxAmount: request.taxAmount,
      totalAmount: request.totalAmount,
      status: 'completed',
      salesChannel: request.salesChannel || 'pos',
      paymentMethod: request.paymentMethod,
      amountPaid: request.amountPaid,
      changeGiven: request.changeGiven || 0,
    }

    // Prepare transaction items
    const newTransactionItems: NewTransactionItem[] = request.items.map(item => ({
      id: ulid(),
      transactionId: transactionId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      caseDiscountApplied: item.caseDiscountApplied || false,
      discountAmount: item.discountAmount || 0,
    }))

    // Create transaction via IPC
    const result = await window.electron.db.createTransaction({
      transaction: newTransaction,
      items: newTransactionItems
    })

    if (result.success) {
      return {
        success: true,
        transaction: result.transaction,
        transactionNumber: transactionNumber
      }
    } else {
      return {
        success: false,
        error: result.error || 'Failed to create transaction'
      }
    }

  } catch (error) {
    console.error('Failed to create transaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Get recent transactions for an employee
 */
export async function getEmployeeTransactions(
  employeeId: string,
  limit: number = 10
): Promise<TransactionSummary[]> {
  try {
    if (!window.electron?.db?.getEmployeeTransactions) {
      throw new Error('Database service not available')
    }

    const result = await window.electron.db.getEmployeeTransactions(employeeId, limit)
    
    if (result.success) {
      return result.transactions || []
    } else {
      console.error('Failed to get employee transactions:', result.error)
      return []
    }
  } catch (error) {
    console.error('Failed to get employee transactions:', error)
    return []
  }
}

/**
 * Get transaction details by ID
 */
export async function getTransactionById(transactionId: string): Promise<Transaction | null> {
  try {
    if (!window.electron?.db?.getTransactionById) {
      throw new Error('Database service not available')
    }

    const result = await window.electron.db.getTransactionById(transactionId)
    
    if (result.success) {
      return result.transaction || null
    } else {
      console.error('Failed to get transaction:', result.error)
      return null
    }
  } catch (error) {
    console.error('Failed to get transaction:', error)
    return null
  }
}

/**
 * Void a transaction (manager+ permission required)
 */
export async function voidTransaction(
  transactionId: string,
  voidedBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!window.electron?.db?.voidTransaction) {
      throw new Error('Database service not available')
    }

    const result = await window.electron.db.voidTransaction({
      transactionId,
      voidedBy,
      reason
    })

    return result
  } catch (error) {
    console.error('Failed to void transaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Get daily sales summary for current employee
 */
export async function getDailySalesSummary(
  employeeId: string,
  date?: Date
): Promise<{
  totalSales: number
  transactionCount: number
  averageTransaction: number
  cashSales: number
  cardSales: number
}> {
  try {
    if (!window.electron?.db?.getDailySalesSummary) {
      throw new Error('Database service not available')
    }

    const targetDate = date || new Date()
    const result = await window.electron.db.getDailySalesSummary(employeeId, targetDate)
    
    if (result.success) {
      return result.summary || {
        totalSales: 0,
        transactionCount: 0,
        averageTransaction: 0,
        cashSales: 0,
        cardSales: 0
      }
    } else {
      console.error('Failed to get daily sales summary:', result.error)
      return {
        totalSales: 0,
        transactionCount: 0,
        averageTransaction: 0,
        cashSales: 0,
        cardSales: 0
      }
    }
  } catch (error) {
    console.error('Failed to get daily sales summary:', error)
    return {
      totalSales: 0,
      transactionCount: 0,
      averageTransaction: 0,
      cashSales: 0,
      cardSales: 0
    }
  }
}