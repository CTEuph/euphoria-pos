import { db } from './localDb'
import * as schema from '../../drizzle/sqlite-schema'
import { publish } from './messageBus'
import { getCurrentEmployee } from '../ipc/handlers/auth'

// Protected config keys that require manager permission
const PROTECTED_KEYS = [
  'tax_rate',
  'loyalty_points_per_dollar',
  'discount_thresholds',
  'case_discount_rules'
]

export async function getConfig<T = unknown>(key: string): Promise<T> {
  const result = await db
    .select()
    .from(schema.posConfig)
    .where(schema.posConfig.key.eq(key))
    .limit(1)

  if (result.length === 0) {
    throw new Error(`Configuration key not found: ${key}`)
  }

  return JSON.parse(result[0].value as string) as T
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  // Check permissions for protected keys
  if (PROTECTED_KEYS.includes(key)) {
    const employee = getCurrentEmployee()
    if (!employee || !employee.isManager) {
      throw new Error('FORBIDDEN: Manager permission required')
    }
  }

  const valueStr = JSON.stringify(value)
  
  // Check if config exists
  const existing = await db
    .select()
    .from(schema.posConfig)
    .where(schema.posConfig.key.eq(key))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(schema.posConfig)
      .set({
        value: valueStr,
        updatedAt: new Date().toISOString()
      })
      .where(schema.posConfig.key.eq(key))
  } else {
    await db.insert(schema.posConfig).values({
      key,
      value: valueStr,
      updatedAt: new Date().toISOString()
    })
  }

  // Publish update for sync
  await publish('pos_config:update', { key, value })
}

export async function getAllConfig(): Promise<Record<string, any>> {
  const results = await db.select().from(schema.posConfig)
  
  const config: Record<string, any> = {}
  for (const row of results) {
    try {
      config[row.key] = JSON.parse(row.value as string)
    } catch {
      config[row.key] = row.value
    }
  }
  
  return config
}