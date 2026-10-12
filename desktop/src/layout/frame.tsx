// The window's frame: Rakki's own title bar (with back/forward and search), the sidebar, the
// queue on the right and the player bar along the bottom.
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ChevronLeft,
  ChevronRight,
  Disc3,
  Heart,
  Home as HomeIcon,
  Library,
  ListMusic,
  Minus,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search as SearchIcon,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Users,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';

import { displayName } from '@/lib/mixes';
import { go, useNav, type Route } from '~/nav';
import { currentPosition, usePlayer } from '~/player/store';
import { useDailyMixes, usePlaylists } from '~/queries';
import { Artwork, formatTime } from '~/ui/parts';

const win = getCurrentWindow();

/** Whether the queue panel is open (remembered). */
export const useLayout = create<{ queueOpen: boolean; toggleQueue(): void }>((set, get) => ({
  queueOpen: localStorage.getItem('rakki.queueOpen') !== 'false',
  toggleQueue() {
    const queueOpen = !get().queueOpen;
    localStorage.setItem('rakki.queueOpen', String(queueOpen));
    set({ queueOpen });
  },
}));

export function TitleBar() {
  const { at, stack, route } = useNav();
  const [term, setTerm] = useState(route.name === 'search' ? (route.term ?? '') : '');
  return (
    <div className="titlebar">
      <div className="drag" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Rakki<b>.</b>
        </span>
        <button className="navbtn" disabled={at === 0} onClick={() => useNav.getState().back()} aria-label="Back">
          <ChevronLeft size={18} />
        </button>
        <button className="navbtn" disabled={at >= stack.length - 1} onClick={() => useNav.getState().forward()} aria-label="Forward">
          <ChevronRight size={18} />
        </button>
        <label className="search">
          <SearchIcon size={16} />
          <input
            value={term}
            placeholder="What do you want to listen to?"
            onChange={(e) => {
              setTerm(e.target.value);
              const r = useNav.getState().route;
              if (r.name === 'search') useNav.setState({ route: { name: 'search', term: e.target.value } });
              else go({ name: 'search', term: e.target.value });
            }}
          />
        </label>
      </div>
      <button className="win" aria-label="Minimize" onClick={() => void win.minimize()}>
        <Minus size={16} />
      </button>
      <button className="win" aria-label="Maximize" onClick={() => void win.toggleMaximize()}>
        <Square size={13} />
      </button>
      <button className="win close" aria-label="Close to tray" title="Close (keeps playing in the tray)" onClick={() => void win.close()}>
        <X size={17} />
      </button>
    </div>
  );
}

function NavLink({ to, icon, label }: { to: Route; icon: React.ReactNode; label: string }) {
  const on = useNav((s) => s.route.name === to.name);
  return (
    <button className={`link${on ? ' on' : ''}`} onClick={() => go(to)}>
      {icon}
      {label}
    </button>
  );
}

