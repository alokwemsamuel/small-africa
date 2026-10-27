import { formatTime, scheduleOptions } from './lagosTime';

const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  opensAt: '12:00',
  closesAt: '22:00',
  isClosed: d === 1, // closed Mondays
}));

describe('scheduleOptions', () => {
  // Tuesday 20 Oct 2026, 21:00 Lagos wall-clock.
  const now = new Date(2026, 9, 20, 21, 0);

  it('respects the lead time and closing time today', () => {
    const [today] = scheduleOptions(hours, 45, 7, now);
    expect(today?.label).toBe('Today');
    expect(today?.times).toEqual(['21:45', '22:00']);
  });

  it('skips closed days and stops after the window', () => {
    const days = scheduleOptions(hours, 45, 7, now);
    expect(days.map((d) => d.date)).not.toContain('2026-10-26'); // Monday
    expect(days.at(-1)?.date).toBe('2026-10-27');
    expect(days[1]?.label).toBe('Tomorrow');
    expect(days[1]?.times[0]).toBe('12:00');
  });
});

it('formats 24-hour times for people', () => {
  expect(formatTime('00:15')).toBe('12:15 am');
  expect(formatTime('12:00')).toBe('12:00 pm');
  expect(formatTime('19:30')).toBe('7:30 pm');
});
