import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL, ensure the database is provisioned');
}

export default defineConfig({
  out: './migrations',
  schema: ['./server/schema.ts', './server/designControlStructuredSchema.ts'],
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: false,
  verbose: true,
});
