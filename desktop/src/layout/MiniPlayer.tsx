// The mini player (Rakki 2.0, the Frost mock): the window itself shrinks to a small player that
// stays on top of other windows (a second window would mean a second webview, ~100 MB more).
// The cover, the song, one glass pill with previous / play / next and the clean play bar; with
// Lyrics on (Settings → Look), the sung line under it. Keep on Top and Full Window show on hover;
// Esc grows the window back. Drag it anywhere. The theme in use carries over: its colours, its
// rules for .mini, and its backdrop (the cover, still or flowing) behind the little window too.
import { LogicalSize } from '@tauri-apps/api/dpi';
import { Maximize2, Music, Pause, Pin, PinOff, Play, SkipBack, SkipForward } from '~/ui/icons';
import { useEffect, useState } from 'react';

import { creditLine, useLyrics } from '@/lyrics/fetch';
import { useLyricsOffset } from '@/lyrics/offset';
import type { Lyrics } from '@/lyrics/types';

import { artColor } from '@/lib/blurhash';
import { useAuth } from '~/auth/session';
import { useLivePosition } from '~/player/position';
import { Range } from '~/ui/Range';
import { leaveFullscreen, useLayout, win } from '~/layout/layout';
import { currentPosition, usePlayer } from '~/player/store';
import { pickLyrics } from '~/lyrics/LyricsView';
import { ThemeBackdrop } from '~/themes/ThemeBackdrop';
import { ArtistLinks, Artwork } from '~/ui/parts';

export const MINI = { width: 380, height: 132 };
/** With the sung line under the controls. */
export const MINI_LYRICS = { width: 380, height: 196 };

const miniSize = () => (useLayout.getState().miniLyrics ? MINI_LYRICS : MINI);

let before: { width: number; height: number; maximized: boolean } | null = null;

/** Into the mini player (remembering the window's size) or back out. */
export async function setMini(on: boolean) {
  const l = useLayout.getState();
  if (on === l.mini) return;
  if (!win) return useLayout.setState({ mini: on });
  if (on) {
    // Full screen first: the size to come back to is the window's, not the screen's.
    await leaveFullscreen();
    const size = (await win.innerSize()).toLogical(await win.scaleFactor());
    before = { width: size.width, height: size.height, maximized: await win.isMaximized() };
    if (before.maximized) await win.unmaximize();
    useLayout.setState({ mini: true, nowPlaying: false });
    const small = miniSize();
    await win.setMinSize(new LogicalSize(small.width, small.height));
    await win.setSize(new LogicalSize(small.width, small.height));
    await win.setResizable(false);
    await win.setAlwaysOnTop(l.miniOnTop);
  } else {
    useLayout.setState({ mini: false });
    await win.setAlwaysOnTop(false);
    await win.setResizable(true);
    await win.setMinSize(new LogicalSize(900, 600));
    await win.setSize(new LogicalSize(before?.width ?? 1280, before?.height ?? 800));
    if (before?.maximized) await win.toggleMaximize();
  }
}

/** Lyrics on or off for the mini player; resizes the little window when it's showing. */
export async function setMiniLyrics(on: boolean) {
  useLayout.getState().setMiniLyrics(on);
  if (!win || !useLayout.getState().mini) return;
  const size = miniSize();
  await win.setMinSize(new LogicalSize(size.width, size.height));
  await win.setSize(new LogicalSize(size.width, size.height));
}

/** How long "Couldn't play, trying the next song" stays up. */
const FAILED_MS = 4000;

