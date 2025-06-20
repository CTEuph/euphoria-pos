import { eq } from 'drizzle-orm'
import { employees, type Employee, type NewEmployee } from '../../drizzle/sqlite-schema'
import { getDb, generateId, now } from './localDb'
import bcrypt from 'bcrypt'

/**
 * Verify employee PIN
 */
export async function verifyPin(pin: string): Promise<Employee | null> {
  const db = getDb()
  
  try {
    // Get all active employees
    const activeEmployees = await db
      .select()
      .from(employees)
      .where(eq(employees.isActive, true))
    
    // Check PIN against each employee
    for (const employee of activeEmployees) {
      const isValid = await bcrypt.compare(pin, employee.pin)
      if (isValid) {
        console.log(`Employee ${employee.firstName} ${employee.lastName} authenticated`)
        return employee
      }
    }
    
    console.log('Invalid PIN - no matching employee found')
    return null
  } catch (error) {
    console.error('Error verifying PIN:', error)
    return null
  }
}

/**
 * Upsert employee (create or update)
 */
export async function upsertEmployee(employee: Partial<NewEmployee> & { employeeCode: string }): Promise<Employee> {
  const db = getDb()
  const timestamp = now()
  
  try {
    // Check if employee exists
    const existing = await db
      .select()
      .from(employees)
      .where(eq(employees.employeeCode, employee.employeeCode))
      .limit(1)
    
    if (existing.length > 0) {
      // Update existing employee
      const updates: Partial<Employee> = {
        ...employee,
        updatedAt: timestamp
      }
      
      // If PIN is provided, hash it
      if (employee.pin) {
        updates.pin = await bcrypt.hash(employee.pin, 10)
      }
      
      await db
        .update(employees)
        .set(updates)
        .where(eq(employees.id, existing[0].id))
      
      // Return updated employee
      const updated = await db
        .select()
        .from(employees)
        .where(eq(employees.id, existing[0].id))
        .limit(1)
      
      return updated[0]
    } else {
      // Create new employee
      const id = generateId()
      const hashedPin = employee.pin ? await bcrypt.hash(employee.pin, 10) : ''
      
      const newEmployee: NewEmployee = {
        id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName || '',
        lastName: employee.lastName || '',
        pin: hashedPin,
        isActive: employee.isActive ?? true,
        canOverridePrice: employee.canOverridePrice ?? false,
        canVoidTransaction: employee.canVoidTransaction ?? false,
        isManager: employee.isManager ?? false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      
      await db.insert(employees).values(newEmployee)
      
      // Return created employee
      const created = await db
        .select()
        .from(employees)
        .where(eq(employees.id, id))
        .limit(1)
      
      return created[0]
    }
  } catch (error) {
    console.error('Error upserting employee:', error)
    throw error
  }
}

/**
 * Get all employees
 */
export async function getAllEmployees(): Promise<Employee[]> {
  const db = getDb()
  return await db.select().from(employees)
}

/**
 * Get employee by ID
 */
export async function getEmployeeById(id: string): Promise<Employee | null> {
  const db = getDb()
  const result = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1)
  
  return result[0] || null
}