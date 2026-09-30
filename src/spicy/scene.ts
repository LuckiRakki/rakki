// The Spicy Lyrics renderer for Rakki: a port of the web mod's LyricsAnimator
// (SpicyLyrics-Jellyfin/src/LyricsAnimator.ts + spicy-lyrics.css) from DOM/CSS to Skia.
//
// The motion model is unchanged: every word has three springs (size, lift, glow) chasing
// spline targets for how far through the word the singer is; held words (≥ 1 s) are
// spelled letter by letter with a neighbour falloff; a line is lit only inside its own
// time range; unlit lines are drawn flat and blurred by their distance from the lit one.
// What changed is the output: instead of writing CSS, each frame is drawn onto a Skia
// canvas (see draw()). Layout that CSS did for free (wrapping, alignment, gaps) is done
// here once per song/size in the constructor.
import {
  BlurStyle,
  Skia,
  TileMode,
  type SkCanvas,
  type SkColor,
  type SkFont,
  type SkMaskFilter,
  type SkPaint,
} from '@shopify/react-native-skia';

import type { LyricLine, Lyrics, WordCue } from '@/lyrics/types';
import { Spline } from '@/spicy/Spline';
import { Spring } from '@/spicy/Spring';

// ─── Tunables (the web mod's Settings; the customizer will expose these) ───────────────

export interface SpicySettings {
  glowEnabled: boolean;
  glowStrength: number;
  wordPop: number;
  wordLift: number;
  sweepBand: number;
  spellingEnabled: boolean;
  spellMinMs: number;
  letterPop: number;
  letterGlow: number;
  motionSpeed: number;
  motionDamping: number;
  lineGlowEnabled: boolean;
  lineGlowAmount: number;
  lineBlurEnabled: boolean;
  blurPerLine: number;
  gapDotsMs: number;
  dotRise: number;
  lrcSweep: boolean;
  lrcBand: number;
  unsyncedAutoScroll: boolean;
}

export const SPICY_DEFAULTS: SpicySettings = {
  glowEnabled: true,
  glowStrength: 1,
  wordPop: 1,
  wordLift: 1,
  sweepBand: 20,
  spellingEnabled: true,
  spellMinMs: 1000,
  letterPop: 1,
  letterGlow: 1,
  motionSpeed: 1,
  motionDamping: 1,
  lineGlowEnabled: true,
  lineGlowAmount: 0.18,
  lineBlurEnabled: true,
  blurPerLine: 1.25,
  gapDotsMs: 4000,
  dotRise: 0.95,
  lrcSweep: true,
  lrcBand: 20,
  unsyncedAutoScroll: true,
};

// ─── Motion (identical to LyricsAnimator.ts) ─────────────────────────────────────────

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const WORD_SCALE = new Spline([[0, 0.95], [0.7, 1.0505], [1, 1]]);
const WORD_LIFT = new Spline([[0, 0.01], [0.9, -1 / 60], [1, 0]]);
const LETTER_SCALE = new Spline([[0, 0.95], [0.7, 1.175], [1, 1]]);
const LETTER_LIFT = new Spline([[0, 0.02], [0.9, -1 / 28], [1, 0]]);
const GLOW = new Spline([[0, 0], [0.15, 1], [0.6, 1], [1, 0]]);
const LINE_GLOW = new Spline([[0, 0], [0.5, 1], [1, 0]]);

const SCALE_SPRING = { f: 0.88, z: 0.64 };
const LIFT_SPRING = { f: 1.45, z: 0.4 };
const GLOW_SPRING = { f: 1.18, z: 0.56 };
const LINE_GLOW_SPRING = { f: 1, z: 0.5 };

const SWEEP_FROM = -20;
const SWEEP_SPAN = 120;

const LETTER_TAIL_MS = 250;
const LETTER_FALLOFF = 2.8;
const LETTER_GLOW_SLOPE = 0.9;
const LETTER_SUNG_GLOW = GLOW.at(0.2);

const WORD_GLOW_ALPHA = 0.35;
const LETTER_GLOW_ALPHA = 1.85;
const LINE_GLOW_ALPHA = 0.5;

const BLUR_CAP_LINES = 5.465;
const SCROLL_LIFT = 30;
const PIN_LOOKAHEAD = 2;
const MAX_FRAME_S = 0.1;
const SEEK_BACK_MS = 150;
const SEEK_AHEAD_MS = 1000;
const CREDIT_SWEEP_MS = 2000;
const MANUAL_RESUME_MS = 4000;
const DOT_SCALE = 0.45;
const DOT_EXIT_EM = 2.2;

const SCROLL_MS = 550; // CSS: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)
const OPACITY_TAU = 0.07; // ≈ the CSS 0.2s opacity transition

// Colours (CSS custom properties of .sl-root / .sl-line--bg)
const SUNG = 0.85;
const UNSUNG = 0.5;
const LINE_UNSUNG = 0.35;
const BG_SUNG = 0.6;
const BG_UNSUNG = 0.3;
const OPACITY = { notsung: 0.51, sung: 0.497, active: 1 } as const;

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

type Phase = 'notsung' | 'active' | 'sung';
const phaseAt = (ms: number, start: number, end: number): Phase =>
  ms < start ? 'notsung' : ms >= end ? 'sung' : 'active';
const progressAt = (ms: number, start: number, end: number) =>
  end > start ? clamp01((ms - start) / (end - start)) : ms >= end ? 1 : 0;

