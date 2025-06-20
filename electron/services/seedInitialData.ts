import { getDb } from './localDb'
import { upsertEmployee, getAllEmployees } from './employeeService'
import { employees } from '../../drizzle/sqlite-schema'

// Mock employees for development
const mockEmployees = [
  {
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '1234',
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: true,
    isManager: true
  },
  {
    employeeCode: 'EMP002',
    firstName: 'Jane',
    lastName: 'Smith',
    pin: '5678',
    isActive: true,
    canOverridePrice: false,
    canVoidTransaction: false,
    isManager: false
  },
  {
    employeeCode: 'EMP003',
    firstName: 'Bob',
    lastName: 'Johnson',
    pin: '9999',
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: false,
    isManager: false
  }
]

/**
 * Seed initial data if database is empty
 */
export async function seedInitialData(): Promise<void> {
  try {
    const db = getDb()
    
    // Check if employees table is empty
    const existingEmployees = await getAllEmployees()
    
    if (existingEmployees.length === 0) {
      console.log('Seeding initial employee data...')
      
      // Insert mock employees
      for (const employee of mockEmployees) {
        await upsertEmployee(employee)
        console.log(`Created employee: ${employee.firstName} ${employee.lastName} (PIN: ${employee.pin})`)
      }
      
      console.log('Initial employee data seeded successfully')
    } else {
      console.log('Employee data already exists, skipping seed')
    }
  } catch (error) {
    console.error('Error seeding initial data:', error)
    // Don't throw - app should still start even if seeding fails
  }
}