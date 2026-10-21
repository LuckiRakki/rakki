// Spicy lyrics (word by word) in React: mounts the web mod's LyricsAnimator and feeds it the
// song's position every animation frame while the lyrics are on screen and the window isn't
// hidden. Paused, it runs on for a moment so the springs settle, then stops (no cost while
// nothing moves). The song's timing offset (lyrics/offset.ts, shared with the phone) moves the
// lyrics earlier or later.
//
// As in the web mod, the lyrics end with their credits (written by, provider, synced by: the
// Spicy Lyrics API's Terms ask for the last two) and, once the singing is over or the song has
// 15 seconds left, a Next up card for the following song (click: the queue).
//
// Two sizes: `big` (the full player; click a line to jump there) and `card` (the right
// sidebar's lyrics card; a click opens the full player, and it rests while that's open; it keeps
// a one-line credit under it, since the card is too small to reach the end).
import { useEffect, useRef } from 'react';

import { creditLine, creditRows } from '@/lyrics/fetch';
import { useLyricsOffset } from '@/lyrics/offset';
import type { Lyrics } from '@/lyrics/types';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { currentPosition, usePlayer } from '~/player/store';
import { useLook } from '~/settings/look';

import { LyricsAnimator } from './LyricsAnimator';
import { openLink } from '~/lib/links';
import './spicy.css';

const SETTLE_MS = 2500;
const NEXT_UP_S = 15;

export function SpicyView({
  lyrics,
  itemId,
  variant = 'big',
  active = true,
  onOpen,
  onNextUp,
}: {
  lyrics: Lyrics;
  itemId?: string;
  variant?: 'big' | 'card';
  /** Off: the animation rests (the card while the full player covers it). */
  active?: boolean;
  onOpen?(): void;
  /** The Next up card clicked (default: the full player's queue). */
  onNextUp?(): void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const anim = useRef<LyricsAnimator | null>(null);
  const playing = usePlayer((s) => s.playing);
  const hidden = usePlayer((s) => s.hidden);
  const next = usePlayer((s) => (s.repeat === 'one' ? undefined : s.queue[s.index + 1]));
  const client = useAuth((s) => s.client);
  const offset = useLyricsOffset(itemId);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const position = usePlayer((s) => s.position);
  const big = variant === 'big';
  const nextUpRef = useRef(onNextUp);
  nextUpRef.current = onNextUp;

  useEffect(() => {
    const a = new LyricsAnimator(mount.current!);
    a.onSeek = big ? (ms) => usePlayer.getState().seek(Math.max(0, (ms + offsetRef.current) / 1000)) : null;
    a.onLink = (url) => openLink(url);
    anim.current = a;
    return () => {
      a.destroy();
      anim.current = null;
    };
  }, [big]);

  useEffect(() => {
    anim.current?.load(lyrics, big ? creditRows(lyrics).map((r) => ({ text: r.text, small: r.small, link: r.link, avatar: r.avatar })) : undefined);
  }, [lyrics, big]);

  // Text size changed (Settings -> Lyrics, or Aa): centre the sung line again, even if paused.
  const lyricsSize = useLook((s) => s.lyricsSize);
  useEffect(() => anim.current?.relayout(), [lyricsSize]);

  // The Next up card at the end (full player only).
  useEffect(() => {
    const a = anim.current;
    if (!a || !big) return;
    a.setNextUp(
      next && !next.Radio ? { title: next.Name, artist: next.Artists?.join(', ') ?? next.AlbumArtist ?? '', artUrl: client?.imageUrl(next, 120) ?? null } : null,
      () => (nextUpRef.current ? nextUpRef.current() : useLayout.getState().setPlayerTab('queue')),
    );
  }, [next?.Id, lyrics, big, client]); // eslint-disable-line react-hooks/exhaustive-deps

  // The frame loop: always while playing; paused, only until the springs settle.
  useEffect(() => {
    if (hidden || !active) return;
    let frame = 0;
    const until = playing ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      const s = usePlayer.getState();
      const ms = currentPosition(s) * 1000 - offsetRef.current;
      const a = anim.current;
      a?.tick(ms, s.duration * 1000);
      if (a && big) {
        const end = a.getLastLyricEnd();
        a.showNextUp((end > 0 && ms >= end) || (s.duration > 30 && s.duration - currentPosition(s) <= NEXT_UP_S));
      }
      if (performance.now() < until) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // (Paused, a seek or a timing change starts it again; playing, it never stopped.)
  }, [playing, hidden, active, lyrics, big, next?.Id, playing ? 0 : position, playing ? 0 : offset, lyricsSize]);

  const credit = big ? null : creditLine(lyrics);
  return (
    <div className={`spicy-view ${variant}`} onClick={big ? undefined : onOpen}>
      <div className="spicy-mount" ref={mount} />
      {credit ? <div className="spicy-credit">{credit}</div> : null}
    </div>
  );
}
