// The window's frame: Rakki's own title bar (the window has no system frame), the sidebar, the
// panel on the right (queue or lyrics) and the player bar along the bottom.
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Disc3,
  Heart,
  Home as HomeIcon,
  Library,
  LogOut,
  ListMusic,
  Maximize2,
  MicVocal,
  Minus,
  Moon,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search as SearchIcon,
  Settings2,
  Shapes,
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
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { displayName } from '@/lib/mixes';
import { useAuth } from '~/auth/session';
import { setLiked } from '~/library/actions';
import { collectionMenu, songMenu } from '~/library/menus';
import { inTauri } from '~/lib/tauri';
import { LyricsView } from '~/lyrics/LyricsView';
import { go, useNav, type Route } from '~/nav';
import { useSleep } from '~/player/sleep';
import { currentPosition, usePlayer } from '~/player/store';
import { useDailyMixes, usePlaylists } from '~/queries';
import { openMenu } from '~/ui/overlays';
import { ArtistLinks, Artwork, formatTime } from '~/ui/parts';

const win = inTauri ? getCurrentWindow() : null;

/** What's open around the main area (remembered between launches). */
export const useLayout = create<{
  panel: 'queue' | 'lyrics' | null;
  nowPlaying: boolean;
  setPanel(p: 'queue' | 'lyrics' | null): void;
  togglePanel(p: 'queue' | 'lyrics'): void;
  setNowPlaying(open: boolean): void;
}>((set, get) => ({
  panel: (localStorage.getItem('rakki.panel') as 'queue' | 'lyrics' | null) ?? 'queue',
  nowPlaying: false,
  setPanel(panel) {
    if (panel) localStorage.setItem('rakki.panel', panel);
    else localStorage.removeItem('rakki.panel');
    set({ panel });
  },
  togglePanel(p) {
    get().setPanel(get().panel === p ? null : p);
  },
  setNowPlaying(nowPlaying) {
    set({ nowPlaying });
  },
}));

// ---- Title bar ----

export function WindowButtons() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!win) return;
    void win.isMaximized().then(setMax);
    const un = win.onResized(() => void win.isMaximized().then(setMax));
    return () => void un.then((f) => f());
  }, []);
  if (!win) return null;
  return (
    <div className="winbtns">
      <button className="win" aria-label="Minimize" title="Minimize" onClick={() => void win.minimize()}>
        <Minus size={16} />
      </button>
      <button className="win" aria-label={max ? 'Restore' : 'Maximize'} title={max ? 'Restore' : 'Maximize'} onClick={() => void win.toggleMaximize()}>
        {max ? <Copy size={13} style={{ transform: 'scaleX(-1)' }} /> : <Square size={13} />}
      </button>
      <button className="win close" aria-label="Close" title="Close (Rakki keeps playing in the tray)" onClick={() => void win.close()}>
        <X size={17} />
      </button>
    </div>
  );
}

/** Your picture in the title bar: Settings and Sign out. */
function UserButton() {
  const session = useAuth((s) => s.session);
  const client = useAuth((s) => s.client);
  const [failed, setFailed] = useState(false);
  if (!session) return null;
  const src = client?.userImageUrl({ Id: session.userId }, 80);
  return (
    <button
      className="avatar"
      title={session.userName}
      onClick={(e) =>
        openMenu(
          e,
          [
            { label: 'Settings', icon: Settings2, run: () => go({ name: 'settings' }) },
            { label: 'Sign out', icon: LogOut, run: () => useAuth.getState().signOut(), divider: true },
          ],
          `${session.userName} · ${session.serverName}`,
        )
      }>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : null}
      <span>{session.userName.slice(0, 1).toUpperCase()}</span>
    </button>
  );
}

