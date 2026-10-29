// The left sidebar: Your Library's buttons (closable, foldable) and your playlists. In a narrow
// window it shrinks to icons and covers (layout.ts `rail`). The handles beside both sidebars
// resize them, by mouse or keyboard.
import { useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { create } from 'zustand';

import { displayName } from '@/lib/mixes';
import { collectionMenu } from '~/library/menus';
import { PANEL, SIDEBAR, useLayout } from '~/layout/layout';
import { go, useNav, type Route } from '~/nav';
import { useDailyMixes, usePlaylists } from '~/queries';
import { Blend, ChevronDown, ChevronUp, Disc3, Heart, Library, ListMusic, MonitorPlay, Music, Plus, Radio, Tags, UserRound, X } from '~/ui/icons';
import { openMenu } from '~/ui/overlays';
import { Artwork } from '~/ui/parts';
import { activateOnKey } from '~/ui/keys';
import { kv } from '~/lib/kv';

/** Your Library's buttons: folded away or not, and the ones you closed (remembered). */
const useLibraryTabs = create<{ open: boolean; hidden: string[]; set(p: Partial<{ open: boolean; hidden: string[] }>): void }>((set, get) => {
  let saved: { open?: boolean; hidden?: string[] } = {};
  try {
    saved = JSON.parse(kv.getItem('rakki.libraryTabs') ?? '{}');
  } catch {
    // Defaults.
  }
  return {
    open: saved.open ?? true,
    hidden: saved.hidden ?? [],
    set(p) {
      const next = { open: get().open, hidden: get().hidden, ...p };
      kv.setItem('rakki.libraryTabs', JSON.stringify(next));
      set(next);
    },
  };
});

const LIBRARY_TABS: { to: Route; label: string; Icon: typeof ListMusic }[] = [
  { to: { name: 'playlists' }, label: 'Playlists', Icon: ListMusic },
  { to: { name: 'mixes' }, label: 'Daily Mixes', Icon: Blend },
  { to: { name: 'albums' }, label: 'Albums', Icon: Disc3 },
  { to: { name: 'songs' }, label: 'Songs', Icon: Music },
  { to: { name: 'artists' }, label: 'Artists', Icon: UserRound },
  { to: { name: 'genres' }, label: 'Genres', Icon: Tags },
  { to: { name: 'radio' }, label: 'Radio', Icon: Radio },
  { to: { name: 'videos' }, label: 'Videos', Icon: MonitorPlay },
];

function NavLink({ to, icon, label }: { to: Route; icon: ReactNode; label: string }) {
  const on = useNav((s) => s.route.name === to.name);
  const close = () => useLibraryTabs.getState().set({ hidden: [...useLibraryTabs.getState().hidden, to.name] });
  return (
    <div
      className={`link${on ? ' on' : ''}`}
      role="link"
      aria-current={on ? 'page' : undefined}
      aria-label={label}
      title={label}
      tabIndex={0}
      onClick={() => go(to)}
      onKeyDown={activateOnKey(() => go(to))}
      onContextMenu={(e) => openMenu(e, [{ label: `Close ${label}`, icon: X, run: close }], label)}>
      <span className="link-icon">{icon}</span>
      <span className="link-label">{label}</span>
      <button
        className="link-close"
        aria-label={`Close ${label}`}
        title={`Close ${label} (right-click Your Library to bring it back)`}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}>
        <X size={14} />
      </button>
    </div>
  );
}

function LibraryHead() {
  const { open, hidden } = useLibraryTabs();
  const set = useLibraryTabs.getState().set;
  const closed = LIBRARY_TABS.filter((t) => hidden.includes(t.to.name));
  return (
    <button
      className="side-head"
      title={open ? 'Fold the library buttons away' : 'Show the library buttons'}
      aria-expanded={open}
      onClick={() => set({ open: !open })}
      onContextMenu={(e) =>
        openMenu(
          e,
          [
            { label: open ? 'Fold Buttons Away' : 'Show Buttons', icon: open ? ChevronUp : ChevronDown, run: () => set({ open: !open }) },
            ...closed.map((t, i) => ({ label: `Bring back ${t.label}`, icon: t.Icon, divider: i === 0, run: () => set({ hidden: hidden.filter((h) => h !== t.to.name) }) })),
            ...(closed.length > 1 ? [{ label: 'Bring Them All Back', icon: Plus, run: () => set({ hidden: [] }) }] : []),
          ],
          'Your Library',
        )
      }>
      <Library size={21} />
      <span className="side-head-label">Your Library</span>
      <span className="side-head-chev">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
    </button>
  );
}

