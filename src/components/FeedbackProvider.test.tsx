import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { FeedbackProvider, useFeedback } from './FeedbackProvider';

function ToastTrigger() {
  const { notify } = useFeedback();
  return <button type="button" onClick={() => notify('Cart updated', 'success')}>Show notification</button>;
}

test('keeps the notification stack compact so it does not obscure store controls', async () => {
  const user = userEvent.setup();
  render(<FeedbackProvider><ToastTrigger /></FeedbackProvider>);
  const trigger = screen.getByRole('button', { name: 'Show notification' });
  await user.click(trigger);
  await user.click(trigger);
  await user.click(trigger);
  expect(screen.getAllByText('Cart updated')).toHaveLength(2);
});
