import { sql } from './time';

/**
 * The demo's database: the API's tables as arrays of rows (snake_case columns, kobo amounts,
 * 'YYYY-MM-DD HH:MM:SS' Lagos times), kept in this browser's localStorage. Rows are untyped on
 * purpose: they mirror SQL rows, and the handlers port PHP code that reads them the same way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface DemoState {
  version: number;
  /** Lagos date the data was built for: a new day rebuilds it, so "today" is always busy. */
  builtOn: string;
  tables: Record<string, Row[]>;
  nextId: Record<string, number>;
  /** The signed-in demo user (the real API keeps this in a server-side session). */
  userId: number | null;
  /** SHA-256 of salt + password for accounts that can sign in. Demo only. */
  passwords: Record<number, string>;
}

export const STATE_VERSION = 1;
const STORAGE_KEY = 'sa-demo-db-v1';

/** Column defaults from the migrations, for the columns the handlers rely on. */
const DEFAULTS: Record<string, Row> = {
  users: {
    staff_position: null,
    phone: null,
    email_verified_at: null,
    birthday: null,
    favourite_kitchen_id: null,
    referral_code: null,
    referred_by_user_id: null,
    marketing_opt_in: 0,
    theme_preference: null,
    totp_enabled_at: null,
    last_login_at: null,
    locked_until: null,
    failed_logins: 0,
    is_active: 1,
  },
  loyalty_accounts: {
    tier: 'bronze',
    wallet_balance_kobo: 0,
    points_balance: 0,
    stamps: 0,
    lifetime_stamps: 0,
    streak_month: null,
    streak_count: 0,
    spend_12m_kobo: 0,
    last_activity_at: null,
    tier_updated_at: null,
  },
  orders: {
    user_id: null,
    delivery_zone_id: null,
    address_snapshot: null,
    scheduled_for: null,
    refund_flag: 0,
    discount_kobo: 0,
    voucher_discount_kobo: 0,
    service_charge_kobo: 0,
    wallet_applied_kobo: 0,
    coupon_id: null,
    voucher_id: null,
    notes: null,
    points_earned: 0,
    loyalty_processed_at: null,
    idempotency_key: null,
    placed_at: null,
    cancelled_reason: null,
  },
  order_items: { notes: null },
  order_status_history: { note: null, changed_by_user_id: null },
  payments: {
    user_id: null,
    attempt: 1,
    access_code: null,
    authorization_url: null,
    verified_at: null,
    provider_payload: null,
  },
  reservations: {
    user_id: null,
    table_label: null,
    cancelled_reason: null,
    notes: null,
    occasion: 'none',
  },
  reviews: { user_id: null, order_id: null, dish_id: null, title: null, admin_reply: null, replied_at: null },
  reward_vouchers: {
    status: 'issued',
    used_order_id: null,
    reward_id: null,
    dish_id: null,
    category_slug: null,
  },
  wallet_topups: { status: 'pending', paid_at: null, idempotency_key: null },
  wallet_ledger: { reference: null, idempotency_key: null, created_by_user_id: null },
  points_ledger: { reference: null, idempotency_key: null, created_by_user_id: null },
  notifications: { read_at: null, data: null },
  event_enquiries: {
    status: 'new',
    user_id: null,
    company: null,
    package_id: null,
    budget_kobo: null,
    message: null,
  },
  contact_messages: { status: 'new', phone: null },
  dine_in_visits: { points_earned: 0, note: null },
  coupons: {
    times_used: 0,
    is_active: 1,
    min_order_kobo: 0,
    max_discount_kobo: null,
    kitchen_id: null,
    valid_weekdays: null,
    starts_at: null,
    ends_at: null,
    usage_limit: null,
    per_user_limit: null,
    first_order_only: 0,
  },
  dishes: {
    kitchen_id: null,
    ingredients: null,
    allergens: null,
    spice_level: 0,
    is_vegetarian: 0,
    is_gluten_free: 0,
    contains_nuts: 0,
    contains_pork: 0,
    is_alcoholic: 0,
    is_featured: 0,
    is_available: 1,
    sold_out_until: null,
    image_path: null,
    image_alt: null,
    sort_order: 0,
    popularity: 0,
    deleted_at: null,
  },
  rewards_catalog: {
    is_active: 1,
    dine_in_only: 0,
    sort_order: 0,
    credit_kobo: null,
    dish_id: null,
    category_slug: null,
  },
  delivery_zones: { is_active: 1 },
  interest_runs: {
    accounts_credited: 0,
    total_kobo: 0,
    finished_at: null,
    error: null,
    run_by_user_id: null,
  },
  referrals: { status: 'pending', reject_reason: null, qualifying_order_id: null, rewarded_at: null },
  capacity_overrides: { start_time: null, reason: null },
  audit_logs: { actor_user_id: null, entity_type: null, entity_id: null, meta: null, ip: null },
};

/** Tables with no `id` column (keyed some other way). */
const NO_ID = new Set(['loyalty_accounts', 'settings', 'opening_hours']);

let state: DemoState | null = null;

export function setState(next: DemoState): void {
  state = next;
}

export function getState(): DemoState {
  if (!state) throw new Error('Demo database not loaded');
  return state;
}

export const db = {
  all(table: string): Row[] {
    const s = getState();
    return (s.tables[table] ??= []);
  },
  find(table: string, pred: (r: Row) => boolean): Row | null {
    return db.all(table).find(pred) ?? null;
  },
  where(table: string, pred: (r: Row) => boolean): Row[] {
    return db.all(table).filter(pred);
  },
  byId(table: string, id: unknown): Row | null {
    return id === null || id === undefined ? null : db.find(table, (r) => r.id === Number(id));
  },
  /** Inserts a row with the table's defaults, a new id and created_at; returns the stored row. */
  insert(table: string, values: Row): Row {
    const s = getState();
    const row: Row = { ...DEFAULTS[table], created_at: sql(), ...values };
    if (!NO_ID.has(table) && row.id === undefined) {
      row.id = s.nextId[table] ?? 1;
      s.nextId[table] = row.id + 1;
    }
    db.all(table).push(row);
    return row;
  },
  delete(table: string, pred: (r: Row) => boolean): void {
    const s = getState();
    s.tables[table] = db.all(table).filter((r) => !pred(r));
  },
  /** JSON settings group (the `settings` table), like Settings::group(). */
  settings(group: string): Row {
    const row = db.find('settings', (r) => r.setting_key === group);
    return row ? (JSON.parse(row.setting_value) as Row) : {};
  },
  saveSettings(group: string, value: Row): void {
    const row = db.find('settings', (r) => r.setting_key === group);
    if (row) row.setting_value = JSON.stringify(value);
    else db.insert('settings', { setting_key: group, setting_value: JSON.stringify(value) });
  },
};

/** Next free id for every table, after loading rows that already carry ids. */
export function nextIds(tables: Record<string, Row[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    out[name] = rows.reduce((max, r) => (typeof r.id === 'number' && r.id >= max ? r.id + 1 : max), 1);
  }
  return out;
}

export function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getState()));
  } catch {
    // Storage full or blocked (private mode): the demo keeps working for this visit.
  }
}

export function loadPersisted(): DemoState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoState) : null;
    return parsed && parsed.version === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPersisted(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
