// Crop and reshape an artist's picture (Edit Artist → a picture's Crop): pick a shape (square
// for their photo, wide for the header, or free), then drag the frame to move it, its corners
// to size it, and scroll to zoom in or out. Done makes the cropped copy, which waits for Save
// like a picture chosen from a file. Nothing changes on the server until Save.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { ChevronLeft, Refresh } from '~/ui/icons';
import { Loading } from '~/ui/states';

export interface Shape {
  label: string;
  /** Width over height; null is free. */
  ratio: number | null;
}

/** The frame, as fractions of the picture (0 to 1). */
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Drag = { kind: 'move' | 'nw' | 'ne' | 'sw' | 'se'; px: number; py: number; start: Frame };

const MAX_SIDE = 3000;
const MIN_PX = 24;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The biggest frame of that shape, centred. */
function fullFrame(ratio: number | null, W: number, H: number): Frame {
  if (!ratio) return { x: 0, y: 0, w: 1, h: 1 };
  const wpx = Math.min(W, H * ratio);
  const hpx = wpx / ratio;
  return { x: (W - wpx) / 2 / W, y: (H - hpx) / 2 / H, w: wpx / W, h: hpx / H };
}

/** The frame kept to the shape (around its centre) and inside the picture. */
function fit(f: Frame, ratio: number | null, W: number, H: number): Frame {
  let wpx = f.w * W;
  let hpx = f.h * H;
  if (ratio) {
    const cx = (f.x + f.w / 2) * W;
    const cy = (f.y + f.h / 2) * H;
    const area = Math.sqrt(wpx * hpx);
    wpx = area * Math.sqrt(ratio);
    hpx = area / Math.sqrt(ratio);
    const shrink = Math.min(1, W / wpx, H / hpx);
    wpx *= shrink;
    hpx *= shrink;
    return place({ x: (cx - wpx / 2) / W, y: (cy - hpx / 2) / H, w: wpx / W, h: hpx / H });
  }
  wpx = clamp(wpx, MIN_PX, W);
  hpx = clamp(hpx, MIN_PX, H);
  return place({ ...f, w: wpx / W, h: hpx / H });
}

/** Moved back inside the picture. */
const place = (f: Frame): Frame => ({ ...f, x: clamp(f.x, 0, 1 - f.w), y: clamp(f.y, 0, 1 - f.h) });

