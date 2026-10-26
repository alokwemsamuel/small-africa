import { api } from '@/lib/api';

export interface Reservation {
  code: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  date: string;
  time: string;
  partySize: number;
  area: { slug: string; name: string } | null;
  occasion: string;
  notes: string | null;
  name: string;
  createdAt: string;
}

export interface Availability {
  date: string;
  partySize: number;
  durationMinutes: number;
  closed: boolean;
  areas: {
    slug: string;
    name: string;
    description: string;
    minParty: number;
    maxParty: number;
    fitsParty: boolean;
    slots: { time: string; available: boolean; remaining: number }[];
  }[];
}

export interface BookingRequest {
  date: string;
  time: string;
  party_size: number;
  area: string;
  occasion: string;
  notes: string | null;
  name: string;
  email: string;
  phone: string;
}

export const reservationsApi = {
  availability: (date: string, party: number, signal?: AbortSignal) =>
    api<Availability>(`/reservations/availability?date=${date}&party=${party}`, { signal }),
  book: (body: BookingRequest) =>
    api<{ reservation: Reservation; manageToken: string }>('/reservations', { method: 'POST', body }),
  get: (code: string, token: string | null, signal?: AbortSignal) =>
    api<{ reservation: Reservation }>(
      `/reservations/${encodeURIComponent(code)}${token ? `?t=${encodeURIComponent(token)}` : ''}`,
      { signal },
    ).then((r) => r.reservation),
  cancel: (code: string, token: string | null) =>
    api<{ reservation: Reservation }>(`/reservations/${encodeURIComponent(code)}/cancel`, {
      method: 'POST',
      body: { t: token },
    }).then((r) => r.reservation),
};

/** Builds an .ics calendar file for "Add to calendar". Lagos is UTC+1 all year. */
export function icsFor(r: Reservation, durationMinutes = 120): string {
  const [y, m, d] = r.date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = r.time.split(':').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, d, hh - 1, mm));
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const fmt = (t: Date) =>
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

export const longDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
