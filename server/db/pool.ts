import 'dotenv/config';
import mysql from 'mysql2/promise';

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const pool = hasDatabase ? mysql.createPool({
  uri: process.env.DATABASE_URL,
  // Keep enough connections for short checkout/admin bursts, then release every
  // idle socket so Railway can suspend the service between requests.
  connectionLimit: positiveInteger(process.env.DB_POOL_CONNECTION_LIMIT, 5),
  maxIdle: 0,
  idleTimeout: positiveInteger(process.env.DB_POOL_IDLE_TIMEOUT_MS, 15_000),
  enableKeepAlive: false,
  waitForConnections: true,
  queueLimit: positiveInteger(process.env.DB_POOL_QUEUE_LIMIT, 50),
  decimalNumbers: true,
  timezone: 'Z',
  multipleStatements: true,
}) : null;

export async function withTransaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>) {
  if (!pool) throw new Error('DATABASE_URL is required');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
