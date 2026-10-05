import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_TOKEN_KEY, getAdminToken } from './storage';

describe('admin session storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reads the persistent admin token', () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, 'persistent-token');
    expect(getAdminToken()).toBe('persistent-token');
  });

  it('migrates an existing tab session so the admin is not signed out', () => {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, 'old-session-token');
    expect(getAdminToken()).toBe('old-session-token');
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe('old-session-token');
    expect(sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });
});
