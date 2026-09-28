import 'dotenv/config';
import mysql from 'mysql2/promise';

export const hasDatabase = Boolean(process.env.DATABASE_URL);
export const pool = hasDatabase ? mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 10, decimalNumbers: true, timezone: 'Z', multipleStatements: true }) : null;

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
