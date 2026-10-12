// Lyrics, line by line ("Regular" in the phone app): the sung line lit, the view following it,
// click a line to jump there. Uses the phone app's loader (word-timed TTML from the Rakki plugin,
// else Jellyfin's own lyrics) and its credits. Spicy mode (word by word) comes next.
import { useEffect, useRef, useState } from 'react';

import { creditRows, useLyrics } from '@/lyrics/fetch';
import type { Lyrics } from '@/lyrics/types';
import { currentPosition, usePlayer } from '~/player/store';
import { Spinner } from '~/ui/parts';

function pick(bundle: { ttml: Lyrics | null; lrc: Lyrics | null } | undefined): Lyrics | null {
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

export function LyricsView({ big = false }: { big?: boolean }) {
  const item = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  const q = useLyrics(item?.Id);
  const lyrics = pick(q.data);
  const [current, setCurrent] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(0);

  // Follow the song a few times a second while it plays and the lyrics are on screen.
  useEffect(() => {
    if (!lyrics?.isSynced) return setCurrent(-1);
    const update = () => setCurrent(lineAt(lyrics, currentPosition(usePlayer.getState()) * 1000 + 150));
    update();
    if (!playing || hidden) return;
    const id = setInterval(update, 120);
    return () => clearInterval(id);
  }, [lyrics, playing, hidden]);
  usePlayer((s) => s.position); // a seek updates the line at once

  // Keep the sung line in view (unless you've just scrolled yourself).
  useEffect(() => {
    if (current < 0 || Date.now() - userScrolled.current < 3000) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  if (!item) return <div className="lyrics-empty">Play something to see its lyrics.</div>;
  if (q.isLoading) return <Spinner />;
  if (!lyrics) return <div className="lyrics-empty">No lyrics for this song.</div>;

  return (
    <div className={`lyrics${big ? ' big' : ''}${lyrics.isSynced ? '' : ' unsynced'}`} ref={box} onWheel={() => (userScrolled.current = Date.now())}>
      {lyrics.lines.map((line, i) => (
        <p
          key={i}
          data-line={i}
          className={i === current ? 'on' : i < current ? 'past' : undefined}
          onClick={lyrics.isSynced ? () => usePlayer.getState().seek(line.startMs / 1000) : undefined}>
          {line.text || ' '}
        </p>
      ))}
      <div className="lyrics-credits">
        {creditRows(lyrics).map((row, i) => (
          <div key={i} className={row.small ? 'small' : undefined}>
            {row.text}
          </div>
        ))}
      </div>
    </div>
  );
}
