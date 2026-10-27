import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CookieNotice } from './CookieNotice';

const renderNotice = () =>
  render(
    <MemoryRouter>
      <CookieNotice />
    </MemoryRouter>,
  );

describe('CookieNotice', () => {
  afterEach(() => localStorage.clear());

  it('shows on a first visit and stays closed once dismissed', async () => {
    const { unmount } = renderNotice();
    const notice = screen.getByRole('region', { name: 'Cookie notice' });
    // theme-init.js hides it by this class in pre-built pages for returning visitors.
    expect(notice).toHaveClass('cookie-notice');
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('region', { name: 'Cookie notice' })).toBeNull();
    expect(localStorage.getItem('sa-cookie-notice')).toBe('1');

    unmount();
    renderNotice();
    expect(screen.queryByRole('region', { name: 'Cookie notice' })).toBeNull();
  });
});
