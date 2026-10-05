import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AdminClaims = { sub: string; email: string; role: 'admin' | 'operator' };
export type CustomerClaims = { sub: string; email: string; role: 'customer' };
const ISSUER = 'mzansi-mega-store-api';
const ADMIN_AUDIENCE = 'mzansi-mega-store-admin';
const CUSTOMER_AUDIENCE = 'mzansi-mega-store-customer';
const LEGACY_ISSUER = 'moya-market-api';
const LEGACY_ADMIN_AUDIENCE = 'moya-market-admin';
const LEGACY_CUSTOMER_AUDIENCE = 'moya-market-customer';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return value;
}

export function signAdminToken(claims: AdminClaims) {
  return jwt.sign(claims, secret(), { expiresIn: '24h', issuer: ISSUER, audience: ADMIN_AUDIENCE });
}

export function signCustomerToken(claims: CustomerClaims) {
  return jwt.sign(claims, secret(), { expiresIn: '30d', issuer: ISSUER, audience: CUSTOMER_AUDIENCE });
}

function verifyToken<T>(token: string, audience: string, legacyAudience: string) {
  try { return jwt.verify(token, secret(), { issuer: ISSUER, audience }) as T; }
  catch { return jwt.verify(token, secret(), { issuer: LEGACY_ISSUER, audience: legacyAudience }) as T; }
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  try {
    response.locals.admin = verifyToken<AdminClaims>(token, ADMIN_AUDIENCE, LEGACY_ADMIN_AUDIENCE);
    next();
  } catch { response.status(401).json({ error: 'Admin authentication required' }); }
}

export function requireCustomer(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  try {
    response.locals.customer = verifyToken<CustomerClaims>(token, CUSTOMER_AUDIENCE, LEGACY_CUSTOMER_AUDIENCE);
    next();
  } catch { response.status(401).json({ error: 'Customer authentication required' }); }
}