export function TitleBar() {
  const { at, stack, route } = useNav();
  const [term, setTerm] = useState(route.name === 'search' ? (route.term ?? '') : '');
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K / Ctrl+F / "/": search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) || (e.key === '/' && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-left" data-tauri-drag-region>
        <span className="brand" data-tauri-drag-region>
          Rakki<b>.</b>
        </span>
        <button className="navbtn" disabled={at === 0} onClick={() => useNav.getState().back()} aria-label="Back" title="Back">
          <ChevronLeft size={18} />
        </button>
        <button className="navbtn" disabled={at >= stack.length - 1} onClick={() => useNav.getState().forward()} aria-label="Forward" title="Forward">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="tb-center" data-tauri-drag-region>
        <button className="navbtn home" onClick={() => go({ name: 'home' })} aria-label="Home" title="Home">
          <HomeIcon size={18} />
        </button>
        <label className="search">
          <SearchIcon size={16} />
          <input
            ref={input}
            value={term}
            placeholder="What do you want to play?"
            onFocus={() => useNav.getState().route.name !== 'search' && go({ name: 'search', term })}
            onChange={(e) => {
              setTerm(e.target.value);
              const r = useNav.getState().route;
              if (r.name === 'search') useNav.setState({ route: { name: 'search', term: e.target.value } });
              else go({ name: 'search', term: e.target.value });
            }}
          />
          {term ? (
            <button className="clear" aria-label="Clear" onClick={() => setTerm('')}>
              <X size={14} />
            </button>
          ) : null}
        </label>
      </div>
      <div className="tb-right" data-tauri-drag-region>
        <UserButton />
        <WindowButtons />
      </div>
    </div>
  );
}

// ---- Sidebar ----

