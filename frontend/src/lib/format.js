const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** Formats kobo as Naira, e.g. 1850000 → "₦18,500". Amounts are always integer kobo in the API. */
export function formatNaira(kobo) {
  const sign = kobo < 0 ? '−' : '';
  return `${sign}₦${naira.format(Math.round(Math.abs(kobo) / 100))}`;
}

export function initials(first, last) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
