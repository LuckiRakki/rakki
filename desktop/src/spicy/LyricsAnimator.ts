/**
 * LyricsAnimator.ts
 * Renders and animates lyrics the way Spicy Lyrics for Spotify does.
 * From the Spicy Lyrics web mod (SpicyLyrics-Jellyfin/src), used as is in Rakki desktop; only
 * its imports changed (Rakki's lyrics model, and settings fixed at the web mod's defaults).
 *
 * Every word is moved by three springs (size, lift, glow). Each frame the word
 * looks up where it *should* be on a keyframe curve for how far through it the
 * singer is, and its springs chase that target. Springs lag and overshoot a
 * little, and that is the whole look: a word swells from 95% to about 105% of
 * its size as it is sung, then settles at 100%, lifting a hair and bouncing as
 * it lands. Unsung words wait small and slightly low; sung words stay put.
 *
 *  - The colour sweep is a soft-edged gradient moving through each word.
 *  - Words held for a second or more are spelled out: each letter pops in
 *    turn, with its neighbours following at a falloff.
 *  - A line is lit only while it is being sung, so overlapping lines (duets,
 *    background vocals) are lit together.
 *  - Unlit lines draw their glyphs through text-shadow, whose blur radius is
 *    the depth-of-field blur — far cheaper than filter: blur().
 *  - Duet lines (different TTML ttm:agent) are right-aligned.
 *  - Background vocals (x-bg) are their own smaller line under the lead.
 *  - Long instrumental gaps show three bouncing dots under the last line.
 *  - The track glides via a CSS transform; the user can also scroll manually.
 */

import type { LyricLine, Lyrics as LyricsPayload, WordCue } from '@/lyrics/types';

import { Settings } from './settings';
import { Spline } from './Spline';
import { Spring } from './Spring';

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

// ─── Motion ──────────────────────────────────────────────────────────────────
// Curves are [progress through the word 0→1, value]. Lifts are fractions of the
// lyric font size; negative is up.

const WORD_SCALE   = new Spline([[0, 0.95], [0.7, 1.0505], [1, 1]]);
const WORD_LIFT    = new Spline([[0, 0.01], [0.9, -1 / 60], [1, 0]]);
const LETTER_SCALE = new Spline([[0, 0.95], [0.7, 1.175], [1, 1]]);
const LETTER_LIFT  = new Spline([[0, 0.02], [0.9, -1 / 28], [1, 0]]);
const GLOW         = new Spline([[0, 0], [0.15, 1], [0.6, 1], [1, 0]]);
const LINE_GLOW    = new Spline([[0, 0], [0.5, 1], [1, 0]]);

/** Spring tunings: frequency (Hz) and damping ratio. */
const SCALE_SPRING     = { f: 0.88, z: 0.64 };
const LIFT_SPRING      = { f: 1.45, z: 0.4 };
const GLOW_SPRING      = { f: 1.18, z: 0.56 };
const LINE_GLOW_SPRING = { f: 1, z: 0.5 };

// Colour sweep: the sung edge runs from 20% before a word to its end.
const SWEEP_FROM = -20;
const SWEEP_SPAN = 120;

const LETTER_TAIL_MS    = 250;   // a spelled word finishes its letters this early
const LETTER_FALLOFF    = 2.8;   // neighbour falloff (size/lift) around the popping letter
const LETTER_GLOW_SLOPE = 0.9;   // neighbour falloff (glow)
const LETTER_SUNG_GLOW  = GLOW.at(0.2);

const WORD_GLOW_ALPHA   = 0.35;  // peak halo opacity, ordinary word
const LETTER_GLOW_ALPHA = 1.85;  // … spelled letter (clamps to 1)
const LINE_GLOW_ALPHA   = 0.5;   // … line-by-line lyric

const BLUR_CAP_LINES = 5.465;    // blur stops growing this many lines out
const SCROLL_LIFT_PX = 30;       // the followed line sits this far above centre
const PIN_LOOKAHEAD  = 2;        // see scrollGroup()
const MAX_FRAME_S    = 0.1;      // a stalled frame shouldn't fast-forward the springs
const SEEK_BACK_MS   = 150;      // clock moves beyond these → treat as a seek
const SEEK_AHEAD_MS  = 1000;
const CREDIT_SWEEP_MS = 2000;

const MANUAL_RESUME_MS = 4000;   // resume auto-follow this long after manual scroll
const DOT_SCALE        = 0.45;   // extra scale at a dot's peak
const DOT_EXIT_EM      = 2.2;    // how far the dots fall away at the end

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

// ─── Internal types ───────────────────────────────────────────────────────────

type Phase = 'notsung' | 'active' | 'sung';

const phaseAt = (ms: number, start: number, end: number): Phase =>
    ms < start ? 'notsung' : ms >= end ? 'sung' : 'active';

