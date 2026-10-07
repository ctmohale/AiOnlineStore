import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { beginLoading, getPendingRequests, resetLoading } from '../lib/loading';
import GlobalLoading from './GlobalLoading';
afterEach(() => { resetLoading(); vi.useRealTimers(); });
it('shows an accessible spinner for slow requests and hides after the last request finishes', () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  let first!: () => void; let second!: () => void;
  act(() => { first = beginLoading(); second = beginLoading(); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(240); });
  expect(screen.getByRole('status')).toHaveTextContent('Preparing your store');
  expect(screen.getByRole('status').parentElement).toHaveClass('global-loading-backdrop');
  act(() => first()); expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => second()); expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(720); });
  expect(screen.getByRole('status').parentElement).toHaveClass('is-leaving');
  act(() => { vi.advanceTimersByTime(320); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('avoids flashing the spinner for fast requests', () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  let done!: () => void;
  act(() => { done = beginLoading(); });
  act(() => done()); act(() => { vi.advanceTimersByTime(240); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('keeps one continuous loading experience across a short request gap', () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  let first!: () => void; let second!: () => void;
  act(() => { first = beginLoading(); });
  act(() => { vi.advanceTimersByTime(240); });
  act(() => first());
  act(() => { vi.advanceTimersByTime(100); second = beginLoading(); });
  expect(screen.getByRole('status').parentElement).not.toHaveClass('is-leaving');
  act(() => second());
  act(() => { vi.advanceTimersByTime(620); });
  expect(screen.getByRole('status').parentElement).toHaveClass('is-leaving');
});

it('removes a restored loading overlay after returning from hosted checkout', async () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  await act(async () => { await Promise.resolve(); });
  act(() => { beginLoading(); });
  act(() => { vi.advanceTimersByTime(240); });
  expect(screen.getByRole('status')).toBeInTheDocument();

  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));

  expect(getPendingRequests()).toBe(0);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
