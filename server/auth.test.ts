import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAdminToken, signCustomerToken } from './auth.js';

describe('authentication token lifetimes', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  });

  it('keeps an administrator signed in for 24 hours', () => {
    const token = signAdminToken({ sub: '1', email: 'admin@example.test', role: 'admin' });
    const claims = jwt.decode(token) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(24 * 60 * 60);
  });

  it('keeps the existing 30-day customer session', () => {
    const token = signCustomerToken({ sub: '2', email: 'customer@example.test', role: 'customer' });
    const claims = jwt.decode(token) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(30 * 24 * 60 * 60);
  });
});
