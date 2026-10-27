import { api } from './api';

/**
 * Data shapes from the API (all money in integer kobo; times 'YYYY-MM-DD HH:MM:SS', Lagos).
 *
 * @typedef {'pending_payment' | 'received' | 'preparing' | 'ready' | 'out_for_delivery'
 *   | 'delivered' | 'completed' | 'cancelled'} OrderStatus
 *
 * @typedef {object} Quote  Live checkout totals (POST /checkout/quote). The server decides every number.
 * @property {object[]} lines priced lines: name, unitPriceKobo, quantity, lineTotalKobo, portion, addons…
 * @property {number} subtotalKobo
 * @property {number} discountKobo coupon discount
 * @property {number} voucherDiscountKobo reward voucher (one free item)
 * @property {number} deliveryFeeKobo 0 with the Gold / Black Diamond free-delivery perk
 * @property {boolean} freeDeliveryPerk
 * @property {number} packagingFeeKobo
 * @property {number} serviceChargeKobo
 * @property {number} vatIncludedKobo VAT already inside the prices (for the receipt)
 * @property {number} totalKobo the whole bill
 * @property {number} walletBalanceKobo dining credit available
 * @property {number} walletAppliedKobo dining credit used on this order
 * @property {number} payableKobo left to pay by card (total − dining credit)
 * @property {'delivery' | 'pickup'} fulfilment
 * @property {{ slug: string, name: string, etaMinutes: number } | null} zone
 * @property {string | null} scheduledFor
 * @property {string} estimatedReadyAt ISO time
 * @property {{ id: number, code: string, description: string } | null} coupon
 * @property {{ id: number, code: string, title: string, discountKobo: number } | null} voucher
 *
 * @typedef {object} Order  An order as the guest sees it (tracking page, account).
 * @property {string} reference e.g. 'SA-7K2M9Q'
 * @property {OrderStatus} status
 * @property {'unpaid' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'} paymentStatus
 * @property {number} walletAppliedKobo paid with dining credit from the Interest Account wallet
 * @property {number} totalKobo paid by card (after dining credit)
 * @property {number} pointsEarned
 * @property {object[]} [items] with detail only
 * @property {{ status: OrderStatus, at: string }[]} [history] with detail only
 *
 * @typedef {object} PlacedOrder  Answer to POST /orders.
 * @property {Order} order
 * @property {{ provider: 'paystack' | 'simulated', reference: string, accessCode: string,
 *   authorizationUrl: string | null } | null} payment null when fully paid with dining credit
 * @property {string} trackingToken for the guest's tracking link
 * @property {string | null} publicKey Paystack public key (live Paystack only)
 */

/** Only identifiers and choices go to the server: never prices. */
function cartItems(lines) {
  return lines.map((l) => ({
    dish_id: l.dishId,
    quantity: l.quantity,
    portion_id: l.portionId,
    addon_ids: l.addonIds,
    note: l.note ?? null,
  }));
}

export const checkoutApi = {
  quote: (lines, req, signal) =>
    api('/checkout/quote', {
      method: 'POST',
      body: { ...req, items: cartItems(lines) },
      signal,
    }).then((r) => r.quote),
  place: (lines, req, idempotencyKey) =>
    api('/orders', {
      method: 'POST',
      body: { ...req, items: cartItems(lines) },
      idempotencyKey,
    }),
  verify: (reference) =>
    api('/payments/verify', { method: 'POST', body: { reference } }).then((r) => r.order),
  simulate: (reference, outcome) =>
    api('/payments/simulate', { method: 'POST', body: { reference, outcome } }).then((r) => r.order),
  track: (reference, token, signal) =>
    api(`/orders/${encodeURIComponent(reference)}${token ? `?t=${encodeURIComponent(token)}` : ''}`, {
      signal,
    }).then((r) => r.order),
};
