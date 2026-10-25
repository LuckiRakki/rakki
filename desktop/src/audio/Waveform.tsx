// The audio editor's waveform: the whole song, with the part that plays bright and the trimmed
// ends dim, fades drawn as ramps on the bars themselves, and two handles for where the song
// starts and ends. Clicking the waveform plays from there; the played part turns white, like the
// seek bar. Drawn once per change (not per frame): only the playhead and the played fill move
// while the song plays, and nothing moves while it's paused or out of sight.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { currentPosition, usePlayer } from '~/player/store';

/** The shortest a trimmed song can be, in seconds. */
const MIN_LENGTH = 1;

/** 83.4 → "1:23.4" */
export function preciseTime(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export interface WaveformProps {
  peaks: Float32Array | null;
  /** Couldn't read the song's sound: a flat line, the handles still work. */
  failed?: boolean;
  duration: number;
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
  /** dB: louder songs draw taller. */
  gain: number;
  /** This song is the one playing (the playhead shows). */
  current: boolean;
  onTrim(start: number, end: number): void;
  /** A handle was let go: play from it to hear the cut. */
  onAudition(which: 'start' | 'end'): void;
  onSeek(seconds: number): void;
}

/** How loud the bar at `t` comes out, with the trim, the fades and the gain (0 to 1+). */
function envelope(t: number, p: WaveformProps): number {
  if (t < p.start || t > p.end) return 1;
  let f = 1;
  if (p.fadeIn > 0 && t < p.start + p.fadeIn) f = Math.min(f, (t - p.start) / p.fadeIn);
  if (p.fadeOut > 0 && t > p.end - p.fadeOut) f = Math.min(f, (p.end - t) / p.fadeOut);
  return Math.max(0, f) * Math.min(2, 10 ** (p.gain / 20));
}

export function Waveform(props: WaveformProps) {
  const { peaks, duration, start, end, current } = props;
  const box = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const played = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The bars: grey where the song plays, faint where it's trimmed; the played copy in white.
  useEffect(() => {
    const draw = () => {
      const p = latest.current;
      const h = box.current?.clientHeight ?? 0;
      if (!width || !h) return;
      const dpr = window.devicePixelRatio || 1;
      const bar = 2;
      const gap = 1;
      const n = Math.max(1, Math.floor(width / (bar + gap)));
      const mid = h / 2;
      const room = mid - 3;
      for (const [canvas, inside, outside] of [
        [base.current, 'rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.15)'],
        [played.current, '#fff', 'rgba(255, 255, 255, 0.3)'],
      ] as const) {
        if (!canvas) continue;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(h * dpr);
        const g = canvas.getContext('2d');
        if (!g) continue;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, width, h);
        for (let i = 0; i < n; i++) {
          const t = ((i + 0.5) / n) * p.duration;
          let peak = 0.02;
          if (p.peaks?.length) {
            const from = Math.floor((i / n) * p.peaks.length);
            const to = Math.max(from + 1, Math.floor(((i + 1) / n) * p.peaks.length));
            for (let j = from; j < to; j++) peak = Math.max(peak, p.peaks[j]);
          }
          const amp = Math.min(1, Math.max(0.02, peak * envelope(t, p)));
          const y = Math.max(1, amp * room);
          g.fillStyle = t >= p.start && t <= p.end ? inside : outside;
          g.beginPath();
          g.roundRect(i * (bar + gap), mid - y, bar, y * 2, 1);
          g.fill();
        }
      }
    };
    // Once per frame at most, however many changes a drag makes.
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, peaks, duration, start, end, props.fadeIn, props.fadeOut, props.gain]);

  // The playhead and the played fill follow the song while it plays here.
  useEffect(() => {
    const place = (at: number | null) => {
      const pct = at === null || duration <= 0 ? null : Math.max(0, Math.min(100, (at / duration) * 100));
      if (head.current) {
        head.current.style.display = pct === null ? 'none' : '';
        head.current.style.left = `${pct ?? 0}%`;
      }
      if (played.current) played.current.style.clipPath = `inset(0 ${100 - (pct ?? 0)}% 0 0)`;
    };
    if (!current) return place(null);
    let raf = 0;
    const tick = () => {
      const s = usePlayer.getState();
      place(currentPosition(s));
      if (s.playing && !s.hidden) raf = requestAnimationFrame(tick);
    };
    tick();
    const off = usePlayer.subscribe((s, prev) => {
      if (s.playing !== prev.playing || s.position !== prev.position || s.hidden !== prev.hidden) {
        cancelAnimationFrame(raf);
        tick();
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, [current, duration]);

  const timeAt = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r?.width) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  const clampTrim = (which: 'start' | 'end', t: number): [number, number] =>
    which === 'start' ? [Math.max(0, Math.min(t, end - MIN_LENGTH)), end] : [start, Math.min(duration, Math.max(t, start + MIN_LENGTH))];

  const grab = (which: 'start' | 'end') => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(which);
  };
  const onMove = (e: ReactPointerEvent) => {
    const t = timeAt(e.clientX);
    if (dragging) {
      const [s, en] = clampTrim(dragging, t);
      props.onTrim(Math.round(s * 10) / 10, Math.round(en * 10) / 10);
    } else setHover(t);
  };
  const onUp = () => {
    if (dragging) props.onAudition(dragging);
    setDragging(null);
  };
  const handleKey = (which: 'start' | 'end') => (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 1 : 0.1;
    const now = which === 'start' ? start : end;
    const to: number | null =
      e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? now - step
        : e.key === 'ArrowRight' || e.key === 'ArrowUp'
          ? now + step
          : e.key === 'Home'
            ? which === 'start'
              ? 0
              : start + MIN_LENGTH
            : e.key === 'End'
              ? which === 'end'
                ? duration
                : end - MIN_LENGTH
              : null;
    if (to === null) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        props.onAudition(which);
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const [s, en] = clampTrim(which, Math.round(to * 10) / 10);
    props.onTrim(s, en);
  };

  const pct = (t: number) => `${duration > 0 ? (t / duration) * 100 : 0}%`;
  return (
    <div
      className={`wave${dragging ? ' dragging' : ''}${peaks ? '' : ' empty'}${props.failed ? ' failed' : ''}`}
      ref={box}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        if (e.button === 0 && !dragging) props.onSeek(timeAt(e.clientX));
      }}>
      <canvas ref={base} className="wave-canvas" aria-hidden />
      <canvas ref={played} className="wave-canvas wave-played" aria-hidden />
      <div className="wave-head" ref={head} aria-hidden />
      {hover !== null && !dragging ? (
        <div className="wave-hover" style={{ left: pct(hover) }} aria-hidden>
          <span>{preciseTime(hover)}</span>
        </div>
      ) : null}
      {(['start', 'end'] as const).map((which) => {
        const t = which === 'start' ? start : end;
        return (
          <div
            key={which}
            className={`wave-handle ${which}${dragging === which ? ' on' : ''}`}
            style={{ left: pct(t) }}
            role="slider"
            tabIndex={0}
            aria-label={which === 'start' ? 'Starts At' : 'Ends At'}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration * 10) / 10}
            aria-valuenow={Math.round(t * 10) / 10}
            aria-valuetext={preciseTime(t)}
            title={which === 'start' ? 'Drag to where the song should start' : 'Drag to where the song should end'}
            onPointerDown={grab(which)}
            onKeyDown={handleKey(which)}>
            <span className="wave-grip" />
            <span className="wave-label">{preciseTime(t)}</span>
          </div>
        );
      })}
    </div>
  );
}
