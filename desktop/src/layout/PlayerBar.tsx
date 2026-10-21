// The player bar along the bottom: the song, the transport and seek bar, and the buttons on the
// right. It belongs to a music video while one is open (player/VideoHost.tsx VideoBar) and to
// another device while you control one (layout/RemoteBar.tsx). In a narrow window the less-used
// buttons move into a More menu so nothing overlaps; Lyrics always stays.
import { useCallback, useEffect, useRef, useState } from 'react';

import { DevicesButton } from '~/layout/Devices';
import { useLayout } from '~/layout/layout';
import { setMini } from '~/layout/MiniPlayer';
import { RemoteBar } from '~/layout/RemoteBar';
import { songMenu } from '~/library/menus';
import { useNoLyrics } from '~/lyrics/LyricsView';
import { go } from '~/nav';
import { useLivePosition } from '~/player/position';
import { useRemote } from '~/player/remote';
import { useSleep } from '~/player/sleep';
import { usePlayer } from '~/player/store';
import { useVideo } from '~/player/video';
import { VideoBar } from '~/player/VideoHost';
import {
  ListMusic,
  Maximize2,
  MicVocal,
  Minimize2,
  Moon,
  MoreHorizontal,
  PanelRight,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from '~/ui/icons';
import { openMenu, type MenuItem } from '~/ui/overlays';
import { ArtistLinks, Artwork, formatTime, SaveButton } from '~/ui/parts';
import { Range } from '~/ui/Range';

export function Transport({ size = 'normal' }: { size?: 'normal' | 'big' }) {
  const { playing, shuffle, repeat } = usePlayer();
  const p = usePlayer.getState();
  const s = size === 'big' ? 1.3 : 1;
  return (
    <div className={`buttons${size === 'big' ? ' big' : ''}`}>
      <button
        className={`iconbtn${shuffle ? ' on dot' : ''}`}
        aria-label="Shuffle"
        aria-pressed={shuffle}
        title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
        onClick={() => p.toggleShuffle()}>
        <Shuffle size={20 * s} />
      </button>
      <button className="iconbtn" aria-label="Previous" title="Previous" onClick={() => p.previous()}>
        <SkipBack size={20 * s} />
      </button>
      <button className="pp" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => p.toggle()}>
        {playing ? <Pause size={20 * s} /> : <Play size={20 * s} style={{ marginLeft: 2 }} />}
      </button>
      <button className="iconbtn" aria-label="Next" title="Next" onClick={() => p.next()}>
        <SkipForward size={20 * s} />
      </button>
      <button
        className={`iconbtn${repeat !== 'off' ? ' on dot' : ''}`}
        aria-label={repeat === 'off' ? 'Repeat: off' : repeat === 'all' ? 'Repeat: all' : 'Repeat: this song'}
        title={repeat === 'off' ? 'Repeat: off' : repeat === 'all' ? 'Repeat: all' : 'Repeat: this song'}
        onClick={() => p.setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')}>
        {repeat === 'one' ? <Repeat1 size={20 * s} /> : <Repeat size={20 * s} />}
      </button>
    </div>
  );
}

export function SeekBar() {
  const duration = usePlayer((s) => s.duration);
  const live = usePlayer((s) => !!s.queue[s.index]?.Radio);
  const position = useLivePosition();
  if (live) {
    return (
      <div className="seek live">
        <span className="live-pill">Live</span>
      </div>
    );
  }
  return (
    <div className="seek">
      <span>{formatTime(position)}</span>
      <Range
        label="Seek"
        value={position}
        max={duration}
        step={5}
        valueText={(v) => `${formatTime(v)} of ${formatTime(duration)}`}
        onSet={(v) => usePlayer.getState().seek(v)}
      />
      <span>{formatTime(duration)}</span>
    </div>
  );
}

/** The sleep timer's choices (the button's menu, and the More menu's). */
function sleepMenu(): { items: MenuItem[]; title: string } {
  const { endsAt, endOfSong } = useSleep.getState();
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 60_000)) : 0;
  const choose = (m: number | 'song' | null) => () => useSleep.getState().set(m);
  return {
    items: [
      { label: '15 minutes', run: choose(15) },
      { label: '30 minutes', run: choose(30) },
      { label: '45 minutes', run: choose(45) },
      { label: '1 hour', run: choose(60) },
      { label: 'End of This Song', run: choose('song') },
      ...(endsAt ? [{ label: 'Turn Off', run: choose(null), divider: true, danger: true }] : []),
    ],
    title: endsAt ? (endOfSong ? 'Pausing at the end of this song' : `Pausing in ${left} min`) : 'Pause after',
  };
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
  return (
    <button
      className={`iconbtn${endsAt ? ' on' : ''}`}
      aria-label="Sleep Timer"
      title={endsAt ? (endOfSong ? 'Sleep timer: end of this song' : `Sleep timer: ${left} min left`) : 'Sleep Timer'}
      onClick={(e) => {
        const m = sleepMenu();
        openMenu(e, m.items, m.title);
      }}>
      <Moon size={19} />
      {endsAt && !endOfSong ? <span className="badge">{left}</span> : null}
    </button>
  );
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const [last, setLast] = useState(volume || 80);
  const Icon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div className="volume" title={`Volume ${volume}% (scroll to change)`} onWheel={(e) => usePlayer.getState().setVolume(volume + (e.deltaY < 0 ? 5 : -5))}>
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
        <Icon size={20} />
      </button>
      <div className="vol">
        <Range label="Volume" value={volume} max={100} step={5} valueText={(v) => `${Math.round(v)}%`} onSet={(v) => usePlayer.getState().setVolume(v)} />
      </div>
    </div>
  );
}

