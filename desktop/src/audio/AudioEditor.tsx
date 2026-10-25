// Edit Audio: one song's own sound, kept on your server by the Rakki plugin and never written
// into the music file (audio/edits.ts). Where it starts and ends, fades, volume, a ten-band
// equalizer, speed, pitch and reverb. While the song plays you hear every change as you make
// it; Save keeps it, so the song plays this way on every Rakki. Changes you haven't saved stay
// here while Rakki runs, so leaving the page loses nothing.
import { useEffect, useRef, useState } from 'react';

import type { BaseItem } from '@/api/jellyfin';
import { artColor } from '@/lib/blurhash';
import {
  cleanEdit,
  EDIT_PRESETS,
  EQ_BANDS,
  previewEdit,
  removeSongEdit,
  saveSongEdit,
  useEditError,
  useEditsAvailable,
  useSongEdit,
  type SongEdit,
} from '~/audio/edits';
import { Equalizer } from '~/audio/Equalizer';
import { songPeaks, type Peaks } from '~/audio/peaks';
import { preciseTime, Waveform } from '~/audio/Waveform';
import { useAuth } from '~/auth/session';
import { useLayout } from '~/layout/layout';
import { go } from '~/nav';
import { currentPosition, usePlayer } from '~/player/store';
import { queryClient, useItem } from '~/queries';
import { Alert, AudioWave, Check, FastForward, Info, Pause, Play, Rewind } from '~/ui/icons';
import { confirmAction, toast } from '~/ui/overlays';
import { Artwork, formatTime } from '~/ui/parts';
import { Slider } from '~/ui/Slider';
import { Empty, Loading } from '~/ui/states';

/** Open a song's audio editor in the main area. */
export function openAudioEditor(item: BaseItem) {
  // Shown at once from what's known; the page refreshes it behind.
  queryClient.setQueryData(['item', useAuth.getState().session?.userId, item.Id], item);
  const l = useLayout.getState();
  if (l.nowPlaying) l.setNowPlaying(false);
  go({ name: 'editAudio', id: item.Id });
}

/** Every setting, filled in (SongEdit leaves out what's unchanged). `end` null: the song's end. */
interface Draft {
  start: number;
  end: number | null;
  fadeIn: number;
  fadeOut: number;
  gain: number;
  eq: number[];
  speed: number;
  pitch: number;
  reverb: number;
}

const FLAT = EQ_BANDS.map(() => 0);

function fill(e: SongEdit | null): Draft {
  return {
    start: e?.start ?? 0,
    end: e?.end ?? null,
    fadeIn: e?.fadeIn ?? 0,
    fadeOut: e?.fadeOut ?? 0,
    gain: e?.gain ?? 0,
    eq: e?.eq?.length === EQ_BANDS.length ? [...e.eq] : [...FLAT],
    speed: e?.speed ?? 1,
    pitch: e?.pitch ?? 0,
    reverb: e?.reverb ?? 0,
  };
}

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

/** Only what differs from the song as it is. */
function edit(d: Draft, duration: number): SongEdit {
  const e: SongEdit = {};
  if (d.start >= 0.05) e.start = round(d.start, 1);
  if (d.end !== null && (duration <= 0 || d.end <= duration - 0.05)) e.end = round(d.end, 1);
  if (d.fadeIn > 0) e.fadeIn = round(d.fadeIn, 1);
  if (d.fadeOut > 0) e.fadeOut = round(d.fadeOut, 1);
  if (d.gain !== 0) e.gain = round(d.gain, 1);
  if (d.eq.some((v) => v !== 0)) e.eq = d.eq.map((v) => round(v, 1));
  if (d.speed !== 1) e.speed = round(d.speed);
  if (d.pitch !== 0) e.pitch = round(d.pitch, 1);
  if (d.reverb > 0) e.reverb = round(d.reverb);
  return e;
}

/** The same edit (both cleaned the way they're saved, so the keys come in one order). */
const same = (a: SongEdit, b: SongEdit) => JSON.stringify(cleanEdit(a)) === JSON.stringify(cleanEdit(b));
const isEmpty = (e: SongEdit) => Object.keys(e).length === 0;

/** Unsaved changes per song, kept while Rakki runs. */
const drafts = new Map<string, Draft>();

