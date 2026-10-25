// Audio edits: a song cut shorter, louder, with its own EQ, speed, pitch, fades or a little
// reverb. Nothing is ever written into the music file. The edit is a small note the Rakki
// plugin keeps on the server for that song (plugin 0.3: GET /Rakki/Edits, PUT and DELETE
// /Rakki/Edits/{id}), the way it keeps Spicy Lyrics' lyrics, so every Rakki on the server
// hears the same edit.
//
// mpv applies it live while the song plays: the edit becomes mpv options for that song only
// (start, end, speed, and af: a libavfilter chain plus rubberband for pitch), handed over when
// the song is loaded, also as the next song, so gapless playback keeps working. mpv drops them
// again when the song ends.
//
// The editor (AudioEditor.tsx) previews changes on the playing song with previewEdit before
// saving; the cut points aren't enforced while previewing, so its handles can be auditioned.
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

import type { BaseItem } from '@/api/jellyfin';
import { inTauri } from '~/lib/tauri';
import { PluginError, pluginRequest, pluginVersion, versionAtLeast } from '~/lib/plugin';
import { engine, type FileOptions } from '~/player/engine';
import { currentPosition, setSongOptions, usePlayer } from '~/player/store';

export { useEditsAvailable } from '~/lib/plugin';

export interface SongEdit {
  /** Where the song starts and ends, in seconds into the file. */
  start?: number;
  end?: number;
  /** Louder or quieter, in dB (-12 to 12). */
  gain?: number;
  /** One value per EQ_BANDS entry, in dB (-12 to 12). */
  eq?: number[];
  /** 0.5 to 2, keeping the pitch. */
  speed?: number;
  /** Semitones, -12 to 12 (needs mpv with rubberband). */
  pitch?: number;
  /** Seconds. */
  fadeIn?: number;
  fadeOut?: number;
  /** 0 (none) to 1. */
  reverb?: number;
}

/** The EQ's bands, in Hz. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EDIT_PRESETS: { id: string; label: string; eq: number[] }[] = [
  { id: 'flat', label: 'Flat', eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass', label: 'Bass Boost', eq: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble Boost', eq: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: 'vocal', label: 'Vocal', eq: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1] },
  { id: 'loudness', label: 'Loudness', eq: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
  { id: 'acoustic', label: 'Acoustic', eq: [3, 3, 2, 1, 1, 1, 2, 3, 2, 1] },
  { id: 'electronic', label: 'Electronic', eq: [4, 4, 1, 0, -2, 1, 0, 1, 4, 5] },
  { id: 'late-night', label: 'Late Night', eq: [-3, -2, -1, 0, 1, 2, 2, 1, -1, -3] },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: number) => String(Math.round(v * 1000) / 1000);

/** The edit with defaults and out-of-range values dropped (what's saved). */
export function cleanEdit(e: SongEdit): SongEdit {
  const out: SongEdit = {};
  if (e.start && e.start > 0) out.start = Math.round(e.start * 1000) / 1000;
  if (e.end && e.end > (out.start ?? 0)) out.end = Math.round(e.end * 1000) / 1000;
  if (e.gain) out.gain = clamp(e.gain, -12, 12);
  if (e.eq?.some((g) => g)) out.eq = EQ_BANDS.map((_, i) => clamp(e.eq?.[i] ?? 0, -12, 12));
  if (e.speed && e.speed !== 1) out.speed = clamp(e.speed, 0.5, 2);
  if (e.pitch) out.pitch = clamp(e.pitch, -12, 12);
  if (e.fadeIn && e.fadeIn > 0) out.fadeIn = clamp(e.fadeIn, 0, 30);
  if (e.fadeOut && e.fadeOut > 0) out.fadeOut = clamp(e.fadeOut, 0, 30);
  if (e.reverb && e.reverb > 0) out.reverb = clamp(e.reverb, 0, 1);
  return out;
}

export const isEmptyEdit = (e: SongEdit | null | undefined) => !e || Object.keys(cleanEdit(e)).length === 0;