const progressAt = (ms: number, start: number, end: number): number =>
    end > start ? clamp01((ms - start) / (end - start)) : ms >= end ? 1 : 0;

/** Something whose inline styles we write, with a cache to skip no-op writes. */
interface Styled {
    el: HTMLElement;
    written: Record<string, number>;
}

/** An animated element: a word, a spelled word's box, or one of its letters. */
interface Mover extends Styled {
    startMs: number;
    endMs: number;
    scale: Spring;
    lift: Spring;
    glow: Spring;
    /** Carrying per-frame inline styles; otherwise its CSS rest state shows. */
    live: boolean;
    /** Which CSS rest state it was last left in. */
    rest: 'notsung' | 'sung';
}

interface Word extends Mover {
    /** Held words only: one mover per letter. */
    letters: Mover[] | null;
}

type RowKind = 'lead' | 'bg' | 'plain' | 'credits';

/** One visual line: a lead vocal line, its background vocals, or a plain line. */
interface Row extends Styled {
    kind: RowKind;
    group: number;
    startMs: number;
    endMs: number;
    words: Word[];
    phase: Phase;
    /** Plain (line-by-line / credit) rows glow as a whole. */
    glow: Spring | null;
}

/** A lead line together with the background-vocal rows under it. */
interface Group {
    first: number;
    last: number;
    startMs: number;
    endMs: number;
}

const splitGraphemes = (text: string): string[] => {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
    return Array.from(text);
};

// ─── LyricsAnimator ───────────────────────────────────────────────────────────

export class LyricsAnimator {
    private readonly root: HTMLElement;
    private readonly scroller: HTMLElement;
    private readonly dots: HTMLElement;
    private rows: Row[] = [];
    private groups: Group[] = [];
    /** Rows that are lit or still settling — the only ones animated per frame. */
    private live = new Set<Row>();
    private synced = true;
    private payload: LyricsPayload | null = null;

    private focusRow = -1;       // blur centre: the last lit line
    private blurStep = -1;       // px/line currently written
    private centeredGroup = -1;
    private lastMs = -1;

    // "Next up" card shown once the lyrics are over.
    private nextUpEl: HTMLElement | null = null;
    private lastLyricEnd = 0;

    // Wall-clock frame delta for the springs — they move in real time,
    // independent of the (seek-jumpy) playback clock.
    private lastFrameWall = 0;

    // manual-scroll state
    private manual = false;
    private manualUntil = 0;
    private manualY = 0;
    private lastAutoY = 0;

    /** Called with a line's start time (ms) when the user clicks that line. */
    public onSeek: ((startMs: number) => void) | null = null;

    constructor(mountPoint: HTMLElement) {
        this.root = mountPoint;
        this.root.classList.add('sl-root');

        this.scroller = document.createElement('div');
        this.scroller.className = 'sl-scroller';
        this.root.appendChild(this.scroller);

        // Interlude dots — inserted into the lyric flow (under the last line)
        // during a pause, removed otherwise.
        this.dots = document.createElement('div');
        this.dots.id = 'spicy-lyrics-dots';
        this.dots.innerHTML = '<span class="sl-dot"></span><span class="sl-dot"></span><span class="sl-dot"></span>';

        this.root.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }

    // ── Public ────────────────────────────────────────────────────────────────

    load(payload: LyricsPayload): void {
        this.payload = payload;
        this.synced = payload.isSynced;
        this.setManual(false);
        this.root.classList.toggle('sl-unsynced', !payload.isSynced);
        this.buildDOM(payload);
    }

    tick(ms: number, durationMs = 0): void {
        if (!this.payload) return;
        // Unsynced lyrics have no timing. Optionally auto-scroll the list in step
        // with playback progress (top at 0%, bottom at 100%); otherwise static.
        if (!this.synced) {
            if (this.manual && Date.now() > this.manualUntil) this.setManual(false);
            if (Settings.values.unsyncedAutoScroll && !this.manual && durationMs > 0) {
                const viewH = this.root.clientHeight || this.root.offsetHeight;
                const scrollable = Math.max(0, this.scroller.scrollHeight - viewH);
                const progress = Math.max(0, Math.min(1, ms / durationMs));
                const y = -Math.round(progress * scrollable);
                this.lastAutoY = y;
                this.applyTransform(y, false);
            }
            return;
        }

        const wall = performance.now();
        const dt = this.lastFrameWall ? Math.min(MAX_FRAME_S, (wall - this.lastFrameWall) / 1000) : 0;
        this.lastFrameWall = wall;

        // Resume auto-follow a few seconds after the user stops scrolling
        if (this.manual && Date.now() > this.manualUntil) {
            this.setManual(false);
            this.centeredGroup = -1;
        }

        // The first frame counts as a seek too: opening mid-song must not
        // animate every line above the singer into place at once.
        const jumped = this.lastMs < 0 || ms < this.lastMs - SEEK_BACK_MS || ms > this.lastMs + SEEK_AHEAD_MS;
        this.lastMs = ms;

        // Which lines are being sung right now.
        let focus = -1;
        for (let i = 0; i < this.rows.length; i++) {
            const row = this.rows[i];
            const phase = phaseAt(ms, row.startMs, row.endMs);
            if (phase !== row.phase) {
                this.setRowPhase(row, phase);
                this.live.add(row);
            }
            if (phase === 'active') focus = i;
        }
        if (jumped) this.snapAll(ms);

        // Depth-of-field blur, centred on the last lit line (kept while none is).
        const s = Settings.values;
        const step = s.lineBlurEnabled ? s.blurPerLine : 0;
        if ((focus >= 0 && focus !== this.focusRow) || step !== this.blurStep) {
            if (focus >= 0) this.focusRow = focus;
            this.applyBlur(step);
        }

        // Follow the singer.
        const target = this.scrollGroup(ms);
        if (target >= 0 && !this.manual && target !== this.centeredGroup) {
            this.centerLine(this.rows[this.groups[target].first].el, true);
            this.centeredGroup = target;
        }

        // Interlude dots under the last line that was sung.
        const gap = this.computeGap(ms);
        const last = this.lastStartedGroup(ms);
        this.updateDots(gap.inGap, gap.progress, last >= 0 ? this.rows[this.groups[last].last].el : null);

        for (const row of this.live) {
            if (!this.animateRow(row, ms, dt)) this.live.delete(row);
        }
    }