/** How much room the bar has: everything, the extras in a menu, or the essentials only. */
type Fit = 'wide' | 'compact' | 'tight';

// A callback ref, so the bar is measured again each time it comes back (after a music video or
// controlling another device the footer is a new element). A width of 0 (the bar gone or hidden
// in full screen) is ignored: it used to leave the bar on 'tight' with the Lyrics button gone.
function useFit(): [Fit, (el: HTMLElement | null) => void] {
  const [fit, setFit] = useState<Fit>('wide');
  const ro = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const o = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w > 0) setFit(w >= 1150 ? 'wide' : w >= 940 ? 'compact' : 'tight');
    });
    o.observe(el);
    ro.current = o;
  }, []);
  return [fit, measure];
}

export function PlayerBar() {
  const now = usePlayer((s) => s.queue[s.index]);
  const error = usePlayer((s) => s.error);
  const panel = useLayout((s) => s.panel);
  const open = useLayout((s) => s.nowPlaying);
  const tab = useLayout((s) => s.playerTab);
  const lyricsView = useLayout((s) => s.lyricsView);
  const target = useRemote((s) => s.target);
  const video = useVideo((s) => s.video);
  const [fit, bar] = useFit();
  const noLyrics = useNoLyrics(now);
  const l = useLayout.getState();
  // A music video: the bar is the video's. Another device picked in Devices: that device's.
  if (video) return <VideoBar video={video} />;
  if (target) return <RemoteBar target={target} />;

  // The lyrics take the main area (the full player open: its Lyrics tab, as before).
  const toggleLyrics = () => (open ? (tab === 'lyrics' ? l.setNowPlaying(false) : l.setPlayerTab('lyrics')) : l.setLyricsView(!lyricsView));
  const lyricsOn = open ? tab === 'lyrics' : lyricsView;
  const more = (e: React.MouseEvent) => {
    const sleep = sleepMenu();
    const items: MenuItem[] = [
      ...(fit === 'tight'
        ? [
            { label: panel === 'now' ? 'Hide Now Playing View' : 'Now Playing View', icon: PanelRight, run: () => l.togglePanel('now') },
          ]
        : []),
      { label: 'Sleep Timer', icon: Moon, run: () => openMenu(e, sleep.items, sleep.title), divider: fit === 'tight' },
      { label: 'Mini Player', icon: PictureInPicture2, run: () => void setMini(true) },
    ];
    openMenu(e, items);
  };

  return (
    <footer className={`playerbar fit-${fit}`} ref={bar}>
      <div className="np">
        {now ? (
          <>
            <button key={now.Id} className="np-art" title={open ? 'Close Full Player' : 'Full Player'} aria-label={open ? 'Close Full Player' : 'Full Player'} onClick={() => l.setNowPlaying(!open)}>
              <Artwork item={now} size={160} className="thumb" />
              <span className="expand">
                <Maximize2 size={14} />
              </span>
            </button>
            <div key={`t-${now.Id}`} className="t" onContextMenu={now.Radio ? undefined : (e) => openMenu(e, songMenu([now]))}>
              <div className="name linkish" onClick={() => now.AlbumId && go({ name: 'album', id: now.AlbumId })}>
                {now.Name}
              </div>
              <div className="by">
                <ArtistLinks item={now} />
              </div>
            </div>
            <SaveButton item={now} size={19} />
          </>
        ) : null}
      </div>
      <div className="controls">
        <Transport />
        <SeekBar />
        {error ? <div className="error small">{error}</div> : null}
      </div>
      <div className="right">
        {fit !== 'tight' ? (
          <button className={`iconbtn${panel === 'now' ? ' on dot' : ''}`} aria-label="Now Playing View" aria-pressed={panel === 'now'} title="Now Playing View" onClick={() => l.togglePanel('now')}>
            <PanelRight size={19} />
          </button>
        ) : null}
        <button
          className={`iconbtn${lyricsOn ? ' on dot' : ''}`}
          aria-label={noLyrics ? 'Lyrics (No Lyrics Found)' : 'Lyrics'}
          aria-pressed={lyricsOn}
          title={noLyrics ? 'No Lyrics Found' : 'Lyrics'}
          disabled={!now}
          onClick={toggleLyrics}>
          <MicVocal size={19} />
        </button>
        <button
          className={`iconbtn${(open ? tab === 'queue' : panel === 'queue') ? ' on dot' : ''}`}
          aria-label="Queue"
          aria-pressed={open ? tab === 'queue' : panel === 'queue'}
          title="Queue"
          onClick={() => (open ? l.setPlayerTab('queue') : l.togglePanel('queue'))}>
          <ListMusic size={20} />
        </button>
        {fit === 'wide' ? <SleepButton /> : null}
        <DevicesButton />
        <VolumeControl />
        {fit === 'wide' ? (
          <button className="iconbtn" aria-label="Mini Player" title="Mini Player" onClick={() => void setMini(true)}>
            <PictureInPicture2 size={19} />
          </button>
        ) : (
          <button className="iconbtn" aria-label="More" title="More" onClick={more}>
            <MoreHorizontal size={20} />
          </button>
        )}
        <button
          className={`iconbtn${open ? ' on' : ''}`}
          aria-label={open ? 'Close Full Player' : 'Full Player'}
          title={open ? 'Close Full Player (Esc)' : 'Full Player'}
          disabled={!now}
          onClick={() => l.setNowPlaying(!open)}>
          {open ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
      </div>
    </footer>
  );
}
