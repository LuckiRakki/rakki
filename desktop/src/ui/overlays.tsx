// Things that float above the window: right-click menus, toasts and dialogs. One host renders
// them all (see <Overlays/> in main.tsx); anything can open one through the stores below.
import type { LucideIcon } from 'lucide-react';
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

interface MenuState {
  open: { x: number; y: number; items: MenuItem[]; title?: string } | null;
  show(x: number, y: number, items: MenuItem[], title?: string): void;
  close(): void;
}

export const useMenu = create<MenuState>((set) => ({
  open: null,
  show: (x, y, items, title) => set({ open: { x, y, items, title } }),
  close: () => set({ open: null }),
}));

/** Opens a menu at the mouse (for onContextMenu, or a "more" button). */
export function openMenu(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation?(): void }, items: MenuItem[], title?: string) {
  e.preventDefault();
  e.stopPropagation?.();
  useMenu.getState().show(e.clientX, e.clientY, items, title);
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
      left: Math.min(open.x, window.innerWidth - r.width - 8),
      top: open.y + r.height > window.innerHeight - 8 ? Math.max(8, open.y - r.height) : open.y,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => useMenu.getState().close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', close);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className="menu"
      style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}>
      {open.title ? <div className="menu-title">{open.title}</div> : null}
      {open.items.map((item, i) => (
        <div key={i}>
          {item.divider ? <div className="menu-divider" /> : null}
          <button
            className={`menu-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              useMenu.getState().close();
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
