/**
 * Builds "schedule for later" choices: every 15 minutes within opening hours, at least
 * `leadMinutes` from now, up to `days` days ahead. Times are Lagos local (UTC+1, no DST).
 * The server re-validates; this only keeps the picker honest.
 */
export interface OpeningHour {
  dayOfWeek: number;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
}

export interface ScheduleDay {
  date: string; // YYYY-MM-DD
  label: string;
  times: string[]; // HH:MM
}

const LAGOS_OFFSET_MIN = 60;

/** "Now" expressed as Lagos wall-clock, whatever the visitor's own time zone. */
export function lagosNow(now = new Date()): Date {
  return new Date(now.getTime() + (now.getTimezoneOffset() + LAGOS_OFFSET_MIN) * 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

export function scheduleOptions(
  hours: OpeningHour[],
  leadMinutes = 45,
  days = 7,
  now = lagosNow(),
): ScheduleDay[] {
  const out: ScheduleDay[] = [];
  const earliest = new Date(now.getTime() + leadMinutes * 60_000);
  for (let i = 0; i <= days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const h = hours.find((x) => x.dayOfWeek === day.getDay());
    if (!h || h.isClosed || !h.opensAt || !h.closesAt) continue;
    const times: string[] = [];
    for (let m = toMin(h.opensAt); m <= toMin(h.closesAt); m += 15) {
      const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
      if (slot >= earliest) times.push(`${pad(slot.getHours())}:${pad(slot.getMinutes())}`);
    }
    if (times.length) {
      const label =
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : day.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' });
      out.push({ date: ymd(day), label, times });
    }
  }
  return out;
}

export function formatTime(hm: string): string {
  const h = Number(hm.slice(0, 2));
  const m = hm.slice(3, 5);
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'am' : 'pm'}`;
}
