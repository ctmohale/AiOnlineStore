import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { beginLoading } from '../lib/loading';
import GlobalLoading from './GlobalLoading';
afterEach(() => vi.useRealTimers());
it('shows an accessible spinner for slow requests and hides after the last request finishes', () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  let first!: () => void; let second!: () => void;
  act(() => { first = beginLoading(); second = beginLoading(); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.getByRole('status')).toHaveTextContent('Loading data');
  expect(screen.getByRole('status').parentElement).toHaveClass('global-loading-backdrop');
  act(() => first()); expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => second()); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('avoids flashing the spinner for fast requests', () => {
  vi.useFakeTimers(); render(<GlobalLoading />);
  let done!: () => void;
  act(() => { done = beginLoading(); });
  act(() => done()); act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
