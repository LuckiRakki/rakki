// Sync Lyrics, step 3: play it back, nudge the times, and save.
import { useEffect, useRef } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { playNow } from '~/audio/AudioEditor';
import { useLayout } from '~/layout/layout';
import { isComplete, saveMadeLyrics, shiftLine, type Draft } from '~/lyrics/maker';
import { useNav } from '~/nav';
import { currentPosition, usePlayer } from '~/player/store';
import { Info, Music, Rewind, Stopwatch } from '~/ui/icons';
import { confirmAction, toast } from '~/ui/overlays';
import { stamp, sung, tapped, timed } from '~/lyrics/makerSteps/helpers';

export function CheckStep({
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