/** cubic-bezier(0.22, 1, 0.36, 1) — the web mod's scroll glide. */
function easeOutQuint(t: number): number {
  const x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1;
  // Solve x(u) = t by Newton's method, then return y(u).
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
    const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dx) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - x / dx));
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

// ─── Model ─────────────────────────────────────────────────────────────────────────

interface Mover {
  startMs: number;
  endMs: number;
  scale: Spring;
  lift: Spring;
  glow: Spring;
  live: boolean;
  rest: 'notsung' | 'sung';
  gp: number; // sweep position (%) last computed
}

interface Letter extends Mover {
  text: string;
  x: number; // relative to the word's x
  w: number;
}

interface Word extends Mover {
  text: string;
  x: number; // relative to the row's left edge
  w: number;
  line: number; // visual line within the row
  origin: 'center' | 'left' | 'right';
  letters: Letter[] | null;
}

type RowKind = 'lead' | 'bg' | 'plain' | 'credits' | 'unsynced';

interface VisualLine {
  text: string; // plain rows only
  x: number;
  w: number;
}

interface Row {
  kind: RowKind;
  group: number;
  startMs: number;
  endMs: number;
  seekMs: number;
  phase: Phase;
  font: SkFont;
  size: number;
  lineHeight: number;
  baseline: number; // from a visual line's top
  top: number; // content y
  height: number;
  right: boolean;
  words: Word[];
  lines: VisualLine[]; // plain rows
  glow: Spring | null;
  opacity: number;
  gp: number;
  near: boolean;
  blur: number;
}

interface Group {
  first: number;
  last: number;
  startMs: number;
  endMs: number;
}

export interface SpicyFonts {
  lead: SkFont;
  bg: SkFont;
  credits: SkFont;
}

// ─── Scene ─────────────────────────────────────────────────────────────────────────

export class SpicyScene {
  readonly contentHeight: number;
  private rows: Row[] = [];
  private groups: Group[] = [];
  private live = new Set<Row>();
  private readonly synced: boolean;
  private readonly width: number;
  private readonly height: number;
  private readonly pad: number;
  private readonly leadSize: number;

  private focusRow = -1;
  private centeredGroup = -1;
  private lastMs = -1;

  // scroll (content translate)
  private scrollY = 0;
  private scrollFrom = 0;
  private scrollTo = 0;
  private scrollT = 1;
  private manual = false;
  private manualUntil = 0;

  // interlude dots
  private dots = { visible: false, progress: 0, after: -1, right: false };

  // reusable drawing objects
  private readonly paint: SkPaint;
  private readonly glowPaint: SkPaint;
  private readonly blurCache = new Map<number, SkMaskFilter>();
  private readonly white: SkColor;

  constructor(
    lyrics: Lyrics,
    fonts: SpicyFonts,
    width: number,
    height: number,
    private settings: SpicySettings = SPICY_DEFAULTS,
  ) {
    this.width = width;
    this.height = height;
    this.pad = 24;
    this.leadSize = fonts.lead.getSize();
    this.synced = lyrics.isSynced;
    this.paint = Skia.Paint();
    this.paint.setAntiAlias(true);
    this.glowPaint = Skia.Paint();
    this.glowPaint.setAntiAlias(true);
    this.white = Skia.Color('white');

    if (!lyrics.isSynced) {
      this.buildUnsynced(lyrics, fonts);
    } else {
      this.build(lyrics, fonts);
    }
    const last = this.rows[this.rows.length - 1];
    this.contentHeight = last ? last.top + last.height : 0;
    // Start with the first line where the singer will be.
    const first = this.rows[0];
    this.scrollY = this.scrollTo = first ? this.height / 2 - (first.top + first.height / 2) - SCROLL_LIFT : 0;
    if (!this.synced) this.scrollY = this.scrollTo = this.height * 0.12;
  }

  // ── Building ────────────────────────────────────────────────────────────────────

  private build(lyrics: Lyrics, fonts: SpicyFonts) {
    const primary = primaryAgent(lyrics.lines);
    const isRight = (l: LyricLine) => !!l.agent && !!primary && l.agent !== primary;
    const lines = lyrics.lines;
    let y = 0;
    const gap = this.leadSize * 0.2;

    for (let i = 0; i < lines.length; i++) {
      const data = lines[i];
      const right = isRight(data);
      const group = this.groups.length;
      const first = this.rows.length;
      const words = lyrics.hasWordCues && data.words?.length ? data.words : null;

      let start = data.startMs;
      let end = data.endMs;
      if (words) {
        for (const w of words) {
          start = Math.min(start, w.startMs);
          end = Math.max(end, w.endMs);
        }
      }
      if (end <= start) {
        const next = lines[i + 1]?.startMs ?? 0;
        end = next > start ? next : start + 3000;
      }

      if (i > 0) y += gap;
      const lead = words
        ? this.wordRow('lead', group, right, fonts.lead, words, data.startMs, y)
        : this.plainRow('plain', group, right, fonts.lead, data.text, data.startMs, y);
      y = lead.top + lead.height;

      if (data.bgWords?.length) {
        y += gap - gap * 0.8; // CSS: margin-top: calc(var(--sl-line-gap) * -0.8)
        const bg = this.wordRow('bg', group, right, fonts.bg, data.bgWords, data.bgWords[0].startMs, y);
        bg.startMs = Math.min(...data.bgWords.map((w) => w.startMs));
        bg.endMs = Math.max(...data.bgWords.map((w) => w.endMs));
        start = Math.min(start, bg.startMs);
        end = Math.max(end, bg.endMs);
        y = bg.top + bg.height;
      }

      lead.startMs = start;
      lead.endMs = end;
      this.groups.push({ first, last: this.rows.length - 1, startMs: start, endMs: end });
    }

    // "Written by: …" once the lyrics are done.
    if (lyrics.songwriters?.length && this.rows.length) {
      const lastEnd = Math.max(...this.groups.map((g) => g.endMs));
      const lastRight = this.rows[this.rows.length - 1].right;
      y += gap + fonts.credits.getSize() * 0.6;
      const row = this.plainRow(
        'credits',
        this.groups.length,
        lastRight,
        fonts.credits,
        `Written by: ${lyrics.songwriters.join(', ')}`,
        lastEnd,
        y,
      );
      row.startMs = lastEnd;
      row.endMs = lastEnd + 600000;
      this.groups.push({ first: this.rows.length - 1, last: this.rows.length - 1, startMs: row.startMs, endMs: row.endMs });
    }
  }

