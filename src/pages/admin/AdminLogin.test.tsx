import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider } from '../../components/FeedbackProvider';
import AdminLogin from './AdminLogin';

describe('AdminLogin', () => {
  it('lets an administrator show and hide the password', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FeedbackProvider><AdminLogin /></FeedbackProvider></MemoryRouter>);

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