    /** End time (ms) of the last actual lyric — used by the next-up trigger. */
    getLastLyricEnd(): number { return this.lastLyricEnd; }

    /** Fade the next-up card in/out (the plugin decides when — it has duration). */
    showNextUp(visible: boolean): void {
        this.nextUpEl?.classList.toggle('sl-nextup--show', visible);
    }

    clear(): void {
        this.payload = null;
        this.rows = [];
        this.groups = [];
        this.live.clear();
        this.nextUpEl = null;   // wiped with the scroller below
        this.lastLyricEnd = 0;
        if (this.dots.parentElement) this.dots.remove();
        this.scroller.innerHTML = '';
    }

    /**
     * Provide (or clear with null) the "next up" card, appended under the
     * credits. It fades up once playback passes the last lyric (see tick()).
     */
    setNextUp(
        info: { title: string; artist: string; artUrl: string | null } | null,
        onClick?: () => void
    ): void {
        if (this.nextUpEl) { this.nextUpEl.remove(); this.nextUpEl = null; }
        if (!info || !info.title || this.lastLyricEnd <= 0) return;

        const el = document.createElement('div');
        el.className = 'sl-nextup';
        // Follow the last line's side (duet lines can be right-aligned).
        const lastRow = this.rows[this.rows.length - 1];
        if (lastRow?.el.classList.contains('sl-line--right')) {
            el.classList.add('sl-nextup--right');
        }

        let art: HTMLElement;
        if (info.artUrl) {
            const img = document.createElement('img');
            img.className = 'sl-nextup-art';
            img.alt = '';
            img.src = info.artUrl;
            art = img;
        } else {
            art = document.createElement('div');
            art.className = 'sl-nextup-art';
        }

        const text = document.createElement('div');
        text.className = 'sl-nextup-text';
        const label = document.createElement('span');
        label.className = 'sl-nextup-label';
        label.textContent = 'Next up';
        const title = document.createElement('span');
        title.className = 'sl-nextup-title';
        title.textContent = info.title;
        const artist = document.createElement('span');
        artist.className = 'sl-nextup-artist';
        artist.textContent = info.artist;
        text.append(label, title, artist);

        el.append(art, text);
        if (onClick) el.addEventListener('click', onClick);
        this.scroller.appendChild(el);
        this.nextUpEl = el;
    }

    destroy(): void {
        this.clear();
        this.root.innerHTML = '';
    }

    // ── DOM building ──────────────────────────────────────────────────────────

