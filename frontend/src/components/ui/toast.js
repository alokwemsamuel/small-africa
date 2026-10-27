let toasts = [];
export const getToasts = () => toasts;
let nextId = 1;
export const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function toast(message, action) {
  toasts = [...toasts.slice(-2), { id: nextId++, message, action }];
  emit();
}

export function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
