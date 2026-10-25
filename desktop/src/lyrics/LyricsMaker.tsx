// Sync Lyrics: make timed lyrics for a song by tapping along as it plays (Riff's idea, done the
// Rakki way). Three steps: the words (pasted, or the lyrics the song already has on your
// server), tapping (Space as each line, or each word, starts), and checking (every line with
// its time, nudged or tapped again). Saved by the Rakki plugin on your server, apart from the
// music files (lyrics/maker.ts), so every Rakki shows them; the work in progress is kept on
// this computer until then.
//
// Lyrics from the Spicy Lyrics API are never copied in: its terms only allow showing them.
import { useEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import { useLyrics } from '@/lyrics/fetch';
import { playNow } from '~/audio/AudioEditor';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import {
  clearTimings,
  draftFromLyrics,
  draftFromText,
  isComplete,
  loadDraft,
  nextTarget,
  saveDraftLocal,
  saveMadeLyrics,
  shiftLine,
  tap,
  untap,
  type Draft,
  type MakerLine,
} from '~/lyrics/maker';
import { pickLyrics } from '~/lyrics/LyricsView';
import { go, useNav } from '~/nav';
import { currentPosition, usePlayer } from '~/player/store';
import { queryClient, useItem } from '~/queries';
import { useShortcuts } from '~/settings/shortcuts';
import { useActiveTheme } from '~/themes/themes';
import { useEditsAvailable } from '~/audio/edits';
import { ArrowLeft, ArrowRight, Backspace, Check, ChevronLeft, Hand, Info, Music, Pause, Play, Rewind, Stopwatch } from '~/ui/icons';
import { confirmAction, toast } from '~/ui/overlays';
import { Artwork } from '~/ui/parts';
import { Empty, Loading } from '~/ui/states';

/** Open the lyrics maker for a song in the main area. */
export function openLyricsMaker(item: BaseItem) {
  queryClient.setQueryData(['item', useAuth.getState().session?.userId, item.Id], item);
  const l = useLayout.getState();
  if (l.nowPlaying) l.setNowPlaying(false);
  go({ name: 'makeLyrics', id: item.Id });
}

type Step = 'text' | 'tap' | 'check';

/** 83456 → "1:23.45" */
function stamp(ms: number | undefined): string {
  if (ms === undefined) return '–:––.––';
  const cs = Math.max(0, Math.round(ms / 10));
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

const sung = (d: Draft) => d.lines.filter((l) => !l.break);
const tapped = (l: MakerLine) => l.start !== undefined;
/** Every word (or the line itself) has its time. */
const timed = (l: MakerLine) => (l.words?.length ? l.words.every((w) => w.start !== undefined) : l.start !== undefined);
const anyTapped = (d: Draft) => d.lines.some((l) => tapped(l) || l.words?.some((w) => w.start !== undefined));
/** The text of a draft, back as rows (breaks as empty rows). */
const textOf = (d: Draft) => d.lines.map((l) => (l.break ? '' : l.text)).join('\n');
/** The latest time tapped anywhere in the draft (ms), or 0. */
function lastTap(d: Draft): number {
  let at = 0;
  for (const l of d.lines) {
    for (const t of [l.start, l.end, ...(l.words ?? []).flatMap((w) => [w.start, w.end])]) if (t !== undefined && t > at) at = t;
  }
  return at;
}
const nowMs = () => Math.round(currentPosition(usePlayer.getState()) * 1000);

export function LyricsMaker({ id }: { id: string }) {
  const q = useItem(id);
  const item = q.data;
  if (!item) return q.isError ? <Empty icon={Stopwatch} title="Couldn't Find the Song" detail="It may have been removed from your server." /> : <Loading what="the song" />;
  if (item.Type !== 'Audio' || item.Radio) return <Empty icon={Stopwatch} title="Only Songs Have Lyrics to Sync" />;
  return <Maker item={item} />;
}

function Maker({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const available = useEditsAvailable();
  const current = usePlayer((s) => s.queue[s.index]?.Id === item.Id);
  const lyricsQ = useLyrics(item.Id);
  const existing = pickLyrics(lyricsQ.data);
  // Only lyrics that live on your server (its files, or made in Rakki) can be the starting
  // point, never the Spicy Lyrics API's.
  const own = existing && (!existing.source || existing.source === 'rakki') ? existing : null;
  const [draft, setDraftState] = useState<Draft | null>(() => loadDraft(item.Id));
  const [text, setText] = useState(() => (draft ? textOf(draft) : ''));
  const [mode, setMode] = useState<Draft['mode']>(draft?.mode ?? 'line');
  const [step, setStep] = useState<Step>(() => (draft && anyTapped(draft) ? 'check' : 'text'));
  const typed = useRef(!!draft);

  // The lyrics the song has fill the box, until you type.
  useEffect(() => {
    if (!typed.current && own) setText(own.lines.map((l) => l.text).join('\n'));
  }, [own]);

  const setDraft = (d: Draft) => {
    setDraftState(d);
    saveDraftLocal(d);
  };

  const start = (d: Draft) => {
    setDraft(d);
    setStep('tap');
    // From the top for a fresh start, else a little before where you got to.
    const from = anyTapped(d) ? Math.max(0, lastTap(d) / 1000 - 3) : 0;
    if (current) {
      const p = usePlayer.getState();
      p.seek(from);
      if (!p.playing) p.toggle();
    } else playNow(item, from);
  };

  const tint = client ? artColor(client.blurhash(item), '#202024') : '#202024';
  const ownBackground = useActiveTheme().meta.backdrop !== 'flow';
  const artists = item.Artists?.join(', ') || item.AlbumArtist;
  const steps: { id: Step; label: string }[] = [
    { id: 'text', label: 'Words' },
    { id: 'tap', label: 'Tap' },
    { id: 'check', label: 'Check' },
  ];

  return (
    <div className={`maker${ownBackground ? ' own-bg' : ''}`} style={{ ['--tint' as string]: tint }}>
      <header className="mk-top">
        <button className="iconbtn mk-back" aria-label="Back" title="Back" onClick={() => useNav.getState().back()}>
          <ChevronLeft size={22} />
        </button>
        <Artwork item={item} size={120} className="mk-art" />
        <div className="mk-title">
          <div className="kind">Sync Lyrics</div>
          <div className="mk-name">{item.Name}</div>
          <div className="mk-sub">{artists}</div>
        </div>
        <ol className="mk-steps" aria-label="Steps">
          {steps.map((s, i) => {
            const at = steps.findIndex((x) => x.id === step);
            return (
              <li key={s.id} className={i === at ? 'on' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>
                <span className="mk-step-n">{i < at ? <Check size={13} /> : i + 1}</span>
                {s.label}
              </li>
            );
          })}
        </ol>
      </header>
      {step === 'text' ? (
        <TextStep
          text={text}
          onText={(t) => {
            typed.current = true;
            setText(t);
          }}
          mode={mode}
          onMode={setMode}
          canFix={!!own?.isSynced}
          fromApi={!!existing && !own}
          resume={draft && anyTapped(draft) && textOf(draft) === text ? draft : null}
          onStart={() => start(draftFromText(item.Id, text, mode))}
          onResume={() => draft && setStep('check')}
          onFix={() => {
            if (!own) return;
            const d = draftFromLyrics(item.Id, own.lines);
            setDraft(d);
            setMode(d.mode);
            setStep('check');
          }}
        />
      ) : step === 'tap' && draft ? (
        <TapStep item={item} draft={draft} current={current} onDraft={setDraft} onDone={() => setStep('check')} />
      ) : draft ? (
        <CheckStep
          item={item}
          draft={draft}
          current={current}
          available={available}
          onDraft={setDraft}
          onTap={() => start(draft)}
          onRetapFrom={(i) => {
            if (i === 0) return start(clearTimings(draft));
            // Undo taps until this line is the next to tap, then tap on from a little before it.
            let d = draft;
            for (let guard = 0; guard < 5000; guard++) {
              const t = nextTarget(d);
              if (t && t.line <= i && !t.end) break;
              const back = untap(d);
              if (back === d) break;
              d = back;
            }
            start(d);
          }}
          onWords={() => {
            setText(textOf(draft));
            setStep('text');
          }}
        />
      ) : null}
    </div>
  );
}

// ---- 1. The words ----

function TextStep(p: {
  text: string;
  onText(t: string): void;
  mode: Draft['mode'];
  onMode(m: Draft['mode']): void;
  canFix: boolean;
  fromApi: boolean;
  resume: Draft | null;
  onStart(): void;
  onResume(): void;
  onFix(): void;
}) {
  const rows = p.text.split('\n').filter((r) => r.trim()).length;
  const words = p.text.split(/\s+/).filter(Boolean).length;
  return (
    <div className="mk-body mk-text-step">
      <textarea
        className="mk-text"
        value={p.text}
        onChange={(e) => p.onText(e.target.value)}
        placeholder={'Paste or type the lyrics, one sung line per row.\n\nLeave an empty row where the singing stops for a while.'}
        spellCheck={false}
        aria-label="The Lyrics"
        autoFocus
      />
      <aside className="mk-side">
        <div className="mk-side-main">
          <h2>How Do You Want to Tap?</h2>
          <div className="mk-modes" role="radiogroup" aria-label="How to Tap">
            {(
              [
                { id: 'line', label: 'Line by Line', detail: 'A tap as each line starts. One listen does it.' },
                { id: 'word', label: 'Word by Word', detail: 'A tap on every word, so the words light up as they’re sung, like Spicy Lyrics. Takes a few listens.' },
              ] as const
            ).map((m) => (
              <button key={m.id} role="radio" aria-checked={p.mode === m.id} className={`mk-mode${p.mode === m.id ? ' on' : ''}`} onClick={() => p.onMode(m.id)}>
                <span className="mk-radio" />
                <span>
                  <b>{m.label}</b>
                  <span>{m.detail}</span>
                </span>
              </button>
            ))}
          </div>
          <ul className="mk-keys">
            <li>
              <kbd>Space</kbd> Tap
            </li>
            <li>
              <kbd>Backspace</kbd> Undo the last tap
            </li>
            <li>
              <kbd aria-label="Left Arrow">
                <ArrowLeft size={13} />
              </kbd>
              <kbd aria-label="Right Arrow">
                <ArrowRight size={13} />
              </kbd>{' '}
              Back or on 3 seconds
            </li>
            <li>
              <kbd>Enter</kbd> Pause or play
            </li>
          </ul>
          {p.fromApi ? <p className="mk-small">This song's lyrics come from the Spicy Lyrics API, which only lets Rakki show them, so paste your own here.</p> : null}
        </div>
        <div className="mk-side-foot">
          <span className="mk-small">{rows ? `${rows} ${rows === 1 ? 'line' : 'lines'}, ${words} ${words === 1 ? 'word' : 'words'}` : 'No lyrics yet'}</span>
          {p.resume ? (
            <button className="secondary" onClick={p.onResume}>
              Continue Where You Left Off
            </button>
          ) : null}
          {p.canFix ? (
            <button className="secondary" onClick={p.onFix}>
              Fix the Timing It Has
            </button>
          ) : null}
          <button className="primary" disabled={!rows} onClick={p.onStart}>
            Start Tapping
          </button>
        </div>
      </aside>
    </div>
  );
}

// ---- 2. Tapping ----

function TapStep({ item, draft, current, onDraft, onDone }: { item: BaseItem; draft: Draft; current: boolean; onDraft(d: Draft): void; onDone(): void }) {
  const playing = usePlayer((s) => s.playing);
  const [pulse, setPulse] = useState(0);
  const latest = useRef({ draft, current });
  latest.current = { draft, current };
  const target = nextTarget(draft);

  const doTap = () => {
    const { draft: d, current: here } = latest.current;
    if (!here) return;
    const next = tap(d, nowMs());
    onDraft(next);
    setPulse((n) => n + 1);
    if (!nextTarget(next)) {
      toast('Every line has its time');
      onDone();
    }
  };
  const doUndo = () => {
    const { draft: d, current: here } = latest.current;
    const back = untap(d);
    if (back === d) return;
    onDraft(back);
    // A little before the tap that was undone, to catch it again.
    if (here) usePlayer.getState().seek(Math.max(0, lastTap(d) / 1000 - 3));
  };

  // Space and friends belong to the maker while tapping (the app's shortcuts rest).
  useEffect(() => {
    useShortcuts.getState().setRecording(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const p = usePlayer.getState();
      if (e.code === 'Space') doTap();
      else if (e.key === 'Backspace') doUndo();
      else if (e.key === 'Enter') p.toggle();
      else if (e.key === 'ArrowLeft') p.seek(Math.max(0, currentPosition(p) - 3));
      else if (e.key === 'ArrowRight') p.seek(currentPosition(p) + 3);
      else if (e.key === 'Escape') onDone();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      useShortcuts.getState().setRecording(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = draft.lines;
  const at = target?.line ?? lines.length - 1;
  const before = lines.slice(Math.max(0, at - 2), at);
  const after = target?.end ? [] : lines.slice(at + 1, at + 4);
  const done = sung(draft).filter(tapped).length;
  const total = sung(draft).length;

  return (
    <div className="mk-body mk-tap-step">
      <div className="mk-stage" aria-live="polite">
        {before.map((l, i) => (
          <StageLine key={`b${at - before.length + i}`} line={l} kind="before" />
        ))}
        {target ? <StageLine key={`t${at}`} line={lines[at]} kind="target" word={target.word} end={!!target.end} /> : null}
        {after.map((l, i) => (
          <StageLine key={`a${at + 1 + i}`} line={l} kind="after" />
        ))}
      </div>
      {!current ? (
        <div className="mk-away">
          <Info size={18} /> This song isn't playing.
          <button className="secondary small" onClick={() => playNow(item, Math.max(0, lastTap(draft) / 1000 - 3))}>
            Play It
          </button>
        </div>
      ) : null}
      <TapTimeline draft={draft} />
      <div className="mk-pad">
        <div className="mk-pad-side">
          <button className="mk-tool" onClick={doUndo} disabled={!anyTapped(draft)} aria-label="Undo the Last Tap" title="Undo the Last Tap (Backspace)">
            <span className="mk-tool-ico">
              <Backspace size={20} />
            </span>
            <span>Undo</span>
          </button>
          <button className="mk-tool" onClick={() => usePlayer.getState().seek(Math.max(0, currentPosition(usePlayer.getState()) - 3))} aria-label="Back 3 Seconds" title="Back 3 Seconds (Left Arrow)">
            <span className="mk-tool-ico">
              <Rewind size={20} />
            </span>
            <span>3 s</span>
          </button>
        </div>
        <button className="mk-tap" onClick={doTap} disabled={!current} aria-label="Tap" title="Tap (Space)">
          {pulse ? <span key={pulse} className="mk-ring" aria-hidden /> : null}
          <Hand size={30} />
          <span>Tap</span>
        </button>
        <div className="mk-pad-side right">
          <button className="mk-tool" onClick={() => usePlayer.getState().toggle()} disabled={!current} aria-label={playing ? 'Pause' : 'Play'} title={`${playing ? 'Pause' : 'Play'} (Enter)`}>
            <span className="mk-tool-ico">{playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}</span>
            <span>{playing ? 'Pause' : 'Play'}</span>
          </button>
          <button className="mk-tool" onClick={onDone} aria-label="Done Tapping" title="Done Tapping (Esc)">
            <span className="mk-tool-ico">
              <Check size={20} />
            </span>
            <span>Done</span>
          </button>
        </div>
      </div>
      <div className="mk-count">
        {done} of {total} lines
      </div>
    </div>
  );
}

function StageLine({ line, kind, word, end }: { line: MakerLine; kind: 'before' | 'target' | 'after'; word?: number; end?: boolean }) {
  if (line.break) {
    return (
      <div className={`mk-line ${kind} break`}>
        <Music size={kind === 'target' ? 30 : 18} />
        {kind === 'target' ? <span className="mk-cue">Tap when the singing stops</span> : null}
      </div>
    );
  }
  return (
    <div className={`mk-line ${kind}`}>
      {kind === 'target' && word !== undefined && line.words ? (
        <span className="mk-words">
          {line.words.map((w, i) => (
            <span key={i} className={i < word ? 'lit' : i === word ? 'next' : ''}>
              {w.text}{' '}
            </span>
          ))}
        </span>
      ) : (
        <span>{line.text}</span>
      )}
      {kind === 'before' ? <span className="mk-stamp">{stamp(line.start)}</span> : null}
      {kind === 'target' ? <span className="mk-cue">{end ? 'Tap when this last line ends' : word !== undefined ? 'Tap as each word starts' : 'Tap as this line starts'}</span> : null}
    </div>
  );
}

/** The song as a thin bar: where it is, and a mark for every tap. */
function TapTimeline({ draft }: { draft: Draft }) {
  const duration = usePlayer((s) => s.duration);
  const at = usePlayer((s) => Math.floor(currentPosition(s) * 4) / 4);
  const marks = draft.lines.flatMap((l) => (l.start !== undefined ? [l.start] : []));
  const pct = (ms: number) => `${duration > 0 ? Math.min(100, (ms / 1000 / duration) * 100) : 0}%`;
  return (
    <div className="mk-timeline" aria-hidden>
      <div className="mk-timeline-fill" style={{ width: pct(at * 1000) }} />
      {marks.map((m, i) => (
        <span key={i} className="mk-mark" style={{ left: pct(m) }} />
      ))}
    </div>
  );
}

// ---- 3. Checking ----

function CheckStep({
  item,
  draft,
  current,
  available,
  onDraft,
  onTap,
  onRetapFrom,
  onWords,
}: {
  item: BaseItem;
  draft: Draft;
  current: boolean;
  available: boolean;
  onDraft(d: Draft): void;
  onTap(): void;
  onRetapFrom(i: number): void;
  onWords(): void;
}) {
  const ms = usePlayer((s) => (current ? Math.round(currentPosition(s) * 10) * 100 : -1));
  const list = useRef<HTMLOListElement>(null);
  const scrolledAt = useRef(0);
  const held = () => (scrolledAt.current = Date.now());
  const missing = sung(draft).filter((l) => !timed(l)).length;
  const complete = isComplete(draft);

  // The line being sung (while this song plays).
  let playingLine = -1;
  if (ms >= 0) draft.lines.forEach((l, i) => l.start !== undefined && l.start <= ms && (playingLine = i));

  // Follows the sung line, unless you scrolled in the last few seconds.
  useEffect(() => {
    if (playingLine < 0 || Date.now() - scrolledAt.current < 4000) return;
    list.current?.children[playingLine]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [playingLine]);

  const listen = (i: number) => {
    const t = draft.lines[i].start;
    if (t === undefined) return;
    const at = Math.max(0, t / 1000 - 1);
    if (current) {
      const p = usePlayer.getState();
      p.seek(at);
      if (!p.playing) p.toggle();
    } else playNow(item, at);
  };
  const shiftAll = (by: number) => {
    let d = draft;
    d.lines.forEach((_, i) => (d = shiftLine(d, i, by)));
    onDraft(d);
  };
  // Done here at once; the server's answer comes as a toast. A save that fails keeps the draft on
  // this computer, so Sync Lyrics opens where you left it.
  const save = () => {
    const name = item.Name;
    useNav.getState().back();
    const backTo = useNav.getState().route;
    saveMadeLyrics(item, draft).then(
      () => {
        toast(`Saved the lyrics for ${name}`);
        // Straight to them, when the song is playing and you're still where Save left you.
        const p = usePlayer.getState();
        if (p.queue[p.index]?.Id === item.Id && useNav.getState().route === backTo) useLayout.getState().setLyricsView(true);
      },
      (e: unknown) => toast(`Couldn't save the lyrics for ${name} (${e instanceof Error ? e.message : 'the server said no'}). Your taps are kept for Sync Lyrics.`),
    );
  };

  return (
    <div className="mk-body mk-check-step">
      <div className="mk-check-bar">
        <div className="mk-shift" role="group" aria-label="Move Every Line">
          <span>Move Everything</span>
          <button className="timing-step" onClick={() => shiftAll(-100)} aria-label="Earlier by 0.1 Seconds">
            −0.1 s
          </button>
          <button className="timing-step" onClick={() => shiftAll(100)} aria-label="Later by 0.1 Seconds">
            +0.1 s
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="secondary small" onClick={onWords}>
          Change the Words
        </button>
        <button
          className="secondary small"
          onClick={() =>
            void confirmAction('Tap Again from the Start?', 'Every time you tapped is cleared, and the song plays from the start.', 'Tap Again').then(
              (yes) => yes && onRetapFrom(0),
            )
          }>
          Tap Again
        </button>
        <button className="primary mk-save" disabled={!complete || !available} onClick={save} title={available ? undefined : 'Needs the Rakki plugin 0.3 on your server'}>
          Save Lyrics
        </button>
      </div>
      {!complete ? (
        <div className="mk-banner">
          <Stopwatch size={18} />
          <span>{missing ? `${missing} ${missing === 1 ? 'line still needs' : 'lines still need'} a time.` : 'The last line still needs a tap where it ends.'}</span>
          <button className="secondary small" onClick={onTap}>
            {missing ? 'Tap the Rest' : 'Tap the End'}
          </button>
        </div>
      ) : !available ? (
        <div className="mk-banner">
          <Info size={18} />
          <span>Saving lyrics needs version 0.3 of the Rakki plugin on your server. Your taps are kept on this computer until then.</span>
        </div>
      ) : null}
      <ol className="mk-list" ref={list} onWheel={held} onKeyDown={held} onPointerDown={(e) => e.target === e.currentTarget && held()}>
        {draft.lines.map((l, i) => (
          <li key={i} className={`mk-row${l.break ? ' break' : ''}${i === playingLine ? ' on' : ''}${tapped(l) ? '' : ' missing'}`}>
            <button className="mk-row-main" onClick={() => listen(i)} disabled={!tapped(l)} title={tapped(l) ? 'Play from Here' : undefined}>
              <span className="mk-stamp">{stamp(l.start)}</span>
              {l.break ? (
                <span className="mk-row-text break">
                  <Music size={15} /> Break
                </span>
              ) : (
                <span className={`mk-row-text${draft.mode === 'word' && l.words?.length ? ' words' : ''}`}>
                  {draft.mode === 'word' && l.words?.length
                    ? l.words.map((w, j) => (
                        <span key={j} className={i === playingLine && w.start !== undefined && w.start <= ms ? 'lit' : ''}>
                          {w.text}{' '}
                        </span>
                      ))
                    : l.text}
                </span>
              )}
            </button>
            <div className="mk-row-tools">
              <button className="timing-step" disabled={!tapped(l)} onClick={() => onDraft(shiftLine(draft, i, -100))} aria-label={`Line ${i + 1} Earlier`} title="0.1 s Earlier">
                −0.1
              </button>
              <button className="timing-step" disabled={!tapped(l)} onClick={() => onDraft(shiftLine(draft, i, 100))} aria-label={`Line ${i + 1} Later`} title="0.1 s Later">
                +0.1
              </button>
              <button className="iconbtn" onClick={() => onRetapFrom(i)} aria-label={`Tap Again from Line ${i + 1}`} title="Tap Again from Here">
                <Rewind size={16} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <p className="mk-foot">Kept by the Rakki plugin on your server, never in your music files. Every Rakki shows them, with you credited as the one who synced them.</p>
    </div>
  );
}
