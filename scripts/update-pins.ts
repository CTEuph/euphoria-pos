#!/usr/bin/env tsx

/**
 * Update existing employee PINs from 4-digit to 6-digit
 */

import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { employees } from '../src/db/local/schema'
import { eq } from 'drizzle-orm'

const DATABASE_PATH = './data/euphoria-pos.db'

async function updatePins() {
  console.log('🔐 Updating employee PINs to 6-digit format...')
  
  try {
    // Connect to database
    const sqlite = new Database(DATABASE_PATH)
    const db = drizzle(sqlite)
    
    // Hash new 6-digit PINs
    const cashierPinHash = await bcrypt.hash('123456', 10)
    const managerPinHash = await bcrypt.hash('567890', 10)
    const ownerPinHash = await bcrypt.hash('999999', 10)
    
    // Update each employee's PIN
    console.log('Updating Cashier PIN...')
    await db
      .update(employees)
      .set({ pin: cashierPinHash, updatedAt: new Date() })
      .where(eq(employees.employeeCode, 'CASH001'))
    
    console.log('Updating Manager PIN...')
    await db
      .update(employees)
      .set({ pin: managerPinHash, updatedAt: new Date() })
      .where(eq(employees.employeeCode, 'MGR001'))
    
    console.log('Updating Owner PIN...')
    await db
      .update(employees)
      .set({ pin: ownerPinHash, updatedAt: new Date() })
      .where(eq(employees.employeeCode, 'OWN001'))
    
    console.log('✅ Successfully updated employee PINs:')
    console.log('')
    console.log('   👤 Cashier: Alice Johnson (CASH001) - PIN: 123456')
    console.log('   👤 Manager: Bob Smith (MGR001) - PIN: 567890') 
    console.log('   👤 Owner: Carol Williams (OWN001) - PIN: 999999')
    console.log('')
    console.log('   Updated PINs are now 6 digits and ready for use.')
    
    sqlite.close()
    
  } catch (error) {
    console.error('❌ Failed to update employee PINs:', error)
    process.exit(1)
  }
}

updatePins()