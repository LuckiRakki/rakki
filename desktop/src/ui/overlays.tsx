// Things that float above the window: right-click menus, toasts and dialogs. One host renders
// them all (see <Overlays/> in main.tsx); anything can open one through the stores below.
import type { LucideIcon } from '~/ui/icons';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';

// ---- Right-click menus ----

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  run?: () => void;
  danger?: boolean;
  /** A line above this item. */
  divider?: boolean;
  disabled?: boolean;
}

interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
  title?: string;
  /** Opened from the keyboard (Menu key, Shift+F10, Enter on a button): focus starts on the first item. */
  keyboard: boolean;
  /** Where focus goes back to when it closes. */
  from: HTMLElement | null;
}

interface MenuState {
  open: OpenMenu | null;
  show(m: OpenMenu): void;
  close(): void;
}

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (m) => set({ open: m }),
  close: () => set({ open: null }),
}));

type MenuEvent = {
  clientX: number;
  clientY: number;
  type?: string;
  detail?: number;
  currentTarget?: EventTarget | null;
  nativeEvent?: Event;
  preventDefault(): void;
  stopPropagation?(): void;
};

/**
 * Opens a menu at the mouse (for onContextMenu, or a "more" button). From the keyboard (the Menu
 * key or Shift+F10 on a focused row, Enter or Space on a button) it opens under the element
 * instead, with the first item focused.
 */
export function openMenu(e: MenuEvent, items: MenuItem[], title?: string) {
  e.preventDefault();
  e.stopPropagation?.();
  const native = e.nativeEvent as (Event & { pointerType?: string }) | undefined;
  const keyboard =
    e.type === 'contextmenu' ? native?.pointerType === '' || (e.clientX === 0 && e.clientY === 0) : e.detail === 0;
  const from = (e.currentTarget instanceof HTMLElement ? e.currentTarget : null) ?? (document.activeElement as HTMLElement | null);
  let { clientX: x, clientY: y } = e;
  if (keyboard && from) {
    const r = from.getBoundingClientRect();
    x = r.left + Math.min(24, r.width / 2);
    y = r.bottom;
  }
  useMenu.getState().show({ x, y, items, title, keyboard, from: (document.activeElement as HTMLElement | null) ?? from });
}

function ContextMenu() {
  const open = useMenu((s) => s.open);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Keep it inside the window.
  useLayoutEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(open.x, window.innerWidth - r.width - 8)),
      top: open.y + r.height > window.innerHeight - 8 ? Math.max(8, open.y - r.height) : open.y,
    });
  }, [open]);

  // Once placed (it can't take focus while hidden for measuring): focus into it.
  useEffect(() => {
    if (!open || !pos || !ref.current) return;
    const first = ref.current.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)');
    if (open.keyboard && first) first.focus();
    else ref.current.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const close = () => useMenu.getState().close();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [open]);

  /** Close; back to where the menu came from when focus was in the menu. */
  const close = (refocus: boolean) => {
    const from = open?.from;
    useMenu.getState().close();
    if (refocus && from?.isConnected) from.focus();
  };

  // Arrow keys move through the items (wrapping), Home / End jump, Escape and Tab close.
  const onKey = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const move = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? -1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(-1);
    else if (e.key === 'Escape' || e.key === 'Tab') close(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (!open) return null;
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={open.title}
      tabIndex={-1}
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden' }}
      onKeyDown={onKey}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}>
      {open.title ? <div className="menu-title">{open.title}</div> : null}
      {open.items.map((item, i) => (
        <div key={i} role="none">
          {item.divider ? <div className="menu-divider" role="separator" /> : null}
          <button
            className={`menu-item${item.danger ? ' danger' : ''}`}
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onClick={() => {
              close(open.keyboard);
              item.run?.();
            }}>
            {item.icon ? <item.icon size={16} /> : <span style={{ width: 16 }} />}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}

// ---- Toasts ----

export const useToast = create<{ text: string | null; at: number }>(() => ({ text: null, at: 0 }));

export function toast(text: string) {
  useToast.setState({ text, at: Date.now() });
}

function Toast() {
  const { text, at } = useToast();
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(() => useToast.setState({ text: null }), 2600);
    return () => clearTimeout(id);
  }, [text, at]);
  return text ? (
    <div className="toast" key={at}>
      {text}
    </div>
  ) : null;
}

// ---- Dialogs ----

export const useDialog = create<{ content: ReactNode | null }>(() => ({ content: null }));

export function showDialog(content: ReactNode) {
  useDialog.setState({ content });
}

export function closeDialog() {
  useDialog.setState({ content: null });
}

function Dialog() {
  const content = useDialog((s) => s.content);
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDialog();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content]);
  if (!content) return null;
  return (
    <div className="scrim" onMouseDown={closeDialog}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

/** A dialog asking for a line of text (a playlist's name). */
export function askText(title: string, initial = '', action = 'Save'): Promise<string | null> {
  return new Promise((resolve) => {
    function Ask() {
      const [value, setValue] = useState(initial);
      const done = (v: string | null) => {
        closeDialog();
        resolve(v);
      };
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            done(value.trim() || null);
          }}>
          <h2 className="dialog-title">{title}</h2>
          <input className="field" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => done(null)}>
              Cancel
            </button>
            <button className="primary" disabled={!value.trim()}>
              {action}
            </button>
          </div>
        </form>
      );
    }
    showDialog(<Ask />);
  });
}

/** Are you sure? (deleting a playlist). */
export function confirmAction(title: string, detail: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      closeDialog();
      resolve(v);
    };
    showDialog(
      <div>
        <h2 className="dialog-title">{title}</h2>
        <p className="muted">{detail}</p>
        <div className="dialog-actions">
          <button className="secondary" onClick={() => done(false)}>
            Cancel
          </button>
          <button className="primary danger" onClick={() => done(true)}>
            {action}
          </button>
        </div>
      </div>,
    );
  });
}

export function Overlays() {
  return (
    <>
      <ContextMenu />
      <Dialog />
      <Toast />
    </>
  );
}
