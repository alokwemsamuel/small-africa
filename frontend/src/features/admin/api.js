import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const adminApi = {
  me: (signal) => api('/admin/me', { signal }),
  dashboard: (days, signal) => api(`/admin/dashboard?days=${days}`, { signal }),

  orders: (q, signal) => api(`/admin/orders${qs(q)}`, { signal }),
  order: (ref, signal) => api(`/admin/orders/${ref}`, { signal }).then((r) => r.order),
  setOrderStatus: (ref, status, note) =>
    api(`/admin/orders/${ref}/status`, {
      method: 'POST',
      body: { status, note: note || null },
    }).then((r) => r.order),
  refundFlag: (ref, flag, reason) =>
    api(`/admin/orders/${ref}/refund-flag`, {
      method: 'POST',
      body: { flag, reason },
    }).then((r) => r.order),

  reservations: (q, signal) => api(`/admin/reservations${qs(q)}`, { signal }),
  updateReservation: (code, body) =>
    api(`/admin/reservations/${code}`, { method: 'PATCH', body }).then((r) => r.reservation),
  capacity: (date, signal) => api(`/admin/capacity?date=${date}`, { signal }),
  setCapacity: (body) => api('/admin/capacity', { method: 'PUT', body }),
  clearCapacity: (id) => api(`/admin/capacity/${id}`, { method: 'DELETE' }),

  menu: (signal) => api('/admin/menu', { signal }),
  createDish: (body) => api('/admin/dishes', { method: 'POST', body }),
  updateDish: (id, body) => api(`/admin/dishes/${id}`, { method: 'PATCH', body }),
  deleteDish: (id) => api(`/admin/dishes/${id}`, { method: 'DELETE' }),
  dishAvailability: (id, body) => api(`/admin/dishes/${id}/availability`, { method: 'POST', body }),
  uploadDishImage: (id, file, alt) => {
    const form = new FormData();
    form.append('image', file);
    form.append('alt', alt);
    return api(`/admin/dishes/${id}/image`, { method: 'POST', formData: form });
  },
  removeDishImage: (id) => api(`/admin/dishes/${id}/image`, { method: 'DELETE' }),
  saveCategory: (body, id) =>
    api(id ? `/admin/categories/${id}` : '/admin/categories', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  saveKitchen: (id, body) => api(`/admin/kitchens/${id}`, { method: 'PATCH', body }),

  customers: (q, signal) => api(`/admin/customers${qs(q)}`, { signal }),
  customer: (id, signal) => api(`/admin/customers/${id}`, { signal }),
  customerHistory: (id, kind, before, signal) =>
    api(`/admin/customers/${id}/history${qs({ kind, before })}`, { signal }),
  recordVisit: (id, amountNaira, note) =>
    api(`/admin/customers/${id}/visits`, {
      method: 'POST',
      body: { amount_naira: amountNaira, note: note || null },
    }),
  adjust: (id, body) => api(`/admin/customers/${id}/adjust`, { method: 'POST', body }),

  loyaltySettings: (signal) => api('/admin/loyalty/settings', { signal }),
  saveLoyaltySettings: (settings) =>
    api('/admin/loyalty/settings', {
      method: 'PUT',
      body: settings,
    }),
  saveReward: (body, id) =>
    api(id ? `/admin/loyalty/rewards/${id}` : '/admin/loyalty/rewards', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  loyaltyAnalytics: (signal) => api('/admin/loyalty/analytics', { signal }),
  loyaltyLedger: (q, signal) => api(`/admin/loyalty/ledger${qs(q)}`, { signal }),
  runInterest: (period) =>
    api('/admin/loyalty/interest-runs', {
      method: 'POST',
      body: { period },
    }),
  simulateInterest: () => api('/admin/loyalty/interest-runs/simulate', { method: 'POST' }),

  reviews: (q, signal) => api(`/admin/reviews${qs(q)}`, { signal }),
  moderateReview: (id, body) => api(`/admin/reviews/${id}`, { method: 'PATCH', body }).then((r) => r.review),
  coupons: (signal) => api('/admin/coupons', { signal }).then((r) => r.coupons),
  saveCoupon: (body, id) =>
    api(id ? `/admin/coupons/${id}` : '/admin/coupons', {
      method: id ? 'PATCH' : 'POST',
      body,
    }).then((r) => r.coupons),
  expireCoupon: (id) => api(`/admin/coupons/${id}/expire`, { method: 'POST' }).then((r) => r.coupons),
  enquiries: (q, signal) => api(`/admin/enquiries${qs(q)}`, { signal }),
  updateEnquiry: (id, status) => api(`/admin/enquiries/${id}`, { method: 'PATCH', body: { status } }),
  messages: (q, signal) => api(`/admin/messages${qs(q)}`, { signal }),
  updateMessage: (id, status) => api(`/admin/messages/${id}`, { method: 'PATCH', body: { status } }),

  staff: (signal) => api('/admin/staff', { signal }).then((r) => r.staff),
  createStaff: (body) => api('/admin/staff', { method: 'POST', body }).then((r) => r.staff),
  updateStaff: (id, body) => api(`/admin/staff/${id}`, { method: 'PATCH', body }).then((r) => r.staff),
  resetStaff2fa: (id) => api(`/admin/staff/${id}/reset-2fa`, { method: 'POST' }).then((r) => r.staff),
  resendInvite: (id) => api(`/admin/staff/${id}/invite`, { method: 'POST' }),

  settings: (signal) => api('/admin/settings', { signal }),
  saveSettingsGroup: (group, body) => api(`/admin/settings/${group}`, { method: 'PUT', body }),
  saveHours: (hours) => api('/admin/settings/hours', { method: 'PUT', body: { hours } }),
  saveZone: (body, id) =>
    api(id ? `/admin/settings/zones/${id}` : '/admin/settings/zones', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  saveSeating: (id, body) => api(`/admin/settings/seating/${id}`, { method: 'PATCH', body }),

  audit: (q, signal) => api(`/admin/audit${qs(q)}`, { signal }),
};

const adminKeys = {
  me: ['admin', 'me'],
};

export function useAdminMe() {
  return useQuery({
    queryKey: adminKeys.me,
    queryFn: ({ signal }) => adminApi.me(signal),
    staleTime: 60_000,
  });
}

export function can(me, permission) {
  return !!me?.permissions.includes(permission);
}
