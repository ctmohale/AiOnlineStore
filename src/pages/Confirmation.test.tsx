import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Confirmation from './Confirmation';

vi.mock('../state/StoreContext', () => ({ useStore: () => ({ clear: vi.fn() }) }));

it('explains payment confirmation in clear customer-friendly language', () => {
  render(<MemoryRouter initialEntries={['/confirmation/MMS-2026-17A021?payment=success']}>
    <Routes><Route path="/confirmation/:reference" element={<Confirmation />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByText('Payment sent securely')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Yoco is confirming your payment/i })).toBeInTheDocument();
  expect(screen.getByText('Confirmation in progress')).toBeInTheDocument();
  expect(screen.getByText('MMS-2026-17A021')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(/webhook|screenshot|browser return/i);
});
