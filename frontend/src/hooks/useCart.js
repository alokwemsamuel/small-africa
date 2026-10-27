import { useSyncExternalStore } from 'react';

/**
 * Persistent cart (localStorage: a UI convenience, never auth data).
 * Prices here are for display only; the server recalculates every total at checkout.
 *
 * @typedef {object} CartLine
 * @property {string} key dish + chosen options, so the same dish with different options is a separate line
 * @property {number} dishId
 * @property {string} slug
 * @property {string} name
 * @property {string | null} kitchen
 * @property {number} unitPriceKobo dish price + portion + add-ons, for display
 * @property {number} quantity 1–20
 * @property {number | null} portionId
 * @property {string | null} portionName
 * @property {number[]} addonIds
 * @property {string[]} addonNames
 * @property {boolean} containsPork
 * @property {string} [note]
 */

const STORAGE_KEY = 'sa-cart-v1';
const MAX_QTY = 20;
let lines = load();
const listeners = new Set();

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.dishId === 'number') : [];
  } catch {
    return [];
  }
}

function commit(next) {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: cart still works for this visit */
  }
  listeners.forEach((l) => l());
}

export function lineKey(dishId, portionId, addonIds) {
  return [dishId, portionId ?? 0, [...addonIds].sort((a, b) => a - b).join('.')].join(':');
}

export const cart = {
  add(line, quantity = 1) {
    const key = lineKey(line.dishId, line.portionId, line.addonIds);
    const existing = lines.find((l) => l.key === key);
    commit(
      existing
        ? lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l))
        : [...lines, { ...line, key, quantity: Math.min(MAX_QTY, quantity) }],
    );
  },
  setQuantity(key, quantity) {
    commit(
      quantity <= 0
        ? lines.filter((l) => l.key !== key)
        : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  },
  remove(key) {
    commit(lines.filter((l) => l.key !== key));
  },
  clear() {
    commit([]);
  },
  subscribe(fn) {
    listeners.add(fn);
    const onStorage = (e) => {
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

const EMPTY = [];
const serverSnapshot = () => EMPTY;

export function useCart() {
  // Pre-built pages show an empty basket; the saved one appears once React has attached.
  const items = useSyncExternalStore(cart.subscribe, cart.snapshot, serverSnapshot);
  const count = items.reduce((n, l) => n + l.quantity, 0);
  const subtotalKobo = items.reduce((n, l) => n + l.unitPriceKobo * l.quantity, 0);
  return { items, count, subtotalKobo };
}
