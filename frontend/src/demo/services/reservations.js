import { db } from '../db';
import { fail } from '../http';
import { code } from '../random';
import { addDays, addMinutes, now, parse, startOfDay, ymd } from '../time';
import { audit } from './audit';
import { openingWindow } from './pricing';

/** Port of App\Services\ReservationService. */

const ACTIVE = ['pending', 'confirmed', 'seated'];

export const STAFF_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['seated', 'cancelled', 'no_show'],
  seated: ['completed'],
  completed: [],
  cancelled: ['confirmed'],
  no_show: ['confirmed'],
};

export function manageToken(reservationCode) {
  return `demo-${btoa(`manage:${reservationCode}`).replace(/[^A-Za-z0-9]/g, '')}`;
}

export function capacity(areaId, date, time, fallback) {
  const overrides = db.where(
    'capacity_overrides',
    (o) => o.seating_area_id === areaId && o.service_date === date,
  );
  const exact = overrides.find((o) => o.start_time === `${time}:00`);
  const wholeDay = overrides.find((o) => o.start_time === null);
  const o = exact ?? wholeDay;
  return o ? o.covers : fallback;
}

export function bookedCovers(areaId, date, time) {
  return db
    .where(
      'reservations',
      (r) =>
        r.seating_area_id === areaId &&
        r.service_date === date &&
        r.start_time === `${time}:00` &&
        ACTIVE.includes(r.status),
    )
    .reduce((s, r) => s + r.party_size, 0);
}

function parseDate(date) {
  const day = parse(date);
  if (ymd(day) !== date) throw fail.field('date', 'Choose a valid date.');
  const today = startOfDay(now());
  const maxDays = Number(db.settings('reservations').max_days_ahead ?? 60);
  if (day < today) throw fail.field('date', 'Choose a date from today onwards.');
  if (day > addDays(today, maxDays)) throw fail.field('date', `Bookings open ${maxDays} days ahead.`);
  return day;
}

export function activeSlots() {
  return db
    .where('reservation_slots', (s) => !!s.is_active)
    .map((s) => String(s.start_time).slice(0, 5))
    .sort();
}

