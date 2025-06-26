import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/local/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE_PATH || './data/euphoria-pos.db',
  },
} satisfies Config