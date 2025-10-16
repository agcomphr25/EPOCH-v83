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

// Test database connection with timeout
export async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');

    // Add 5 second timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );

    await Promise.race([sql`SELECT 1`, timeoutPromise]);

    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    console.log('Server will start anyway - database operations may fail');
    return false;
  }
}

// Export a dummy pool for compatibility with existing code
export const pool = {
  query: sql,
  end: () => Promise.resolve(),
};
