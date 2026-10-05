import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';

vi.mock('./db/pool.js', () => ({ pool: null, withTransaction: vi.fn() }));

import app from './app.js';

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-more-than-thirty-two-characters';
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

test('rejects checkout when the customer is not signed in', async () => {
  const response = await fetch(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer: {}, items: [] }),
  });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Customer authentication required' });
});
