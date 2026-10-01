const publicLabels: Record<string,string> = {
  requested: 'Order received',
  checking_supplier: 'Confirming your order',
  quoted: 'Order details confirmed',
  awaiting_payment: 'Awaiting payment',
  paid: 'Payment confirmed',
  purchasing: 'Preparing your order',
  shipped: 'With courier',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  test_paid: 'Test completed',
  test_failed: 'Test unsuccessful',
};

export const publicOrderStatus = (status:string) => publicLabels[status] || 'Order update';
