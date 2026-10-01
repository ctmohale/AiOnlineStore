import { publicOrderStatus } from './orderStatus';

test('keeps supplier operations private in customer status labels', () => {
  expect(publicOrderStatus('checking_supplier')).toBe('Confirming your order');
  expect(publicOrderStatus('purchasing')).toBe('Preparing your order');
  expect(publicOrderStatus('shipped')).toBe('With courier');
});

test('does not echo unknown internal statuses', () => {
  expect(publicOrderStatus('supplier_recheck_required')).toBe('Order update');
});
