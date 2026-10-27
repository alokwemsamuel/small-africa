/** Opening hours as shown in the footer and the mobile menu. */
export const DAY_GROUPS = [
  { label: 'Mon – Thu', day: 1 },
  { label: 'Fri – Sat', day: 5 },
  { label: 'Sunday', day: 0 },
];

/**
 * One day's hours as text ("12:00 – late"), or '' while the site settings load.
 * @param {{ openingHours: { dayOfWeek: number, opensAt: string | null, closesAt: string | null, isClosed: boolean }[] } | undefined} site
 * @param {number} day 0 = Sunday
 */
export function hoursText(site, day) {
  const h = site?.openingHours.find((o) => o.dayOfWeek === day);
  if (!h) return '';
  if (h.isClosed) return 'Closed';
  return `${h.opensAt} – ${h.closesAt === '23:59' ? 'late' : h.closesAt}`;
}
