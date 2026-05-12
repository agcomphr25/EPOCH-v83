import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import * as schema from './schema';

const connectionString =
  process.env.FORCE_DATABASE_URL ||
  process.env.DATABASE_URL;
const connectionSource = process.env.FORCE_DATABASE_URL ? 'FORCE_DATABASE_URL' : 'DATABASE_URL';

if (!connectionString) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?'
  );
}

export function getDatabaseTargetInfo() {
  if (!connectionString) {
    return {
      source: connectionSource,
      host: null,
      database: null,
      user: null,
      redactedUrl: null,
    };
  }

  try {
    const parsed = new URL(connectionString);
    const database = parsed.pathname.replace(/^\//, '') || null;
    const user = parsed.username ? decodeURIComponent(parsed.username) : null;
    return {
      source: connectionSource,
      host: parsed.hostname || null,
      database,
      user,
      redactedUrl: `${parsed.protocol}//${user ? `${user}:***@` : ''}${parsed.host}${database ? `/${database}` : ''}`,
    };
  } catch {
    return {
      source: connectionSource,
      host: process.env.PGHOST || null,
      database: process.env.PGDATABASE || null,
      user: process.env.PGUSER || null,
      redactedUrl: null,
    };
  }
}

console.log('Initializing database connection...', getDatabaseTargetInfo());

export const pgPool = new Pool({
  connectionString,
});

export const db = drizzle({ client: pgPool, schema });

export async function rawSql(strings: TemplateStringsArray, ...values: any[]): Promise<any[]> {
  let queryString = '';
  for (let i = 0; i < strings.length; i++) {
    queryString += strings[i];
    if (i < values.length) {
      queryString += `$${i + 1}`;
    }
  }
  const result = await pgPool.query(queryString, values);
  return result.rows;
}

export type CompatibleQueryResult<T extends QueryResultRow = any> =
  T[] &
  Pick<QueryResult<T>, 'rows' | 'rowCount' | 'command' | 'oid' | 'fields'>;

function toCompatibleQueryResult<T extends QueryResultRow>(
  result: QueryResult<T>,
): CompatibleQueryResult<T> {
  const rows = [...result.rows] as CompatibleQueryResult<T>;

  Object.defineProperties(rows, {
    rows: { value: rows, enumerable: false },
    rowCount: { value: result.rowCount, enumerable: false },
    command: { value: result.command, enumerable: false },
    oid: { value: result.oid, enumerable: false },
    fields: { value: result.fields, enumerable: false },
  });

  return rows;
}

export async function queryRows<T extends QueryResultRow = any>(
  queryString: string,
  params?: any[],
): Promise<T[]> {
  return pgPool.query<T>(queryString, params || []).then((result) => result.rows);
}

export async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database connection timeout')), 30000)
    );

    await Promise.race([pgPool.query('SELECT 1'), timeoutPromise]);

    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.log('⚠️  Server will start anyway - database operations may fail');
    return false;
  }
}

export const pool = {
  query: async <T extends QueryResultRow = any>(
    queryString: string,
    params?: any[],
  ): Promise<CompatibleQueryResult<T>> => {
    const result = await pgPool.query<T>(queryString, params || []);
    return toCompatibleQueryResult(result);
  },
  end: () => pgPool.end(),
  connect: () => pgPool.connect(),
};
