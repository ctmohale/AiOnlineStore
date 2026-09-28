import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type AdminClaims = { sub: string; email: string; role: 'admin' | 'operator' };

export function signAdminToken(claims: AdminClaims) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return jwt.sign(claims, secret, { expiresIn: '8h', issuer: 'moya-market-api', audience: 'moya-market-admin' });
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '';
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Missing secret');
    response.locals.admin = jwt.verify(token, secret, { issuer: 'moya-market-api', audience: 'moya-market-admin' }) as AdminClaims;
    next();
  } catch { response.status(401).json({ error: 'Admin authentication required' }); }
}
