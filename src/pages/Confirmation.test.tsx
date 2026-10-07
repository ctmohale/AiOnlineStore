import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Confirmation from './Confirmation';

const mocks = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock('../state/StoreContext', () => ({ useStore: () => ({ clear: mocks.clear }) }));

beforeEach(() => mocks.clear.mockReset());

it('explains payment confirmation in clear customer-friendly language', () => {
  render(<MemoryRouter initialEntries={['/confirmation/MMS-2026-17A021?payment=success']}>
    <Routes><Route path="/confirmation/:reference" element={<Confirmation />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByText('Payment sent securely')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Yoco is confirming your payment/i })).toBeInTheDocument();
  expect(screen.getByText('Confirmation in progress')).toBeInTheDocument();
  expect(screen.getByText('MMS-2026-17A021')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/webhook|screenshot|browser return/i);
  expect(mocks.clear).toHaveBeenCalledTimes(1);
});

it.each(['cancelled', 'failed', 'unavailable'])('keeps the cart when payment is %s', (payment) => {
  render(<MemoryRouter initialEntries={[`/confirmation/MMS-2026-17A021?payment=${payment}`]}>
    <Routes><Route path="/confirmation/:reference" element={<Confirmation />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByText(/cart has been kept exactly as it was/i)).toBeInTheDocument();
  expect(mocks.clear).not.toHaveBeenCalled();
});
