// The audio editor's equalizer: ten bands from the deepest bass to the air on top, each a
// vertical slider, with a smooth curve through them showing the shape you've made. Drag a
// band (or the space above and below it), use the arrow keys on it, or double-click it for 0.
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

const MAX_DB = 12;

/** 1000 → "1k" */
const hz = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));
/** 3.5 → "+3.5 dB" */
export const db = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) % 1 ? 1 : 0)} dB`;

/** A smooth line through the points (Catmull-Rom as Bézier curves). */
function smooth(points: [number, number][]): string {
  if (!points.length) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Equalizer({ bands, values, onChange }: { bands: readonly number[]; values: number[]; onChange(values: number[]): void }) {
  const area = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const set = (i: number, v: number) => {
    const next = [...values];
    next[i] = Math.max(-MAX_DB, Math.min(MAX_DB, Math.round(v * 2) / 2));
    if (next[i] !== values[i]) onChange(next);
  };
  const valueAt = (clientY: number) => {
    const r = area.current?.getBoundingClientRect();
    if (!r?.height) return 0;
    // The inverse of y() below.
    return ((100 - ((clientY - r.top) / r.height) * 200) / 92) * MAX_DB;
  };
  const down = (i: number) => (e: ReactPointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setActive(i);
    set(i, valueAt(e.clientY));
  };
  const key = (i: number) => (e: ReactKeyboardEvent) => {
    const by: Record<string, number | undefined> = { ArrowUp: 0.5, ArrowRight: 0.5, ArrowDown: -0.5, ArrowLeft: -0.5, PageUp: 3, PageDown: -3 };
    let to: number | null = null;
    if (by[e.key] !== undefined) to = values[i] + by[e.key]! * (e.shiftKey ? 6 : 1);
    else if (e.key === 'Home') to = MAX_DB;
    else if (e.key === 'End') to = -MAX_DB;
    else if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') to = 0;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(i, to);
  };

  // The curve, in a 1000 × 200 box (stretched to fit).
  const y = (v: number) => 100 - (v / MAX_DB) * 92;
  const points = values.map((v, i): [number, number] => [((i + 0.5) / values.length) * 1000, y(v)]);
  const line = smooth([[0, points[0]?.[1] ?? 100], ...points, [1000, points[points.length - 1]?.[1] ?? 100]]);

  return (
    <div className="eq-panel">
      <div className="eq-scale" aria-hidden>
        <span>+12</span>
        <span>0</span>
        <span>−12</span>
      </div>
      <div className="eq-area" ref={area}>
        <svg className="eq-curve" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--text)', stopOpacity: 0.16 }} />
              <stop offset="0.5" style={{ stopColor: 'var(--text)', stopOpacity: 0.02 }} />
              <stop offset="1" style={{ stopColor: 'var(--text)', stopOpacity: 0.16 }} />
            </linearGradient>
          </defs>
          <line x1="0" x2="1000" y1="100" y2="100" className="eq-zero" vectorEffect="non-scaling-stroke" />
          <path d={`${line} L1000,100 L0,100 Z`} fill="url(#eq-fill)" />
          <path d={line} className="eq-line" vectorEffect="non-scaling-stroke" />
        </svg>
        {values.map((v, i) => (
          <div
            key={bands[i]}
            className={`eq-band${active === i ? ' on' : ''}`}
            role="slider"
            tabIndex={0}
            aria-label={`${hz(bands[i])} Hz`}
            aria-valuemin={-MAX_DB}
            aria-valuemax={MAX_DB}
            aria-valuenow={v}
            aria-valuetext={db(v)}
            onPointerDown={down(i)}
            onPointerMove={(e) => active === i && set(i, valueAt(e.clientY))}
            onPointerUp={() => setActive(null)}
            onDoubleClick={() => set(i, 0)}
            onKeyDown={key(i)}>
            <span className="eq-track" />
            <span className="eq-knob" style={{ top: `${(y(v) / 200) * 100}%` }}>
              <span className="eq-value">{db(v)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="eq-freqs" aria-hidden>
        {bands.map((f) => (
          <span key={f}>{hz(f)}</span>
        ))}
      </div>
    </div>
  );
}
