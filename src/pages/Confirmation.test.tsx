import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';
import Confirmation from './Confirmation';

it('waits for signed payment verification without clearing the cart from a browser return', () => {
  render(<MemoryRouter initialEntries={['/confirmation/MMS-CHK-2026-17A021?payment=success']}>
    <Routes><Route path="/confirmation/:reference" element={<Confirmation />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByText('Payment return received')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Yoco is confirming your payment/i })).toBeInTheDocument();
  expect(screen.getByText('Verification in progress')).toBeInTheDocument();
  expect(screen.getByText('MMS-CHK-2026-17A021')).toBeInTheDocument();
  expect(screen.getByText(/cart is not cleared by this return page/i)).toBeInTheDocument();
});

it.each(['cancelled', 'failed', 'unavailable'])('keeps the cart when payment is %s', (payment) => {
  render(<MemoryRouter initialEntries={[`/confirmation/MMS-CHK-2026-17A021?payment=${payment}`]}>
    <Routes><Route path="/confirmation/:reference" element={<Confirmation />} /></Routes>
  </MemoryRouter>);

  expect(screen.getByText(/cart (stays|has been kept) exactly as it was/i)).toBeInTheDocument();
  expect(screen.getByText('Checkout reference')).toBeInTheDocument();
});