export function Cropper({ src, title, shapes, png, round, onBack, onDone }: { src: string; title: string; shapes: Shape[]; png?: boolean; round?: boolean; onBack(): void; onDone(file: File, url: string): void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [shape, setShape] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<Drag | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ratio = shapes[shape]?.ratio ?? null;

  // The picture, read so it can be drawn into a new one (your server allows that; some sites
  // that pictures found online come from don't).
  useEffect(() => {
    let alive = true;
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.decoding = 'async';
    el.onload = () => {
      if (!alive) return;
      setImg(el);
      setFrame(fullFrame(shapes[0]?.ratio ?? null, el.naturalWidth, el.naturalHeight));
    };
    el.onerror = () => alive && setFailed(true);
    el.src = src;
    return () => {
      alive = false;
    };
  }, [src, shapes]);

  const W = img?.naturalWidth ?? 1;
  const H = img?.naturalHeight ?? 1;
  // Shown at most 640 × 380.
  const scale = img ? Math.min(640 / W, 380 / H, 1.5) : 1;
  const dw = W * scale;
  const dh = H * scale;

  const pickShape = (i: number) => {
    setShape(i);
    if (frame) setFrame(shapes[i].ratio ? fit(frame, shapes[i].ratio, W, H) : frame);
  };

  const down = (kind: Drag['kind']) => (e: ReactPointerEvent) => {
    if (!frame) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, px: e.clientX, py: e.clientY, start: frame };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.px) / dw;
    const dy = (e.clientY - d.py) / dh;
    const s = d.start;
    if (d.kind === 'move') return setFrame(place({ ...s, x: s.x + dx, y: s.y + dy }));
    // A corner: the opposite one stays put.
    const left = d.kind === 'nw' || d.kind === 'sw';
    const top = d.kind === 'nw' || d.kind === 'ne';
    const ax = left ? s.x + s.w : s.x;
    const ay = top ? s.y + s.h : s.y;
    let wpx = Math.max(MIN_PX, (left ? s.w - dx : s.w + dx) * W);
    let hpx = Math.max(MIN_PX, (top ? s.h - dy : s.h + dy) * H);
    // Room up to the picture's edges from the fixed corner.
    const roomW = (left ? ax : 1 - ax) * W;
    const roomH = (top ? ay : 1 - ay) * H;
    if (ratio) {
      // The bigger pull wins, the other side follows the shape.
      if (wpx / ratio > hpx) hpx = wpx / ratio;
      else wpx = hpx * ratio;
      const shrink = Math.min(1, roomW / wpx, roomH / hpx);
      wpx *= shrink;
      hpx *= shrink;
    } else {
      wpx = Math.min(wpx, roomW);
      hpx = Math.min(hpx, roomH);
    }
    const w = wpx / W;
    const h = hpx / H;
    setFrame({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
  };
  const up = () => {
    drag.current = null;
  };

  // Scroll: zoom the frame in or out around its centre.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setFrame((f) => {
        if (!f) return f;
        const k = e.deltaY < 0 ? 0.94 : 1 / 0.94;
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        let w = f.w * k;
        let h = f.h * k;
        const grow = Math.min(1, 1 / w, 1 / h);
        w *= grow;
        h *= grow;
        if (w * W < MIN_PX || h * H < MIN_PX) return f;
        return place({ x: cx - w / 2, y: cy - h / 2, w, h });
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [img, W, H]);

  const done = () => {
    if (!img || !frame) return;
    setBusy(true);
    const sw = frame.w * W;
    const sh = frame.h * H;
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return setBusy(false);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, frame.x * W, frame.y * H, sw, sh, 0, 0, canvas.width, canvas.height);
    const type = png ? 'image/png' : 'image/jpeg';
    try {
      canvas.toBlob(
        (blob) => {
          setBusy(false);
          if (!blob) return setFailed(true);
          const file = new File([blob], png ? 'cropped.png' : 'cropped.jpg', { type });
          onDone(file, URL.createObjectURL(blob));
        },
        type,
        0.92,
      );
    } catch {
      // The picture's site doesn't allow it to be redrawn.
      setBusy(false);
      setFailed(true);
    }
  };

  const box = frame ? { left: frame.x * dw, top: frame.y * dh, width: frame.w * dw, height: frame.h * dh } : null;
  const outPx = frame ? `${Math.round(frame.w * W)} × ${Math.round(frame.h * H)}` : '';

  return (
    <div className="meta-edit crop-edit">
      <div className="art-online-head">
        <button type="button" className="iconbtn" onClick={onBack} aria-label="Back" title="Back">
          <ChevronLeft size={20} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h2 className="dialog-title">Crop</h2>
          <p className="muted ellipsis">{title}</p>
        </div>
      </div>
      {failed ? (
        <p className="setting-detail error crop-state">Couldn’t open this picture for cropping. A picture found online may come from a site that doesn’t allow it: Save it first, then crop it.</p>
      ) : !img || !box ? (
        <div className="crop-state">
          <Loading what="the picture" />
        </div>
      ) : (
        <>
          <div className="crop-shapes" role="radiogroup" aria-label="Shape">
            {shapes.map((s, i) => (
              <button key={s.label} type="button" role="radio" aria-checked={i === shape} className={`chip${i === shape ? ' on' : ''}`} onClick={() => pickShape(i)}>
                {s.label}
              </button>
            ))}
            <button type="button" className="iconbtn crop-reset" title="Reset the Frame" aria-label="Reset the Frame" onClick={() => setFrame(fullFrame(ratio, W, H))}>
              <Refresh size={16} />
            </button>
          </div>
          <div className="crop-stage" ref={stage} style={{ width: dw, height: dh }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <img src={img.src} alt="" draggable={false} style={{ width: dw, height: dh }} />
            <div className={`crop-frame${round && ratio === 1 ? ' round' : ''}`} style={box} onPointerDown={down('move')}>
              <span className="crop-grid" />
              {(['nw', 'ne', 'sw', 'se'] as const).map((k) => (
                <span key={k} className={`crop-handle ${k}`} onPointerDown={down(k)} />
              ))}
            </div>
          </div>
          <p className="muted small crop-hint">Drag to move, drag a corner to size it, scroll to zoom. {outPx}</p>
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={onBack}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!img || !frame || failed || busy} onClick={done}>
          Done
        </button>
      </div>
    </div>
  );
}
