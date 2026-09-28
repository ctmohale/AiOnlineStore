import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

if (!pool) throw new Error('DATABASE_URL is required to seed data');
const email = process.env.ADMIN_EMAIL || 'admin@moyamarket.co.za';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
const hash = await bcrypt.hash(password, 12);

await pool.execute("INSERT INTO admins (email,password_hash,name,role) VALUES (?,?,?,'admin') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),name=VALUES(name)", [email.toLowerCase(), hash, 'Store Administrator']);

const seeds = [
  ['wahl-cutek-wh5439-216-hairdryer', 'Wahl Cutek WH5439-216 Hairdryer', 'Wahl', 'WH5439-216', '1 unit', 'Hair care', 649],
  ['pampers-pants-active-baby-size-6-96', 'Pampers Pants Active Baby Size 6', 'Pampers', 'Active Baby Size 6', '96 pack', 'Baby', 849],
  ['wahl-barber-kit-9247', 'Wahl Barber Kit 9247', 'Wahl', '9247', 'Complete kit', 'Grooming', 1099],
];
for (const [slug, title, brand, model, packSize, category, price] of seeds) {
  await pool.execute("INSERT INTO products (slug,title,brand,model,pack_size,category,description,specifications,selling_price,status,review_reason) VALUES (?,?,?,?,?,?,?,JSON_OBJECT('Model',?,'Pack size',?),?,'pending_review','Seed example requires supplier price, stock and exact-match verification') ON DUPLICATE KEY UPDATE title=VALUES(title)", [slug, title, brand, model, packSize, category, 'Original store description to be completed after verification.', model, packSize, price]);
}
console.log(`Seeded one admin and ${seeds.length} review-only example products.`);
await pool.end();