export function activeAreas() {
  return db.where('seating_areas', (a) => !!a.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

export function availability(date, partySize) {
  const day = parseDate(date);
  const rules = db.settings('reservations');
  const maxParty = Number(rules.max_party_online ?? 12);
  if (partySize < 1 || partySize > maxParty) {
    throw fail.field(
      'party_size',
      `Online bookings are for 1–${maxParty} guests. For larger groups, please send an events enquiry.`,
    );
  }
  const window = openingWindow(day);
  const earliest = addMinutes(now(), Number(rules.min_advance_minutes ?? 60));
  const dayKey = ymd(day);
  const areas = activeAreas().map((area) => {
    const fits = partySize >= area.min_party && partySize <= area.max_party;
    return {
      slug: area.slug,
      name: area.name,
      description: area.description,
      minParty: area.min_party,
      maxParty: area.max_party,
      fitsParty: fits,
      slots: activeSlots().map((time) => {
        const at = parse(`${dayKey} ${time}`);
        const open = !!window && at >= window.opens && addMinutes(at, 60) <= window.closes;
        const remaining =
          capacity(area.id, dayKey, time, area.covers_per_slot) - bookedCovers(area.id, dayKey, time);
        return {
          time,
          available: fits && open && at >= earliest && remaining >= partySize,
          remaining: Math.max(0, remaining),
        };
      }),
    };
  });
  return {
    date: dayKey,
    partySize,
    durationMinutes: Number(rules.dining_duration_minutes ?? 120),
    areas,
    closed: window === null,
  };
}

export function toPublic(r) {
  const area = db.byId('seating_areas', r.seating_area_id);
  return {
    code: r.code,
    status: r.status,
    date: r.service_date,
    time: String(r.start_time).slice(0, 5),
    partySize: r.party_size,
    area: area ? { slug: area.slug, name: area.name } : null,
    occasion: r.occasion,
    notes: r.notes,
    name: r.guest_name,
    createdAt: r.created_at,
  };
}

export function create(data, user) {
  const avail = availability(data.date, data.party_size);
  const area = avail.areas.find((a) => a.slug === data.area);
  if (!area) throw fail.field('area', 'Choose where you’d like to sit.');
  if (!area.fitsParty)
    throw fail.field('area', `${area.name} seats ${area.minParty}–${area.maxParty} guests.`);
  const slot = area.slots.find((s) => s.time === data.time);
  if (!slot || !slot.available) throw fail.field('time', 'That time isn’t available. Please choose another.');
  const areaRow = db.find('seating_areas', (a) => a.slug === data.area);
  if (
    bookedCovers(areaRow.id, data.date, data.time) + data.party_size >
    capacity(areaRow.id, data.date, data.time, areaRow.covers_per_slot)
  ) {
    throw fail.conflict(
      'Someone just booked the last seats at that time. Please choose another slot.',
      'slot_taken',
    );
  }
  let reservationCode;
  do reservationCode = code(6, 'R-');
  while (db.find('reservations', (r) => r.code === reservationCode));
  const row = db.insert('reservations', {
    code: reservationCode,
    user_id: user?.id ?? null,
    guest_name: data.name,
    guest_email: data.email,
    guest_phone: data.phone,
    party_size: data.party_size,
    service_date: data.date,
    start_time: `${data.time}:00`,
    seating_area_id: areaRow.id,
    occasion: data.occasion ?? 'none',
    notes: data.notes ?? null,
    status: 'confirmed',
  });
  audit(user?.id ?? null, 'reservation.created', 'reservation', row.code);
  return { reservation: toPublic(row), manageToken: manageToken(row.code) };
}

function authorised(reservationCode, user, token) {
  const row = db.find('reservations', (r) => r.code === reservationCode.toUpperCase());
  const owner = row && user && (row.user_id === user.id || row.guest_email === user.email);
  const tokenOk = row && token && token === manageToken(row.code);
  if (!row || !(owner || tokenOk)) throw fail.notFound('We couldn’t find that reservation.');
  return row;
}

export function find(reservationCode, user, token) {
  return toPublic(authorised(reservationCode, user, token));
}

export function cancel(reservationCode, user, token) {
  const row = authorised(reservationCode, user, token);
  if (!['pending', 'confirmed'].includes(row.status)) {
    throw fail.conflict('This booking can no longer be cancelled online. Please call us.');
  }
  if (parse(`${row.service_date} ${row.start_time}`) < now())
    throw fail.conflict('This booking has already started.');
  Object.assign(row, { status: 'cancelled', cancelled_reason: 'Cancelled by guest' });
  audit(user?.id ?? null, 'reservation.cancelled', 'reservation', row.code);
  return toPublic(row);
}

export function staffUpdate(reservationCode, data, actorId) {
  const row = db.find('reservations', (r) => r.code === reservationCode.toUpperCase());
  if (!row) throw fail.notFound('We couldn’t find that booking.');
  const set = {};
  if (data.status && data.status !== row.status) {
    if (!(STAFF_TRANSITIONS[row.status] ?? []).includes(data.status)) {
      throw fail.conflict(`A booking that is ${row.status} can’t become ${data.status}.`);
    }
    set.status = data.status;
    if (data.status === 'cancelled') set.cancelled_reason = data.reason ?? 'Cancelled by the restaurant';
  }
  if ('table_label' in data) set.table_label = data.table_label;
  if (data.area) {
    const area = db.find('seating_areas', (a) => a.slug === data.area && !!a.is_active);
    if (!area) throw fail.badRequest('Unknown seating area.');
    if (area.id !== row.seating_area_id) {
      const time = String(row.start_time).slice(0, 5);
      if (
        bookedCovers(area.id, row.service_date, time) + row.party_size >
        capacity(area.id, row.service_date, time, area.covers_per_slot)
      ) {
        throw fail.conflict(`${area.name} is full at that time.`, 'slot_taken');
      }
      set.seating_area_id = area.id;
    }
  }
  Object.assign(row, set);
  if (Object.keys(set).length) audit(actorId, 'reservation.updated', 'reservation', row.code, set);
  return row;
}

export function listForUser(userId, email) {
  return db
    .where('reservations', (r) => r.user_id === userId || r.guest_email === email)
    .sort((a, b) => `${b.service_date} ${b.start_time}`.localeCompare(`${a.service_date} ${a.start_time}`))
    .slice(0, 50)
    .map(toPublic);
}
