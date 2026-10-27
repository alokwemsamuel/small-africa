/**
 * Restaurant time for the demo, like the API's Clock: Africa/Lagos, which is UTC+1 all year
 * (no daylight saving). A "wall" Date's UTC fields read as Lagos local time, so every
 * calculation below is plain UTC arithmetic and SQL-style strings compare as text.
 */
const LAGOS_OFFSET_MS = 3_600_000;
let frozen = null;

/** Tests freeze the clock at a Lagos wall time ('2026-10-30 19:15:00'), or pass null to unfreeze. */
export function freezeClock(at) {
  frozen = at === null ? null : parse(at).getTime() - LAGOS_OFFSET_MS;
}

export function now() {
  return new Date((frozen ?? Date.now()) + LAGOS_OFFSET_MS);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 'YYYY-MM-DD' */
export function ymd(d = now()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 'HH:MM' */
export function hm(d) {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 'YYYY-MM-DD HH:MM:SS', the format the API sends. */
export function sql(d = now()) {
  return `${ymd(d)} ${hm(d)}:${pad(d.getUTCSeconds())}`;
}

/** ISO 8601 with the Lagos offset (PHP's DATE_ATOM). */
export function atom(d) {
  return `${ymd(d)}T${hm(d)}:${pad(d.getUTCSeconds())}+01:00`;
}

/** Parses 'YYYY-MM-DD', 'YYYY-MM-DD HH:MM' or 'YYYY-MM-DD HH:MM:SS' as Lagos wall time. */
export function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) throw new Error(`Bad date: ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

export function addMinutes(d, minutes) {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addDays(d, days) {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb), like PHP for our purposes. */
export function addMonths(d, months) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
  );
}

export function startOfDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function startOfMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d) {
  return d.getUTCDay();
}

/** 'YYYY-MM' */
export function period(d) {
  return ymd(d).slice(0, 7);
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 'October 2026' */
export function monthLabel(d) {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
