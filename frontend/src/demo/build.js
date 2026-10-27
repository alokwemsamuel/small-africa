import { nextIds, setState, STATE_VERSION } from './db';
import { generateOperations } from './generate';
import { hashPassword } from './services/auth';
import { addMonths, MONTHS, now, parse, period, sql, ymd } from './time';

/**
 * The demo sign-ins. These are the public demo credentials shown on the sign-in page; the
 * other seeded members have no usable password, exactly as in the seeded database.
 */
const DEMO_PASSWORDS = [
  ['admin@smallafrica.demo', 'SmallAfrica@Admin2026'],
  ['manager@smallafrica.demo', 'SmallAfrica@Manager2026'],
  ['guest@smallafrica.demo', 'SmallAfrica@Guest2026'],
  ['kitchen@smallafrica.demo', 'SmallAfrica@Kitchen2026'],
  ['frontdesk@smallafrica.demo', 'SmallAfrica@Desk2026'],
];

/** Whole calendar months to move the snapshot forward, never past now. */
export function monthShift(exportedAt, at) {
  const e = parse(exportedAt);
  let months = (at.getUTCFullYear() - e.getUTCFullYear()) * 12 + (at.getUTCMonth() - e.getUTCMonth());
  if (months > 0 && addMonths(e, months) > at) months--;
  return Math.max(0, months);
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;
const PERIOD = /^\d{4}-\d{2}$/;
const MONTH_NAME = new RegExp(`\\b(${MONTHS.join('|')})(?: (\\d{4}))?\\b`, 'g');

/** "Interest for September 2026" → "Interest for November 2026" (and bare month names). */
export function shiftText(text, months) {
  return text.replace(MONTH_NAME, (_, name, year) => {
    const index = MONTHS.indexOf(name);
    const d = addMonths(new Date(Date.UTC(Number(year ?? 2000), index, 1)), months);
    return year ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()];
  });
}

/**
 * Moves every date in the snapshot forward by whole months, so a demo opened months after the
 * export still shows recent history, and month-based things (interest periods, streaks) line up.
 */
export function shiftSnapshot(tables, months) {
  if (months === 0) return;
  for (const [table, rows] of Object.entries(tables)) {
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value !== 'string' || key === 'birthday') continue;
        if (DATE_TIME.test(value)) {
          const shifted = addMonths(parse(value), months);
          row[key] = value.length === 10 ? ymd(shifted) : sql(shifted);
        } else if (PERIOD.test(value) && ['period', 'streak_month', 'reference'].includes(key)) {
          row[key] = period(addMonths(parse(`${value}-01`), months));
        } else if (
          ['wallet_ledger', 'points_ledger', 'notifications'].includes(table) &&
          ['description', 'title', 'body'].includes(key)
        ) {
          row[key] = shiftText(value, months);
        }
      }
    }
  }
}

/** Lets the browser paint and handle input between the steps of a build. */
const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A fresh demo database for today: the exported snapshot plus today's busy operations.
 * `consume` builds on the snapshot's own rows (no copy); only for its first use in a page.
 */
export async function buildState(snapshot, at = now(), { consume = false } = {}) {
  const tables = consume ? snapshot.tables : structuredClone(snapshot.tables);
  shiftSnapshot(tables, monthShift(snapshot.exportedAt, at));
  await yieldToBrowser();
  for (const t of [
    'reservations',
    'capacity_overrides',
    'audit_logs',
    'coupon_redemptions',
    'newsletter_subscribers',
  ]) {
    tables[t] ??= [];
  }
  const state = {
    version: STATE_VERSION,
    builtOn: ymd(at),
    tables,
    nextId: nextIds(tables),
    userId: null,
    passwords: {},
  };
  setState(state);
  generateOperations(at);
  await yieldToBrowser();
  for (const [email, password] of DEMO_PASSWORDS) {
    const user = tables.users.find((u) => u.email === email);
    if (user) state.passwords[user.id] = await hashPassword(password);
  }
  return state;
}
