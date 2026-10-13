// A thin bar you click, drag, scroll or use from the keyboard (seek, volume): a slider to
// screen readers, with arrow keys (Shift for bigger steps), Page Up / Down, Home and End.
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

export function Range({
  value,
  max,
  onSet,
  onWheelStep,
  label,
  step = 1,
  valueText,
}: {
  value: number;
  max: number;
  onSet(v: number): void;
  onWheelStep?: number;
  /** What it changes ("Seek", "Volume"). */
  label: string;
  /** One arrow key press. */
  step?: number;
  /** How a screen reader says the value ("1:23 of 3:40"). */
  valueText?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * max;
  };
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const shown = drag ?? value;
  const pct = max > 0 ? Math.max(0, Math.min(100, (shown / max) * 100)) || 0 : 0;

  const onKey = (e: ReactKeyboardEvent) => {
    const big = Math.max(step * 5, max / 10);
    const by: Record<string, number | undefined> = {
      ArrowRight: e.shiftKey ? big : step,
      ArrowUp: e.shiftKey ? big : step,
      ArrowLeft: -(e.shiftKey ? big : step),
      ArrowDown: -(e.shiftKey ? big : step),
      PageUp: big,
      PageDown: -big,
    };
    let to: number | null = null;
    if (by[e.key] !== undefined) to = clamp(value + by[e.key]!);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = max;
    if (to === null || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    onSet(to);
  };

  return (
    <div
      className={`range${drag !== null ? ' dragging' : ''}`}
      ref={ref}
      role="slider"
      tabIndex={max > 0 ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={valueText?.(shown)}
      aria-disabled={max > 0 ? undefined : true}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(at(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(at(e))}
      onPointerUp={(e) => {
        if (drag !== null) onSet(at(e));
        setDrag(null);
      }}
      onWheel={onWheelStep ? (e) => onSet(clamp(value + (e.deltaY < 0 ? onWheelStep : -onWheelStep))) : undefined}>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="knob" style={{ left: `${pct}%` }} />
    </div>
  );
}
