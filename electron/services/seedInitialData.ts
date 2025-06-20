import { getDb, generateId, now } from './localDb'
import { upsertEmployee, getAllEmployees } from './employeeService'
import { employees, products, productBarcodes, inventory } from '../../drizzle/sqlite-schema'

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

// Mock products for development
const mockProducts = [
  {
    id: generateId(),
    sku: 'JD750',
    name: 'Jack Daniels 750ml',
    category: 'liquor',
    size: '750ml',
    cost: '15.00',
    retailPrice: '24.99',
    barcode: '082184090563'
  },
  {
    id: generateId(),
    sku: 'GREY750',
    name: 'Grey Goose Vodka 750ml',
    category: 'liquor',
    size: '750ml',
    cost: '22.00',
    retailPrice: '34.99',
    barcode: '080480280017'
  },
  {
    id: generateId(),
    sku: 'BUD6PK',
    name: 'Budweiser 6-Pack',
    category: 'beer',
    size: 'other',
    cost: '5.00',
    retailPrice: '8.99',
    barcode: '018200001963'
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
    
    // Check if products need seeding
    const existingProducts = await db.select().from(products).limit(1)
    
    if (existingProducts.length === 0) {
      console.log('Seeding initial product data...')
      const timestamp = now()
      
      for (const product of mockProducts) {
        // Insert product
        await db.insert(products).values({
          ...product,
          parentProductId: null,
          unitsInParent: 1,
          loyaltyPointMultiplier: '1.0',
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        
        // Insert barcode
        await db.insert(productBarcodes).values({
          id: generateId(),
          productId: product.id,
          barcode: product.barcode,
          isPrimary: true,
          createdAt: timestamp
        })
        
        // Insert inventory
        await db.insert(inventory).values({
          productId: product.id,
          currentStock: 100, // Start with 100 units
          reservedStock: 0,
          lastUpdated: timestamp,
          lastSyncedAt: null
        })
        
        console.log(`Created product: ${product.name}`)
      }
      
      console.log('Initial product data seeded successfully')
    } else {
      console.log('Product data already exists, skipping seed')
    }
  } catch (error) {
    console.error('Error seeding initial data:', error)
    // Don't throw - app should still start even if seeding fails
  }
}