    private buildDOM(payload: LyricsPayload): void {
        this.scroller.innerHTML = '';
        this.scroller.style.transform = 'translate3d(0, 0, 0)';
        this.rows = [];
        this.groups = [];
        this.live.clear();
        this.focusRow = -1;
        this.blurStep = -1;
        this.centeredGroup = -1;
        this.lastMs = -1;
        this.lastFrameWall = 0;
        this.lastLyricEnd = 0;
        this.root.classList.remove('sl-has-duets');

        if (!payload.isSynced) {
            // Unsynced (.txt / embedded with no timing): static readable text
            for (const line of payload.lines) {
                const el = document.createElement('div');
                el.className = 'sl-line sl-line--unsynced';
                el.textContent = line.text;
                this.scroller.appendChild(el);
            }
            return;
        }

        const primaryAgent = this.computePrimaryAgent(payload.lines);
        const isRight = (l: LyricLine): boolean => !!l.agent && !!primaryAgent && l.agent !== primaryAgent;
        this.root.classList.toggle('sl-has-duets', payload.lines.some(isRight));

        const lines = payload.lines;
        for (let i = 0; i < lines.length; i++) {
            const data = lines[i];
            const right = isRight(data);
            const rtl = RTL.test(data.text);
            const group = this.groups.length;
            const first = this.rows.length;
            const words = payload.hasWordCues && data.words?.length ? data.words : null;

            // A line with no usable end runs until the next one starts.
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

            const lead = this.addRow(words ? 'lead' : 'plain', group, right, rtl, data.startMs);
            if (words) this.buildWords(lead, words);
            else lead.el.textContent = data.text;

            if (data.bgWords?.length) {
                const bg = this.addRow('bg', group, right, rtl, data.bgWords[0].startMs);
                this.buildWords(bg, data.bgWords);
                bg.startMs = data.bgWords[0].startMs;
                bg.endMs = bg.startMs;
                for (const w of data.bgWords) {
                    bg.startMs = Math.min(bg.startMs, w.startMs);
                    bg.endMs = Math.max(bg.endMs, w.endMs);
                }
                // The lead line stays lit until its background vocals are done.
                start = Math.min(start, bg.startMs);
                end = Math.max(end, bg.endMs);
            }

            lead.startMs = start;
            lead.endMs = end;
            this.groups.push({ first, last: this.rows.length - 1, startMs: start, endMs: end });
            // The moment the actual lyrics finish — used to trigger the next-up card.
            this.lastLyricEnd = Math.max(this.lastLyricEnd, end);
        }

        this.appendCredits(payload);
    }

    private addRow(kind: RowKind, group: number, right: boolean, rtl: boolean, seekMs: number): Row {
        const el = document.createElement('div');
        let cls = 'sl-line sl-line--notsung';
        if (kind === 'bg') cls += ' sl-line--bg';
        if (kind === 'plain' || kind === 'credits') cls += ' sl-line--plain';
        if (kind === 'credits') cls += ' sl-credits';
        if (right) cls += ' sl-line--right';
        if (rtl) cls += ' sl-line--rtl';
        el.className = cls;
        el.addEventListener('click', () => this.onSeek?.(seekMs));
        this.scroller.appendChild(el);

        const row: Row = {
            el, kind, group,
            startMs: 0, endMs: 0,
            words: [],
            phase: 'notsung',
            glow: kind === 'plain' || kind === 'credits'
                ? new Spring(0, LINE_GLOW_SPRING.f, LINE_GLOW_SPRING.z)
                : null,
            written: {},
        };
        this.rows.push(row);
        return row;
    }

    /**
     * A "Written by: …" credit appended after the lyrics. It's modelled as a
     * final line that becomes lit (and glows) once the last lyric is done.
     */
    private appendCredits(payload: LyricsPayload): void {
        const writers = payload.songwriters;
        if (!writers || !writers.length || !this.rows.length) return;

        const start = this.lastLyricEnd;
        const lastRow = this.rows[this.rows.length - 1];
        const row = this.addRow('credits', this.groups.length, false, false, start);
        row.el.textContent = `Written by: ${writers.join(', ')}`;
        row.el.classList.toggle('sl-line--right', lastRow.el.classList.contains('sl-line--right'));
        row.startMs = start;
        row.endMs = start + 600000;
        this.groups.push({ first: this.rows.length - 1, last: this.rows.length - 1, startMs: row.startMs, endMs: row.endMs });
    }

    /** The most common agent is treated as the "left" (primary) singer. */
    private computePrimaryAgent(lines: LyricLine[]): string {
        const counts = new Map<string, number>();
        for (const l of lines) {
            if (l.agent) counts.set(l.agent, (counts.get(l.agent) ?? 0) + 1);
        }
        let best = '';
        let max = 0;
        for (const [agent, n] of counts) {
            if (n > max) { max = n; best = agent; }
        }
        return best;
    }

