export interface Toast {
  id: number;
  message: string;
  action?: { label: string; to: string };
}

let toasts: Toast[] = [];
export const getToasts = () => toasts;
let nextId = 1;
export const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, action?: Toast['action']) {
  toasts = [...toasts.slice(-2), { id: nextId++, message, action }];
  emit();
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