export function Sidebar() {
  const libOpen = useLibraryTabs((s) => s.open);
  const hiddenTabs = useLibraryTabs((s) => s.hidden);
  const playlists = usePlaylists().data;
  const mixes = useDailyMixes().data;
  const route = useNav((s) => s.route);
  const current = route.name === 'playlist' ? route.id : null;
  return (
    <aside className="sidebar panel" aria-label="Your Library">
      <LibraryHead />
      <div className={`side-links-fold${libOpen ? '' : ' folded'}`} aria-hidden={!libOpen}>
        <nav className="side-links">
          {LIBRARY_TABS.filter((t) => !hiddenTabs.includes(t.to.name)).map(({ to, label, Icon }) => (
            <NavLink key={to.name} to={to} icon={<Icon size={18} />} label={label} />
          ))}
        </nav>
      </div>
      <div className="side-lists">
        <button className={`row${route.name === 'liked' ? ' on' : ''}`} title="Liked Songs" onClick={() => go({ name: 'liked' })}>
          <div className="artwork empty liked-art thumb">
            <Heart size={18} fill="#fff" />
          </div>
          <div className="t">
            <div className="name">Liked Songs</div>
            <div className="sub">Playlist</div>
          </div>
        </button>
        {[...(mixes ?? []), ...(playlists ?? [])].map((p) => (
          <button
            key={p.Id}
            className={`row${current === p.Id ? ' on' : ''}`}
            title={displayName(p)}
            onClick={() => go({ name: 'playlist', id: p.Id })}
            onContextMenu={(e) => openMenu(e, collectionMenu(p), displayName(p))}>
            <Artwork item={p} size={100} className="thumb" />
            <div className="t">
              <div className="name">{displayName(p)}</div>
              <div className="sub">{p.ChildCount ? `Playlist · ${p.ChildCount} songs` : 'Playlist'}</div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

/**
 * The handle in the gap beside a sidebar: drag (or focus it and use the arrow keys) to resize,
 * remembered; double-click or Enter for the default width. Lives in the gap so it never covers
 * anything.
 */
export function Resizer({ which }: { which: 'sidebar' | 'panel' }) {
  const [dragging, setDragging] = useState(false);
  const range = which === 'sidebar' ? SIDEBAR : PANEL;
  const now = useLayout((s) => (which === 'sidebar' ? s.sidebarWidth : s.panelWidth));
  const set = (px: number) => useLayout.getState().setWidth(which, px);
  const width = (e: ReactPointerEvent) => (which === 'sidebar' ? e.clientX - 12 : window.innerWidth - e.clientX - 12);
  // The left sidebar grows to the right; the right one to the left.
  const grow = which === 'sidebar' ? 'ArrowRight' : 'ArrowLeft';
  const shrink = which === 'sidebar' ? 'ArrowLeft' : 'ArrowRight';
  const onKey = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    const to = e.key === grow ? now + step : e.key === shrink ? now - step : e.key === 'Home' ? range.min : e.key === 'End' ? range.max : e.key === 'Enter' ? range.default : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(to);
  };
  return (
    <div
      className={`resizer resizer-${which}${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={which === 'sidebar' ? 'Resize Your Library' : 'Resize the right sidebar'}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={now}
      tabIndex={0}
      title="Drag or use the arrow keys to resize, double-click to reset"
      onKeyDown={onKey}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => dragging && set(width(e))}
      onPointerUp={() => setDragging(false)}
      onDoubleClick={() => set(range.default)}
    />
  );
}
