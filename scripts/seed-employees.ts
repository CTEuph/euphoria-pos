#!/usr/bin/env tsx

/**
 * Seed script to create sample employees for testing authentication
 * Creates one employee for each role: cashier, manager, owner
 */

import bcrypt from 'bcryptjs'
import { ulid } from 'ulid'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { employees } from '../src/db/local/schema'
import type { NewEmployee } from '../src/db/local/schema'

const DATABASE_PATH = './data/euphoria-pos.db'

async function seedEmployees() {
  console.log('🌱 Seeding employee data...')
  
  try {
    // Connect to database
    const sqlite = new Database(DATABASE_PATH)
    const db = drizzle(sqlite)
    
    // Hash PINs (using 6-digit PINs for testing)
    const cashierPinHash = await bcrypt.hash('123456', 10)
    const managerPinHash = await bcrypt.hash('567890', 10)
    const ownerPinHash = await bcrypt.hash('999999', 10)
    
    // Sample employees for each role
    const sampleEmployees: NewEmployee[] = [
      {
        id: ulid(),
        employeeCode: 'CASH001',
        firstName: 'Alice',
        lastName: 'Johnson',
        pin: cashierPinHash,
        role: 'cashier',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: ulid(),
        employeeCode: 'MGR001',
        firstName: 'Bob',
        lastName: 'Smith',
        pin: managerPinHash,
        role: 'manager',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: ulid(),
        employeeCode: 'OWN001',
        firstName: 'Carol',
        lastName: 'Williams',
        pin: ownerPinHash,
        role: 'owner',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]
    
    // Check if employees already exist
    const existingEmployees = await db.select().from(employees)
    
    if (existingEmployees.length > 0) {
      console.log(`ℹ️  Found ${existingEmployees.length} existing employees. Skipping seed.`)
      console.log('   Use --force flag to overwrite existing data.')
      sqlite.close()
      return
    }
    
    // Insert sample employees
    await db.insert(employees).values(sampleEmployees)
    
    console.log('✅ Successfully seeded employee data:')
    console.log('')
    console.log('   👤 Cashier: Alice Johnson (CASH001) - PIN: 123456')
    console.log('   👤 Manager: Bob Smith (MGR001) - PIN: 567890') 
    console.log('   👤 Owner: Carol Williams (OWN001) - PIN: 999999')
    console.log('')
    console.log('   These credentials can be used for testing authentication.')
    
    sqlite.close()
    
  } catch (error) {
    console.error('❌ Failed to seed employee data:', error)
    process.exit(1)
  }
}

async function clearAndSeed() {
  console.log('🧹 Clearing existing employee data...')
  
  try {
    const sqlite = new Database(DATABASE_PATH)
    const db = drizzle(sqlite)
    
    // Clear existing employees
    await db.delete(employees)
    console.log('✅ Cleared existing employee data')
    
    sqlite.close()
    
    // Seed new data
    await seedEmployees()
    
  } catch (error) {
    console.error('❌ Failed to clear and seed employee data:', error)
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const forceFlag = args.includes('--force')

// Run appropriate function
if (forceFlag) {
  clearAndSeed()
} else {
  seedEmployees()
}