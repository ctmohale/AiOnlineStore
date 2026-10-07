import { expect, it, vi } from 'vitest';
import { beginLoading, getPendingRequests, resetLoading, subscribeToLoading } from './loading';
it('tracks concurrent requests until all finish and prevents double completion', () => {
  const listener = vi.fn(); const unsubscribe = subscribeToLoading(listener);
  const first = beginLoading(); const second = beginLoading();
  expect(getPendingRequests()).toBe(2);
  first(); first(); expect(getPendingRequests()).toBe(1);
  second(); expect(getPendingRequests()).toBe(0);
  expect(listener).toHaveBeenCalledTimes(4); unsubscribe();
});

it('resets safely across browser page restores without allowing negative counts', () => {
  const staleDone = beginLoading();
  expect(getPendingRequests()).toBe(1);
  resetLoading();
  expect(getPendingRequests()).toBe(0);
  const currentDone = beginLoading();
  staleDone();
  expect(getPendingRequests()).toBe(1);
  currentDone();
  expect(getPendingRequests()).toBe(0);
});
