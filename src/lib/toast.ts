export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((l) => l([..._toasts]));
}

function _add(message: string, type: ToastType) {
  const id = Math.random().toString(36).slice(2, 9);
  _toasts = [..._toasts, { id, message, type }];
  _notify();
  setTimeout(() => _remove(id), 4000);
}

function _remove(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();
}

export const toast = {
  success: (message: string) => _add(message, 'success'),
  error: (message: string) => _add(message, 'error'),
  info: (message: string) => _add(message, 'info'),
  dismiss: (id: string) => _remove(id),
};

export function subscribeToToasts(listener: Listener): () => void {
  _listeners.add(listener);
  listener([..._toasts]);
  return () => _listeners.delete(listener);
}

