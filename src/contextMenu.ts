export type MenuItem = {
  label: string;
  icon?: string;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
};

let currentMenuEl: HTMLElement | null = null;
let dismissListener: ((e: MouseEvent | KeyboardEvent) => void) | null = null;

export function closeContextMenu(): void {
  if (currentMenuEl) {
    currentMenuEl.remove();
    currentMenuEl = null;
  }
  if (dismissListener) {
    document.removeEventListener("click", dismissListener);
    document.removeEventListener("contextmenu", dismissListener);
    document.removeEventListener("keydown", dismissListener);
    dismissListener = null;
  }
}

export function showContextMenu(
  x: number,
  y: number,
  items: MenuItem[],
): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "custom-context-menu";

  for (const item of items) {
    if (item.divider) {
      const div = document.createElement("div");
      div.className = "context-menu-divider";
      menu.append(div);
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "context-menu-item";
    if (item.danger) btn.classList.add("danger");

    if (item.icon) {
      const iconSpan = document.createElement("span");
      iconSpan.className = "context-menu-icon";
      iconSpan.textContent = item.icon;
      btn.append(iconSpan);
    }

    const labelSpan = document.createElement("span");
    labelSpan.className = "context-menu-label";
    labelSpan.textContent = item.label;
    btn.append(labelSpan);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeContextMenu();
      item.onClick?.();
    });

    menu.append(btn);
  }

  document.body.append(menu);
  currentMenuEl = menu;

  // Viewport boundary adjustment
  const rect = menu.getBoundingClientRect();
  const pad = 8;
  let posX = x;
  let posY = y;

  if (posX + rect.width > window.innerWidth - pad) {
    posX = Math.max(pad, window.innerWidth - rect.width - pad);
  }
  if (posY + rect.height > window.innerHeight - pad) {
    posY = Math.max(pad, window.innerHeight - rect.height - pad);
  }

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;

  // Auto-dismiss on click outside or Escape
  dismissListener = (e: MouseEvent | KeyboardEvent) => {
    if (e instanceof KeyboardEvent) {
      if (e.key === "Escape") closeContextMenu();
      return;
    }
    if (!menu.contains(e.target as Node)) {
      closeContextMenu();
    }
  };

  setTimeout(() => {
    if (dismissListener) {
      document.addEventListener("click", dismissListener);
      document.addEventListener("contextmenu", dismissListener);
      document.addEventListener("keydown", dismissListener);
    }
  }, 10);
}
