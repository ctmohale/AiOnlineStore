import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

if (!pool) throw new Error('DATABASE_URL is required to run migrations');
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const compiledMigrationsDir = path.join(currentDir, 'migrations');
const sourceMigrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');
const migrationsDir = await fs.access(compiledMigrationsDir).then(() => compiledMigrationsDir).catch(() => sourceMigrationsDir);
const connection = await pool.getConnection();
try {
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  const [rows] = await connection.query('SELECT name FROM schema_migrations');
  const applied = new Set((rows as { name: string }[]).map((row) => row.name));
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await connection.query(sql);
    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`Applied ${file}`);
  }
} finally { connection.release(); await pool.end(); }
