// Lyrics, line by line ("Regular" in the phone app): the sung line lit, the view following it,
// click a line to jump there. Uses the phone app's loader (word-timed TTML from the Rakki plugin,
// else Jellyfin's own lyrics) and its credits. Spicy mode (word by word) comes next.
//
// Three sizes: `card` (the lyrics card in the Now Playing sidebar), `panel`, and `big` (the full
// player: big, left-aligned, lines further from the sung one dimmer and softer, like Feishin).
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { creditRows, useLyrics } from '@/lyrics/fetch';
import type { Lyrics } from '@/lyrics/types';
import { useLyricsOffset } from '@/lyrics/offset';
import { useSettings } from '@/settings/store';
import { useLayout } from '~/layout/layout';
import { currentPosition, usePlayer } from '~/player/store';
import { SpicyView } from '~/spicy/SpicyView';
import { Loading } from '~/ui/states';

export function pickLyrics(bundle: { ttml: Lyrics | null; lrc: Lyrics | null } | undefined): Lyrics | null {
  if (!bundle) return null;
  const { ttml, lrc } = bundle;
  // A synced source beats an unsynced one; TTML first otherwise.
  if (ttml?.isSynced) return ttml;
  if (lrc?.isSynced) return lrc;
  return ttml ?? lrc;
}

/** The index of the line being sung at `ms`, or -1 before the first. */
function lineAt(lyrics: Lyrics, ms: number): number {
  let at = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    if (lyrics.lines[i].startMs <= ms) at = i;
    else break;
  }
  return at;
}

export function LyricsView({ variant = 'panel', onOpen }: { variant?: 'panel' | 'big' | 'card'; onOpen?(): void }) {
  const item = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  // A radio station has no lyrics here.
  const q = useLyrics(item?.Radio ? undefined : item?.Id);
  const lyrics = pickLyrics(q.data);
  const [current, setCurrent] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(0);
  // The song's timing offset (lyrics/offset.ts, shared with the phone; positive = later).
  const offset = useLyricsOffset(item?.Id);
  const mode = useSettings((s) => s.lyricsMode);
  // The card rests while the full player covers it.
  const covered = useLayout((s) => s.nowPlaying);

  // Follow the song a few times a second while it plays and the lyrics are on screen.
  useEffect(() => {
    if (!lyrics?.isSynced) return setCurrent(-1);
    const update = () => setCurrent(lineAt(lyrics, currentPosition(usePlayer.getState()) * 1000 + 150 - offset));
    update();
    if (!playing || hidden) return;
    const id = setInterval(update, 120);
    return () => clearInterval(id);
  }, [lyrics, playing, hidden, offset]);
  usePlayer((s) => s.position); // a seek updates the line at once

  // Keep the sung line in view (unless you've just scrolled yourself). Scrolls this box only,
  // never the page or sidebar around it.
  useEffect(() => {
    const b = box.current;
    const el = b?.querySelector<HTMLElement>(`[data-line="${Math.max(0, current)}"]`);
    if (!b || !el || Date.now() - userScrolled.current < 3000) return;
    const top = el.offsetTop - b.clientHeight * (variant === 'big' ? 0.4 : 0.35) + el.offsetHeight / 2;
    b.scrollTo({ top: Math.max(0, top), behavior: current < 0 ? 'auto' : 'smooth' });
  }, [current, variant, lyrics]);

  if (!item) return <div className="lyrics-empty">Play something to see its lyrics.</div>;
  if (item.Radio) return <div className="lyrics-empty">No lyrics for radio.</div>;
  if (q.isLoading) return <Loading what="lyrics" />;
  if (!lyrics) return <div className="lyrics-empty">No lyrics for this song.</div>;
  // Spicy (word by word) in the sidebar's card too, when that's the lyrics style.
  if (variant === 'card' && mode === 'spicy') return <SpicyView lyrics={lyrics} itemId={item.Id} variant="card" active={!covered} onOpen={onOpen} />;

  return (
    <div
      className={`lyrics ${variant}${lyrics.isSynced ? '' : ' unsynced'}`}
      ref={box}
      onWheel={() => (userScrolled.current = Date.now())}
      onClick={variant === 'card' ? onOpen : undefined}>
      {lyrics.lines.map((line, i) => (
        <p
          key={i}
          data-line={i}
          className={i === current ? 'on' : i < current ? 'past' : undefined}
          style={variant === 'big' && lyrics.isSynced ? ({ '--d': Math.min(4, Math.abs(i - Math.max(0, current))) } as CSSProperties) : undefined}
          onClick={
            lyrics.isSynced && variant !== 'card'
              ? () => {
                  userScrolled.current = 0;
                  usePlayer.getState().seek(Math.max(0, (line.startMs + offset) / 1000));
                }
              : undefined
          }>
          {line.text || ' '}
        </p>
      ))}
      {variant === 'card' ? null : (
        <div className="lyrics-credits">
          {creditRows(lyrics).map((row, i) => (
            <div key={i} className={row.small ? 'small' : undefined}>
              {row.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
