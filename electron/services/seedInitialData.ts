import { db } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'

export async function seedInitialData() {
  try {
    // Check if pos_config already has data
    const configCount = await db.select({ count: schema.posConfig.key.count() })
      .from(schema.posConfig)
      .limit(1)
    
    if (configCount[0]?.count === 0) {
      // Seed default configuration
      await db.insert(schema.posConfig).values([
        {
          key: 'tax_rate',
          value: JSON.stringify({ percent: 8.0 }),
          updatedAt: new Date().toISOString()
        },
        {
          key: 'loyalty_points_per_dollar',
          value: JSON.stringify(1),
          updatedAt: new Date().toISOString()
        },
        {
          key: 'terminal_sequence',
          value: JSON.stringify(0),
          updatedAt: new Date().toISOString()
        }
      ])
      console.log('Seeded default POS configuration')
    }

    // Check if discount rules exist
    const discountCount = await db.select({ count: schema.discountRules.id.count() })
      .from(schema.discountRules)
      .limit(1)
    
    if (discountCount[0]?.count === 0) {
      // Add a sample discount rule
      await db.insert(schema.discountRules).values({
        id: 'case-discount-wine-750ml',
        scope: 'case',
        category: 'wine',
        size: '750ml',
        percent: 10.0,
        fixedAmount: null,
        employeeApprovalRequired: false,
        isActive: true,
        updatedAt: new Date().toISOString()
      })
      console.log('Seeded sample discount rule')
    }
  } catch (error) {
    console.error('Failed to seed initial data:', error)
  }
}