/** Speed and pitch together, as people know them. */
const STYLES: { id: string; label: string; speed: number; pitch: number; reverb: number }[] = [
  { id: 'normal', label: 'As Recorded', speed: 1, pitch: 0, reverb: 0 },
  // Slowed: 85 % speed with the pitch dropping with it (12 × log2 0.85 ≈ −2.8), in a room.
  { id: 'slowed', label: 'Slowed + Reverb', speed: 0.85, pitch: -2.8, reverb: 0.35 },
  // Sped up: 125 % with the pitch rising with it (≈ +3.9).
  { id: 'sped', label: 'Sped Up', speed: 1.25, pitch: 3.9, reverb: 0 },
];

const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) % 1 ? digits : 0)}`;

export function AudioEditor({ id }: { id: string }) {
  const q = useItem(id);
  const item = q.data;
  if (!item) return q.isError ? <Empty icon={AudioWave} title="Couldn't Find the Song" detail="It may have been removed from your server." /> : <Loading what="the song" />;
  if (item.Type !== 'Audio' || item.Radio) return <Empty icon={AudioWave} title="Only Songs Can Be Edited" />;
  return <Editor item={item} />;
}

function Editor({ item }: { item: BaseItem }) {
  const client = useAuth((s) => s.client);
  const saved = useSongEdit(item.Id);
  const available = useEditsAvailable();
  const engineError = useEditError();
  const current = usePlayer((s) => s.queue[s.index]?.Id === item.Id);
  const playing = usePlayer((s) => s.playing);
  const playerDuration = usePlayer((s) => s.duration);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraftState] = useState<Draft>(() => drafts.get(item.Id) ?? fill(saved));
  const touched = useRef(drafts.has(item.Id));

  // The song's length: Jellyfin's, else the decoded file's, else the player's.
  const duration = (item.RunTimeTicks ?? 0) / 10_000_000 || peaks?.duration || (current ? playerDuration : 0);
  const end = draft.end ?? duration;

  // The saved edit arrives after the page opens (or changes on another Rakki): follow it until
  // you change something here.
  const savedKey = JSON.stringify(saved ?? {});
  useEffect(() => {
    if (!touched.current) setDraftState(fill(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    songPeaks(item).then(
      (p) => live && setPeaks(p),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [item]);

  const setDraft = (patch: Partial<Draft>) => {
    touched.current = true;
    setDraftState((d) => {
      const next = { ...d, ...patch };
      drafts.set(item.Id, next);
      return next;
    });
  };

  const mine = edit(draft, duration);
  const kept = saved ?? {};
  const dirty = !same(mine, kept);

  // Heard as you go while this song plays (not saved). Start and end aren't enforced while
  // editing, so the handles can be tried by playing either side of them.
  const previewing = current && dirty;
  const mineKey = JSON.stringify(mine);
  useEffect(() => {
    if (!previewing) return;
    const t = setTimeout(() => previewEdit(JSON.parse(mineKey) as SongEdit), 120);
    return () => clearTimeout(t);
  }, [previewing, mineKey]);
  useEffect(() => {
    if (previewing) return () => previewEdit(null);
  }, [previewing]);

  const playHere = (at: number) => {
    const p = usePlayer.getState();
    if (current) {
      p.seek(at);
      if (!p.playing) p.toggle();
    } else playNow(item, at);
  };

  const save = () => {
    const name = item.Name;
    const removing = isEmpty(mine);
    touched.current = false;
    drafts.delete(item.Id);
    (removing ? removeSongEdit(item.Id) : saveSongEdit(item.Id, mine)).then(
      () => toast(removing ? `${name} plays as it was recorded again` : `Saved the edits to ${name}`),
      (e: unknown) => {
        touched.current = true;
        drafts.set(item.Id, draft);
        toast(`Couldn't save the edits to ${name} (${e instanceof Error ? e.message : 'the server said no'})`);
      },
    );
  };
  const undo = () => {
    touched.current = false;
    drafts.delete(item.Id);
    setDraftState(fill(saved));
  };
  const removeAll = () =>
    void confirmAction('Remove the Edits?', `${item.Name} will play as it was recorded, on every Rakki.`, 'Remove').then((yes) => {
      if (!yes) return;
      touched.current = false;
      drafts.delete(item.Id);
      setDraftState(fill(null));
      removeSongEdit(item.Id).then(
        () => toast(`${item.Name} plays as it was recorded again`),
        () => toast("Couldn't remove the edits"),
      );
    });

  const tint = client ? artColor(client.blurhash(item), '#3a3a3e') : '#3a3a3e';
  const style = STYLES.find((s) => s.speed === draft.speed && s.pitch === draft.pitch && s.reverb === draft.reverb)?.id;
  const preset = EDIT_PRESETS.find((p) => p.eq.every((v, i) => v === draft.eq[i]))?.id;
  const trimmed = draft.start > 0 || end < duration;
  const artists = item.Artists?.join(', ') || item.AlbumArtist;

  return (
    <div className="page audio-editor" style={{ ['--tint' as string]: tint }}>
      <header className="ae-head">
        <Artwork item={item} size={300} className="ae-art" />
        <div className="ae-title">
          <div className="kind">Edit Audio</div>
          <h1>{item.Name}</h1>
          <div className="ae-sub">{[artists, item.Album].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="ae-actions">
          <span className={`ae-state${dirty ? ' dirty' : ''}`}>
            {dirty ? (
              'Not Saved'
            ) : isEmpty(kept) ? (
              'As Recorded'
            ) : (
              <>
                <Check size={15} /> Saved
              </>
            )}
          </span>
          {dirty ? (
            <button className="secondary small" onClick={undo}>
              Undo Changes
            </button>
          ) : !isEmpty(kept) ? (
            <button className="secondary small" onClick={removeAll}>
              Remove Edits
            </button>
          ) : null}
          <button className="primary ae-save" disabled={!dirty || !available} onClick={save} title={available ? undefined : 'Needs the Rakki plugin 0.3 on your server'}>
            Save
          </button>
        </div>
      </header>

      {!available ? (
        <div className="ae-note">
          <Info size={18} />
          <span>Saving edits needs version 0.3 of the Rakki plugin on your server. You can still try changes on the playing song.</span>
        </div>
      ) : null}
      {engineError ? (
        <div className="ae-note error" role="status">
          <Alert size={18} />
          <span>{engineError}</span>
        </div>
      ) : null}

      <section className="ae-card ae-trim">
        <div className="ae-card-head">
          <h2>Start and End</h2>
          <span className="ae-summary">
            {trimmed ? `Plays ${preciseTime(draft.start)} to ${preciseTime(end)}, ${formatTime(end - draft.start)} long` : `The whole song, ${formatTime(duration)}`}
          </span>
        </div>
        <Waveform
          peaks={peaks?.peaks ?? null}
          failed={failed}
          duration={duration}
          start={draft.start}
          end={end}
          fadeIn={draft.fadeIn}
          fadeOut={draft.fadeOut}
          gain={draft.gain}
          current={current}
          onTrim={(start, e) => setDraft({ start, end: e >= duration - 0.05 ? null : e })}
          onAudition={(which) => playHere(which === 'start' ? draft.start : Math.max(draft.start, end - 4))}
          onSeek={playHere}
        />
        {failed ? <div className="setting-detail">Couldn't read this song's sound to draw it; the handles still work.</div> : null}
        <div className="ae-trim-foot">
          <div className="ae-transport">
            <button className="iconbtn" aria-label="Play from the Start" title="Play from the Start" onClick={() => playHere(draft.start)}>
              <Rewind size={18} />
            </button>
            <button
              className="ae-play"
              aria-label={current && playing ? 'Pause' : 'Play'}
              title={current && playing ? 'Pause' : current ? 'Play' : 'Play This Song'}
              onClick={() => (current ? usePlayer.getState().toggle() : playHere(draft.start))}>
              {current && playing ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
            </button>
            <button className="iconbtn" aria-label="Hear the End" title="Hear the End" onClick={() => playHere(Math.max(draft.start, end - 4))}>
              <FastForward size={18} />
            </button>
            {current ? <LiveTime duration={duration} /> : <span className="ae-hint">Play the song to hear changes as you make them.</span>}
          </div>
          <div className="ae-fades">
            <label className="ae-fade">
              <span>Fade In</span>
              <Slider label="Fade In" value={draft.fadeIn} min={0} max={10} step={0.1} show={(v) => (v ? `${v.toFixed(1)} s` : 'Off')} onChange={(fadeIn) => setDraft({ fadeIn })} />
            </label>
            <label className="ae-fade">
              <span>Fade Out</span>
              <Slider label="Fade Out" value={draft.fadeOut} min={0} max={10} step={0.1} show={(v) => (v ? `${v.toFixed(1)} s` : 'Off')} onChange={(fadeOut) => setDraft({ fadeOut })} />
            </label>
          </div>
        </div>
      </section>

      <div className="ae-grid">
        <section className="ae-card">
          <div className="ae-card-head">
            <h2>Equalizer</h2>
          </div>
          <div className="choice start ae-chips" role="radiogroup" aria-label="Equalizer Presets">
            {EDIT_PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={preset === p.id} className={preset === p.id ? 'on' : ''} onClick={() => setDraft({ eq: [...p.eq] })}>
                {p.label}
              </button>
            ))}
            {preset ? null : (
              <button role="radio" aria-checked className="on" disabled>
                Yours
              </button>
            )}
          </div>
          <Equalizer bands={EQ_BANDS} values={draft.eq} onChange={(eq) => setDraft({ eq })} />
        </section>

        <section className="ae-card">
          <div className="ae-card-head">
            <h2>Sound</h2>
          </div>
          <div className="choice start ae-chips" role="radiogroup" aria-label="Speed and Pitch Styles">
            {STYLES.map((s) => (
              <button key={s.id} role="radio" aria-checked={style === s.id} className={style === s.id ? 'on' : ''} onClick={() => setDraft({ speed: s.speed, pitch: s.pitch, reverb: s.reverb })}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="ae-rows">
            <div className="setting">
              <div className="setting-text">
                <div className="setting-label">Volume</div>
                <div className="setting-detail">Louder or quieter than the file.</div>
              </div>
              <Slider label="Volume" value={draft.gain} min={-12} max={12} step={0.5} show={(v) => (v ? `${signed(v)} dB` : '0 dB')} onChange={(gain) => setDraft({ gain })} />
            </div>
            <div className="setting">
              <div className="setting-text">
                <div className="setting-label">Speed</div>
                <div className="setting-detail">Faster or slower; the pitch stays.</div>
              </div>
              <Slider label="Speed" value={draft.speed} min={0.5} max={2} step={0.01} show={(v) => `${v.toFixed(2)}×`} onChange={(speed) => setDraft({ speed })} />
            </div>
            <div className="setting">
              <div className="setting-text">
                <div className="setting-label">Pitch</div>
                <div className="setting-detail">Higher or lower in semitones (12 is an octave); the speed stays.</div>
              </div>
              <Slider label="Pitch" value={draft.pitch} min={-12} max={12} step={0.1} show={(v) => (v ? signed(v) : '0')} onChange={(pitch) => setDraft({ pitch })} />
            </div>
            <div className="setting">
              <div className="setting-text">
                <div className="setting-label">Reverb</div>
                <div className="setting-detail">A room around the sound.</div>
              </div>
              <Slider label="Reverb" value={draft.reverb} min={0} max={1} step={0.01} show={(v) => (v ? `${Math.round(v * 100)}%` : 'Off')} onChange={(reverb) => setDraft({ reverb })} />
            </div>
          </div>
        </section>
      </div>

      <p className="ae-foot">
        Edits are kept by the Rakki plugin on your server, never written into the music file. Rakki on any computer plays the song with them.
      </p>
    </div>
  );
}

/**
 * Play `item` now, after the song that's playing (the rest of the queue stays), from `at`
 * seconds once it has loaded.
 */
export function playNow(item: BaseItem, at = 0) {
  usePlayer.getState().playNext([item]);
  usePlayer.getState().next();
  if (at < 0.5) return;
  const off = usePlayer.subscribe((s) => {
    if (s.queue[s.index]?.Id !== item.Id) return off();
    // mpv has the song once it reports a place in it.
    if (s.position > 0) {
      off();
      s.seek(at);
    }
  });
  setTimeout(off, 10_000);
}

/** Where the song is, by the second. */
function LiveTime({ duration }: { duration: number }) {
  const at = usePlayer((s) => Math.floor(currentPosition(s)));
  return (
    <span className="ae-time">
      {formatTime(at)} / {formatTime(duration)}
    </span>
  );
}
