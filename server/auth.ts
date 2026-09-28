import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AdminClaims = { sub: string; email: string; role: 'admin' | 'operator' };
export type CustomerClaims = { sub: string; email: string; role: 'customer' };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return value;
}

export function signAdminToken(claims: AdminClaims) {
  return jwt.sign(claims, secret(), { expiresIn: '8h', issuer: 'moya-market-api', audience: 'moya-market-admin' });
}

export function signCustomerToken(claims: CustomerClaims) {
  return jwt.sign(claims, secret(), { expiresIn: '30d', issuer: 'moya-market-api', audience: 'moya-market-customer' });
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  try {
    response.locals.admin = jwt.verify(token, secret(), { issuer: 'moya-market-api', audience: 'moya-market-admin' }) as AdminClaims;
    next();
  } catch { response.status(401).json({ error: 'Admin authentication required' }); }
}

export function requireCustomer(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  try {
    response.locals.customer = jwt.verify(token, secret(), { issuer: 'moya-market-api', audience: 'moya-market-customer' }) as CustomerClaims;
    next();
  } catch { response.status(401).json({ error: 'Customer authentication required' }); }
}

export function optionalCustomer(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  if (!token) return next();
  try { response.locals.customer = jwt.verify(token, secret(), { issuer: 'moya-market-api', audience: 'moya-market-customer' }) as CustomerClaims; } catch { /* Guest checkout remains available for invalid or expired sessions. */ }
  next();
}
