import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { assertAuthenticated } from './auth'
import { completeSale, getTransactionById, getRecentTransactions, type TransactionDTO } from '../../services/transactionService'

/**
 * Setup transaction IPC handlers
 */
export function setupTransactionHandlers(): void {
  // Complete a sale transaction
  ipcMain.handle('transaction:complete', async (event: IpcMainInvokeEvent, dto: TransactionDTO) => {
    try {
      // Ensure user is authenticated
      const employee = assertAuthenticated()
      console.log(`Processing transaction for employee: ${employee.firstName} ${employee.lastName}`)
      
      // Validate transaction data
      if (!dto.items || dto.items.length === 0) {
        throw new Error('Transaction must have at least one item')
      }
      
      if (!dto.payments || dto.payments.length === 0) {
        throw new Error('Transaction must have at least one payment')
      }
      
      // Validate payment amounts match total
      const totalPayments = dto.payments.reduce((sum, p) => sum + p.amount, 0)
      if (Math.abs(totalPayments - dto.totalAmount) > 0.01) {
        throw new Error(`Payment total (${totalPayments}) does not match transaction total (${dto.totalAmount})`)
      }
      
      // Complete the sale
      const transactionId = await completeSale(dto)
      
      return {
        success: true,
        transactionId
      }
      
    } catch (error) {
      console.error('Transaction completion error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed'
      }
    }
  })
  
  // Get transaction by ID
  ipcMain.handle('transaction:get', async (event: IpcMainInvokeEvent, transactionId: string) => {
    try {
      assertAuthenticated()
      
      const transaction = await getTransactionById(transactionId)
      
      return {
        success: true,
        transaction
      }
      
    } catch (error) {
      console.error('Get transaction error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get transaction'
      }
    }
  })
  
  // Get recent transactions
  ipcMain.handle('transaction:recent', async (event: IpcMainInvokeEvent, limit?: number) => {
    try {
      assertAuthenticated()
      
      const transactions = await getRecentTransactions(limit)
      
      return {
        success: true,
        transactions
      }
      
    } catch (error) {
      console.error('Get recent transactions error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get recent transactions'
      }
    }
  })
  
  // Void transaction (placeholder for now)
  ipcMain.handle('transaction:void', async (event: IpcMainInvokeEvent, transactionId: string, reason: string) => {
    try {
      const employee = assertAuthenticated()
      
      // Check if employee can void transactions
      if (!employee.canVoidTransaction && !employee.isManager) {
        throw new Error('You do not have permission to void transactions')
      }
      
      // TODO: Implement void logic
      console.log(`Voiding transaction ${transactionId} - Reason: ${reason}`)
      
      return {
        success: true,
        message: 'Transaction void not yet implemented'
      }
      
    } catch (error) {
      console.error('Void transaction error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to void transaction'
      }
    }
  })
}