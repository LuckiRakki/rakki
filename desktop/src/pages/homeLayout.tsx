// Home's sections, in your order, with the ones you hid left out (remembered). Customize Home
// (the button on Home) drags them into order and switches them on and off.
import { Eye, EyeOff, GripVertical } from '~/ui/icons';
import { useRef, useState } from 'react';
import { create } from 'zustand';

import { closeDialog, showDialog } from '~/ui/overlays';

export type HomeSection = 'quick' | 'mixes' | 'jump' | 'added' | 'playlists' | 'artists' | 'most' | 'rediscover' | 'random';

export const SECTION_LABEL: Record<HomeSection, string> = {
  quick: 'Quick Picks',
  mixes: 'Your Daily Mixes',
  jump: 'Jump Back In',
  added: 'Recently Added',
  playlists: 'Your Playlists',
  artists: 'Artists You Play',
  most: 'Most Played',
  rediscover: 'Rediscover',
  random: 'Random Picks',
};

const DEFAULT_ORDER = Object.keys(SECTION_LABEL) as HomeSection[];
const KEY = 'rakki.home';

interface Saved {
  order: HomeSection[];
  hidden: HomeSection[];
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (!s) return { order: DEFAULT_ORDER, hidden: [] };
    // Sections added in an update join at the end.
    const order = [...s.order.filter((x) => DEFAULT_ORDER.includes(x)), ...DEFAULT_ORDER.filter((x) => !s.order.includes(x))];
    return { order, hidden: s.hidden.filter((x) => DEFAULT_ORDER.includes(x)) };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

export const useHomeLayout = create<Saved & { set(next: Saved): void; reset(): void }>((set) => ({
  ...load(),
  set(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
    set(next);
  },
  reset() {
    localStorage.removeItem(KEY);
    set({ order: DEFAULT_ORDER, hidden: [] });
  },
}));

const ROW = 48;

function Customize() {
  const { order, hidden } = useHomeLayout();
  const [drag, setDrag] = useState<{ from: number; gap: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const save = (next: Partial<Saved>) => useHomeLayout.getState().set({ order, hidden, ...next });

  const startDrag = (from: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    let gap = from;
    const move = (ev: PointerEvent) => {
      const top = list.current?.getBoundingClientRect().top ?? 0;
      gap = Math.max(0, Math.min(order.length, Math.round((ev.clientY - top) / ROW)));
      setDrag({ from, gap });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const to = gap > from ? gap - 1 : gap;
      if (to === from) return;
      const next = [...order];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      save({ order: next });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setDrag({ from, gap });
  };

  return (
    <div>
      <h2 className="dialog-title">Customize Home</h2>
      <p className="muted">Drag sections into the order you like; the eye shows or hides one.</p>
      <div className={`home-sections${drag ? ' dragging' : ''}`} ref={list}>
        {drag ? <div className="tt-drop" style={{ top: drag.gap * ROW - 1, left: 0, right: 0 }} /> : null}
        {order.map((id, i) => {
          const off = hidden.includes(id);
          return (
            <div key={id} className={`home-section${off ? ' off' : ''}${drag?.from === i ? ' lifted' : ''}`}>
              <span className="grip" onPointerDown={(e) => startDrag(i, e)} title="Drag to move">
                <GripVertical size={18} />
              </span>
              <span className="label">{SECTION_LABEL[id]}</span>
              <button
                className="iconbtn"
                aria-label={off ? `Show ${SECTION_LABEL[id]}` : `Hide ${SECTION_LABEL[id]}`}
                title={off ? 'Show' : 'Hide'}
                onClick={() => save({ hidden: off ? hidden.filter((x) => x !== id) : [...hidden, id] })}>
                {off ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="dialog-actions">
        <button className="secondary" onClick={() => useHomeLayout.getState().reset()}>
          Reset
        </button>
        <button className="primary" onClick={closeDialog}>
          Done
        </button>
      </div>
    </div>
  );
}

export const openCustomizeHome = () => showDialog(<Customize />);
