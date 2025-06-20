import type { Config } from 'drizzle-kit'

export default {
  dialect: 'sqlite',
  schema: './drizzle/sqlite-schema.ts',
  out: './drizzle/sqlite',
  dbCredentials: {
    url: './euphoria-pos.db' // This will be overridden at runtime
  }
} satisfies Config