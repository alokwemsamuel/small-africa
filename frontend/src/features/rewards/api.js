import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * The member's Interest Account (GET /account/loyalty). Money is integer kobo.
 *
 * @typedef {'bronze' | 'silver' | 'gold' | 'black_diamond'} TierKey
 *
 * @typedef {object} LoyaltySummary
 * @property {{ name: string, since: string | null, birthdayWeek: boolean, hasBirthday: boolean }} member
 * @property {{ key: TierKey, name: string, multiplier: number, perks: string[], spend12mKobo: number,
 *   next: { key: TierKey, name: string, remainingKobo: number, progress: number } | null }} tier
 * @property {{ balanceKobo: number, interest: { rateBp: number, capKobo: number, minBalanceKobo: number,
 *   lowestThisMonthKobo: number, projectedKobo: number, last: object | null },
 *   topup: { presetsKobo: number[], minKobo: number, maxKobo: number,
 *   bonusBands: { minKobo: number, bonusBp: number }[] } }} wallet dining credit
 * @property {{ balance: number, valueKobo: number, earnPer1000Naira: number, doublePointsWeekdays: number[],
 *   expiresAt: string | null, nextReward: object | null }} points
 * @property {{ stamps: number, size: number, rewards: { stamp: number, reward: string }[],
 *   next: object | null, lifetime: number }} stampCard
 * @property {{ month: string, count: number, target: number, bonusPoints: number }} streak
 * @property {{ code: string | null, link: string | null, creditKobo: number, rewarded: number,
 *   pending: number }} referral
 * @property {object[]} rewards the rewards menu, with `affordable`
 * @property {{ code: string, title: string, source: string, dineInOnly: boolean, expiresAt: string }[]} vouchers
 * @property {object[]} offers
 *
 * @typedef {object} Topup
 * @property {string} reference e.g. 'TU-4H7K2M'
 * @property {number} amountKobo
 * @property {number} bonusKobo extra dining credit from the bonus bands
 * @property {'pending' | 'paid' | 'failed'} status
 * @property {string | null} paidAt
 */

export const loyaltyKey = ['account', 'loyalty'];

export const loyaltyApi = {
  summary: (signal) => api('/account/loyalty', { signal }),
  history: (kind, before, signal) =>
    api(`/account/loyalty/history?kind=${kind}${before ? `&before=${before}` : ''}`, { signal }),
  startTopup: (amountNaira, idempotencyKey) =>
    api('/account/wallet/topups', {
      method: 'POST',
      body: { amount_naira: amountNaira },
      idempotencyKey,
    }),
  verifyTopup: (reference) =>
    api('/account/wallet/topups/verify', { method: 'POST', body: { reference } }).then((r) => r.topup),
  simulateTopup: (reference, outcome) =>
    api('/payments/simulate', { method: 'POST', body: { reference, outcome } }).then((r) => r.topup),
  redeem: (slug, idempotencyKey) =>
    api(`/account/rewards/${encodeURIComponent(slug)}/redeem`, { method: 'POST', idempotencyKey }),
  notifications: (signal) => api('/account/notifications', { signal }),
  markRead: (ids) =>
    api('/account/notifications/read', {
      method: 'POST',
      body: ids ? { ids } : {},
    }),
  catalog: (signal) => api('/rewards', { signal }).then((r) => r.rewards),
};

export function useLoyalty(enabled = true) {
  return useQuery({ queryKey: loyaltyKey, queryFn: ({ signal }) => loyaltyApi.summary(signal), enabled });
}

export function useLoyaltyHistory(kind, before) {
  return useQuery({
    queryKey: [...loyaltyKey, 'history', kind, before],
    queryFn: ({ signal }) => loyaltyApi.history(kind, before, signal),
  });
}

export function useNotifications(enabled) {
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
    mutationFn: (ids) => loyaltyApi.markRead(ids),
    onSuccess: (r) => qc.setQueryData(['account', 'notifications'], r),
  });
}

export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug) => loyaltyApi.redeem(slug, crypto.randomUUID()),
    onSuccess: (r) => {
      qc.setQueryData(loyaltyKey, r.account);
      void qc.invalidateQueries({ queryKey: [...loyaltyKey, 'history'] });
      void qc.invalidateQueries({ queryKey: ['account', 'notifications'] });
    },
  });
}

/**
 * Top-up bonus preview, mirroring the server (the server decides). The highest band the amount
 * reaches applies, rounded down to the kobo.
 * @param {number} amountKobo top-up amount
 * @param {{ minKobo: number, bonusBp: number }[]} bands bonusBp is basis points (500 = 5%)
 * @returns {number} bonus dining credit in kobo
 */
export function bonusFor(amountKobo, bands) {
  const band = [...bands].sort((a, b) => b.minKobo - a.minKobo).find((b) => amountKobo >= b.minKobo);
  return band ? Math.floor((amountKobo * band.bonusBp) / 10000) : 0;
}
