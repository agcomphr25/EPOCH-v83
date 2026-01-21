import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?'
  );
}

console.log('Initializing database connection...');

// Configure Neon client with timeout (Neon HTTP only supports basic options)
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle({ client: sql, schema });

// Export raw SQL function for cases where Drizzle query builder has issues
export const rawSql = sql;

// Create a real PostgreSQL pool for operations that need proper UPDATE/INSERT support
// The Neon HTTP driver doesn't work properly with non-Neon PostgreSQL databases
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test database connection with timeout
export async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');

    // Add 30 second timeout to prevent hanging (Neon serverless may need time to wake up)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout')), 30000)
    );

    await Promise.race([sql`SELECT 1`, timeoutPromise]);

    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('⚠️  Server will start anyway - database operations may fail');
    return false;
  }
}

// Export a pool wrapper for compatibility with existing code that uses pool.query(sql, params) pattern
// Now uses real pg Pool for proper PostgreSQL operations
// Returns an array-like object with rows as base, plus rowCount for UPDATE/INSERT operations
export const pool = {
  query: async (queryString: string, params?: any[]) => {
    // Use real pg Pool for proper UPDATE/INSERT support
    const result = await pgPool.query(queryString, params || []);
    // Create an array from rows and attach rowCount for backward compatibility
    const rows = [...result.rows] as any[];
    (rows as any).rowCount = result.rowCount;
    return rows;
  },
  end: () => pgPool.end(),
};
