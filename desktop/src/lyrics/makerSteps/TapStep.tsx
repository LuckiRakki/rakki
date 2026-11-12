// Sync Lyrics, step 2: tap along as each line (or word) is sung.
import { useEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { playNow } from '~/audio/AudioEditor';
import { nextTarget, tap, untap, type Draft, type MakerLine } from '~/lyrics/maker';
import { currentPosition, usePlayer } from '~/player/store';
import { useShortcuts } from '~/settings/shortcuts';
import { Backspace, Check, Hand, Info, Music, Pause, Play, Rewind } from '~/ui/icons';
import { toast } from '~/ui/overlays';
import { anyTapped, lastTap, nowMs, stamp, sung, tapped } from '~/lyrics/makerSteps/helpers';

export function TapStep({ item, draft, current, onDraft, onDone }: { item: BaseItem; draft: Draft; current: boolean; onDraft(d: Draft): void; onDone(): void }) {
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
            <span className="mk-tool-ico">{playing ? <Pause size={20} /> : <Play size={20} />}</span>
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
