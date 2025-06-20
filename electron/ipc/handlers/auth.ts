import { ipcMain } from 'electron'
import * as employeeService from '../../services/employeeService'
import { Employee } from '../../services/localDb'

// Store current session in main process (secure)
let currentEmployee: Employee | null = null

export function setupAuthHandlers() {
  // Verify PIN
  ipcMain.handle('auth:verify-pin', async (_, pin: string) => {
    try {
      const emp = await employeeService.verifyPin(pin)
      if (!emp) return null
      
      currentEmployee = emp
      return { 
        id: emp.id, 
        firstName: emp.firstName, 
        lastName: emp.lastName 
      }
    } catch (error: any) {
      if (error.message === 'EMPLOYEE_INACTIVE') {
        console.error('Employee is inactive')
        return null
      }
      console.error('PIN verification failed:', error)
      return null
    }
  })

  // Logout
  ipcMain.handle('auth:logout', async () => {
    currentEmployee = null
  })

  // Get current employee
  ipcMain.handle('auth:get-current-employee', async () => {
    if (!currentEmployee) return null
    return {
      id: currentEmployee.id,
      name: `${currentEmployee.firstName} ${currentEmployee.lastName}`
    }
  })
}

// Helper function to assert authentication
export function assertAuthenticated(): Employee {
  if (!currentEmployee) {
    throw new Error('Not authenticated')
  }
  return currentEmployee
}

// Export getter for current employee
export function getCurrentEmployee(): Employee | null {
  return currentEmployee
}