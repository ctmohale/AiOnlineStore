import { expect, it, vi } from 'vitest';
import { beginLoading, getPendingRequests, subscribeToLoading } from './loading';
it('tracks concurrent requests until all finish and prevents double completion', () => {
  const listener = vi.fn(); const unsubscribe = subscribeToLoading(listener);
  const first = beginLoading(); const second = beginLoading();
  expect(getPendingRequests()).toBe(2);
  first(); first(); expect(getPendingRequests()).toBe(1);
  second(); expect(getPendingRequests()).toBe(0);
  expect(listener).toHaveBeenCalledTimes(4); unsubscribe();
});
