import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getDb } from './localDb'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations() {
  const db = getDb()
  const migrationsFolder = path.join(__dirname, '../../drizzle/sqlite')
  
  console.log('Running SQLite migrations from:', migrationsFolder)
  
  try {
    await migrate(db, { migrationsFolder })
    console.log('Migrations completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  }
}