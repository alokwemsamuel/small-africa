import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaymentStart } from '@/features/checkout/usePaymentPopup';

export type TierKey = 'bronze' | 'silver' | 'gold' | 'black_diamond';

export interface Voucher {
  code: string;
  title: string;
  source: string;
  dineInOnly: boolean;
  expiresAt: string;
}

export interface Reward {
  slug: string;
  name: string;
  description: string;
  pointsCost: number;
  type: 'credit' | 'item' | 'upgrade';
  creditKobo: number | null;
  dineInOnly: boolean;
  affordable: boolean;
}

export interface LoyaltySummary {
  member: { name: string; since: string | null; birthdayWeek: boolean; hasBirthday: boolean };
  tier: {
    key: TierKey;
    name: string;
    multiplier: number;
    perks: string[];
    spend12mKobo: number;
    next: { key: TierKey; name: string; remainingKobo: number; progress: number } | null;
  };
  tiers: { key: TierKey; name: string; minSpendKobo: number; multiplier: number; perks: string[] }[];
  wallet: {
    balanceKobo: number;
    interest: {
      rateBp: number;
      capKobo: number;
      minBalanceKobo: number;
      lowestThisMonthKobo: number;
      projectedKobo: number;
      last: { amountKobo: number; period: string; at: string } | null;
    };
    topup: {
      presetsKobo: number[];
      minKobo: number;
      maxKobo: number;
      bonusBands: { minKobo: number; bonusBp: number }[];
    };
  };
  points: {
    balance: number;
    valueKobo: number;
    earnPer1000Naira: number;
    doublePointsWeekdays: number[];
    expiresAt: string | null;
    nextReward: { name: string; pointsCost: number; remaining: number } | null;
  };
  stampCard: {
    stamps: number;
    size: number;
    rewards: { stamp: number; reward: string }[];
    next: { stamp: number; reward: string; remaining: number } | null;
    lifetime: number;
  };
  streak: { month: string; count: number; target: number; bonusPoints: number };
  referral: {
    code: string | null;
    link: string | null;
    creditKobo: number;
    rewarded: number;
    pending: number;
  };
  rewards: Reward[];
  vouchers: Voucher[];
  offers: {
    id: number;
    kind: string;
    headline: string;
    message: string;
    couponCode: string | null;
    expiresAt: string | null;
  }[];
}

export interface LedgerEntry {
  id: number;
  type: string;
  direction: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reference: string | null;
  description: string;
  at: string;
}

export interface Topup {
  reference: string;
  amountKobo: number;
  bonusKobo: number;
  status: 'pending' | 'paid' | 'failed';
  paidAt: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
}

export const loyaltyKey = ['account', 'loyalty'] as const;

export const loyaltyApi = {
  summary: (signal?: AbortSignal) => api<LoyaltySummary>('/account/loyalty', { signal }),
  history: (kind: 'wallet' | 'points', before: number | null, signal?: AbortSignal) =>
    api<{ entries: LedgerEntry[]; nextBefore: number | null }>(
      `/account/loyalty/history?kind=${kind}${before ? `&before=${before}` : ''}`,
      { signal },
    ),
  startTopup: (amountNaira: number, idempotencyKey: string) =>
    api<{ topup: Topup; payment: PaymentStart | null }>('/account/wallet/topups', {
      method: 'POST',
      body: { amount_naira: amountNaira },
      idempotencyKey,
    }),
  verifyTopup: (reference: string) =>
    api<{ topup: Topup }>('/account/wallet/topups/verify', { method: 'POST', body: { reference } }).then(
      (r) => r.topup,
    ),
  simulateTopup: (reference: string, outcome: 'success' | 'failed' | 'abandoned') =>
    api<{ topup: Topup }>('/payments/simulate', { method: 'POST', body: { reference, outcome } }).then(
      (r) => r.topup,
    ),
  redeem: (slug: string, idempotencyKey: string) =>
    api<{ result: { type: string; creditKobo?: number; voucher?: Voucher }; account: LoyaltySummary }>(
      `/account/rewards/${encodeURIComponent(slug)}/redeem`,
      { method: 'POST', idempotencyKey },
    ),
  notifications: (signal?: AbortSignal) =>
    api<{ items: AppNotification[]; unread: number }>('/account/notifications', { signal }),
  markRead: (ids?: number[]) =>
    api<{ items: AppNotification[]; unread: number }>('/account/notifications/read', {
      method: 'POST',
      body: ids ? { ids } : {},
    }),
  catalog: (signal?: AbortSignal) =>
    api<{ rewards: Omit<Reward, 'affordable' | 'creditKobo'>[] }>('/rewards', { signal }).then(
      (r) => r.rewards,
    ),
};

export function useLoyalty(enabled = true) {
  return useQuery({ queryKey: loyaltyKey, queryFn: ({ signal }) => loyaltyApi.summary(signal), enabled });
}

export function useLoyaltyHistory(kind: 'wallet' | 'points', before: number | null) {
  return useQuery({
    queryKey: [...loyaltyKey, 'history', kind, before],
    queryFn: ({ signal }) => loyaltyApi.history(kind, before, signal),
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['account', 'notifications'],
    queryFn: ({ signal }) => loyaltyApi.notifications(signal),
    enabled,
    refetchInterval: enabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => loyaltyApi.markRead(ids),
    onSuccess: (r) => qc.setQueryData(['account', 'notifications'], r),
  });
}

export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => loyaltyApi.redeem(slug, crypto.randomUUID()),
    onSuccess: (r) => {
      qc.setQueryData(loyaltyKey, r.account);
      void qc.invalidateQueries({ queryKey: [...loyaltyKey, 'history'] });
      void qc.invalidateQueries({ queryKey: ['account', 'notifications'] });
    },
  });
}

/** Top-up bonus preview, mirroring the server (the server decides). */
export function bonusFor(amountKobo: number, bands: { minKobo: number; bonusBp: number }[]): number {
  const band = [...bands].sort((a, b) => b.minKobo - a.minKobo).find((b) => amountKobo >= b.minKobo);
  return band ? Math.floor((amountKobo * band.bonusBp) / 10000) : 0;
}
