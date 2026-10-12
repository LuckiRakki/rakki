// The window's frame: Rakki's own title bar (the window has no system frame), the sidebar and
// the player bar along the bottom. The right sidebar is layout/NowPlayingPanel.tsx.
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
  Minimize2,
  MicVocal,
  Minus,
  Moon,
  PanelRight,
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
import { displayName } from '@/lib/mixes';
import { useAuth } from '~/auth/session';
import { setLiked } from '~/library/actions';
import { collectionMenu, songMenu } from '~/library/menus';
import { PANEL, SIDEBAR, useLayout, win } from '~/layout/layout';
import { go, useNav, type Route } from '~/nav';
import { useSleep } from '~/player/sleep';
import { currentPosition, usePlayer } from '~/player/store';
import { useDailyMixes, usePlaylists } from '~/queries';
import { openMenu } from '~/ui/overlays';
import { ArtistLinks, Artwork, formatTime } from '~/ui/parts';

export { useLayout } from '~/layout/layout';

// ---- Title bar ----

export function WindowButtons() {
  const [max, setMax] = useState(false);
  const w = win;
  useEffect(() => {
    if (!w) return;
    void w.isMaximized().then(setMax);
    const un = w.onResized(() => void w.isMaximized().then(setMax));
    return () => void un.then((f) => f());
  }, []);
  if (!w) return null;
  return (
    <div className="winbtns">
      <button className="win" aria-label="Minimize" title="Minimize" onClick={() => void w.minimize()}>
        <Minus size={16} />
      </button>
      <button className="win" aria-label={max ? 'Restore' : 'Maximize'} title={max ? 'Restore' : 'Maximize'} onClick={() => void w.toggleMaximize()}>
        {max ? <Copy size={13} style={{ transform: 'scaleX(-1)' }} /> : <Square size={13} />}
      </button>
      <button className="win close" aria-label="Close" title="Close (Rakki keeps playing in the tray)" onClick={() => void w.close()}>
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

// ---- Resizing the sidebars ----

/**
 * The handle in the gap beside a sidebar: drag to resize (remembered), double-click for the
 * default width. Lives in the gap so it never covers anything.
 */
export function Resizer({ which }: { which: 'sidebar' | 'panel' }) {
  const [dragging, setDragging] = useState(false);
  const width = (e: ReactPointerEvent) => (which === 'sidebar' ? e.clientX - 12 : window.innerWidth - e.clientX - 12);
  return (
    <div
      className={`resizer ${which}${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize, double-click to reset"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => dragging && useLayout.getState().setWidth(which, width(e))}
      onPointerUp={() => setDragging(false)}
      onDoubleClick={() => useLayout.getState().setWidth(which, (which === 'sidebar' ? SIDEBAR : PANEL).default)}
    />
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
  const open = useLayout((s) => s.nowPlaying);
  const tab = useLayout((s) => s.playerTab);
  const l = useLayout.getState();
  const liked = !!now?.UserData?.IsFavorite;
  return (
    <footer className="playerbar">
      <div className="np">
        {now ? (
          <>
            <button className="np-art" title={open ? 'Close full player' : 'Full player'} onClick={() => l.setNowPlaying(!open)}>
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
        <button
          className={`iconbtn${panel === 'now' ? ' on dot' : ''}`}
          aria-label="Now playing view"
          title="Now playing view"
          onClick={() => l.togglePanel('now')}>
          <PanelRight size={18} />
        </button>
        <button
          className={`iconbtn${open && tab === 'lyrics' ? ' on dot' : ''}`}
          aria-label="Lyrics"
          title="Lyrics"
          disabled={!now}
          onClick={() => (open && tab === 'lyrics' ? l.setNowPlaying(false) : l.setNowPlaying(true, 'lyrics'))}>
          <MicVocal size={18} />
        </button>
        <button
          className={`iconbtn${(open ? tab === 'queue' : panel === 'queue') ? ' on dot' : ''}`}
          aria-label="Queue"
          title="Queue"
          onClick={() => (open ? l.setPlayerTab('queue') : l.togglePanel('queue'))}>
          <ListMusic size={18} />
        </button>
        <SleepButton />
        <VolumeControl />
        <button
          className={`iconbtn${open ? ' on' : ''}`}
          aria-label={open ? 'Close full player' : 'Full player'}
          title={open ? 'Close full player (Esc)' : 'Full player'}
          disabled={!now}
          onClick={() => l.setNowPlaying(!open)}>
          {open ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>
    </footer>
  );
}
