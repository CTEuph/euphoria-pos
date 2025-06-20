import { ipcMain } from 'electron'
import * as employeeService from '../../services/employeeService'
import { Employee } from '../../services/localDb'

// Store current session in main process (secure)
let currentEmployee: Employee | null = null

export function setupAuthHandlers() {
  console.log('Setting up auth handlers...')
  
  // Verify PIN - MOCK VERSION FOR TESTING
  ipcMain.handle('auth:verify-pin', async (_, pin: string) => {
    console.log('auth:verify-pin called with pin:', pin)
    
    // Mock authentication for testing
    if (pin === '1234') {
      currentEmployee = {
        id: '1',
        employeeCode: 'EMP001',
        firstName: 'John',
        lastName: 'Doe',
        pin: 'hashed',
        isActive: true,
        canOverridePrice: true,
        canVoidTransaction: true,
        isManager: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any
      
      return { 
        id: '1', 
        firstName: 'John', 
        lastName: 'Doe' 
      }
    } else if (pin === '5678') {
      return { 
        id: '2', 
        firstName: 'Jane', 
        lastName: 'Smith' 
      }
    }
    
    return null
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