export function Sidebar() {
  const playlists = usePlaylists().data;
  const mixes = useDailyMixes().data;
  const route = useNav((s) => s.route);
  const current = route.name === 'playlist' ? route.id : null;
  return (
    <aside className="sidebar">
      <nav className="panel">
        <NavLink to={{ name: 'home' }} icon={<HomeIcon size={20} />} label="Home" />
        <NavLink to={{ name: 'search' }} icon={<SearchIcon size={20} />} label="Search" />
      </nav>
      <div className="panel lists">
        <nav style={{ padding: '4px 0 8px' }}>
          <NavLink to={{ name: 'albums' }} icon={<Disc3 size={20} />} label="Albums" />
          <NavLink to={{ name: 'artists' }} icon={<Users size={20} />} label="Artists" />
          <NavLink to={{ name: 'playlists' }} icon={<Library size={20} />} label="Playlists" />
          <NavLink to={{ name: 'mixes' }} icon={<Sparkles size={20} />} label="Daily Mixes" />
        </nav>
        <h3>Your playlists</h3>
        <button className={`row${route.name === 'liked' ? ' on' : ''}`} onClick={() => go({ name: 'liked' })}>
          <div className="artwork empty" style={{ width: 44, flex: 'none', background: 'linear-gradient(135deg, #4a2fd1, #9a86f5)' }}>
            <Heart size={18} fill="#fff" color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="name">Liked Songs</div>
            <div className="sub">Playlist</div>
          </div>
        </button>
        {[...(mixes ?? []), ...(playlists ?? [])].map((p) => (
          <button key={p.Id} className={`row${current === p.Id ? ' on' : ''}`} onClick={() => go({ name: 'playlist', id: p.Id })}>
            <Artwork item={p} size={100} className="thumb" />
            <div style={{ minWidth: 0 }}>
              <div className="name">{displayName(p)}</div>
              <div className="sub">{p.ChildCount ? `${p.ChildCount} songs` : 'Playlist'}</div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function QueuePanel() {
  const { queue, index } = usePlayer();
  const now = queue[index];
  const upcoming = queue.slice(index + 1, index + 101);
  return (
    <aside className="panel queue">
      <header>Queue</header>
      <div className="list">
        {now ? (
          <>
            <div className="label">Now playing</div>
            <div className="qrow now">
              <Artwork item={now} size={80} className="thumb" />
              <div className="t">
                <div>{now.Name}</div>
                <div>{now.Artists?.join(', ') || now.AlbumArtist}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="muted" style={{ padding: '0 8px' }}>
            Nothing playing yet.
          </p>
        )}
        {upcoming.length ? <div className="label">Next up</div> : null}
        {upcoming.map((t, i) => (
          <button key={`${t.Id}-${index + 1 + i}`} className="qrow" onDoubleClick={() => usePlayer.getState().playAt(index + 1 + i)}>
            <Artwork item={t} size={80} className="thumb" />
            <div className="t">
              <div>{t.Name}</div>
              <div>{t.Artists?.join(', ') || t.AlbumArtist}</div>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

/** A thin bar you click or drag along (seek, volume). */
function Range({ value, max, onSet }: { value: number; max: number; onSet(v: number): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max;
  };
  const shown = drag ?? value;
  return (
    <div
      className="range"
      ref={ref}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag !== null) onSet(at(e));
        setDrag(null);
      }}>
      <div className="bar">
        <div className="fill" style={{ width: `${max > 0 ? (shown / max) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** The song's position, redrawn a few times a second while playing and visible (never while hidden). */
function useLivePosition(): number {
  const [, tick] = useState(0);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  usePlayer((s) => s.position);
  useEffect(() => {
    if (!playing || hidden) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [playing, hidden]);
  return currentPosition(usePlayer.getState());
}

export function PlayerBar() {
  const { queue, index, playing, duration, volume, shuffle, repeat, error } = usePlayer();
  const now = queue[index];
  const position = useLivePosition();
  const p = usePlayer.getState();
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const [lastVolume, setLastVolume] = useState(volume || 80);
  const queueOpen = useLayout((s) => s.queueOpen);
  return (
    <footer className="playerbar">
      <div className="np">
        {now ? (
          <>
            <Artwork item={now} size={120} className="thumb" />
            <div className="t">
              <div className="name">{now.Name}</div>
              <div className="by">
                {now.ArtistItems?.length
                  ? now.ArtistItems.map((a, i) => (
                      <span key={a.Id}>
                        {i ? ', ' : ''}
                        <span className="linkish" onClick={() => go({ name: 'artist', id: a.Id })}>
                          {a.Name}
                        </span>
                      </span>
                    ))
                  : now.AlbumArtist}
              </div>
            </div>
          </>
        ) : null}
      </div>
      <div className="controls">
        <div className="buttons">
          <button className={`iconbtn${shuffle ? ' on' : ''}`} aria-label="Shuffle" onClick={() => p.toggleShuffle()}>
            <Shuffle size={18} />
          </button>
          <button className="iconbtn" aria-label="Previous" onClick={() => p.previous()}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="pp" aria-label={playing ? 'Pause' : 'Play'} onClick={() => p.toggle()}>
            {playing ? <Pause size={18} fill="#000" /> : <Play size={18} fill="#000" style={{ marginLeft: 2 }} />}
          </button>
          <button className="iconbtn" aria-label="Next" onClick={() => p.next()}>
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            className={`iconbtn${repeat !== 'off' ? ' on' : ''}`}
            aria-label="Repeat"
            onClick={() => p.setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>
            {repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>
        <div className="seek">
          <span>{formatTime(position)}</span>
          <Range value={position} max={duration} onSet={(v) => p.seek(v)} />
          <span>{formatTime(duration)}</span>
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>
      <div className="right">
        <button className={`iconbtn${queueOpen ? ' on' : ''}`} aria-label="Queue" title="Queue" onClick={() => useLayout.getState().toggleQueue()}>
          <ListMusic size={18} />
        </button>
        <button
          className="iconbtn"
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          onClick={() => {
            if (volume === 0) p.setVolume(lastVolume);
            else {
              setLastVolume(volume);
              p.setVolume(0);
            }
          }}>
          <VolumeIcon size={18} />
        </button>
        <div className="vol">
          <Range value={volume} max={100} onSet={(v) => p.setVolume(v)} />
        </div>
      </div>
    </footer>
  );
}
