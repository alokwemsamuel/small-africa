/** Admin panel formatting (Lagos time) and shared table classes. */
const toDate = (iso: string) => new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + '+01:00');

export const fmt = {
  dateTime: (iso: string | null) =>
    iso
      ? toDate(iso).toLocaleString('en-NG', {
          timeZone: 'Africa/Lagos',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '—',
  date: (iso: string | null) =>
    iso
      ? toDate(iso.length === 10 ? `${iso} 12:00:00` : iso).toLocaleDateString('en-NG', {
          timeZone: 'Africa/Lagos',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—',
  time: (iso: string) =>
    toDate(iso).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' }),
  number: (n: number) => n.toLocaleString('en-NG'),
  compactNaira: (kobo: number) => {
    const n = kobo / 100;
    if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `₦${Math.round(n / 1_000)}K`;
    return `₦${Math.round(n)}`;
  },
  label: (s: string) =>
    s === 'black_diamond' ? 'Black Diamond' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
};

export const thClass = 'text-muted py-2 pr-4 text-left text-xs font-semibold tracking-wide uppercase';
export const tdClass = 'border-line border-t py-3 pr-4 align-top text-sm';