// ---- Into mpv ----

let filters: string[] | null = null;
const canPitch = () => !filters || filters.includes('rubberband');

/**
 * mpv's af for the edit. `songEnd` (seconds into the file) places the fade out; every value
 * is a number written here, so the chain always builds (a broken chain would silence the song).
 */
function audioFilter(e: SongEdit, songEnd: number): string {
  const chain: string[] = [];
  const end = e.end ?? songEnd;
  if (e.fadeIn) chain.push(`afade=t=in:st=${num(e.start ?? 0)}:d=${num(e.fadeIn)}`);
  if (e.fadeOut && end > 0) chain.push(`afade=t=out:st=${num(Math.max(0, end - e.fadeOut))}:d=${num(e.fadeOut)}`);
  e.eq?.forEach((g, i) => g && chain.push(`equalizer=f=${EQ_BANDS[i]}:t=o:w=1:g=${num(g)}`));
  if (e.reverb) {
    const r = e.reverb;
    chain.push(`aecho=0.8:0.9:40|80|120:${num(0.5 * r)}|${num(0.35 * r)}|${num(0.2 * r)}`);
  }
  if (e.gain) chain.push(`volume=${num(e.gain)}dB`);
  // Anything made louder: a limiter keeps it from clipping.
  if ((e.gain ?? 0) > 0 || e.eq?.some((g) => g > 0) || e.reverb) chain.push('alimiter=limit=0.97:level=0');
  const af: string[] = [];
  if (e.pitch && canPitch()) af.push(`rubberband=pitch-scale=${num(Math.pow(2, e.pitch / 12))}`);
  if (chain.length) af.push(`lavfi=[${chain.join(',')}]`);
  return af.join(',');
}

const songEnd = (item: BaseItem | undefined) => (item?.RunTimeTicks ?? 0) / 10_000_000;

/** mpv options for the song's saved edit, or null when it has none. */
function optionsFor(item: BaseItem | undefined): FileOptions | null {
  const e = item?.Id ? useSongEdits.getState().byId[item.Id] : undefined;
  if (!e || isEmptyEdit(e)) return null;
  const o: FileOptions = {};
  const af = audioFilter(e, songEnd(item));
  if (af) o.af = af;
  if (e.speed) o.speed = num(e.speed);
  if (e.start) o.start = num(e.start);
  if (e.end) o.end = num(e.end);
  return o;
}

// ---- The edits ----

interface EditsState {
  byId: Record<string, SongEdit>;
  loaded: boolean;
  /** mpv couldn't do part of an edit (pitch without rubberband), or the server said no. */
  error: string | null;
}

export const useSongEdits = create<EditsState>(() => ({ byId: {}, loaded: false, error: null }));

/** The song's saved edit, or null. */
export function useSongEdit(itemId: string | undefined): SongEdit | null {
  return useSongEdits((s) => (itemId ? (s.byId[itemId] ?? null) : null));
}

/** What went wrong applying or saving an edit, for the editor to say. */
export function useEditError(): string | null {
  return useSongEdits((s) => s.error);
}

const playing = () => {
  const p = usePlayer.getState();
  return p.queue[p.index];
};

/** Sets the playing song's edit in mpv now (af, speed; cut points unless previewing). */
function applyNow(e: SongEdit | null, preview: boolean) {
  const item = playing();
  const edit = cleanEdit(e ?? {});
  if (edit.pitch && !canPitch()) useSongEdits.setState({ error: "This mpv can't change pitch (it has no rubberband). Everything else applies." });
  lastApplied = performance.now();
  void engine.set('af', audioFilter(edit, songEnd(item)));
  void engine.set('speed', edit.speed ?? 1);
  // While previewing the whole song plays, so the editor's handles can be auditioned.
  void engine.set('end', !preview && edit.end ? num(edit.end) : 'none');
  const p = usePlayer.getState();
  const rate = edit.speed ?? 1;
  if (rate !== p.rate) usePlayer.setState({ rate, position: currentPosition(p), positionAt: performance.now() });
}

