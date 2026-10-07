import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

describe('global page scrolling', () => {
  beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined));

  it('scrolls to the top when the page or query changes', () => {
    render(<MemoryRouter initialEntries={['/']}>
      <ScrollToTop />
      <Link to="/shop?category=Television">Open shop</Link>
      <Routes><Route path="*" element={<div>Page</div>} /></Routes>
    </MemoryRouter>);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Open shop' }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