export function MiniPlayer() {
  const item = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const duration = usePlayer((s) => s.duration);
  const error = usePlayer((s) => s.error);
  const onTop = useLayout((s) => s.miniOnTop);
  const withLyrics = useLayout((s) => s.miniLyrics);
  const client = useAuth((s) => s.client);
  const position = useLivePosition();
  const [hover, setHover] = useState(false);
  const [failedAt, setFailedAt] = useState(0);
  const p = usePlayer.getState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void setMini(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A song that won't play: the player moves on by itself, so the note stays a few seconds.
  useEffect(() => {
    if (!error) return;
    setFailedAt(Date.now());
    const id = setTimeout(() => setFailedAt(0), FAILED_MS);
    return () => clearTimeout(id);
  }, [error]);

  const tint = item && client ? artColor(client.blurhash(item), '#1b1b1e') : '#1b1b1e';
  return (
    <div
      className={`mini${hover ? ' hover' : ''}${item ? '' : ' empty'}${withLyrics ? ' with-lyrics' : ''}`}
      style={{ ['--tint' as string]: tint }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-tauri-drag-region>
      {item ? <ThemeBackdrop /> : null}
      <div className="mini-main" data-tauri-drag-region>
        {item ? (
          <Artwork item={item} size={240} className="mini-art" />
        ) : (
          <div className="mini-art mini-art-empty" aria-hidden>
            <Music size={36} />
          </div>
        )}
        <div className="mini-body" data-tauri-drag-region>
          <div className="mini-top" data-tauri-drag-region>
            <div className="mini-text" data-tauri-drag-region>
              <div className="mini-title" data-tauri-drag-region>
                {item?.Name ?? 'Nothing Playing'}
              </div>
              {failedAt ? (
                <div className="mini-by mini-failed" role="status">
                  <span className="mini-dot" />
                  Couldn&apos;t play, trying the next song
                </div>
              ) : (
                <div className="mini-by">{item ? <ArtistLinks item={item} /> : 'Pick a song in Rakki and it plays here'}</div>
              )}
            </div>
            <div className="mini-window">
              <button
                className={`iconbtn${onTop ? ' on' : ''}`}
                aria-label={onTop ? 'Stop Keeping on Top' : 'Keep on Top'}
                title={onTop ? 'Stop keeping on top' : 'Keep on top of other windows'}
                onClick={() => {
                  useLayout.getState().setMiniOnTop(!onTop);
                  void win?.setAlwaysOnTop(!onTop);
                }}>
                {onTop ? <Pin size={15} /> : <PinOff size={15} />}
              </button>
              <button className="iconbtn" aria-label="Back to the Full Window" title="Back to the full window (Esc)" onClick={() => void setMini(false)}>
                <Maximize2 size={15} />
              </button>
            </div>
          </div>
          <div className="mini-controls">
            <button className="iconbtn" aria-label="Previous" title="Previous" disabled={!item} onClick={() => p.previous()}>
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button className="pp" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} disabled={!item} onClick={() => p.toggle()}>
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <button className="iconbtn" aria-label="Next" title="Next" disabled={!item} onClick={() => p.next()}>
              <SkipForward size={18} fill="currentColor" />
            </button>
          </div>
          {item ? (
            <div className="mini-seek">
              <Range label="Seek" step={5} value={position} max={duration} onSet={(v) => p.seek(v)} />
            </div>
          ) : null}
        </div>
      </div>
      {withLyrics && item && !item.Radio ? <MiniLyrics itemId={item.Id} /> : null}
    </div>
  );
}

/** The word being sung splits the line: what's been sung is white, the rest dimmer. */
function sungSplit(lyrics: Lyrics, ms: number): { line: number; sung: string; rest: string } {
  let line = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    if (lyrics.lines[i].startMs <= ms) line = i;
    else break;
  }
  const l = lyrics.lines[line];
  if (!l) return { line, sung: '', rest: '' };
  if (!l.words?.length) return { line, sung: l.text, rest: '' };
  let sung = '';
  let rest = '';
  for (const w of l.words) {
    if (w.startMs <= ms) sung += w.text;
    else rest += w.text;
  }
  return { line, sung, rest };
}

/** The sung line and the lyrics' credit (shown wherever its lyrics are, per the Spicy Lyrics terms). */
function MiniLyrics({ itemId }: { itemId: string }) {
  const q = useLyrics(itemId);
  const lyrics = pickLyrics(q.data);
  const offset = useLyricsOffset(itemId);
  const playing = usePlayer((s) => s.playing);
  usePlayer((s) => s.position); // a seek moves the line at once
  const [, tick] = useState(0);

  useEffect(() => {
    if (!playing || !lyrics?.isSynced) return;
    const id = setInterval(() => tick((n) => n + 1), 120);
    return () => clearInterval(id);
  }, [playing, lyrics]);

  if (!lyrics?.isSynced) {
    return <div className="mini-lyrics muted">{q.isLoading ? ' ' : 'No synced lyrics for this song'}</div>;
  }
  const ms = currentPosition(usePlayer.getState()) * 1000 + 150 - offset;
  const { line, sung, rest } = sungSplit(lyrics, ms);
  const credit = creditLine(lyrics);
  return (
    <div className="mini-lyrics">
      <div className="mini-line" key={line}>
        {line < 0 ? (
          <span className="rest">{lyrics.lines[0]?.text}</span>
        ) : (
          <>
            <span>{sung}</span>
            <span className="rest">{rest}</span>
          </>
        )}
      </div>
      {credit ? <div className="mini-credit">{credit}</div> : null}
    </div>
  );
}
