// Lyrics timing, as on the phone (its Sync panel): move this song's lyrics earlier or later when
// they run ahead of or behind the song. Saved on this computer as you go (shared code:
// lyrics/offset.ts); Save to server writes it into the lyrics themselves, so every Rakki has it
// (not for lyrics from the Spicy Lyrics API, which can't be kept).
import { Timer } from '~/ui/icons';
import { useEffect, useRef, useState } from 'react';

import { pickLyrics } from '~/lyrics/LyricsView';
import { useLyrics } from '@/lyrics/fetch';
import { saveOffsetToServer, serverSaveFor, useLyricsOffset, useLyricsOffsets } from '@/lyrics/offset';
import { queryClient } from '~/queries';
import { toast } from '~/ui/overlays';

const STEPS = [-500, -100, 100, 500];

function describe(ms: number): string {
  if (ms === 0) return 'As written';
  const s = (Math.abs(ms) / 1000).toFixed(1);
  return ms > 0 ? `${s} s later` : `${s} s earlier`;
}

export function LyricsTiming({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const offset = useLyricsOffset(itemId);
  const lyrics = pickLyrics(useLyrics(itemId).data);
  const target = serverSaveFor(lyrics);
  const box = useRef<HTMLDivElement>(null);
  // From the stored value, so quick clicks add up.
  const move = (by: number) => useLyricsOffsets.getState().set(itemId, (useLyricsOffsets.getState().byItem[itemId] ?? 0) + by);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the panel closes (not the full player behind it); focus goes back to its button.
      e.stopImmediatePropagation();
      setOpen(false);
      box.current?.querySelector<HTMLButtonElement>('.iconbtn')?.focus();
    };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  // Saves behind the screen (the panel closes); the toast says how it went.
  const save = async () => {
    if (!lyrics) return;
    setOpen(false);
    try {
      await saveOffsetToServer(itemId, lyrics, offset);
      // The shared code refreshes the phone's cache; this is the desktop's.
      await queryClient.invalidateQueries({ queryKey: ['lyrics'] });
      toast('Lyrics timing saved to the server');
    } catch (e) {
      toast(`Couldn’t save the timing: ${e instanceof Error ? e.message : 'try again'}`);
    }
  };

  return (
    <div className="timing" ref={box}>
      <button
        className={`iconbtn${offset ? ' on' : ''}`}
        aria-label="Lyrics timing"
        title={offset ? `Lyrics timing: ${describe(offset)}` : 'Lyrics timing'}
        disabled={!lyrics?.isSynced}
        onClick={() => setOpen(!open)}>
        <Timer size={19} />
      </button>
      {open ? (
        <div className="timing-pop">
          <div className="timing-head">Lyrics timing</div>
          <div className="timing-row">
            {STEPS.slice(0, 2).map((s) => (
              <button key={s} className="timing-step" onClick={() => move(s)} title={`${Math.abs(s) / 1000} s earlier`}>
                {s / 1000} s
              </button>
            ))}
            <button className="timing-now" onClick={() => offset !== 0 && move(-offset)} title={offset ? 'Back to as written' : undefined}>
              {describe(offset)}
              {offset ? <span>Reset</span> : null}
            </button>
            {STEPS.slice(2).map((s) => (
              <button key={s} className="timing-step" onClick={() => move(s)} title={`${s / 1000} s later`}>
                +{s / 1000} s
              </button>
            ))}
          </div>
          <div className="timing-foot">
            {target.ok ? (
              <button className="device-btn" disabled={!offset} onClick={() => void save()}>
                Save to server
              </button>
            ) : (
              <span>{target.reason.replace('this phone', 'this computer')}</span>
            )}
            <span className="muted">Saved on this computer as you change it.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
