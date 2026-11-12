// The pieces every Settings group is built from: a switch row, a row with any control, chips,
// a card and the folded-away More Options.
import { useState, type ReactNode } from 'react';

import { ChevronDown } from '~/ui/icons';

/** A setting that's on or off. */
export function Toggle({ on, onChange, label, detail }: { on: boolean; onChange(v: boolean): void; label: string; detail?: string }) {
  return (
    <Row label={label} detail={detail}>
      <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <span />
      </button>
    </Row>
  );
}

/** A row with a label on the left and its control on the right. */
export function Row({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {detail ? <div className="setting-detail">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A few choices as chips (one picked). */
export function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The less-used options of a group, folded away until asked for. */
export function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`more${open ? ' open' : ''}`}>
      <button className="more-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        More Options
        <ChevronDown size={16} />
      </button>
      {open ? <div className="more-body">{children}</div> : null}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      {title ? <h2>{title}</h2> : null}
      <div className="settings-card">{children}</div>
    </section>
  );
}
