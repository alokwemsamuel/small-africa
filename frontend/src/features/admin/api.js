import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Order, OrderStatus } from '@/features/checkout/api';
import type { LedgerEntry, LoyaltySummary, TierKey } from '@/features/rewards/api';

export type Permission =
  | 'dashboard.view'
  | 'orders.view'
  | 'orders.status'
  | 'orders.refund'
  | 'reservations.manage'
  | 'reservations.capacity'
  | 'menu.manage'
  | 'menu.availability'
  | 'customers.view'
  | 'customers.visits'
  | 'loyalty.manage'
  | 'loyalty.adjust'
  | 'loyalty.interest'
  | 'reviews.moderate'
  | 'coupons.manage'
  | 'enquiries.manage'
  | 'staff.manage'
  | 'settings.manage'
  | 'audit.view';

export interface AdminMe {
  permissions: Permission[];
  role: 'super_admin' | 'manager' | 'staff';
  staffPosition: 'kitchen' | 'front_desk' | null;
  twoFactorEnabled: boolean;
  demoTools: boolean;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
}

export interface Kpi {
  revenueKobo: number;
  orders: number;
  reservations: number;
  covers: number;
  averageOrderKobo: number;
}

export interface Dashboard {
  today: Kpi;
  yesterday: Kpi;
  period: Kpi & { days: number };
  series: { date: string; revenueKobo: number; orders: number; reservations: number }[];
  topDishes: { name: string; quantity: number; revenueKobo: number }[];
  byKitchen: { kitchen: string; revenueKobo: number }[];
  live: LiveOrder[];
  pending: { reviews: number; enquiries: number; messages: number };
  loyalty: { members: number; walletKobo: number; points: number };
  generatedAt: string;
}

export interface LiveOrder {
  reference: string;
  status: OrderStatus;
  fulfilment: 'delivery' | 'pickup';
  customerName: string;
  totalKobo: number;
  items: number;
  placedAt: string;
  scheduledFor: string | null;
}

export interface AdminOrderRow extends LiveOrder {
  paymentStatus: Order['paymentStatus'];
  refundFlag: boolean;
}

export interface AdminOrder extends Order {
  customer: { name: string; email: string; phone: string; userId: number | null; tier: TierKey | null };
  address: { line1: string; line2?: string | null; landmark?: string | null; area?: string | null } | null;
  notes: string | null;
  refundFlag: boolean;
  cancelledReason: string | null;
  coupon: string | null;
  history: { status: OrderStatus; at: string; note: string | null; by: string | null }[];
  payments: {
    reference: string;
    provider: string;
    amountKobo: number;
    status: string;
    verifiedAt: string | null;
  }[];
  nextStatuses: OrderStatus[];
}

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface AdminReservation {
  code: string;
  status: ReservationStatus;
  date: string;
  time: string;
  partySize: number;
  area: { slug: string; name: string };
  tableLabel: string | null;
  occasion: string;
  notes: string | null;
  guest: { name: string; email: string; phone: string; userId: number | null; tier: TierKey | null };
  cancelledReason: string | null;
  nextStatuses: ReservationStatus[];
  createdAt: string;
}

export interface Capacity {
  date: string;
  slots: string[];
  areas: {
    slug: string;
    name: string;
    defaultCovers: number;
    slots: {
      time: string;
      covers: number;
      booked: number;
      override: { id: number; reason: string | null; wholeDay: boolean } | null;
    }[];
  }[];
}

export interface AdminDishOption {
  id?: number;
  group: 'portion' | 'addon';
  name: string;
  priceDeltaKobo: number;
  isDefault: boolean;
}

export interface AdminDish {
  id: number;
  slug: string;
  name: string;
  kitchenId: number | null;
  categoryId: number;
  shortDescription: string;
  description: string;
  ingredients: string | null;
  allergens: string[];
  priceKobo: number;
  spiceLevel: number;
  isVegetarian: boolean;
  isGlutenFree: boolean;
  containsNuts: boolean;
  containsPork: boolean;
  isAlcoholic: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  soldOutToday: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
  popularity: number;
  options: AdminDishOption[];
}

