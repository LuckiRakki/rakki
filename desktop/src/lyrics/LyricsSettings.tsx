// The full player's Lyrics Settings: one button, one panel, everything about the lyrics in it,
// so the screen stays clean. Style (Spicy word by word, or Regular line by line), where this
// song's lyrics come from when it has more than one set (Automatic, or the Spicy Lyrics API, a
// lyrics file, lyrics made in Rakki, Jellyfin's own; kept by the plugin, so every Rakki follows
// it), text size, and timing, as on the phone (its Sync panel): move this song's lyrics earlier or later when
// they run ahead of or behind the song. Timing is saved on this computer as you go (shared code:
// lyrics/offset.ts); Save to Server writes it into the lyrics themselves, so every Rakki has it
// (not for lyrics from the Spicy Lyrics API, which can't be kept).
import { useEffect, useRef, useState } from 'react';

import { useLyrics } from '@/lyrics/fetch';
import { saveOffsetToServer, serverSaveFor, useLyricsOffset, useLyricsOffsets } from '@/lyrics/offset';
import { setLyricsSource, useLyricsSources, type LyricsSource } from '@/lyrics/source';
import { showSourcePicker, sourceDetail } from '@/lyrics/sourceText';
import { useSettings } from '@/settings/store';
import { pickLyrics } from '~/lyrics/LyricsView';
import { queryClient } from '~/queries';
import { LYRICS_SIZE, useLook } from '~/settings/look';
import { Check, SlidersHorizontal } from '~/ui/icons';
import { toast } from '~/ui/overlays';
import { Slider } from '~/ui/Slider';

const STEPS = [-500, -100, 100, 500];

function describe(ms: number): string {
  if (ms === 0) return 'As written';
  const s = (Math.abs(ms) / 1000).toFixed(1);
  return ms > 0 ? `${s} s later` : `${s} s earlier`;
}

export function LyricsSettings({ itemId }: { itemId?: string }) {
  const [open, setOpen] = useState(false);
  const mode = useSettings((s) => s.lyricsMode);
  const size = useLook((s) => s.lyricsSize);
  const offset = useLyricsOffset(itemId);
  const lyrics = pickLyrics(useLyrics(itemId).data);
  const target = serverSaveFor(lyrics);
  const sources = useLyricsSources(itemId).data;
  const box = useRef<HTMLDivElement>(null);
  // From the stored value, so quick clicks add up.
  const move = (by: number) => {
    if (itemId) useLyricsOffsets.getState().set(itemId, (useLyricsOffsets.getState().byItem[itemId] ?? 0) + by);
  };

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
    if (!lyrics || !itemId) return;
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

  // Shows at once (the lyrics switch over); a toast only if the server refused.
  const pickSource = (source: LyricsSource) => {
    if (!itemId) return;
    setLyricsSource(itemId, source).catch((e: unknown) => toast(`Couldn’t change where the lyrics come from: ${e instanceof Error ? e.message : 'try again'}`));
  };

  return (
    <div className="timing" ref={box}>
      <button className={`iconbtn${open ? ' on' : ''}`} aria-label="Lyrics Settings" aria-expanded={open} title="Lyrics Settings" onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={20} />
      </button>
      {open ? (
        <div className="timing-pop lyrics-pop">
          <div className="timing-head">Lyrics Settings</div>

          <div className="pop-label">Style</div>
          <div className="choice start" role="radiogroup" aria-label="Lyrics Style">
            {(['spicy', 'regular'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => useSettings.getState().set('lyricsMode', m)}>
                {m === 'spicy' ? 'Spicy' : 'Regular'}
              </button>
            ))}
          </div>

          {itemId && showSourcePicker(sources) ? (
            <>
              <div className="pop-label">Source</div>
              <div className="source-list" role="radiogroup" aria-label="Lyrics Source">
                {sources.options.map((o) => {
                  const on = sources.choice === o.source;
                  return (
                    <button key={o.source} role="radio" aria-checked={on} className={`source-row${on ? ' on' : ''}`} onClick={() => !on && pickSource(o.source)}>
                      <span className="source-text">
                        <span className="source-name">{o.label}</span>
                        <span className="source-kind">{sourceDetail(o)}</span>
                      </span>
                      {on ? <Check size={16} /> : null}
                    </button>
                  );
                })}
              </div>
              <span className="pop-note">For this song, on every Rakki.</span>
            </>
          ) : null}

          <div className="pop-label">Text Size</div>
          <Slider label="Lyrics Text Size" value={size} min={LYRICS_SIZE.min} max={LYRICS_SIZE.max} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => useLook.getState().setLyricsSize(v)} />

          {lyrics?.isSynced && itemId ? (
            <>
              <div className="pop-label">Timing</div>
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
                  <button className="secondary small" disabled={!offset} onClick={() => void save()}>
                    Save to Server
                  </button>
                ) : (
                  <span>{target.reason.replace('this phone', 'this computer')}</span>
                )}
                <span className="muted">Saved on this computer as you change it.</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
