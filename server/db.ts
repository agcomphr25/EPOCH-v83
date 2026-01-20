import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
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
export const pool = {
  query: async (queryString: string, params?: any[]) => {
    // Use the Neon sql function with the proper call syntax
    const result = await sql(queryString, params || []);
    return result;
  },
  end: () => Promise.resolve(),
};
