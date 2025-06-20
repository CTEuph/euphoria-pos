import type { Config } from 'drizzle-kit'

export default {
  schema: './drizzle/sqlite-schema.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: './pos.sqlite' // Will be created in app data directory at runtime
  }
} satisfies Config