function NavLink({ to, icon, label }: { to: Route; icon: ReactNode; label: string }) {
  const on = useNav((s) => s.route.name === to.name);
  return (
    <button className={`link${on ? ' on' : ''}`} onClick={() => go(to)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function Sidebar() {
  const playlists = usePlaylists().data;
  const mixes = useDailyMixes().data;
  const route = useNav((s) => s.route);
  const current = route.name === 'playlist' ? route.id : null;
  return (
    <aside className="sidebar panel">
      <div className="side-head">
        <Library size={20} />
        <span>Your Library</span>
      </div>
      <nav className="side-links">
        <NavLink to={{ name: 'playlists' }} icon={<ListMusic size={18} />} label="Playlists" />
        <NavLink to={{ name: 'mixes' }} icon={<Sparkles size={18} />} label="Daily Mixes" />
        <NavLink to={{ name: 'albums' }} icon={<Disc3 size={18} />} label="Albums" />
        <NavLink to={{ name: 'songs' }} icon={<Music size={18} />} label="Songs" />
        <NavLink to={{ name: 'artists' }} icon={<Users size={18} />} label="Artists" />
        <NavLink to={{ name: 'genres' }} icon={<Shapes size={18} />} label="Genres" />
      </nav>
      <div className="side-lists">
        <button className={`row${route.name === 'liked' ? ' on' : ''}`} onClick={() => go({ name: 'liked' })}>
          <div className="artwork empty liked-art thumb">
            <Heart size={16} fill="#fff" color="#fff" />
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

// ---- Right panel ----

function QueueList() {
  const { queue, index } = usePlayer();
  const now = queue[index];
  const upcoming = queue.slice(index + 1, index + 201);
  const row = (t: BaseItem, i: number, isNow = false) => (
    <button
      key={`${t.Id}-${i}`}
      className={`qrow${isNow ? ' now' : ''}`}
      onDoubleClick={() => !isNow && usePlayer.getState().playAt(i)}
      onContextMenu={(e) => openMenu(e, songMenu([t], isNow ? {} : { queueIndex: i }))}>
      <Artwork item={t} size={80} className="thumb" />
      <div className="t">
        <div className="name">{t.Name}</div>
        <div className="sub">
          <ArtistLinks item={t} />
        </div>
      </div>
    </button>
  );
  return (
    <div className="panel-body">
      {now ? (
        <>
          <div className="label">Now playing</div>
          {row(now, index, true)}
        </>
      ) : (
        <p className="muted pad">Nothing playing yet. Double-click a song, or press play on an album.</p>
      )}
      {upcoming.length ? <div className="label">Next up</div> : null}
      {upcoming.map((t, i) => row(t, index + 1 + i))}
      {queue.length - index - 1 > upcoming.length ? <p className="muted pad">and {queue.length - index - 1 - upcoming.length} more</p> : null}
    </div>
  );
}

export function RightPanel() {
  const panel = useLayout((s) => s.panel);
  if (!panel) return null;
  return (
    <aside className="rightpanel panel">
      <header className="tabs">
        <button className={panel === 'queue' ? 'on' : ''} onClick={() => useLayout.getState().setPanel('queue')}>
          Queue
        </button>
        <button className={panel === 'lyrics' ? 'on' : ''} onClick={() => useLayout.getState().setPanel('lyrics')}>
          Lyrics
        </button>
        <div style={{ flex: 1 }} />
        <button className="iconbtn" aria-label="Close panel" title="Close" onClick={() => useLayout.getState().setPanel(null)}>
          <X size={16} />
        </button>
      </header>
      {panel === 'queue' ? <QueueList /> : <LyricsView />}
    </aside>
  );
}

// ---- Player bar ----

/** A thin bar you click, drag or scroll along (seek, volume). */
export function Range({ value, max, onSet, onWheelStep }: { value: number; max: number; onSet(v: number): void; onWheelStep?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max;
  };
  const shown = drag ?? value;
  return (
    <div
      className={`range${drag !== null ? ' dragging' : ''}`}
      ref={ref}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag !== null) onSet(at(e));
        setDrag(null);
      }}
      onWheel={onWheelStep ? (e) => onSet(Math.max(0, Math.min(max, value + (e.deltaY < 0 ? onWheelStep : -onWheelStep)))) : undefined}>
      <div className="bar">
        <div className="fill" style={{ width: `${max > 0 ? (shown / max) * 100 : 0}%` }} />
      </div>
      <div className="knob" style={{ left: `${max > 0 ? (shown / max) * 100 : 0}%` }} />
    </div>
  );
}

/** The song's position, redrawn a few times a second while playing and visible (never while hidden). */
export function useLivePosition(): number {
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

export function Transport({ size = 'normal' }: { size?: 'normal' | 'big' }) {
  const { playing, shuffle, repeat } = usePlayer();
  const p = usePlayer.getState();
  const s = size === 'big' ? 1.3 : 1;
  return (
    <div className={`buttons${size === 'big' ? ' big' : ''}`}>
      <button className={`iconbtn${shuffle ? ' on dot' : ''}`} aria-label="Shuffle" title={shuffle ? 'Shuffle: on' : 'Shuffle: off'} onClick={() => p.toggleShuffle()}>
        <Shuffle size={18 * s} />
      </button>
      <button className="iconbtn" aria-label="Previous" title="Previous" onClick={() => p.previous()}>
        <SkipBack size={20 * s} fill="currentColor" />
      </button>
      <button className="pp" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => p.toggle()}>
        {playing ? <Pause size={18 * s} fill="currentColor" /> : <Play size={18 * s} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>
      <button className="iconbtn" aria-label="Next" title="Next" onClick={() => p.next()}>
        <SkipForward size={20 * s} fill="currentColor" />
      </button>
      <button
        className={`iconbtn${repeat !== 'off' ? ' on dot' : ''}`}
        aria-label="Repeat"
        title={repeat === 'off' ? 'Repeat: off' : repeat === 'all' ? 'Repeat: all' : 'Repeat: this song'}
        onClick={() => p.setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>
        {repeat === 'one' ? <Repeat1 size={18 * s} /> : <Repeat size={18 * s} />}
      </button>
    </div>
  );
}

export function SeekBar() {
  const duration = usePlayer((s) => s.duration);
  const position = useLivePosition();
  return (
    <div className="seek">
      <span>{formatTime(position)}</span>
      <Range value={position} max={duration} onSet={(v) => usePlayer.getState().seek(v)} />
      <span>{formatTime(duration)}</span>
    </div>
  );
}

function SleepButton() {
  const { endsAt, endOfSong } = useSleep();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [endsAt]);
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 60_000)) : 0;
  const choose = (m: number | 'song' | null) => () => useSleep.getState().set(m);
  return (
    <button
      className={`iconbtn${endsAt ? ' on' : ''}`}
      aria-label="Sleep timer"
      title={endsAt ? (endOfSong ? 'Sleep timer: end of this song' : `Sleep timer: ${left} min left`) : 'Sleep timer'}
      onClick={(e) =>
        openMenu(
          e,
          [
            { label: '15 minutes', run: choose(15) },
            { label: '30 minutes', run: choose(30) },
            { label: '45 minutes', run: choose(45) },
            { label: '1 hour', run: choose(60) },
            { label: 'End of this song', run: choose('song') },
            ...(endsAt ? [{ label: 'Turn off', run: choose(null), divider: true, danger: true }] : []),
          ],
          endsAt ? (endOfSong ? 'Pausing at the end of this song' : `Pausing in ${left} min`) : 'Pause after',
        )
      }>
      <Moon size={17} />
      {endsAt && !endOfSong ? <span className="badge">{left}</span> : null}
    </button>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const [last, setLast] = useState(volume || 80);
  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div
      className="volume"
      title={`Volume ${volume}% (scroll to change)`}
      onWheel={(e) => usePlayer.getState().setVolume(volume + (e.deltaY < 0 ? 5 : -5))}>
      <button
        className="iconbtn"
        aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        onClick={() => {
          if (volume === 0) usePlayer.getState().setVolume(last);
          else {
            setLast(volume);
            usePlayer.getState().setVolume(0);
          }
        }}>
        <Icon size={18} />
      </button>
      <div className="vol">
        <Range value={volume} max={100} onSet={(v) => usePlayer.getState().setVolume(v)} />
      </div>
    </div>
  );
}

export function PlayerBar() {
  const now = usePlayer((s) => s.queue[s.index]);
  const error = usePlayer((s) => s.error);
  const panel = useLayout((s) => s.panel);
  const liked = !!now?.UserData?.IsFavorite;
  return (
    <footer className="playerbar">
      <div className="np">
        {now ? (
          <>
            <button className="np-art" title="Now Playing" onClick={() => useLayout.getState().setNowPlaying(true)}>
              <Artwork item={now} size={160} className="thumb" />
              <span className="expand">
                <Maximize2 size={14} />
              </span>
            </button>
            <div className="t" onContextMenu={(e) => openMenu(e, songMenu([now]))}>
              <div className="name linkish" onClick={() => now.AlbumId && go({ name: 'album', id: now.AlbumId })}>
                {now.Name}
              </div>
              <div className="by">
                <ArtistLinks item={now} />
              </div>
            </div>
            <button className={`heart${liked ? ' on' : ''}`} aria-label="Like" title={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'} onClick={() => void setLiked([now], !liked)}>
              <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </>
        ) : null}
      </div>
      <div className="controls">
        <Transport />
        <SeekBar />
        {error ? <div className="error small">{error}</div> : null}
      </div>
      <div className="right">
        <button className={`iconbtn${panel === 'lyrics' ? ' on dot' : ''}`} aria-label="Lyrics" title="Lyrics" onClick={() => useLayout.getState().togglePanel('lyrics')}>
          <MicVocal size={18} />
        </button>
        <button className={`iconbtn${panel === 'queue' ? ' on dot' : ''}`} aria-label="Queue" title="Queue" onClick={() => useLayout.getState().togglePanel('queue')}>
          <ListMusic size={18} />
        </button>
        <SleepButton />
        <VolumeControl />
        <button className="iconbtn" aria-label="Now Playing" title="Now Playing" disabled={!now} onClick={() => useLayout.getState().setNowPlaying(true)}>
          <Maximize2 size={17} />
        </button>
      </div>
    </footer>
  );
}