export interface AdminMenu {
  kitchens: { id: number; slug: string; name: string; tagline: string; description: string }[];
  categories: { id: number; slug: string; name: string; sortOrder: number }[];
  dishes: AdminDish[];
}

export interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  tier: TierKey;
  walletKobo: number;
  points: number;
  spend12mKobo: number;
  orders: number;
  lastActivityAt: string | null;
  joinedAt: string;
  isActive: boolean;
}

export interface CustomerDetail {
  customer: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    emailVerified: boolean;
    birthday: string | null;
    marketingOptIn: boolean;
    referralCode: string | null;
    joinedAt: string;
    isActive: boolean;
  };
  loyalty: LoyaltySummary;
  orders: {
    reference: string;
    status: OrderStatus;
    placedAt: string | null;
    totalKobo: number;
    fulfilment: string;
  }[];
  visits: { reference: string; amountKobo: number; points: number; at: string; note: string | null }[];
  reservations: { code: string; date: string; time: string; partySize: number; status: ReservationStatus }[];
  canAdjust: boolean;
}

export interface LoyaltySettings {
  earn_points_per_1000_naira: number;
  double_points_weekdays: number[];
  featured_dish_points_multiplier: number;
  redeem_points_per_1000_naira: number;
  min_points_to_redeem: number;
  topup_presets_naira: number[];
  topup_min_naira: number;
  topup_max_naira: number;
  topup_bonus_tiers: { min_naira: number; bonus_bp: number }[];
  interest_rate_bp: number;
  interest_cap_naira: number;
  interest_min_balance_naira: number;
  tiers: { key: TierKey; name: string; min_spend_naira: number; multiplier: number; perks: string[] }[];
  stamp_rewards: { stamp: number; reward: string; category: string }[];
  free_delivery_tiers: TierKey[];
  streak_visits_per_month: number;
  streak_bonus_points: number;
  birthday_points_multiplier: number;
  anniversary_points: number;
  referral_credit_naira: number;
  referral_max_per_month: number;
  points_expiry_months: number;
  points_expiry_warning_days: number;
  winback_after_days: number;
  winback_offer_percent: number;
}

export interface AdminReward {
  id: number;
  slug: string;
  name: string;
  description: string;
  pointsCost: number;
  type: 'credit' | 'item' | 'upgrade';
  creditKobo: number | null;
  dishId: number | null;
  categorySlug: string | null;
  dineInOnly: boolean;
  isActive: boolean;
  sortOrder: number;
  redeemed: number;
}

export interface InterestRun {
  period: string;
  status: 'running' | 'completed' | 'failed';
  accounts: number;
  totalKobo: number;
  trigger: 'cron' | 'admin' | 'demo';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface LoyaltyAnalytics {
  members: number;
  activeMembers90d: number;
  repeatRate90d: number;
  last30d: {
    creditIssuedKobo: {
      topups: number;
      bonuses: number;
      interest: number;
      referrals: number;
      rewards: number;
      adjustments: number;
    };
    creditSpentKobo: number;
    totalIssuedKobo: number;
    pointsIssued: number;
    pointsRedeemed: number;
    pointsExpired: number;
  };
  outstanding: { walletKobo: number; points: number };
  tiers: { key: TierKey; members: number }[];
  topMembers: {
    id: number;
    name: string;
    tier: TierKey;
    spend12mKobo: number;
    walletKobo: number;
    points: number;
  }[];
  interestRuns: InterestRun[];
}

export interface AdminLedgerRow extends LedgerEntry {
  member: { id: number; name: string };
  by: string | null;
}

export interface AdminReview {
  id: number;
  author: string;
  dish: string | null;
  orderReference: string | null;
  rating: number;
  title: string | null;
  body: string;
  status: 'pending' | 'approved' | 'hidden';
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  verified: boolean;
}

export interface Coupon {
  id: number;
  code: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderKobo: number;
  maxDiscountKobo: number | null;
  kitchenId: number | null;
  validWeekdays: number[] | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  firstOrderOnly: boolean;
  timesUsed: number;
  isActive: boolean;
  live: boolean;
  personal: boolean;
}

export interface Enquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  eventType: string;
  package: string | null;
  eventDate: string;
  guests: number;
  budgetKobo: number | null;
  message: string | null;
  status: 'new' | 'contacted' | 'quoted' | 'booked' | 'closed';
  createdAt: string;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived';
  createdAt: string;
}

