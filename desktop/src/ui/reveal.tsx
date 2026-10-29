// Loading in order on the desktop (the plan is the phone's, @/lib/reveal): each part of a page
// shows a placeholder of its own size while it loads (they fade in one after another), then
// fades in on its beat, top to bottom, so nothing on screen jumps. Pictures fade in last
// (Artwork in ui/parts.tsx). Opacity only: nothing moves or re-lays out.
import type { CSSProperties, ReactNode } from 'react';

import type { Step } from '@/lib/reveal';

export { partOf, useReveal, type Part, type Step } from '@/lib/reveal';

const delayStyle = (ms: number): CSSProperties | undefined => (ms > 0 ? { animationDelay: `${ms}ms` } : undefined);

/** A part of a page: its placeholder while it loads, then the part itself on its beat. */
export function Reveal({ step, placeholder, children }: { step: Step; placeholder?: ReactNode; children: ReactNode }) {
  if (step.show === 'none') return null;
  if (step.show === 'placeholder') {
    if (!placeholder) return null;
    return (
      <div className="skel-in" style={delayStyle(step.delay)} aria-hidden>
        {placeholder}
      </div>
    );
  }
  if (!step.animate) return <>{children}</>;
  return (
    <div className="reveal-in" style={delayStyle(step.delay)}>
      {children}
    </div>
  );
}

/** The class and delay for something that fades in on its own beat (no wrapper). */
export const revealProps = (step: Step): { className?: string; style?: CSSProperties } =>
  step.show === 'placeholder'
    ? { className: 'skel-in', style: delayStyle(step.delay) }
    : step.animate
      ? { className: 'reveal-in', style: delayStyle(step.delay) }
      : {};

// ---- Placeholders: the real elements' classes (so the sizes match), with bars for text ----

const WIDTHS = [72, 56, 80, 64, 70, 50, 76, 60, 66, 54];

/** A bar the height of a line of text, inside an element of the real text's class. */
export function Bar({ className = '', width, as: Tag = 'div' }: { className?: string; width: number | string; as?: 'div' | 'span' | 'h1' | 'h2' }) {
  return (
    <Tag className={`skel-line${className ? ` ${className}` : ''}`} style={{ ['--w' as string]: typeof width === 'number' ? `${width}%` : width }}>
      {' '}
    </Tag>
  );
}

/** A card (cover, title, subtitle) still loading. */
export function CardSkeleton({ i = 0, round }: { i?: number; round?: boolean }) {
  return (
    <div className="card skel-card">
      <div className="art">
        <div className={`artwork skel${round ? ' round' : ''}`} />
      </div>
      <Bar className={`title${round ? ' center' : ''}`} width={WIDTHS[i % WIDTHS.length]} />
      <Bar className={`sub${round ? ' center' : ''}`} width={WIDTHS[(i + 3) % WIDTHS.length] - 18} />
    </div>
  );
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A shelf still loading: its title and a row of cards, the size the real one will be. */
export function ShelfSkeleton({ round, cards = 8 }: { round?: boolean; cards?: number }) {
  return (
    <section className="shelf">
      <div className="shelf-head">
        <Bar as="h2" width={28} />
        <div className="shelf-tools">
          <span className="skel-tool" />
        </div>
      </div>
      <div className="shelf-row skel-row">
        {range(cards).map((i) => (
          <CardSkeleton key={i} i={i} round={round} />
        ))}
      </div>
    </section>
  );
}

/** A grid of cards still loading: enough to fill the window. */
export function GridSkeleton({ round, cards = 18 }: { round?: boolean; cards?: number }) {
  return (
    <div className="grid skel-grid">
      {range(cards).map((i) => (
        <CardSkeleton key={i} i={i} round={round} />
      ))}
    </div>
  );
}

/** Rows of a list (the sidebar's playlists) still loading. */
export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {range(rows).map((i) => (
        <div key={i} className="row skel-rowitem">
          <div className="artwork skel thumb" />
          <div className="t">
            <Bar className="name" width={WIDTHS[i % WIDTHS.length]} />
            <Bar className="sub" width={WIDTHS[(i + 4) % WIDTHS.length] - 16} />
          </div>
        </div>
      ))}
    </>
  );
}

/** A quick-pick tile still loading. */
export function QuickSkeleton({ i }: { i: number }) {
  return (
    <div className="quick skel-quick" aria-hidden>
      <div className="artwork skel quick-art" />
      <Bar as="span" width={WIDTHS[i % WIDTHS.length]} />
    </div>
  );
}
