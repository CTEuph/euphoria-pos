import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { verifyPin, getEmployeeById } from '../../services/employeeService'
import type { Employee } from '../../../drizzle/sqlite-schema'

// Store current employee session in main process (secure)
let currentEmployee: Employee | null = null

/**
 * Assert that a user is authenticated
 * @throws Error if not authenticated
 */
export function assertAuthenticated(): Employee {
  if (!currentEmployee) {
    throw new Error('Not authenticated')
  }
  return currentEmployee
}

/**
 * Get current authenticated employee
 */
export function getCurrentEmployee(): Employee | null {
  return currentEmployee
}

/**
 * Setup auth IPC handlers
 */
export function setupAuthHandlers(): void {
  // Verify PIN
  ipcMain.handle('auth:verify-pin', async (event: IpcMainInvokeEvent, pin: string) => {
    try {
      const employee = await verifyPin(pin)
      
      if (employee) {
        currentEmployee = employee
        console.log(`Employee authenticated: ${employee.firstName} ${employee.lastName}`)
        
        return {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeCode: employee.employeeCode,
          isManager: employee.isManager,
          canOverridePrice: employee.canOverridePrice,
          canVoidTransaction: employee.canVoidTransaction
        }
      }
      
      return null
    } catch (error) {
      console.error('PIN verification error:', error)
      return null
    }
  })
  
  // Logout
  ipcMain.handle('auth:logout', async () => {
    console.log('Employee logged out:', currentEmployee?.firstName, currentEmployee?.lastName)
    currentEmployee = null
  })
  
  // Get current employee
  ipcMain.handle('auth:get-current-employee', async () => {
    if (!currentEmployee) return null
    
    return {
      id: currentEmployee.id,
      name: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
      employeeCode: currentEmployee.employeeCode,
      isManager: currentEmployee.isManager
    }
  })
  
  // Check if authenticated (for renderer process)
  ipcMain.handle('auth:check-authenticated', async () => {
    return currentEmployee !== null
  })
}