  private buildUnsynced(lyrics: Lyrics, fonts: SpicyFonts) {
    let y = 0;
    const gap = this.leadSize * 0.2;
    for (const line of lyrics.lines) {
      const row = this.plainRow('unsynced', this.rows.length, false, fonts.lead, line.text, 0, y);
      y = row.top + row.height + gap;
    }
  }

  private baseRow(kind: RowKind, group: number, right: boolean, font: SkFont, seekMs: number, top: number): Row {
    const size = font.getSize();
    const lineHeight = size * 1.18;
    const m = font.getMetrics();
    // Centre the glyph box (ascent is negative) in the line box, like CSS line-height.
    const baseline = (lineHeight - (m.descent - m.ascent)) / 2 - m.ascent;
    const row: Row = {
      kind,
      group,
      startMs: 0,
      endMs: 0,
      seekMs,
      phase: 'notsung',
      font,
      size,
      lineHeight,
      baseline,
      top,
      height: lineHeight,
      right,
      words: [],
      lines: [],
      glow: kind === 'plain' || kind === 'credits' ? new Spring(0, LINE_GLOW_SPRING.f, LINE_GLOW_SPRING.z) : null,
      opacity: kind === 'unsynced' ? 1 : OPACITY.notsung,
      gp: SWEEP_FROM,
      near: false,
      blur: 0,
    };
    this.rows.push(row);
    return row;
  }

  /** Content width minus the 5% padding on a line's trailing side (CSS .sl-line). */
  private rowWidth() {
    return (this.width - this.pad * 2) * 0.95;
  }

  private measure(font: SkFont, text: string): number {
    if (!text) return 0;
    const ids = font.getGlyphIDs(text);
    const widths = font.getGlyphWidths(ids);
    let w = 0;
    for (const x of widths) w += x;
    return w;
  }

  /** A synced line with word timings: words laid out and wrapped like the CSS flexbox. */
  private wordRow(kind: 'lead' | 'bg', group: number, right: boolean, font: SkFont, cues: WordCue[], seekMs: number, top: number): Row {
    const row = this.baseRow(kind, group, right, font, seekMs, top);
    const s = this.settings;
    const gapW = this.measure(font, '0') * 0.32; // CSS: margin-right: 0.32ch

    // Words + syllable joins, exactly as LyricsAnimator.buildWords.
    type Unit = { words: Word[]; w: number; gapAfter: number };
    const units: Unit[] = [];
    let unit: Unit | null = null;
    let prevJoins = false;

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const text = cue.text.replace(/\s+$/, '');
      if (!text.trim()) {
        if (unit && prevJoins) {
          unit.gapAfter = gapW;
          units.push(unit);
          unit = null;
        }
        prevJoins = false;
        continue;
      }
      const next = cues[i + 1];
      const joins =
        !!next && !/\s$/.test(cue.text) && !text.endsWith(',') && !/^\s/.test(next.text) && !!next.text.trim();

      const dur = cue.endMs - cue.startMs;
      const spelled = s.spellingEnabled && dur >= s.spellMinMs && !RTL.test(text);
      const endMs = spelled ? cue.endMs - Math.min(LETTER_TAIL_MS, dur / 2) : cue.endMs;
      const w = this.measure(font, text);
      const word: Word = {
        ...mover(cue.startMs, endMs, WORD_SCALE.at(0), WORD_LIFT.at(0)),
        text,
        x: 0,
        w,
        line: 0,
        origin: joins ? (prevJoins ? 'center' : 'right') : prevJoins ? 'left' : 'center',
        letters: null,
      };
      if (spelled) {
        const glyphs = Array.from(text);
        const span = (endMs - cue.startMs) / glyphs.length;
        let lx = 0;
        word.letters = glyphs.map((g, k) => {
          const lw = this.measure(font, g);
          const ls = cue.startMs + k * span;
          const letter: Letter = { ...mover(ls, ls + span, LETTER_SCALE.at(0), LETTER_LIFT.at(0)), text: g, x: lx, w: lw };
          lx += lw;
          return letter;
        });
      }
      row.words.push(word);

      if (!unit) unit = { words: [], w: 0, gapAfter: 0 };
      unit.words.push(word);
      unit.w += w;
      if (!joins) {
        unit.gapAfter = next ? gapW : 0;
        units.push(unit);
        unit = null;
      }
      prevJoins = joins;
    }
    if (unit) units.push(unit);

