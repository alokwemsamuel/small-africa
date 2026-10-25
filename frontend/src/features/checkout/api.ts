import { api } from '@/lib/api';
import type { CartLine } from '@/features/cart/cart';

export interface QuoteLine {
  dishId: number;
  slug: string;
  name: string;
  kitchen: string | null;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
  portion: { id: number; name: string } | null;
  addons: { id: number; name: string }[];
  note: string | null;
  containsPork: boolean;
  isAlcoholic: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalKobo: number;
  discountKobo: number;
  coupon: { id: number; code: string; description: string } | null;
  deliveryFeeKobo: number;
  packagingFeeKobo: number;
  serviceChargeKobo: number;
  vatIncludedKobo: number;
  totalKobo: number;
  fulfilment: 'delivery' | 'pickup';
  zone: { slug: string; name: string; etaMinutes: number } | null;
  scheduledFor: string | null;
  estimatedReadyAt: string;
}

export type OrderStatus =
  | 'pending_payment'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface Order {
  reference: string;
  status: OrderStatus;
  paymentStatus: 'unpaid' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  fulfilment: 'delivery' | 'pickup';
  zone: { name: string; etaMinutes: number } | null;
  scheduledFor: string | null;
  placedAt: string | null;
  createdAt: string;
  customerName: string;
  subtotalKobo: number;
  discountKobo: number;
  deliveryFeeKobo: number;
  serviceChargeKobo: number;
  vatIncludedKobo: number;
  totalKobo: number;
  items?: {
    dishId: number | null;
    slug: string | null;
    name: string;
    quantity: number;
    unitPriceKobo: number;
    lineTotalKobo: number;
    portion: { id: number; name: string } | null;
    addons: { id: number; name: string }[];
    containsPork: boolean;
    note: string | null;
  }[];
  history?: { status: OrderStatus; at: string }[];
  deliveryArea?: string | null;
  reviewable?: boolean;
}

export interface CheckoutRequest {
  fulfilment: 'delivery' | 'pickup';
  zone?: string | null;
  scheduled_for?: string | null;
  coupon_code?: string | null;
  confirm_age?: boolean;
  email?: string | null;
  name?: string;
  phone?: string;
  notes?: string | null;
  save_address?: boolean;
  address?: {
    line1: string;
    line2?: string | null;
    landmark?: string | null;
    area?: string | null;
    label?: string | null;
  };
}

export interface PlacedOrder {
  order: Order;
  payment: {
    provider: 'paystack' | 'simulated';
    reference: string;
    accessCode: string;
    authorizationUrl: string | null;
  } | null;
  trackingToken: string;
  publicKey: string | null;
}

/** Only identifiers and choices go to the server: never prices. */
export function cartItems(lines: CartLine[]) {
  return lines.map((l) => ({
    dish_id: l.dishId,
    quantity: l.quantity,
    portion_id: l.portionId,
    addon_ids: l.addonIds,
    note: l.note ?? null,
  }));
}

export const checkoutApi = {
  quote: (lines: CartLine[], req: CheckoutRequest, signal?: AbortSignal) =>
    api<{ quote: Quote }>('/checkout/quote', {
      method: 'POST',
      body: { ...req, items: cartItems(lines) },
      signal,
    }).then((r) => r.quote),
  place: (lines: CartLine[], req: CheckoutRequest, idempotencyKey: string) =>
    api<PlacedOrder>('/orders', {
      method: 'POST',
      body: { ...req, items: cartItems(lines) },
      idempotencyKey,
    }),
  verify: (reference: string) =>
    api<{ order: Order }>('/payments/verify', { method: 'POST', body: { reference } }).then((r) => r.order),
  simulate: (reference: string, outcome: 'success' | 'failed' | 'abandoned') =>
    api<{ order: Order }>('/payments/simulate', { method: 'POST', body: { reference, outcome } }).then(
      (r) => r.order,
    ),
  track: (reference: string, token: string | null, signal?: AbortSignal) =>
    api<{ order: Order }>(
      `/orders/${encodeURIComponent(reference)}${token ? `?t=${encodeURIComponent(token)}` : ''}`,
      {
        signal,
      },
    ).then((r) => r.order),
};
