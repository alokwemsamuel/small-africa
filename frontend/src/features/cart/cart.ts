import { useSyncExternalStore } from 'react';

/**
 * Persistent cart (localStorage: a UI convenience, never auth data).
 * Prices here are for display only; the server recalculates every total at checkout.
 */
export interface CartLine {
  key: string; // dish + chosen options, so the same dish with different options is a separate line
  dishId: number;
  slug: string;
  name: string;
  kitchen: string | null;
  unitPriceKobo: number;
  quantity: number;
  portionId: number | null;
  portionName: string | null;
  addonIds: number[];
  addonNames: string[];
  containsPork: boolean;
  note?: string;
}

const STORAGE_KEY = 'sa-cart-v1';
const MAX_QTY = 20;
let lines: CartLine[] = load();
const listeners = new Set<() => void>();

function load(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => typeof l?.dishId === 'number') : [];
  } catch {
    return [];
  }
}

function commit(next: CartLine[]) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: cart still works for this visit */
  }
  listeners.forEach((l) => l());
}

export function lineKey(dishId: number, portionId: number | null, addonIds: number[]): string {
  return [dishId, portionId ?? 0, [...addonIds].sort((a, b) => a - b).join('.')].join(':');
}

export const cart = {
  add(line: Omit<CartLine, 'key' | 'quantity'>, quantity = 1) {
    const key = lineKey(line.dishId, line.portionId, line.addonIds);
    const existing = lines.find((l) => l.key === key);
    commit(
      existing
        ? lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l))
        : [...lines, { ...line, key, quantity: Math.min(MAX_QTY, quantity) }],
    );
  },
  setQuantity(key: string, quantity: number) {
    commit(
      quantity <= 0
        ? lines.filter((l) => l.key !== key)
        : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  },
  remove(key: string) {
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit([]);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        lines = load();
        fn();
      }
    };
    window.addEventListener('storage', onStorage); // keep tabs in sync
    return () => {
      listeners.delete(fn);
      window.removeEventListener('storage', onStorage);
    };
  },
  snapshot: () => lines,
};

export function useCart() {
  const items = useSyncExternalStore(cart.subscribe, cart.snapshot, cart.snapshot);
  const count = items.reduce((n, l) => n + l.quantity, 0);
  const subtotalKobo = items.reduce((n, l) => n + l.unitPriceKobo * l.quantity, 0);
  return { items, count, subtotalKobo };
}
