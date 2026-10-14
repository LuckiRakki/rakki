// A slider with its value beside it, over any range (Settings, the lyrics size popover).
import { Range } from '~/ui/Range';

export function Slider({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show(v: number): string;
  onChange(v: number): void;
}) {
  const snap = (v: number) => Math.round(v / step) * step;
  return (
    <div className="slider">
      <Range label={label} value={value - min} max={max - min} step={step} valueText={(v) => show(v + min)} onSet={(v) => onChange(snap(v + min))} />
      <span>{show(value)}</span>
    </div>
  );
}
