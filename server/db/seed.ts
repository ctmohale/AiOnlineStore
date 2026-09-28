import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

if (!pool) throw new Error('DATABASE_URL is required to seed data');
const email = process.env.ADMIN_EMAIL || 'admin@moyamarket.co.za';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
const hash = await bcrypt.hash(password, 12);

await pool.execute("INSERT INTO admins (email,password_hash,name,role) VALUES (?,?,?,'admin') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),name=VALUES(name)", [email.toLowerCase(), hash, 'Store Administrator']);

console.log('Seeded the production administrator. Products must be added through the admin sourcing workflow.');
await pool.end();