    /**
     * Word spans for a row. Syllables of one word (no space between their
     * spans) are kept together in a no-wrap group, and each grows away from
     * the seam so the word never gaps apart. Held words are split into letters.
     */
    private buildWords(row: Row, cues: WordCue[]): void {
        const s = Settings.values;
        let wordGroup: HTMLElement | null = null;
        let prevJoins = false;
        let prevEl: HTMLElement | null = null;

        for (let i = 0; i < cues.length; i++) {
            const cue = cues[i];
            const text = cue.text.replace(/\s+$/, '');
            if (!text.trim()) {
                // A whitespace-only cue is just a space before the next word.
                if (prevEl && prevJoins) prevEl.classList.add('sl-gap');
                prevJoins = false;
                continue;
            }

            const next = cues[i + 1];
            const joins = !!next
                && !/\s$/.test(cue.text) && !text.endsWith(',')
                && !/^\s/.test(next.text) && !!next.text.trim();

            const dur = cue.endMs - cue.startMs;
            const spelled = s.spellingEnabled && dur >= s.spellMinMs && !RTL.test(text);
            const el = document.createElement('span');
            el.className = spelled ? 'sl-word sl-word--spelled' : 'sl-word';
            if (joins) el.classList.add(prevJoins ? 'sl-o-c' : 'sl-o-r');
            else if (prevJoins) el.classList.add('sl-o-l');
            if (!joins && next) el.classList.add('sl-gap');

            const endMs = spelled ? cue.endMs - Math.min(LETTER_TAIL_MS, dur / 2) : cue.endMs;
            const word: Word = { ...this.mover(el, cue.startMs, endMs, WORD_SCALE.at(0), WORD_LIFT.at(0)), letters: null };

            if (spelled) {
                const glyphs = splitGraphemes(text);
                const span = (endMs - cue.startMs) / glyphs.length;
                word.letters = glyphs.map((g, k) => {
                    const le = document.createElement('span');
                    le.className = g.trim() ? 'sl-letter' : 'sl-letter sl-letter--space';
                    le.textContent = g;
                    el.appendChild(le);
                    const ls = cue.startMs + k * span;
                    return this.mover(le, ls, ls + span, LETTER_SCALE.at(0), LETTER_LIFT.at(0));
                });
            } else {
                el.textContent = text;
            }

            if (joins || prevJoins) {
                if (!wordGroup) {
                    wordGroup = document.createElement('span');
                    wordGroup.className = 'sl-word-group';
                    row.el.appendChild(wordGroup);
                }
                wordGroup.appendChild(el);
                if (!joins) wordGroup = null;
            } else {
                row.el.appendChild(el);
            }

            row.words.push(word);
            prevJoins = joins;
            prevEl = el;
        }
    }

    private mover(el: HTMLElement, startMs: number, endMs: number, scale: number, lift: number): Mover {
        return {
            el, startMs, endMs,
            scale: new Spring(scale, SCALE_SPRING.f, SCALE_SPRING.z),
            lift: new Spring(lift, LIFT_SPRING.f, LIFT_SPRING.z),
            glow: new Spring(0, GLOW_SPRING.f, GLOW_SPRING.z),
            live: false,
            rest: 'notsung',
            written: {},
        };
    }

    // ── Line state ────────────────────────────────────────────────────────────

    private setRowPhase(row: Row, phase: Phase): void {
        row.phase = phase;
        const cl = row.el.classList;
        cl.toggle('sl-line--notsung', phase === 'notsung');
        cl.toggle('sl-line--active', phase === 'active');
        cl.toggle('sl-line--sung', phase === 'sung');
    }

    /** Blur each line by its distance from the focused one (capped). */
    private applyBlur(step: number): void {
        this.blurStep = step;
        const cap = step * BLUR_CAP_LINES;
        for (let i = 0; i < this.rows.length; i++) {
            const row = this.rows[i];
            const d = this.focusRow < 0 ? 0 : Math.abs(i - this.focusRow);
            LyricsAnimator.put(row, '--sl-lb', Math.min(step * d, cap), 'px', 0.01);
            // The faint halo is only painted near the focus (it's per-glyph
            // work); before the first line, near the top.
            row.el.classList.toggle('sl-line--near', (this.focusRow < 0 ? i : d) <= 3);
        }
    }

    /** Last line group that has started (the one the dots sit under). */
    private lastStartedGroup(ms: number): number {
        for (let i = this.groups.length - 1; i >= 0; i--) {
            if (ms >= this.groups[i].startMs) return i;
        }
        return -1;
    }

    /**
     * Which line to keep in view. Among the lines being sung, the topmost keeps
     * the view as long as it finishes before the line two further down starts —
     * so a long overlapping line doesn't yank the view back and forth. With
     * nothing lit (a gap, or just after a seek), stay on the last line started.
     */
    private scrollGroup(ms: number): number {
        let front = -1;
        for (const row of this.rows) {
            if (row.phase === 'active' && row.group > front) front = row.group;
        }
        if (front < 0) return this.lastStartedGroup(ms);

        const active: number[] = [];
        for (const row of this.rows) {
            if (row.phase !== 'active') continue;
            // A background vocal still hanging on from an earlier line.
            if (row.kind === 'bg' && row.group < front) continue;
            if (active[active.length - 1] !== row.group) active.push(row.group);
        }
        const anchor = active[0];
        const ahead = this.groups[anchor + PIN_LOOKAHEAD];
        if (!ahead || this.groups[anchor].endMs <= ahead.startMs) return anchor;
        const last = active[active.length - 1];
        return last - anchor <= 1 ? anchor : last;
    }