let previewing = false;
let lastApplied = 0;

/**
 * Hear `edit` on the playing song while editing (null: back to the saved edit). The cut points
 * aren't applied while previewing.
 */
export function previewEdit(edit: SongEdit | null) {
  const item = playing();
  if (!item) return;
  if (edit) {
    previewing = true;
    applyNow(edit, true);
  } else if (previewing) {
    previewing = false;
    applyNow(useSongEdits.getState().byId[item.Id] ?? null, false);
  }
}

async function ready(): Promise<void> {
  if (!versionAtLeast(await pluginVersion(), '0.3')) throw new PluginError('Audio edits need the Rakki plugin 0.3 on the server.');
}

/** Saves the song's edit on the server (an empty edit removes it). Applies at once if it's playing. */
export async function saveSongEdit(itemId: string, edit: SongEdit): Promise<void> {
  const clean = cleanEdit(edit);
  if (!Object.keys(clean).length) return removeSongEdit(itemId);
  await ready();
  const before = useSongEdits.getState().byId[itemId];
  useSongEdits.setState((s) => ({ byId: { ...s.byId, [itemId]: clean }, error: null }));
  try {
    await pluginRequest('PUT', `/Rakki/Edits/${itemId}`, JSON.stringify(clean));
  } catch (e) {
    useSongEdits.setState((s) => ({ byId: restore(s.byId, itemId, before), error: `Couldn't save the edit: ${String((e as Error).message ?? e)}` }));
    throw e;
  }
  changed(itemId);
}

/** Removes the song's edit: it plays as the file is again. */
export async function removeSongEdit(itemId: string): Promise<void> {
  await ready();
  const before = useSongEdits.getState().byId[itemId];
  useSongEdits.setState((s) => ({ byId: restore(s.byId, itemId, undefined), error: null }));
  try {
    await pluginRequest('DELETE', `/Rakki/Edits/${itemId}`);
  } catch (e) {
    useSongEdits.setState((s) => ({ byId: restore(s.byId, itemId, before), error: `Couldn't remove the edit: ${String((e as Error).message ?? e)}` }));
    throw e;
  }
  changed(itemId);
}

function restore(byId: Record<string, SongEdit>, id: string, edit: SongEdit | undefined) {
  const next = { ...byId };
  if (edit) next[id] = edit;
  else delete next[id];
  return next;
}

/** A saved edit changed: the playing song hears it now, and the next song gets it. */
function changed(itemId: string) {
  if (playing()?.Id === itemId) {
    previewing = false;
    applyNow(useSongEdits.getState().byId[itemId] ?? null, false);
  }
  usePlayer.getState().refreshNext();
}

/** Every saved edit, from the server (main.tsx at sign-in). */
export async function loadSongEdits(): Promise<void> {
  if (!versionAtLeast(await pluginVersion(), '0.3')) return;
  try {
    const all = await pluginRequest<Record<string, SongEdit>>('GET', '/Rakki/Edits');
    useSongEdits.setState({ byId: all ?? {}, loaded: true });
  } catch {
    return;
  }
  // The playing song was loaded before its edit arrived.
  const item = playing();
  if (item && useSongEdits.getState().byId[item.Id]) applyNow(useSongEdits.getState().byId[item.Id], false);
  usePlayer.getState().refreshNext();
}

let started = false;

/** Once (main.tsx): saved edits go along with every song mpv loads (loadSongEdits fetches them). */
export function startSongEdits() {
  if (started) return;
  started = true;
  setSongOptions(optionsFor);
  void engine.filters().then((f) => {
    filters = f.length ? f : null;
  });
  if (inTauri) {
    // mpv turned down a filter just set: say so in the editor.
    void listen<string>('player://refused', (e) => {
      if (performance.now() - lastApplied < 2000) useSongEdits.setState({ error: `mpv couldn't apply this edit (${e.payload}).` });
    });
  }
}
