import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

if (!pool) throw new Error('DATABASE_URL is required to seed data');
const email = process.env.ADMIN_EMAIL || 'admin@beestack.co.za';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
const hash = await bcrypt.hash(password, 12);

const normalisedEmail = email.trim().toLowerCase();
const [matchingRows] = await pool.execute('SELECT id FROM admins WHERE email=? LIMIT 1', [normalisedEmail]);
const matching = (matchingRows as { id: number }[])[0];
const [adminRows] = matching ? [[], []] : await pool.execute("SELECT id FROM admins WHERE role='admin' ORDER BY id LIMIT 1");
const admin = matching || (adminRows as { id: number }[])[0];

if (admin) await pool.execute("UPDATE admins SET email=?,password_hash=?,name=?,role='admin' WHERE id=?", [normalisedEmail, hash, 'Store Administrator', admin.id]);
else await pool.execute("INSERT INTO admins (email,password_hash,name,role) VALUES (?,?,?,'admin')", [normalisedEmail, hash, 'Store Administrator']);

console.log(`Updated the production administrator login for ${normalisedEmail}.`);
await pool.end();
