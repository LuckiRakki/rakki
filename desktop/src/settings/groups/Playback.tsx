// Settings → Playback: streaming quality, volume, the equalizer and starting with the computer.
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { EQ_BANDS, EQ_PRESETS, eqPreset } from '@/settings/equalizer';
import { BITRATE_OPTIONS, useSettings, type Bitrate } from '@/settings/store';
import { Equalizer } from '~/audio/Equalizer';
import { inTauri } from '~/lib/tauri';
import { Card, More, Row, Toggle } from '~/settings/rows';

/** Start with the computer: in the tray, quietly, when you sign in (src-tauri autostart.rs). */
function StartupToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (inTauri) void invoke<boolean>('autostart_get').then(setOn).catch(() => setOn(false));
  }, []);
  if (!inTauri) return null;
  return (
    <>
      <Toggle
        on={!!on}
        onChange={(v) => {
          // Shown at once; back if the system says no.
          setOn(v);
          setNote(null);
          void invoke<boolean>('autostart_set', { on: v })
            .then(setOn)
            .catch((e) => {
              setOn(!v);
              setNote(`Couldn’t change it: ${String(e)}`);
            });
        }}
        label="Start with the Computer"
        detail="Rakki opens in the tray when you sign in to the computer, ready to play (the window stays closed)."
      />
      {note ? <div className="setting-detail error pad">{note}</div> : null}
    </>
  );
}

/** One EQ over every song (a song's own Edit Audio EQ still adds to it). */
function EqualizerCard() {
  const on = useSettings((s) => s.equalizer);
  const bands = useSettings((s) => s.equalizerBands);
  const set = useSettings((s) => s.set);
  const preset = eqPreset(bands);
  return (
    <Card>
      <Toggle on={on} onChange={(v) => set('equalizer', v)} label="Equalizer" detail="Shapes the sound of every song. A song's own EQ in Edit Audio adds to it." />
      {on ? (
        <>
          <div className="choice start ae-chips" role="radiogroup" aria-label="Equalizer Presets">
            {EQ_PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={preset === p.id} className={preset === p.id ? 'on' : ''} onClick={() => set('equalizerBands', [...p.eq])}>
                {p.label}
              </button>
            ))}
            {preset ? null : (
              <button role="radio" aria-checked className="on" disabled>
                Yours
              </button>
            )}
          </div>
          <Equalizer bands={EQ_BANDS} values={bands} onChange={(next) => set('equalizerBands', next)} />
        </>
      ) : null}
    </Card>
  );
}

export function Playback() {
  const s = useSettings();
  return (
    <>
    <Card>
      <Row label="Streaming Quality" detail="Original plays the file as it is (mpv plays every format). Lower qualities are converted to AAC by your server.">
        <label className="select">
          <select aria-label="Streaming Quality" value={s.wifiBitrate} onChange={(e) => s.set('wifiBitrate', Number(e.target.value) as Bitrate)}>
            {BITRATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.detail})
              </option>
            ))}
          </select>
        </label>
      </Row>
      <Toggle on={s.autoplay} onChange={(v) => s.set('autoplay', v)} label="Autoplay" detail="When the queue ends, keep going with similar songs." />
      <Toggle on={s.videoAutoplay} onChange={(v) => s.set('videoAutoplay', v)} label="Autoplay Music Videos" detail="When a video ends, the next in Up next follows after a short countdown." />
      <More>
        <Toggle on={s.normalize} onChange={(v) => s.set('normalize', v)} label="Volume Normalization" detail="Songs play at the same loudness (Jellyfin's loudness measurement)." />
        <StartupToggle />
      </More>
    </Card>
    <EqualizerCard />
    </>
  );
}
