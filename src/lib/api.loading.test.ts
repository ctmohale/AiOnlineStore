import { afterEach, expect, it, vi } from 'vitest';
import { publicRequest } from './api';
import { getPendingRequests } from './loading';
afterEach(() => vi.unstubAllGlobals());
it('clears the loading indicator when a network request fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
  const request = publicRequest('/products');
  expect(getPendingRequests()).toBe(1);
  await expect(request).rejects.toThrow('Network unavailable');
  expect(getPendingRequests()).toBe(0);
});
it('keeps loading active while the response body is still being parsed', async () => {
  let resolveBody!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) }));
  const request = publicRequest('/products'); await Promise.resolve();
  expect(getPendingRequests()).toBe(1); resolveBody([]);
  await expect(request).resolves.toEqual([]); expect(getPendingRequests()).toBe(0);
});