    // Greedy wrap into visual lines.
    const maxW = this.rowWidth();
    const lineUnits: Unit[][] = [[]];
    let lineW = 0;
    for (const u of units) {
      const current = lineUnits[lineUnits.length - 1];
      if (current.length && lineW + u.w > maxW) {
        lineUnits.push([u]);
        lineW = u.w + u.gapAfter;
      } else {
        current.push(u);
        lineW += u.w + u.gapAfter;
      }
    }
    lineUnits.forEach((us, li) => {
      const used = us.reduce((acc, u, k) => acc + u.w + (k < us.length - 1 ? u.gapAfter : 0), 0);
      let x = right ? this.width - this.pad - used : this.pad;
      for (const u of us) {
        for (const w of u.words) {
          w.x = x;
          w.line = li;
          x += w.w;
        }
        x += u.gapAfter;
      }
    });
    row.height = lineUnits.length * row.lineHeight;
    return row;
  }

  /** A line-by-line (LRC), credit or unsynced line: plain text, wrapped on spaces. */
  private plainRow(kind: 'plain' | 'credits' | 'unsynced', group: number, right: boolean, font: SkFont, text: string, seekMs: number, top: number): Row {
    const row = this.baseRow(kind, group, right, font, seekMs, top);
    const maxW = kind === 'unsynced' ? this.width - this.pad * 2 : this.rowWidth();
    const space = this.measure(font, ' ');
    const out: VisualLine[] = [];
    let cur = '';
    let curW = 0;
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const w = this.measure(font, word);
      if (!cur) {
        cur = word;
        curW = w;
      } else if (curW + space + w > maxW) {
        out.push({ text: cur, x: 0, w: curW });
        cur = word;
        curW = w;
      } else {
        cur = `${cur} ${word}`;
        curW += space + w;
      }
    }
    if (cur || !out.length) out.push({ text: cur, x: 0, w: curW });
    for (const l of out) l.x = right ? this.width - this.pad - l.w : this.pad;
    row.lines = out;
    row.height = out.length * row.lineHeight;
    return row;
  }

  // ── Per frame ───────────────────────────────────────────────────────────────────

  /**
   * Advance to playback time `ms`. `dt` is the wall-clock frame time in seconds — springs
   * move in real time, independent of the (seek-jumpy) playback clock.
   */
  tick(ms: number, dt: number, durationMs = 0) {
    dt = Math.min(MAX_FRAME_S, Math.max(0, dt));
    const now = Date.now();
    if (this.manual && now > this.manualUntil) {
      this.manual = false;
      this.centeredGroup = -1;
    }
    this.advanceScroll(dt);

    if (!this.synced) {
      if (this.settings.unsyncedAutoScroll && !this.manual && durationMs > 0) {
        const scrollable = Math.max(0, this.contentHeight - this.height * 0.7);
        this.scrollY = this.height * 0.12 - clamp01(ms / durationMs) * scrollable;
      }
      return;
    }

    const jumped = this.lastMs < 0 || ms < this.lastMs - SEEK_BACK_MS || ms > this.lastMs + SEEK_AHEAD_MS;
    this.lastMs = ms;

    let focus = -1;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const phase = phaseAt(ms, row.startMs, row.endMs);
      if (phase !== row.phase) {
        row.phase = phase;
        this.live.add(row);
      }
      if (phase === 'active') focus = i;
    }
    if (jumped) this.snapAll(ms);
    if (focus >= 0) this.focusRow = focus;

    // Depth-of-field blur by distance from the last lit line.
    const step = this.settings.lineBlurEnabled && !this.manual ? this.settings.blurPerLine : 0;
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const d = this.focusRow < 0 ? 0 : Math.abs(i - this.focusRow);
      row.blur = Math.min(step * d, step * BLUR_CAP_LINES);
      row.near = (this.focusRow < 0 ? i : d) <= 3;
      const target = row.kind === 'unsynced' ? 1 : OPACITY[row.phase];
      row.opacity += (target - row.opacity) * (1 - Math.exp(-dt / OPACITY_TAU));
      if (jumped) row.opacity = target;
    }

    // Follow the singer.
    const target = this.scrollGroup(ms);
    if (target >= 0 && !this.manual && target !== this.centeredGroup) {
      const g = this.groups[target];
      const row = this.rows[g.first];
      this.glideTo(this.height / 2 - (row.top + row.height / 2) - SCROLL_LIFT, !jumped);
      this.centeredGroup = target;
    }

    // Interlude dots.
    const gap = this.computeGap(ms);
    const last = this.lastStartedGroup(ms);
    this.dots.visible = gap.inGap && last >= 0;
    this.dots.progress = gap.progress;
    this.dots.after = last >= 0 ? this.groups[last].last : -1;
    this.dots.right = last >= 0 ? this.rows[this.groups[last].last].right : false;

    for (const row of this.live) {
      if (!this.animateRow(row, ms, dt)) this.live.delete(row);
    }
  }

  private glideTo(y: number, animated: boolean) {
    if (!animated) {
      this.scrollY = this.scrollFrom = this.scrollTo = y;
      this.scrollT = 1;
      return;
    }
    this.scrollFrom = this.scrollY;
    this.scrollTo = y;
    this.scrollT = 0;
  }

  private advanceScroll(dt: number) {
    if (this.manual || this.scrollT >= 1) return;
    this.scrollT = Math.min(1, this.scrollT + (dt * 1000) / SCROLL_MS);
    this.scrollY = this.scrollFrom + (this.scrollTo - this.scrollFrom) * easeOutQuint(this.scrollT);
  }

  private lastStartedGroup(ms: number) {
    for (let i = this.groups.length - 1; i >= 0; i--) if (ms >= this.groups[i].startMs) return i;
    return -1;
  }

  private scrollGroup(ms: number) {
    let front = -1;
    for (const row of this.rows) if (row.phase === 'active' && row.group > front) front = row.group;
    if (front < 0) return this.lastStartedGroup(ms);
    const active: number[] = [];
    for (const row of this.rows) {
      if (row.phase !== 'active') continue;
      if (row.kind === 'bg' && row.group < front) continue;
      if (active[active.length - 1] !== row.group) active.push(row.group);
    }
    const anchor = active[0];
    const ahead = this.groups[anchor + PIN_LOOKAHEAD];
    if (!ahead || this.groups[anchor].endMs <= ahead.startMs) return anchor;
    const last = active[active.length - 1];
    return last - anchor <= 1 ? anchor : last;
  }

  private computeGap(ms: number) {
    const idx = this.lastStartedGroup(ms);
    const next = this.groups[idx + 1];
    if (idx < 0 || !next) return { inGap: false, progress: 0 };
    const gapStart = this.groups[idx].endMs;
    const gapEnd = next.startMs;
    if (gapEnd - gapStart >= this.settings.gapDotsMs && ms >= gapStart && ms < gapEnd) {
      return { inGap: true, progress: (ms - gapStart) / (gapEnd - gapStart) };
    }
    return { inGap: false, progress: 0 };
  }

  private animateRow(row: Row, ms: number, dt: number): boolean {
    if (row.glow) return this.animatePlainRow(row, ms, dt);
    let busy = row.phase === 'active';
    for (const w of row.words) if (this.animateWord(w, ms, dt)) busy = true;
    return busy;
  }

  private animateWord(w: Word, ms: number, dt: number): boolean {
    const phase = phaseAt(ms, w.startMs, w.endMs);
    if (phase !== 'active' && !w.live && w.rest === phase) return false;
    const s = this.settings;
    const t = phase === 'active' ? progressAt(ms, w.startMs, w.endMs) : phase === 'sung' ? 1 : 0;
    this.wake(w, WORD_SCALE, WORD_LIFT, s.wordPop, s.wordLift);
    w.scale.setGoal(1 + (WORD_SCALE.at(t) - 1) * s.wordPop);
    w.lift.setGoal(WORD_LIFT.at(t) * s.wordLift);
    w.glow.setGoal(GLOW.at(t));
    this.stepMover(w, dt);
    w.live = true;
    w.gp = SWEEP_FROM + SWEEP_SPAN * t;

    let busy = phase === 'active' || !settled(w);
    if (w.letters && this.animateLetters(w, ms, phase, dt)) busy = true;
    if (!busy) rest(w, phase);
    return busy;
  }

  private animateLetters(w: Word, ms: number, wordPhase: Phase, dt: number): boolean {
    const s = this.settings;
    const letters = w.letters!;
    let ai = -1;
    let ap = 0;
    if (wordPhase === 'active') {
      for (let i = 0; i < letters.length; i++) {
        const L = letters[i];
        if (ms >= L.startMs && ms < L.endMs) {
          ai = i;
          ap = progressAt(ms, L.startMs, L.endMs);
          break;
        }
      }
    }
    const restS = LETTER_SCALE.at(0);
    const restY = LETTER_LIFT.at(0);
    let busy = false;
    for (let k = 0; k < letters.length; k++) {
      const L = letters[k];
      if (wordPhase !== 'active' && !L.live && L.rest === wordPhase) continue;
      let ts: number, ty: number, tg: number, gp: number;
      if (wordPhase === 'active') {
        const lp = phaseAt(ms, L.startMs, L.endMs);
        ts = restS;
        ty = restY;
        tg = 0;
        if (ai >= 0 && lp !== 'notsung') {
          const d = Math.abs(k - ai);
          const fall = 1 / (1 + Math.pow(d, LETTER_FALLOFF));
          ts = restS + (LETTER_SCALE.at(ap) - restS) * fall;
          ty = restY + (LETTER_LIFT.at(ap) - restY) * fall;
          tg = GLOW.at(ap) / (1 + d * LETTER_GLOW_SLOPE);
        } else if (lp === 'sung') {
          tg = LETTER_SUNG_GLOW;
        }
        gp =
          lp === 'notsung'
            ? SWEEP_FROM
            : lp === 'sung'
              ? 100
              : k === ai
                ? SWEEP_FROM + SWEEP_SPAN * Math.sin((ap * Math.PI) / 2)
                : SWEEP_FROM;
      } else if (wordPhase === 'sung') {
        ts = LETTER_SCALE.at(1);
        ty = LETTER_LIFT.at(1);
        tg = 0;
        gp = 100;
      } else {
        ts = restS;
        ty = restY;
        tg = 0;
        gp = SWEEP_FROM;
      }
      this.wake(L, LETTER_SCALE, LETTER_LIFT, s.letterPop, s.letterPop);
      L.scale.setGoal(1 + (ts - 1) * s.letterPop);
      L.lift.setGoal(ty * s.letterPop);
      L.glow.setGoal(tg);
      this.stepMover(L, dt);
      L.live = true;
      L.gp = gp;
      if (wordPhase !== 'active' && settled(L)) rest(L, wordPhase);
      else busy = true;
    }
    return busy;
  }

  private animatePlainRow(row: Row, ms: number, dt: number): boolean {
    const s = this.settings;
    const glow = row.glow!;
    const end = row.kind === 'credits' ? row.startMs + CREDIT_SWEEP_MS : row.endMs;
    const t = row.phase === 'active' ? progressAt(ms, row.startMs, end) : row.phase === 'sung' ? 1 : 0;
    glow.frequency = LINE_GLOW_SPRING.f * s.motionSpeed;
    glow.damping = LINE_GLOW_SPRING.z * s.motionDamping;
    glow.setGoal(LINE_GLOW.at(t));
    glow.step(dt);
    row.gp = row.phase === 'active' ? (s.lrcSweep ? 100 * t : 100) : row.phase === 'sung' ? 100 : SWEEP_FROM;
    return row.phase === 'active' || !glow.resting;
  }

  private snapAll(ms: number) {
    const s = this.settings;
    this.live.clear();
    for (const row of this.rows) {
      row.glow?.setGoal(0, true);
      for (const w of row.words) {
        const phase = phaseAt(ms, w.startMs, w.endMs);
        const t = phase === 'active' ? progressAt(ms, w.startMs, w.endMs) : phase === 'sung' ? 1 : 0;
        w.scale.setGoal(1 + (WORD_SCALE.at(t) - 1) * s.wordPop, true);
        w.lift.setGoal(WORD_LIFT.at(t) * s.wordLift, true);
        w.glow.setGoal(phase === 'active' ? GLOW.at(t) : 0, true);
        w.gp = SWEEP_FROM + SWEEP_SPAN * t;
        if (phase === 'active') w.live = true;
        else rest(w, phase);
        for (const L of w.letters ?? []) {
          const done = phase === 'sung';
          L.scale.setGoal(1 + ((done ? LETTER_SCALE.at(1) : LETTER_SCALE.at(0)) - 1) * s.letterPop, true);
          L.lift.setGoal((done ? LETTER_LIFT.at(1) : LETTER_LIFT.at(0)) * s.letterPop, true);
          L.glow.setGoal(0, true);
          rest(L, done ? 'sung' : 'notsung');
        }
      }
      if (row.phase === 'active') this.live.add(row);
    }
  }

  private wake(m: Mover, scale: Spline, lift: Spline, popMul: number, liftMul: number) {
    if (m.live) return;
    const t = m.rest === 'sung' ? 1 : 0;
    m.scale.setGoal(1 + (scale.at(t) - 1) * popMul, true);
    m.lift.setGoal(lift.at(t) * liftMul, true);
    m.glow.setGoal(0, true);
  }

  private stepMover(m: Mover, dt: number) {
    const f = this.settings.motionSpeed;
    const z = this.settings.motionDamping;
    m.scale.frequency = SCALE_SPRING.f * f;
    m.scale.damping = SCALE_SPRING.z * z;
    m.lift.frequency = LIFT_SPRING.f * f;
    m.lift.damping = LIFT_SPRING.z * z;
    m.glow.frequency = GLOW_SPRING.f * f;
    m.glow.damping = GLOW_SPRING.z * z;
    m.scale.step(dt);
    m.lift.step(dt);
    m.glow.step(dt);
  }

  // ── Interaction ─────────────────────────────────────────────────────────────────

  /** The start time (ms) of the line at view y, or null. */
  seekTimeAt(y: number): number | null {
    if (!this.synced) return null;
    const cy = y - this.scrollY;
    for (const row of this.rows) {
      if (cy >= row.top - 4 && cy <= row.top + row.height + 4) return row.seekMs;
    }
    return null;
  }

  /** Manual scrolling: shows every line sharp; auto-follow resumes 4 s after the last drag. */
  scrollBy(dy: number) {
    if (!this.manual) this.scrollT = 1;
    this.manual = true;
    this.manualUntil = Date.now() + MANUAL_RESUME_MS;
    const minY = this.height / 2 - this.contentHeight;
    const maxY = this.height / 2;
    this.scrollY = Math.max(minY, Math.min(maxY, this.scrollY + dy));
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────────

  draw(canvas: SkCanvas) {
    const s = this.settings;
    const glowMul = s.glowEnabled ? s.glowStrength : 0;
    const dotsH = this.dots.visible ? this.dotMetrics().height : 0;
    const dotsVis = this.dotsVisibility();

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      // Rows after the dots are pushed down while the dots are showing.
      const shift = this.dots.visible && i > this.dots.after ? dotsH * dotsVis : 0;
      const top = row.top + this.scrollY + shift;
      if (top > this.height + 40 || top + row.height < -40) continue;

      if (row.kind === 'unsynced') {
        this.drawPlainText(canvas, row, top, 0.85, 0);
        continue;
      }
      if (row.glow) {
        this.drawPlainRow(canvas, row, top, glowMul);
      } else {
        this.drawWordRow(canvas, row, top, glowMul);
      }
    }

    if (this.dots.visible && this.dots.after >= 0) {
      const after = this.rows[this.dots.after];
      this.drawDots(canvas, after.top + after.height + this.scrollY);
    }
  }

  private maskFor(radius: number): SkMaskFilter | null {
    if (radius < 0.3) return null;
    const key = Math.round(radius * 4) / 4;
    let mf = this.blurCache.get(key);
    if (!mf) {
      mf = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, key / 2, false);
      this.blurCache.set(key, mf);
    }
    return mf;
  }

  private setWhite(paint: SkPaint, alpha: number) {
    paint.setShader(null);
    paint.setColor(this.white);
    paint.setAlphaf(Math.max(0, Math.min(1, alpha)));
  }

  private drawWordRow(canvas: SkCanvas, row: Row, top: number, glowMul: number) {
    const bg = row.kind === 'bg';
    const sungA = bg ? BG_SUNG : SUNG;
    const unsungA = bg ? BG_UNSUNG : UNSUNG;
    const lit = row.phase === 'active';
    const op = row.opacity;
    const font = row.font;
    const s = this.settings;
    const mf = lit ? null : this.maskFor(row.blur);

    for (const w of row.words) {
      const lineTop = top + w.line * row.lineHeight;
      const baseY = lineTop + row.baseline;
      const cx = w.origin === 'left' ? w.x : w.origin === 'right' ? w.x + w.w : w.x + w.w / 2;
      const cy = lineTop + row.lineHeight / 2;

      canvas.save();
      canvas.translate(cx, cy + w.lift.value * this.leadSize);
      canvas.scale(w.scale.value, w.scale.value);
      canvas.translate(-cx, -cy);

      if (w.letters && lit) {
        this.drawLetters(canvas, row, w, baseY, glowMul, sungA, unsungA);
      } else if (lit) {
        // Glow: a blurred white copy behind the word, then the always-on faint halo.
        const g = w.glow.value;
        const ga = clamp01(WORD_GLOW_ALPHA * g * glowMul);
        if (ga > 0.004) {
          this.setWhite(this.glowPaint, ga * op);
          this.glowPaint.setMaskFilter(this.maskFor(4 + 2 * g));
          canvas.drawText(w.text, w.x, baseY, this.glowPaint, font);
        }
        if (s.lineGlowEnabled && s.lineGlowAmount > 0) {
          this.setWhite(this.glowPaint, 0.6 * s.lineGlowAmount * op);
          this.glowPaint.setMaskFilter(this.maskFor(row.size * 0.1));
          canvas.drawText(w.text, w.x, baseY, this.glowPaint, font);
        }
        this.sweepPaint(w.x, w.w, w.gp, sungA * op, unsungA * op);
        this.paint.setMaskFilter(null);
        canvas.drawText(w.text, w.x, baseY, this.paint, font);
      } else {
        // Unlit: flat glyphs, blurred by distance (the web mod's text-shadow trick).
        const a = (row.phase === 'sung' ? sungA : unsungA) * op;
        if (row.near && s.lineGlowEnabled && s.lineGlowAmount > 0 && !mf) {
          this.setWhite(this.glowPaint, 0.6 * s.lineGlowAmount * op);
          this.glowPaint.setMaskFilter(this.maskFor(row.size * 0.1));
          canvas.drawText(w.text, w.x, baseY, this.glowPaint, font);
        }
        this.setWhite(this.paint, a);
        this.paint.setMaskFilter(mf);
        canvas.drawText(w.text, w.x, baseY, this.paint, font);
      }
      canvas.restore();
    }
    this.paint.setMaskFilter(null);
  }

  private drawLetters(canvas: SkCanvas, row: Row, w: Word, baseY: number, glowMul: number, sungA: number, unsungA: number) {
    const s = this.settings;
    const op = row.opacity;
    const lineTop = baseY - row.baseline;
    for (const L of w.letters!) {
      const x = w.x + L.x;
      const cx = x + L.w / 2;
      const cy = lineTop + row.lineHeight / 2;
      canvas.save();
      canvas.translate(cx, cy + L.lift.value * this.leadSize);
      canvas.scale(L.scale.value, L.scale.value);
      canvas.translate(-cx, -cy);
      const g = L.glow.value;
      const ga = clamp01(LETTER_GLOW_ALPHA * g * glowMul * s.letterGlow);
      if (ga > 0.004) {
        this.setWhite(this.glowPaint, ga * op);
        this.glowPaint.setMaskFilter(this.maskFor(4 + 12 * g));
        canvas.drawText(L.text, x, baseY, this.glowPaint, row.font);
      }
      this.sweepPaint(x, L.w, L.rest === 'sung' && !L.live ? 100 : L.gp, sungA * op, unsungA * op);
      this.paint.setMaskFilter(null);
      canvas.drawText(L.text, x, baseY, this.paint, row.font);
      canvas.restore();
    }
  }

  /** Horizontal colour sweep: sung colour up to gp%, soft edge of sweepBand%, then unsung. */
  private sweepPaint(x: number, w: number, gp: number, sungA: number, unsungA: number) {
    const from = x + (w * gp) / 100;
    const to = from + (w * this.settings.sweepBand) / 100;
    this.paint.setColor(this.white);
    this.paint.setAlphaf(1);
    this.paint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: from, y: 0 },
        { x: Math.max(to, from + 0.01), y: 0 },
        [Skia.Color(`rgba(255,255,255,${sungA})`), Skia.Color(`rgba(255,255,255,${unsungA})`)],
        null,
        TileMode.Clamp,
      ),
    );
  }

  private drawPlainRow(canvas: SkCanvas, row: Row, top: number, glowMul: number) {
    const lit = row.phase === 'active' || (row.glow && !row.glow.resting);
    const op = row.opacity;
    if (!lit) {
      const a = row.phase === 'sung' ? SUNG : LINE_UNSUNG;
      this.drawPlainText(canvas, row, top, a * op, row.blur);
      return;
    }
    const g = row.glow!.value;
    const ga = clamp01(LINE_GLOW_ALPHA * g * glowMul);
    if (ga > 0.004) {
      this.setWhite(this.glowPaint, ga * op);
      this.glowPaint.setMaskFilter(this.maskFor(4 + 8 * g));
      row.lines.forEach((l, i) => canvas.drawText(l.text, l.x, top + i * row.lineHeight + row.baseline, this.glowPaint, row.font));
    }
    // Top→bottom sweep across the whole (possibly wrapped) line.
    const from = top + (row.height * row.gp) / 100;
    const to = from + (row.height * this.settings.lrcBand) / 100;
    this.paint.setColor(this.white);
    this.paint.setAlphaf(1);
    this.paint.setMaskFilter(null);
    this.paint.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: from },
        { x: 0, y: Math.max(to, from + 0.01) },
        [Skia.Color(`rgba(255,255,255,${SUNG * op})`), Skia.Color(`rgba(255,255,255,${LINE_UNSUNG * op})`)],
        null,
        TileMode.Clamp,
      ),
    );
    row.lines.forEach((l, i) => canvas.drawText(l.text, l.x, top + i * row.lineHeight + row.baseline, this.paint, row.font));
    this.paint.setShader(null);
  }

  private drawPlainText(canvas: SkCanvas, row: Row, top: number, alpha: number, blur: number) {
    this.setWhite(this.paint, alpha);
    this.paint.setMaskFilter(this.maskFor(blur));
    row.lines.forEach((l, i) => canvas.drawText(l.text, l.x, top + i * row.lineHeight + row.baseline, this.paint, row.font));
    this.paint.setMaskFilter(null);
  }

  private dotMetrics() {
    const em = 18; // the web mod's fixed 1.5rem, scaled for a phone
    return { em, size: em * 0.8, gap: em * 0.7, height: em * 0.8 + em * 0.3 + 2 * em * 0.47 };
  }

  private dotsVisibility() {
    const p = this.dots.progress;
    return clamp01(p * 12) * (1 - clamp01((p - 0.85) / 0.15));
  }

  /** Three dots rise and fall in turn across the pause, then fall away as the next line starts. */
  private drawDots(canvas: SkCanvas, afterBottom: number) {
    const { em, size, gap, height } = this.dotMetrics();
    const p = this.dots.progress;
    const enter = clamp01(p * 12);
    const exit = clamp01((p - 0.85) / 0.15);
    const groupAlpha = enter * (1 - exit);
    const baseY = afterBottom + height / 2 + exit * DOT_EXIT_EM * em;
    const total = size * 3 + gap * 2;
    const x0 = this.dots.right ? this.width - this.pad - total : this.pad;
    for (let i = 0; i < 3; i++) {
      const local = (p - i / 3) * 3;
      const lift = local >= 0 && local <= 1 ? Math.sin(local * Math.PI) : 0;
      const r = (size / 2) * (1 + lift * DOT_SCALE);
      const cx = x0 + size / 2 + i * (size + gap);
      const cy = baseY - lift * this.settings.dotRise * em;
      const a = (0.28 + 0.72 * lift) * groupAlpha;
      this.setWhite(this.glowPaint, 0.6 * a);
      this.glowPaint.setMaskFilter(this.maskFor(em * 0.55));
      canvas.drawCircle(cx, cy, r, this.glowPaint);
      this.setWhite(this.paint, a);
      this.paint.setMaskFilter(null);
      canvas.drawCircle(cx, cy, r, this.paint);
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────────

function mover(startMs: number, endMs: number, scale: number, lift: number): Mover {
  return {
    startMs,
    endMs,
    scale: new Spring(scale, SCALE_SPRING.f, SCALE_SPRING.z),
    lift: new Spring(lift, LIFT_SPRING.f, LIFT_SPRING.z),
    glow: new Spring(0, GLOW_SPRING.f, GLOW_SPRING.z),
    live: false,
    rest: 'notsung',
    gp: SWEEP_FROM,
  };
}

function settled(m: Mover) {
  return m.scale.resting && m.lift.resting && m.glow.resting;
}

/** Hand a settled mover back to its rest pose (the web mod's CSS rest state). */
function rest(m: Mover, phase: Phase) {
  m.live = false;
  m.rest = phase === 'sung' ? 'sung' : 'notsung';
  m.gp = m.rest === 'sung' ? 100 : SWEEP_FROM;
}

/** The most common singer is the "left" (primary) voice. */
function primaryAgent(lines: LyricLine[]): string {
  const counts = new Map<string, number>();
  for (const l of lines) if (l.agent) counts.set(l.agent, (counts.get(l.agent) ?? 0) + 1);
  let best = '';
  let max = 0;
  for (const [agent, n] of counts) {
    if (n > max) {
      max = n;
      best = agent;
    }
  }
  return best;
}
