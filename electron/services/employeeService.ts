import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { db, Employee, NewEmployee } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'

// Mock employees for initial seeding
const mockEmployees: Omit<NewEmployee, 'id'>[] = [
  {
    employeeCode: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    pin: '', // Will be hashed below
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: true,
    isManager: true
  },
  {
    employeeCode: 'EMP002',
    firstName: 'Jane',
    lastName: 'Smith',
    pin: '', // Will be hashed below
    isActive: true,
    canOverridePrice: false,
    canVoidTransaction: false,
    isManager: false
  },
  {
    employeeCode: 'EMP003',
    firstName: 'Mike',
    lastName: 'Johnson',
    pin: '', // Will be hashed below
    isActive: true,
    canOverridePrice: true,
    canVoidTransaction: false,
    isManager: false
  }
]

// Hash PINs
const PINS = ['1234', '5678', '9999']

export async function seedEmployees() {
  try {
    // Check if employees already exist
    const count = await db.select({ count: schema.employees.id })
      .from(schema.employees)
      .limit(1)
    
    if (count.length > 0) {
      console.log('Employees already exist, skipping seed')
      return
    }

    // Hash PINs and insert employees
    const employeesToInsert = await Promise.all(
      mockEmployees.map(async (emp, index) => ({
        ...emp,
        id: uuidv4(),
        pin: await bcrypt.hash(PINS[index], 10)
      }))
    )

    await db.insert(schema.employees).values(employeesToInsert)
    console.log('Seeded mock employees successfully')
  } catch (error) {
    console.error('Failed to seed employees:', error)
  }
}

export async function verifyPin(pin: string): Promise<Employee | null> {
  try {
    // Get all active employees (we need to check against hashed PINs)
    const employees = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.isActive, true))

    // Check each employee's PIN
    for (const employee of employees) {
      const isMatch = await bcrypt.compare(pin, employee.pin)
      if (isMatch) {
        // Check if employee is active
        if (!employee.isActive) {
          throw new Error('EMPLOYEE_INACTIVE')
        }
        return employee
      }
    }

    return null
  } catch (error) {
    console.error('PIN verification error:', error)
    throw error
  }
}

export async function upsert(employees: Employee[]): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      for (const employee of employees) {
        // Check if employee exists
        const existing = await tx
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.id, employee.id))
          .limit(1)

        if (existing.length > 0) {
          // Update existing employee
          await tx
            .update(schema.employees)
            .set({
              employeeCode: employee.employeeCode,
              firstName: employee.firstName,
              lastName: employee.lastName,
              pin: employee.pin,
              isActive: employee.isActive,
              canOverridePrice: employee.canOverridePrice,
              canVoidTransaction: employee.canVoidTransaction,
              isManager: employee.isManager,
              updatedAt: new Date().toISOString()
            })
            .where(eq(schema.employees.id, employee.id))
        } else {
          // Insert new employee
          await tx.insert(schema.employees).values({
            ...employee,
            id: employee.id || uuidv4()
          })
        }
      }
    })
  } catch (error) {
    console.error('Failed to upsert employees:', error)
    throw error
  }
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  try {
    const results = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, id))
      .limit(1)
    
    return results[0] || null
  } catch (error) {
    console.error('Failed to get employee:', error)
    return null
  }
}