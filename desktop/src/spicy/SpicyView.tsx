// Spicy lyrics (word by word) in React: mounts the web mod's LyricsAnimator and feeds it the
// song's position every animation frame while the lyrics are on screen and the window isn't
// hidden. Paused, it runs on for a moment so the springs settle, then stops (no cost while
// nothing moves). Click a line to jump there. The credit line the Spicy Lyrics API's Terms ask
// for sits under it.
import { useEffect, useRef } from 'react';

import { creditLine } from '@/lyrics/fetch';
import type { Lyrics } from '@/lyrics/types';
import { currentPosition, usePlayer } from '~/player/store';

import { LyricsAnimator } from './LyricsAnimator';
import './spicy.css';

const SETTLE_MS = 2500;

export function SpicyView({ lyrics }: { lyrics: Lyrics }) {
  const mount = useRef<HTMLDivElement>(null);
  const anim = useRef<LyricsAnimator | null>(null);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  usePlayer((s) => s.position); // a seek wakes the loop below

  useEffect(() => {
    const a = new LyricsAnimator(mount.current!);
    a.onSeek = (ms) => usePlayer.getState().seek(ms / 1000);
    anim.current = a;
    return () => {
      a.destroy();
      anim.current = null;
    };
  }, []);

  useEffect(() => {
    anim.current?.load(lyrics);
  }, [lyrics]);

  // The frame loop: always while playing; paused, only until the springs settle.
  const position = usePlayer((s) => s.position);
  useEffect(() => {
    if (hidden) return;
    let frame = 0;
    const until = playing ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      const s = usePlayer.getState();
      anim.current?.tick(currentPosition(s) * 1000, s.duration * 1000);
      if (performance.now() < until) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // (Paused, a seek starts it again; playing, it never stopped.)
  }, [playing, hidden, lyrics, playing ? 0 : position]);

  const credit = creditLine(lyrics);
  return (
    <div className="spicy-view">
      <div className="spicy-mount" ref={mount} />
      {credit ? <div className="spicy-credit">{credit}</div> : null}
    </div>
  );
}