export interface StaffMember {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'super_admin' | 'manager' | 'staff';
  staffPosition: 'kitchen' | 'front_desk' | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
}

export interface AdminSettings {
  groups: {
    restaurant: Record<string, string>;
    pricing: {
      prices_include_vat: boolean;
      vat_rate_bp: number;
      service_charge_dine_in_bp: number;
      service_charge_online_bp: number;
      packaging_fee_kobo: number;
    };
    ordering: {
      accepting_orders: boolean;
      min_lead_minutes: number;
      max_schedule_days: number;
      max_items_per_order: number;
    };
    reservations: {
      min_advance_minutes: number;
      max_days_ahead: number;
      max_party_online: number;
      dining_duration_minutes: number;
    };
  };
  hours: { dayOfWeek: number; opensAt: string | null; closesAt: string | null; isClosed: boolean }[];
  zones: {
    id: number;
    slug: string;
    name: string;
    feeKobo: number;
    minOrderKobo: number;
    etaMinutes: number;
    isActive: boolean;
  }[];
  seating: {
    id: number;
    slug: string;
    name: string;
    description: string;
    coversPerSlot: number;
    minParty: number;
    maxParty: number;
    isActive: boolean;
  }[];
}

export interface AuditEntry {
  id: number;
  action: string;
  actor: { id: number; name: string; role: string } | null;
  entityType: string | null;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

const qs = (params: Record<string, string | number | null | undefined | boolean>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

type Q = Record<string, string | number | null | undefined | boolean>;

export const adminApi = {
  me: (signal?: AbortSignal) => api<AdminMe>('/admin/me', { signal }),
  dashboard: (days: 7 | 30, signal?: AbortSignal) =>
    api<Dashboard>(`/admin/dashboard?days=${days}`, { signal }),

  orders: (q: Q, signal?: AbortSignal) => api<Paged<AdminOrderRow>>(`/admin/orders${qs(q)}`, { signal }),
  order: (ref: string, signal?: AbortSignal) =>
    api<{ order: AdminOrder }>(`/admin/orders/${ref}`, { signal }).then((r) => r.order),
  setOrderStatus: (ref: string, status: OrderStatus, note?: string) =>
    api<{ order: AdminOrder }>(`/admin/orders/${ref}/status`, {
      method: 'POST',
      body: { status, note: note || null },
    }).then((r) => r.order),
  refundFlag: (ref: string, flag: boolean, reason: string) =>
    api<{ order: AdminOrder }>(`/admin/orders/${ref}/refund-flag`, {
      method: 'POST',
      body: { flag, reason },
    }).then((r) => r.order),

  reservations: (q: Q, signal?: AbortSignal) =>
    api<{
      from: string;
      to: string;
      reservations: AdminReservation[];
      areas: { slug: string; name: string; coversPerSlot: number }[];
    }>(`/admin/reservations${qs(q)}`, { signal }),
  updateReservation: (code: string, body: Record<string, unknown>) =>
    api<{ reservation: AdminReservation }>(`/admin/reservations/${code}`, { method: 'PATCH', body }).then(
      (r) => r.reservation,
    ),
  capacity: (date: string, signal?: AbortSignal) => api<Capacity>(`/admin/capacity?date=${date}`, { signal }),
  setCapacity: (body: {
    date: string;
    area: string;
    time?: string | null;
    covers: number;
    reason?: string | null;
  }) => api<Capacity>('/admin/capacity', { method: 'PUT', body }),
  clearCapacity: (id: number) => api<Capacity>(`/admin/capacity/${id}`, { method: 'DELETE' }),

  menu: (signal?: AbortSignal) => api<AdminMenu>('/admin/menu', { signal }),
  createDish: (body: Record<string, unknown>) => api<AdminMenu>('/admin/dishes', { method: 'POST', body }),
  updateDish: (id: number, body: Record<string, unknown>) =>
    api<AdminMenu>(`/admin/dishes/${id}`, { method: 'PATCH', body }),
  deleteDish: (id: number) => api<AdminMenu>(`/admin/dishes/${id}`, { method: 'DELETE' }),
  dishAvailability: (id: number, body: { sold_out_today?: boolean; available?: boolean }) =>
    api<AdminMenu>(`/admin/dishes/${id}/availability`, { method: 'POST', body }),
  uploadDishImage: (id: number, file: File, alt: string) => {
    const form = new FormData();
    form.append('image', file);
    form.append('alt', alt);
    return api<AdminMenu>(`/admin/dishes/${id}/image`, { method: 'POST', formData: form });
  },
  removeDishImage: (id: number) => api<AdminMenu>(`/admin/dishes/${id}/image`, { method: 'DELETE' }),
  saveCategory: (body: { name: string; sort_order?: number }, id?: number) =>
    api<AdminMenu>(id ? `/admin/categories/${id}` : '/admin/categories', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  saveKitchen: (id: number, body: { name: string; tagline: string; description: string }) =>
    api<AdminMenu>(`/admin/kitchens/${id}`, { method: 'PATCH', body }),

  customers: (q: Q, signal?: AbortSignal) => api<Paged<CustomerRow>>(`/admin/customers${qs(q)}`, { signal }),
  customer: (id: number, signal?: AbortSignal) => api<CustomerDetail>(`/admin/customers/${id}`, { signal }),
  customerHistory: (id: number, kind: 'wallet' | 'points', before: number | null, signal?: AbortSignal) =>
    api<{ entries: LedgerEntry[]; nextBefore: number | null }>(
      `/admin/customers/${id}/history${qs({ kind, before })}`,
      { signal },
    ),
  recordVisit: (id: number, amountNaira: number, note?: string) =>
    api<{ visit: { reference: string; points: number } }>(`/admin/customers/${id}/visits`, {
      method: 'POST',
      body: { amount_naira: amountNaira, note: note || null },
    }),
  adjust: (
    id: number,
    body: { kind: 'wallet' | 'points'; direction: 'credit' | 'debit'; amount: number; reason: string },
  ) => api<{ balanceAfter: number }>(`/admin/customers/${id}/adjust`, { method: 'POST', body }),

  loyaltySettings: (signal?: AbortSignal) =>
    api<{ settings: LoyaltySettings; categories: { slug: string; name: string }[]; rewards: AdminReward[] }>(
      '/admin/loyalty/settings',
      { signal },
    ),
  saveLoyaltySettings: (settings: LoyaltySettings) =>
    api<{ settings: LoyaltySettings; categories: { slug: string; name: string }[]; rewards: AdminReward[] }>(
      '/admin/loyalty/settings',
      {
        method: 'PUT',
        body: settings,
      },
    ),
  saveReward: (body: Record<string, unknown>, id?: number) =>
    api<{ rewards: AdminReward[] }>(id ? `/admin/loyalty/rewards/${id}` : '/admin/loyalty/rewards', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  loyaltyAnalytics: (signal?: AbortSignal) => api<LoyaltyAnalytics>('/admin/loyalty/analytics', { signal }),
  loyaltyLedger: (q: Q, signal?: AbortSignal) =>
    api<Paged<AdminLedgerRow> & { kind: string }>(`/admin/loyalty/ledger${qs(q)}`, { signal }),
  runInterest: (period: string) =>
    api<{
      result: { period: string; accountsCredited: number; totalKobo: number };
      interestRuns: InterestRun[];
    }>('/admin/loyalty/interest-runs', {
      method: 'POST',
      body: { period },
    }),
  simulateInterest: () =>
    api<{
      result: { period: string; accountsCredited: number; totalKobo: number };
      interestRuns: InterestRun[];
    }>('/admin/loyalty/interest-runs/simulate', { method: 'POST' }),

  reviews: (q: Q, signal?: AbortSignal) => api<Paged<AdminReview>>(`/admin/reviews${qs(q)}`, { signal }),
  moderateReview: (id: number, body: { status?: string; reply?: string | null }) =>
    api<{ review: AdminReview }>(`/admin/reviews/${id}`, { method: 'PATCH', body }).then((r) => r.review),
  coupons: (signal?: AbortSignal) =>
    api<{ coupons: Coupon[] }>('/admin/coupons', { signal }).then((r) => r.coupons),
  saveCoupon: (body: Record<string, unknown>, id?: number) =>
    api<{ coupons: Coupon[] }>(id ? `/admin/coupons/${id}` : '/admin/coupons', {
      method: id ? 'PATCH' : 'POST',
      body,
    }).then((r) => r.coupons),
  expireCoupon: (id: number) =>
    api<{ coupons: Coupon[] }>(`/admin/coupons/${id}/expire`, { method: 'POST' }).then((r) => r.coupons),
  enquiries: (q: Q, signal?: AbortSignal) => api<Paged<Enquiry>>(`/admin/enquiries${qs(q)}`, { signal }),
  updateEnquiry: (id: number, status: Enquiry['status']) =>
    api<{ ok: true }>(`/admin/enquiries/${id}`, { method: 'PATCH', body: { status } }),
  messages: (q: Q, signal?: AbortSignal) => api<Paged<ContactMessage>>(`/admin/messages${qs(q)}`, { signal }),
  updateMessage: (id: number, status: ContactMessage['status']) =>
    api<{ ok: true }>(`/admin/messages/${id}`, { method: 'PATCH', body: { status } }),

  staff: (signal?: AbortSignal) =>
    api<{ staff: StaffMember[] }>('/admin/staff', { signal }).then((r) => r.staff),
  createStaff: (body: Record<string, unknown>) =>
    api<{ staff: StaffMember[] }>('/admin/staff', { method: 'POST', body }).then((r) => r.staff),
  updateStaff: (id: number, body: Record<string, unknown>) =>
    api<{ staff: StaffMember[] }>(`/admin/staff/${id}`, { method: 'PATCH', body }).then((r) => r.staff),
  resetStaff2fa: (id: number) =>
    api<{ staff: StaffMember[] }>(`/admin/staff/${id}/reset-2fa`, { method: 'POST' }).then((r) => r.staff),
  resendInvite: (id: number) => api<{ ok: true }>(`/admin/staff/${id}/invite`, { method: 'POST' }),

  settings: (signal?: AbortSignal) => api<AdminSettings>('/admin/settings', { signal }),
  saveSettingsGroup: (group: keyof AdminSettings['groups'], body: Record<string, unknown>) =>
    api<AdminSettings>(`/admin/settings/${group}`, { method: 'PUT', body }),
  saveHours: (
    hours: { day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }[],
  ) => api<AdminSettings>('/admin/settings/hours', { method: 'PUT', body: { hours } }),
  saveZone: (body: Record<string, unknown>, id?: number) =>
    api<AdminSettings>(id ? `/admin/settings/zones/${id}` : '/admin/settings/zones', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  saveSeating: (id: number, body: Record<string, unknown>) =>
    api<AdminSettings>(`/admin/settings/seating/${id}`, { method: 'PATCH', body }),

  audit: (q: Q, signal?: AbortSignal) => api<Paged<AuditEntry>>(`/admin/audit${qs(q)}`, { signal }),
};

export const adminKeys = {
  me: ['admin', 'me'] as const,
};

export function useAdminMe() {
  return useQuery({
    queryKey: adminKeys.me,
    queryFn: ({ signal }) => adminApi.me(signal),
    staleTime: 60_000,
  });
}

export function can(me: AdminMe | undefined, permission: Permission): boolean {
  return !!me?.permissions.includes(permission);
}
