export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** A button on the toast, e.g. "Undo". Clicking it runs `run` and closes the toast. */
  action?: { label: string; run: () => void };
}

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach((l) => l([..._toasts]));
}

function _add(message: string, type: ToastType, action?: ToastItem["action"], ms = 4000) {
  const id = Math.random().toString(36).slice(2, 9);
  _toasts = [..._toasts, { id, message, type, action }];
  _notify();
  setTimeout(() => _remove(id), ms);
  return id;
}

function _remove(id: string) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _notify();
}

export const toast = {
  success: (message: string) => _add(message, 'success'),
  error: (message: string) => _add(message, 'error'),
  info: (message: string) => _add(message, 'info'),
  /** Shows a toast with an action button that stays a little longer. Returns its id. */
  withAction: (message: string, label: string, run: () => void, ms = 8000) => _add(message, 'info', { label, run }, ms),
  dismiss: (id: string) => _remove(id),
};

export function subscribeToToasts(listener: Listener): () => void {
  _listeners.add(listener);
  listener([..._toasts]);
  return () => _listeners.delete(listener);
}

