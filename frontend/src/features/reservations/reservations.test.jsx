import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderRoutes } from '@/test/utils';
import { lagosNow } from '@/lib/lagosTime';
import { icsFor } from './api';
import { ManageReservationPage } from '@/features/reservations/pages/ManageReservationPage';
import { ReservationsPage } from '@/features/reservations/pages/ReservationsPage';

const availability = {
  date: '2026-10-30',
  partySize: 2,
  durationMinutes: 120,
  closed: false,
  areas: [
    {
      slug: 'main',
      name: 'Main dining room',
      description: 'Under the chandeliers',
      minParty: 1,
      maxParty: 8,
      fitsParty: true,
      slots: [
        { time: '19:00', available: true, remaining: 3 },
        { time: '19:30', available: false, remaining: 0 },
      ],
    },
  ],
};

const reservation = {
  code: 'R-7KQ2PX',
  status: 'confirmed',
  date: '2026-10-30',
  time: '19:00',
  partySize: 2,
  area: { slug: 'main', name: 'Main dining room' },
  occasion: 'birthday',
  notes: null,
  name: 'Ada Obi',
  createdAt: '2026-10-20 12:00:00',
};

describe('ReservationsPage', () => {
  it('shows live slots and books the chosen table', async () => {
    const today = lagosNow();
    const ymd = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
      .map((n) => String(n).padStart(2, '0'))
      .join('-');
    const { calls } = mockApi({
      'GET /auth/me': () => ({ body: { user: null } }),
      [`GET /reservations/availability?date=${ymd}&party=2`]: () => ({ body: availability }),
      'POST /reservations': () => ({ status: 201, body: { reservation, manageToken: 'tok' } }),
    });

    renderRoutes([{ path: '/reservations', element: <ReservationsPage /> }], '/reservations');
    const user = userEvent.setup();
    expect(
      await screen.findByRole('button', { name: 'Main dining room at 7:30 pm, unavailable' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Main dining room at 7:00 pm' }));
    await user.type(screen.getByLabelText('Full name'), 'Ada Obi');
    await user.type(screen.getByLabelText('Phone'), '08031234567');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.selectOptions(screen.getByLabelText('Occasion'), 'birthday');
    await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));

    expect(await screen.findByText('See you soon, Ada')).toBeInTheDocument();
    expect(screen.getByText('R-7KQ2PX')).toBeInTheDocument();
    const booking = calls.find((c) => c.method === 'POST' && c.path === '/reservations').body;
    expect(booking).toMatchObject({ time: '19:00', party_size: 2, area: 'main', occasion: 'birthday' });
  });

  it('sends large parties to the events team', async () => {
    mockApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderRoutes([{ path: '/reservations', element: <ReservationsPage /> }], '/reservations');
    await userEvent.setup().selectOptions(screen.getByLabelText('Guests'), '13');
    expect(screen.getByRole('link', { name: 'Send an event enquiry' })).toHaveAttribute('href', '/events');
  });
});

describe('ManageReservationPage', () => {
  it('cancels with the emailed token after confirmation', async () => {
    const { calls } = mockApi({
      'GET /reservations/R-7KQ2PX?t=abc': () => ({ body: { reservation } }),
      'POST /reservations/R-7KQ2PX/cancel': () => ({
        body: { reservation: { ...reservation, status: 'cancelled' } },
      }),
    });
    renderRoutes(
      [{ path: '/reservations/:code', element: <ManageReservationPage /> }],
      '/reservations/R-7KQ2PX?t=abc',
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect(await screen.findByText('Reservation cancelled')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/cancel'))?.body).toEqual({ t: 'abc' });
  });

  it('shows a friendly message for a bad link', async () => {
    mockApi({});
    renderRoutes(
      [{ path: '/reservations/:code', element: <ManageReservationPage /> }],
      '/reservations/R-NOPE00?t=x',
    );
    expect(await screen.findByText('We couldn’t find that booking')).toBeInTheDocument();
  });
});

it('builds a calendar file in UTC from Lagos time', () => {
  const ics = icsFor(reservation, 120);
  expect(ics).toContain('DTSTART:20261030T180000Z');
  expect(ics).toContain('DTEND:20261030T200000Z');
  expect(ics).toContain('UID:R-7KQ2PX@smallafrica');
  expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
});
