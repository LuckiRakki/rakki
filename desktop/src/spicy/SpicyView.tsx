// Spicy lyrics (word by word) in React: mounts the web mod's LyricsAnimator and feeds it the
// song's position every animation frame while the lyrics are on screen and the window isn't
// hidden. Paused, it runs on for a moment so the springs settle, then stops (no cost while
// nothing moves). The song's timing offset (lyrics/offset.ts, shared with the phone) moves the
// lyrics earlier or later. The credit line the Spicy Lyrics API's Terms ask for sits under it.
//
// Two sizes: `big` (the full player; click a line to jump there) and `card` (the right
// sidebar's lyrics card; a click opens the full player, and it rests while that's open).
import { useEffect, useRef } from 'react';

import { creditLine } from '@/lyrics/fetch';
import { useLyricsOffset } from '@/lyrics/offset';
import type { Lyrics } from '@/lyrics/types';
import { currentPosition, usePlayer } from '~/player/store';

import { LyricsAnimator } from './LyricsAnimator';
import './spicy.css';

const SETTLE_MS = 2500;

export function SpicyView({
  lyrics,
  itemId,
  variant = 'big',
  active = true,
  onOpen,
}: {
  lyrics: Lyrics;
  itemId?: string;
  variant?: 'big' | 'card';
  /** Off: the animation rests (the card while the full player covers it). */
  active?: boolean;
  onOpen?(): void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const anim = useRef<LyricsAnimator | null>(null);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  const offset = useLyricsOffset(itemId);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const position = usePlayer((s) => s.position);

  useEffect(() => {
    const a = new LyricsAnimator(mount.current!);
    a.onSeek = variant === 'card' ? null : (ms) => usePlayer.getState().seek(Math.max(0, (ms + offsetRef.current) / 1000));
    anim.current = a;
    return () => {
      a.destroy();
      anim.current = null;
    };
  }, [variant]);

  useEffect(() => {
    anim.current?.load(lyrics);
  }, [lyrics]);

  // The frame loop: always while playing; paused, only until the springs settle.
  useEffect(() => {
    if (hidden || !active) return;
    let frame = 0;
    const until = playing ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      const s = usePlayer.getState();
      anim.current?.tick(currentPosition(s) * 1000 - offsetRef.current, s.duration * 1000);
      if (performance.now() < until) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // (Paused, a seek or a timing change starts it again; playing, it never stopped.)
  }, [playing, hidden, active, lyrics, playing ? 0 : position, playing ? 0 : offset]);

  const credit = creditLine(lyrics);
  return (
    <div className={`spicy-view ${variant}`} onClick={variant === 'card' ? onOpen : undefined}>
      <div className="spicy-mount" ref={mount} />
      {credit ? <div className="spicy-credit">{credit}</div> : null}
    </div>
  );
}
