import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use HTTP connection instead of WebSocket for better stability
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle({ client: sql, schema });

// Export a dummy pool for compatibility with existing code
export const pool = {
  query: sql,
  end: () => Promise.resolve(),
};