    /** Detect a long instrumental gap after the last line that started. */
    private computeGap(ms: number): { inGap: boolean; progress: number } {
        const idx = this.lastStartedGroup(ms);
        const next = this.groups[idx + 1];
        if (idx < 0 || !next) return { inGap: false, progress: 0 };

        // A line isn't "done" until its words AND background vocals finish, so
        // a bg part (e.g. "(Oh, just try to catch us!)") doesn't get mistaken
        // for an instrumental gap.
        const gapStart = this.groups[idx].endMs;
        const gapEnd = next.startMs;
        if (gapEnd - gapStart >= Settings.values.gapDotsMs && ms >= gapStart && ms < gapEnd) {
            return { inGap: true, progress: (ms - gapStart) / (gapEnd - gapStart) };
        }
        return { inGap: false, progress: 0 };
    }

    // ── Word animation ────────────────────────────────────────────────────────

    /** Advance one row's words. Returns false once it has nothing left to do. */
    private animateRow(row: Row, ms: number, dt: number): boolean {
        if (row.glow) return this.animatePlainRow(row, ms, dt);
        let busy = row.phase === 'active';
        for (const w of row.words) {
            if (this.animateWord(w, ms, dt)) busy = true;
        }
        return busy;
    }

    private animateWord(w: Word, ms: number, dt: number): boolean {
        const phase = phaseAt(ms, w.startMs, w.endMs);
        if (phase !== 'active' && !w.live && w.rest === phase) return false;   // resting in place

        const s = Settings.values;
        const t = phase === 'active' ? progressAt(ms, w.startMs, w.endMs) : phase === 'sung' ? 1 : 0;
        this.wake(w, WORD_SCALE, WORD_LIFT, s.wordPop, s.wordLift);
        w.scale.setGoal(1 + (WORD_SCALE.at(t) - 1) * s.wordPop);
        w.lift.setGoal(WORD_LIFT.at(t) * s.wordLift);
        w.glow.setGoal(GLOW.at(t));
        this.stepMover(w, dt);
        LyricsAnimator.putTransform(w);

        let busy = phase === 'active' || !LyricsAnimator.settled(w);
        if (w.letters) {
            // A held word: the box moves as one, the letters paint and pop.
            if (this.animateLetters(w, ms, phase, dt)) busy = true;
        } else {
            const glowMul = s.glowEnabled ? s.glowStrength : 0;
            const g = w.glow.value;
            LyricsAnimator.put(w, '--gp', SWEEP_FROM + SWEEP_SPAN * t, '%', 0.01);
            LyricsAnimator.put(w, '--gb', 4 + 2 * g, 'px', 0.02);
            LyricsAnimator.put(w, '--ga', clamp01(WORD_GLOW_ALPHA * g * glowMul), '', 0.002);
        }

        if (!busy) LyricsAnimator.rest(w, phase);
        return busy;
    }

    /**
     * Letters of a held word. The letter being sung pops through its own
     * curve; its neighbours follow at a falloff with distance, and letters not
     * reached yet stay at rest — so a wave rolls through the word behind the
     * singer. Returns true while any letter is still moving.
     */
    private animateLetters(w: Word, ms: number, wordPhase: Phase, dt: number): boolean {
        const s = Settings.values;
        const letters = w.letters!;
        const glowMul = s.glowEnabled ? s.glowStrength * s.letterGlow : 0;

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
                ts = restS; ty = restY; tg = 0;
                if (ai >= 0 && lp !== 'notsung') {
                    const d = Math.abs(k - ai);
                    const fall = 1 / (1 + Math.pow(d, LETTER_FALLOFF));
                    ts = restS + (LETTER_SCALE.at(ap) - restS) * fall;
                    ty = restY + (LETTER_LIFT.at(ap) - restY) * fall;
                    tg = GLOW.at(ap) / (1 + d * LETTER_GLOW_SLOPE);
                } else if (lp === 'sung') {
                    tg = LETTER_SUNG_GLOW;
                }
                gp = lp === 'notsung' ? SWEEP_FROM
                    : lp === 'sung' ? 100
                    : k === ai ? SWEEP_FROM + SWEEP_SPAN * Math.sin(ap * Math.PI / 2)
                    : SWEEP_FROM;
            } else if (wordPhase === 'sung') {
                ts = LETTER_SCALE.at(1); ty = LETTER_LIFT.at(1); tg = 0; gp = 100;
            } else {
                ts = restS; ty = restY; tg = 0; gp = SWEEP_FROM;
            }

            this.wake(L, LETTER_SCALE, LETTER_LIFT, s.letterPop, s.letterPop);
            L.scale.setGoal(1 + (ts - 1) * s.letterPop);
            L.lift.setGoal(ty * s.letterPop);
            L.glow.setGoal(tg);
            this.stepMover(L, dt);
            LyricsAnimator.putTransform(L);
            const g = L.glow.value;
            LyricsAnimator.put(L, '--gp', gp, '%', 0.01);
            LyricsAnimator.put(L, '--gb', 4 + 12 * g, 'px', 0.02);
            LyricsAnimator.put(L, '--ga', clamp01(LETTER_GLOW_ALPHA * g * glowMul), '', 0.002);

