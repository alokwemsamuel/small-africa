import { api } from '@/lib/api';

export const reservationsApi = {
  availability: (date, party, signal) =>
    api(`/reservations/availability?date=${date}&party=${party}`, { signal }),
  book: (body) => api('/reservations', { method: 'POST', body }),
  get: (code, token, signal) =>
    api(`/reservations/${encodeURIComponent(code)}${token ? `?t=${encodeURIComponent(token)}` : ''}`, {
      signal,
    }).then((r) => r.reservation),
  cancel: (code, token) =>
    api(`/reservations/${encodeURIComponent(code)}/cancel`, {
      method: 'POST',
      body: { t: token },
    }).then((r) => r.reservation),
};

/** Builds an .ics calendar file for "Add to calendar". Lagos is UTC+1 all year. */
export function icsFor(r, durationMinutes = 120) {
  const [y, m, d] = r.date.split('-').map(Number);
  const [hh, mm] = r.time.split(':').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, hh - 1, mm));
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (t) =>
    t
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Small Africa//Reservations//EN',
    'BEGIN:VEVENT',
    `UID:${r.code}@smallafrica`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Dinner at Small Africa (${r.partySize} guests)`,
    `LOCATION:Small Africa, Victoria Island, Lagos`,
    `DESCRIPTION:Reservation ${r.code} · ${r.area?.name ?? ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
