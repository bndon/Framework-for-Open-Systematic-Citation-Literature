import { toast } from "./toast";

const UNDO_MS = 8000;

/**
 * Delete with a safety net. The item disappears from the screen straight away, but the real
 * delete only runs after a few seconds. "Undo" cancels it, so nothing is ever lost.
 *
 *  - `hide`    remove the item from what is on screen
 *  - `show`    put it back (called on Undo, or if the delete fails)
 *  - `commit`  the real delete
 *
 * If the app is closed during the window the delete simply does not happen: the item is back
 * next time, which is the safe direction.
 */
export function deleteWithUndo(opts: {
  label: string;
  hide: () => void;
  show: () => void;
  commit: () => Promise<unknown> | unknown;
}): void {
  opts.hide();
  let cancelled = false;
  const timer = window.setTimeout(async () => {
    if (cancelled) return;
    try {
      await opts.commit();
    } catch (err: any) {
      opts.show();
      toast.error(`Could not delete: ${err?.toString?.() ?? err}`);
    }
  }, UNDO_MS);
  toast.withAction(
    opts.label,
    "Undo",
    () => {
      cancelled = true;
      window.clearTimeout(timer);
      opts.show();
    },
    UNDO_MS
  );
}

/**
 * Undo for deletes that are already done (data held in memory, e.g. an EPUB file). The delete
 * runs now; `restore` puts everything back if the person clicks Undo.
 */
export function undoable(label: string, restore: () => Promise<unknown> | unknown): void {
  toast.withAction(label, "Undo", async () => {
    try {
      await restore();
    } catch (err: any) {
      toast.error(`Could not undo: ${err?.toString?.() ?? err}`);
    }
  });
}