            if (wordPhase !== 'active' && LyricsAnimator.settled(L)) LyricsAnimator.rest(L, wordPhase);
            else busy = true;
        }
        return busy;
    }

    /** Line-by-line (and credit) rows: a top→bottom sweep and a whole-line glow. */
    private animatePlainRow(row: Row, ms: number, dt: number): boolean {
        const s = Settings.values;
        const glow = row.glow!;
        const end = row.kind === 'credits' ? row.startMs + CREDIT_SWEEP_MS : row.endMs;
        const t = row.phase === 'active' ? progressAt(ms, row.startMs, end) : row.phase === 'sung' ? 1 : 0;

        glow.frequency = LINE_GLOW_SPRING.f * s.motionSpeed;
        glow.damping = LINE_GLOW_SPRING.z * s.motionDamping;
        glow.setGoal(LINE_GLOW.at(t));
        const g = glow.step(dt);

        const busy = row.phase === 'active' || !glow.resting;
        if (!busy) {
            LyricsAnimator.clearStyles(row);
            return false;
        }
        const sweep = row.phase === 'active' ? (s.lrcSweep ? 100 * t : 100) : row.phase === 'sung' ? 100 : SWEEP_FROM;
        const glowMul = s.glowEnabled ? s.glowStrength : 0;
        LyricsAnimator.put(row, '--gp', sweep, '%', 0.01);
        LyricsAnimator.put(row, '--gb', 4 + 8 * g, 'px', 0.02);
        LyricsAnimator.put(row, '--ga', clamp01(LINE_GLOW_ALPHA * g * glowMul), '', 0.002);
        return true;
    }

    /**
     * After a seek nothing should animate in from where it was: put every word
     * straight into the state that matches the new position.
     */
    private snapAll(ms: number): void {
        const s = Settings.values;
        this.live.clear();
        for (const row of this.rows) {
            if (row.glow) {
                row.glow.setGoal(0, true);
                LyricsAnimator.clearStyles(row);
            }
            for (const w of row.words) {
                const phase = phaseAt(ms, w.startMs, w.endMs);
                const t = phase === 'active' ? progressAt(ms, w.startMs, w.endMs) : phase === 'sung' ? 1 : 0;
                w.scale.setGoal(1 + (WORD_SCALE.at(t) - 1) * s.wordPop, true);
                w.lift.setGoal(WORD_LIFT.at(t) * s.wordLift, true);
                w.glow.setGoal(phase === 'active' ? GLOW.at(t) : 0, true);
                // A word caught mid-song carries on from its snapped values.
                if (phase === 'active') LyricsAnimator.putTransform(w);
                else LyricsAnimator.rest(w, phase);
                for (const L of w.letters ?? []) {
                    const done = phase === 'sung';
                    L.scale.setGoal(1 + ((done ? LETTER_SCALE.at(1) : LETTER_SCALE.at(0)) - 1) * s.letterPop, true);
                    L.lift.setGoal((done ? LETTER_LIFT.at(1) : LETTER_LIFT.at(0)) * s.letterPop, true);
                    L.glow.setGoal(0, true);
                    LyricsAnimator.rest(L, done ? 'sung' : 'notsung');
                }
            }
            if (row.phase === 'active') this.live.add(row);
        }
    }

    /**
     * A mover coming out of its CSS rest state: start its springs from exactly
     * what that rest state shows (in case a setting changed while it rested).
     */
    private wake(m: Mover, scale: Spline, lift: Spline, popMul: number, liftMul: number): void {
        if (m.live) return;
        const t = m.rest === 'sung' ? 1 : 0;
        m.scale.setGoal(1 + (scale.at(t) - 1) * popMul, true);
        m.lift.setGoal(lift.at(t) * liftMul, true);
        m.glow.setGoal(0, true);
    }

    private stepMover(m: Mover, dt: number): void {
        const s = Settings.values;
        const fMul = s.motionSpeed;
        const zMul = s.motionDamping;
        m.scale.frequency = SCALE_SPRING.f * fMul; m.scale.damping = SCALE_SPRING.z * zMul;
        m.lift.frequency = LIFT_SPRING.f * fMul;   m.lift.damping = LIFT_SPRING.z * zMul;
        m.glow.frequency = GLOW_SPRING.f * fMul;   m.glow.damping = GLOW_SPRING.z * zMul;
        m.scale.step(dt);
        m.lift.step(dt);
        m.glow.step(dt);
    }

    private static settled(m: Mover): boolean {
        return m.scale.resting && m.lift.resting && m.glow.resting;
    }

    // ── Style writes (only when a value actually changes) ─────────────────────

    private static put(t: Styled, prop: string, v: number, unit: string, eps: number): void {
        const prev = t.written[prop];
        if (prev !== undefined && Math.abs(prev - v) <= eps) return;
        t.written[prop] = v;
        t.el.style.setProperty(prop, unit ? `${v.toFixed(3)}${unit}` : v.toFixed(4));
    }

    /**
     * translate3d gives a moving word its own compositor layer, but only while
     * it moves: at rest the inline transform is dropped (see rest()), so a song
     * never holds thousands of layers.
     */
    private static putTransform(m: Mover): void {
        const y = m.lift.value;
        const sc = m.scale.value;
        const c = m.written;
        if (c.y !== undefined && Math.abs(c.y - y) <= 0.00005 && Math.abs(c.s - sc) <= 0.0005) return;
        c.y = y;
        c.s = sc;
        m.el.style.transform =
            `translate3d(0, calc(var(--sl-font-size) * ${y.toFixed(5)}), 0) scale(${sc.toFixed(4)})`;
        m.live = true;
    }

    /** Hand a settled mover back to its CSS rest state. */
    private static rest(m: Mover, phase: Phase): void {
        const state = phase === 'sung' ? 'sung' : 'notsung';
        if (!m.live && m.rest === state) return;
        LyricsAnimator.clearStyles(m);
        m.el.style.removeProperty('transform');
        m.el.classList.toggle('sl-w-sung', state === 'sung');
        m.live = false;
        m.rest = state;
    }

    private static clearStyles(t: Styled): void {
        const st = t.el.style;
        st.removeProperty('--gp');
        st.removeProperty('--gb');
        st.removeProperty('--ga');
        const lb = t.written['--sl-lb'];
        t.written = lb === undefined ? {} : { '--sl-lb': lb };
    }

    // ── Interlude dots ────────────────────────────────────────────────────────

    /**
     * Drive the three dots as a "loading" animation across the pause: dot 1
     * rises and falls, then dot 2, then dot 3 — then the whole row falls away
     * as the next line resumes. `progress` is 0..1 over the gap.
     */
    private updateDots(show: boolean, progress: number, afterEl: HTMLElement | null): void {
        if (!show || !afterEl) {
            if (this.dots.parentElement) this.dots.remove();
            return;
        }

        // Insert as a new line directly beneath the last-played line, matching
        // its left/right (duet) alignment.
        if (this.dots.previousElementSibling !== afterEl || this.dots.parentElement !== this.scroller) {
            afterEl.insertAdjacentElement('afterend', this.dots);
        }
        this.dots.classList.toggle('sl-dots--right', afterEl.classList.contains('sl-line--right'));

        const dotEls = this.dots.children;
        const n = dotEls.length; // 3
        for (let i = 0; i < n; i++) {
            // Each dot owns a third of the timeline; rises then falls within it.
            const local = (progress - i / n) / (1 / n);
            const lift = local >= 0 && local <= 1 ? Math.sin(local * Math.PI) : 0;
            const el = dotEls[i] as HTMLElement;
            el.style.transform =
                `translateY(${(-lift * Settings.values.dotRise).toFixed(2)}em) scale(${(1 + lift * DOT_SCALE).toFixed(3)})`;
            el.style.opacity = (0.28 + 0.72 * lift).toFixed(3);
        }

        // Quick fade-in at the start, and a fall-away + fade-out at the very end.
        const enter = clamp01(progress * 12);
        const exit = clamp01((progress - 0.85) / 0.15);
        this.dots.style.transform = `translateY(${(exit * DOT_EXIT_EM).toFixed(2)}em)`;
        this.dots.style.opacity = (enter * (1 - exit)).toFixed(3);
    }

    // ── Scrolling (auto-glide + manual) ───────────────────────────────────────

    private centerLine(el: HTMLElement, withTransition: boolean): void {
        const viewH = this.root.clientHeight || this.root.offsetHeight;
        const y = Math.round(viewH / 2 - (el.offsetTop + el.offsetHeight / 2) - SCROLL_LIFT_PX);
        this.lastAutoY = y;
        this.applyTransform(y, withTransition);
    }

    private applyTransform(y: number, withTransition: boolean): void {
        this.scroller.style.transition = withTransition ? '' : 'none';
        this.scroller.style.transform = `translate3d(0, ${y}px, 0)`;
    }

    /** While the user scrolls by hand, every line is shown sharp. */
    private setManual(on: boolean): void {
        this.manual = on;
        this.root.classList.toggle('sl-manual', on);
    }

    private onWheel(e: WheelEvent): void {
        e.preventDefault();
        if (!this.manual) this.manualY = this.lastAutoY;
        this.setManual(true);
        this.manualUntil = Date.now() + MANUAL_RESUME_MS;

        const viewH = this.root.clientHeight || this.root.offsetHeight;
        const contentH = this.scroller.scrollHeight;
        const maxY = viewH / 2;
        const minY = viewH / 2 - contentH;
        this.manualY = Math.max(minY, Math.min(maxY, this.manualY - e.deltaY));
        this.applyTransform(this.manualY, false);
    }
}
